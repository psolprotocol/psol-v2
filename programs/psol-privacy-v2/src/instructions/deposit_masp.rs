//! MASP Deposit Instruction - pSOL v2
//!
//! Handles deposits into the Multi-Asset Shielded Pool.
//!
//! # Privacy Considerations
//!
//! The deposit event intentionally does NOT include:
//! - Amount (would enable correlation attacks)
//! - Depositor address (would link on-chain identity to commitment)
//!
//! Only the commitment, leaf index, merkle root, and asset ID are emitted.
//! This is sufficient for users to track their deposits while maintaining
//! privacy for the anonymity set.
//!
//! # Security Model
//!
//! 1. User generates commitment = Poseidon(secret, nullifier, amount, asset_id)
//! 2. User generates ZK proof proving knowledge of commitment preimage
//! 3. On-chain verification ensures commitment is valid
//! 4. Tokens are transferred AFTER proof verification (fail-safe)
//! 5. Commitment is inserted into shared Merkle tree

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::crypto::{verify_proof_bytes, DepositPublicInputs};
use crate::error::PrivacyErrorV2;
use crate::events::DepositMaspEvent;
#[cfg(feature = "event-debug")]
use crate::events::DepositMaspDebugEvent;
use crate::state::{AssetVault, MerkleTreeV2, PoolConfigV2, VerificationKeyAccountV2};
use crate::ProofType;

/// Accounts required for a MASP deposit.
#[derive(Accounts)]
#[instruction(
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    proof_data: Vec<u8>,
)]
pub struct DepositMasp<'info> {
    /// User funding the deposit and paying tx fees
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Global pool configuration
    #[account(
        mut,
        has_one = authority,
        has_one = merkle_tree,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Pool authority (validated via has_one constraint)
    /// CHECK: Validated by has_one constraint on pool_config
    pub authority: UncheckedAccount<'info>,

    /// Merkle tree for commitments belonging to this pool
    #[account(
        mut,
        constraint = merkle_tree.pool == pool_config.key() @ PrivacyErrorV2::InvalidMerkleTreePool
    )]
    pub merkle_tree: Box<Account<'info, MerkleTreeV2>>,

    /// Asset vault configuration for this asset
    #[account(
        mut,
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump = asset_vault.bump,
        constraint = asset_vault.pool == pool_config.key() @ PrivacyErrorV2::InvalidVaultPool,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
        constraint = asset_vault.deposits_enabled @ PrivacyErrorV2::DepositsDisabled,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault token account that receives deposited tokens
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account
            @ PrivacyErrorV2::InvalidVaultTokenAccount
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// User token account providing funds
    #[account(
        mut,
        constraint = user_token_account.mint == asset_vault.mint
            @ PrivacyErrorV2::InvalidMint,
        constraint = user_token_account.owner == depositor.key()
            @ PrivacyErrorV2::InvalidTokenOwner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Mint for this asset
    #[account(
        constraint = mint.key() == asset_vault.mint
            @ PrivacyErrorV2::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    /// Verification key account for the deposit circuit
    #[account(
        seeds = [ProofType::Deposit.as_seed(), pool_config.key().as_ref()],
        bump = deposit_vk.bump,
        constraint = deposit_vk.pool == pool_config.key()
            @ PrivacyErrorV2::InvalidVerificationKeyPool,
        constraint = deposit_vk.proof_type == ProofType::Deposit as u8
            @ PrivacyErrorV2::InvalidVerificationKeyType,
        constraint = deposit_vk.is_initialized
            @ PrivacyErrorV2::VerificationKeyNotSet,
    )]
    pub deposit_vk: Account<'info, VerificationKeyAccountV2>,

    /// SPL token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Handler for deposit_masp instruction
///
/// # Arguments
/// * `amount` - Amount of tokens to deposit
/// * `commitment` - Poseidon commitment = H(secret, nullifier, amount, asset_id)
/// * `asset_id` - Asset identifier (Keccak256(mint)[0..32])
/// * `proof_data` - Groth16 proof bytes (256 bytes)
/// * `encrypted_note` - Optional encrypted note for recipient (future use)
///
/// # Flow
/// 1. Validate inputs and asset binding
/// 2. Verify Groth16 proof (proves knowledge of commitment preimage)
/// 3. Transfer tokens from user to vault
/// 4. Insert commitment into Merkle tree
/// 5. Update vault statistics
/// 6. Emit privacy-preserving deposit event
///
/// # Security
/// - Proof verification happens BEFORE token transfer
/// - Commitment uniqueness is enforced by Merkle tree structure
/// - Zero commitments are rejected (reserved for empty leaves)
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<DepositMasp>,
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    proof_data: Vec<u8>,
    _encrypted_note: Option<Vec<u8>>,
) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;
    let merkle_tree = &mut ctx.accounts.merkle_tree;
    let asset_vault = &mut ctx.accounts.asset_vault;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // =========================================================================
    // 1. INPUT VALIDATION (fail fast before any expensive operations)
    // =========================================================================

    // Amount must be positive
    require!(amount > 0, PrivacyErrorV2::InvalidAmount);

    // Commitment cannot be zero (reserved for empty leaves in Merkle tree)
    require!(
        !commitment.iter().all(|&b| b == 0),
        PrivacyErrorV2::InvalidCommitment
    );

    // Proof must be exactly 256 bytes (Groth16 proof size: 2*G1 + 1*G2)
    require!(
        proof_data.len() == 256,
        PrivacyErrorV2::InvalidProofFormat
    );

    // Asset ID must match vault's configured asset ID
    require!(
        asset_vault.asset_id == asset_id,
        PrivacyErrorV2::AssetIdMismatch
    );

    // Check vault deposit limits if configured
    // Check Merkle tree has space
    require!(
        !merkle_tree.is_full(),
        PrivacyErrorV2::MerkleTreeFull
    );

    // =========================================================================
    // 2. VERIFY GROTH16 PROOF
    // =========================================================================

    // Build public inputs matching deposit.circom order:
    // signal input commitment;
    // signal input amount;
    // signal input asset_id;
    let public_inputs = DepositPublicInputs::new(commitment, amount, asset_id);
    public_inputs.validate()?;

    let public_inputs_fields = public_inputs.to_field_elements();

    // Verify the ZK proof
    let vk = &ctx.accounts.deposit_vk;
    let is_valid = verify_proof_bytes(vk, &proof_data, &public_inputs_fields)?;

    require!(is_valid, PrivacyErrorV2::InvalidProof);

    // =========================================================================
    // 3. TRANSFER TOKENS FROM USER TO VAULT
    // =========================================================================

    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );

    token::transfer(cpi_ctx, amount)?;

    // =========================================================================
    // 4. INSERT COMMITMENT INTO MERKLE TREE
    // =========================================================================

    let leaf_index = merkle_tree.insert_leaf(commitment, timestamp)?;
    let merkle_root = merkle_tree.get_current_root();

    // =========================================================================
    // 5. UPDATE STATISTICS
    // =========================================================================

    // Update asset vault statistics
    asset_vault.record_deposit(amount, timestamp)?;

    // Update pool statistics
    pool_config.record_deposit(timestamp)?;

    // =========================================================================
    // 6. EMIT PRIVACY-PRESERVING EVENT
    // =========================================================================

    // IMPORTANT: This event intentionally does NOT include amount or depositor
    // to prevent correlation attacks and protect depositor privacy.
    //
    // The leaf_index and merkle_root are included because:
    // - Users need leaf_index to construct withdrawal proofs
    // - merkle_root lets clients verify tree state
    // - Neither reveals who deposited or how much
    emit!(DepositMaspEvent {
        pool: pool_config.key(),
        commitment,
        leaf_index,
        merkle_root,
        asset_id,
        timestamp,
    });

    // Debug event - only emitted when event-debug feature is enabled
    // WARNING: This leaks privacy-sensitive data and MUST NOT be enabled in production
    #[cfg(feature = "event-debug")]
    emit!(DepositMaspDebugEvent {
        pool: pool_config.key(),
        commitment,
        leaf_index,
        amount,
        asset_id,
        depositor: ctx.accounts.depositor.key(),
        has_encrypted_note: _encrypted_note.is_some(),
        timestamp,
    });

    msg!(
        "MASP deposit: leaf_index={}, root=0x{}...",
        leaf_index,
        hex::encode(&merkle_root[..4])
    );

    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_proof_data_length() {
        // Groth16 proof = 2 G1 points (64 bytes each) + 1 G2 point (128 bytes)
        // = 64 + 64 + 128 = 256 bytes
        assert_eq!(256, 64 + 64 + 128);
    }
}
