//! MASP Deposit Instruction - pSOL v2 (PRIVACY-SAFE BATCHING)
//!
//! # Privacy Protection Changes
//!
//! Pending buffer now stores ONLY:
//! - Commitment (already privacy-preserving)
//! - Timestamp (non-sensitive)
//!
//! Does NOT store:
//! - Depositor address (would enable linking deposits)
//! - Amount (would enable analysis)
//! - Asset ID (tracked in vault stats, not per-deposit)
//!
//! # Security Model
//!
//! 1. Tokens transferred IMMEDIATELY to vault (not deferred)
//! 2. Vault statistics updated IMMEDIATELY
//! 3. Commitment added to pending buffer
//! 4. Batch processor inserts into Merkle tree later
//!
//! If batch processing fails, it doesn't matter because:
//! - Tokens are already in vault
//! - Stats are already updated
//! - Failed batch can be retried with same commitments

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::crypto::{self, verify_proof_bytes, DepositPublicInputs};
use crate::error::PrivacyErrorV2;
use crate::events::DepositPendingEvent;
#[cfg(feature = "event-debug")]
use crate::events::DepositPendingDebugEvent;
use crate::state::{
    AssetVault, PendingDepositsBuffer, PoolConfigV2, VerificationKeyAccountV2,
};
use crate::ProofType;

/// Accounts required for a MASP deposit with batching
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
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Pool authority (validated via has_one constraint)
    /// CHECK: Validated by has_one constraint on pool_config
    pub authority: UncheckedAccount<'info>,

    /// Pending deposits buffer (privacy-safe)
    #[account(
        mut,
        seeds = [
            PendingDepositsBuffer::SEED_PREFIX,
            pool_config.key().as_ref(),
        ],
        bump = pending_buffer.bump,
        constraint = pending_buffer.pool == pool_config.key() @ PrivacyErrorV2::InvalidPoolReference,
    )]
    pub pending_buffer: Box<Account<'info, PendingDepositsBuffer>>,

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
}

/// Handler for deposit_masp instruction (Privacy-Safe Batching Version)
///
/// # Arguments
/// * `amount` - Amount of tokens to deposit
/// * `commitment` - Poseidon commitment = H(secret, nullifier, amount, asset_id)
/// * `asset_id` - Asset identifier (Keccak256(mint)[0..32])
/// * `proof_data` - Groth16 proof bytes (256 bytes)
/// * `encrypted_note` - Optional encrypted note for recipient
///
/// # Privacy Protection
/// Buffer stores ONLY commitment + timestamp.
/// Depositor address and amount are NOT stored on-chain in buffer.
///
/// # Flow
/// 1. Check crypto availability
/// 2. Validate inputs
/// 3. Verify Groth16 proof
/// 4. Transfer tokens to vault (IMMEDIATE)
/// 5. Update vault statistics (IMMEDIATE)
/// 6. Add commitment to pending buffer (privacy-safe)
/// 7. Emit pending deposit event (privacy-preserving)
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<DepositMasp>,
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    proof_data: Vec<u8>,
    _encrypted_note: Option<Vec<u8>>,
) -> Result<()> {
    // =========================================================================
    // 0. CHECK CRYPTO AVAILABILITY
    // =========================================================================
    
    // This fails if neither:
    // - insecure-dev feature is enabled (dev mode), NOR
    // - Real crypto is implemented (production)
    crypto::require_crypto_available()?;

    let pool_config = &mut ctx.accounts.pool_config;
    let pending_buffer = &mut ctx.accounts.pending_buffer;
    let asset_vault = &mut ctx.accounts.asset_vault;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // =========================================================================
    // 1. INPUT VALIDATION
    // =========================================================================

    require!(amount > 0, PrivacyErrorV2::InvalidAmount);

    require!(
        !commitment.iter().all(|&b| b == 0),
        PrivacyErrorV2::InvalidCommitment
    );

    require!(
        proof_data.len() == 256,
        PrivacyErrorV2::InvalidProofFormat
    );

    require!(
        asset_vault.asset_id == asset_id,
        PrivacyErrorV2::AssetIdMismatch
    );

    require!(
        !pending_buffer.is_full(),
        PrivacyErrorV2::BufferFull
    );

    // =========================================================================
    // 2. VERIFY GROTH16 PROOF
    // =========================================================================

    let public_inputs = DepositPublicInputs::new(commitment, amount, asset_id);
    public_inputs.validate()?;

    let public_inputs_fields = public_inputs.to_field_elements();

    let vk = &ctx.accounts.deposit_vk;
    let is_valid = verify_proof_bytes(vk, &proof_data, &public_inputs_fields)?;

    require!(is_valid, PrivacyErrorV2::InvalidProof);

    // =========================================================================
    // 3. TRANSFER TOKENS (IMMEDIATE - NOT DEFERRED)
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
    // 4. UPDATE VAULT STATISTICS (IMMEDIATE)
    // =========================================================================

    asset_vault.record_deposit(amount, timestamp)?;

    // =========================================================================
    // 5. ADD COMMITMENT TO PENDING BUFFER (PRIVACY-SAFE)
    // =========================================================================

    // ONLY stores commitment and timestamp
    // Does NOT store depositor, amount, or asset_id
    let buffer_index = pending_buffer.add_pending(
        commitment,
        timestamp,
    )?;

    // =========================================================================
    // 6. UPDATE POOL STATISTICS
    // =========================================================================

    pool_config.record_pending_deposit(timestamp)?;

    // =========================================================================
    // 7. EMIT PENDING DEPOSIT EVENT (PRIVACY-PRESERVING)
    // =========================================================================

    // Production event: Does NOT include amount or depositor
    emit!(DepositPendingEvent {
        pool: pool_config.key(),
        commitment,
        buffer_index: buffer_index as u32,
        asset_id,  // OK to include - not privacy-sensitive in multi-asset pool
        timestamp,
    });

    // Debug event: Includes sensitive data (ONLY with event-debug feature)
    #[cfg(feature = "event-debug")]
    emit!(DepositPendingDebugEvent {
        pool: pool_config.key(),
        commitment,
        buffer_index: buffer_index as u32,
        amount,  // ⚠️ Privacy leak - debug only
        asset_id,
        depositor: ctx.accounts.depositor.key(),  // ⚠️ Privacy leak - debug only
        has_encrypted_note: _encrypted_note.is_some(),
        timestamp,
    });

    msg!(
        "Deposit pending: buffer_index={}, pending_total={}",
        buffer_index,
        pending_buffer.total_pending
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_data_length() {
        assert_eq!(256, 64 + 64 + 128);
    }
}
