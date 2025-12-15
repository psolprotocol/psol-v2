//! Withdraw MASP Instruction - pSOL v2
//!
//! Withdraws tokens from the shielded pool using a ZK proof.
//!
//! # Privacy Considerations
//!
//! The withdrawal event intentionally does NOT include:
//! - recipient (visible in tx accounts, but not easily indexed from events)
//! - amount (prevents amount correlation attacks)
//!
//! While this data is technically visible in transaction accounts (required
//! for token delivery), omitting it from events makes large-scale indexing
//! and correlation significantly harder.
//!
//! # Security Model
//!
//! 1. User generates ZK proof proving:
//!    - Knowledge of commitment preimage (secret, nullifier, amount, asset_id)
//!    - Commitment exists in Merkle tree at known root
//!    - Nullifier is correctly derived from secret + leaf_index
//! 2. Nullifier is marked as spent (prevents double-spending)
//! 3. Tokens are transferred to recipient
//! 4. Relayer receives fee for submitting transaction

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::crypto::{verify_proof_bytes, WithdrawPublicInputs};
use crate::error::PrivacyErrorV2;
use crate::events::WithdrawMaspEvent;
#[cfg(feature = "event-debug")]
use crate::events::WithdrawMaspDebugEvent;
use crate::state::{
    AssetVault, MerkleTreeV2, PoolConfigV2, RelayerNode, RelayerRegistry,
    SpentNullifierV2, SpendType, VerificationKeyAccountV2,
};
use crate::ProofType;

/// Minimum withdrawal amount to prevent dust attacks
pub const MIN_WITHDRAWAL_AMOUNT: u64 = 100;

/// Maximum relayer fee in basis points (10% = 1000 bps)
pub const MAX_RELAYER_FEE_BPS: u64 = 1000;

/// Accounts for withdrawing from the MASP
#[derive(Accounts)]
#[instruction(
    proof_data: Vec<u8>,
    merkle_root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    asset_id: [u8; 32],
    relayer_fee: u64,
)]
pub struct WithdrawMasp<'info> {
    /// Relayer submitting the transaction (pays gas, receives fee)
    #[account(mut)]
    pub relayer: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(
        constraint = merkle_tree.is_known_root(&merkle_root) @ PrivacyErrorV2::InvalidMerkleRoot,
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Verification key for withdraw proofs
    #[account(
        seeds = [ProofType::Withdraw.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
        constraint = vk_account.is_initialized @ PrivacyErrorV2::VerificationKeyNotSet,
        constraint = vk_account.proof_type == ProofType::Withdraw as u8
            @ PrivacyErrorV2::InvalidVerificationKeyType,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    /// Asset vault account
    #[account(
        mut,
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump = asset_vault.bump,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
        constraint = asset_vault.withdrawals_enabled @ PrivacyErrorV2::WithdrawalsDisabled,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault's token account (source)
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account 
            @ PrivacyErrorV2::InvalidVaultTokenAccount,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Recipient's token account (destination)
    /// CHECK: We verify the mint matches, recipient can be any valid token account
    #[account(
        mut,
        constraint = recipient_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Relayer's token account for fee (if relayer_fee > 0)
    #[account(
        mut,
        constraint = relayer_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    )]
    pub relayer_token_account: Account<'info, TokenAccount>,

    /// Spent nullifier account (PDA, created on first use)
    #[account(
        init,
        payer = relayer,
        space = SpentNullifierV2::LEN,
        seeds = [
            SpentNullifierV2::SEED_PREFIX,
            pool_config.key().as_ref(),
            nullifier_hash.as_ref(),
        ],
        bump,
    )]
    pub spent_nullifier: Account<'info, SpentNullifierV2>,

    /// Relayer registry
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Relayer node (optional, for registered relayers)
    pub relayer_node: Option<Account<'info, RelayerNode>>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Handler for withdraw_masp instruction
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<WithdrawMasp>,
    proof_data: Vec<u8>,
    merkle_root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    asset_id: [u8; 32],
    relayer_fee: u64,
) -> Result<()> {
    // =========================================================================
    // INPUT VALIDATION (fail fast before any state changes)
    // =========================================================================

    // Validate proof data length (Groth16: 2*G1 + 1*G2 = 256 bytes)
    require!(
        proof_data.len() == 256,
        PrivacyErrorV2::InvalidProofFormat
    );

    // Validate amount is above minimum (prevents dust attacks)
    require!(
        amount >= MIN_WITHDRAWAL_AMOUNT,
        PrivacyErrorV2::InvalidAmount
    );

    // Validate nullifier is not zero
    require!(
        !nullifier_hash.iter().all(|&b| b == 0),
        PrivacyErrorV2::InvalidNullifier
    );

    // Validate merkle root is not zero
    require!(
        !merkle_root.iter().all(|&b| b == 0),
        PrivacyErrorV2::InvalidMerkleRoot
    );

    // Validate relayer fee doesn't exceed amount
    require!(
        relayer_fee <= amount,
        PrivacyErrorV2::RelayerFeeExceedsAmount
    );

    // Validate relayer fee is reasonable (max 10% for safety)
    // Using multiplication to avoid integer division edge cases:
    // relayer_fee <= amount * 10% is equivalent to relayer_fee * 10 <= amount
    // This correctly handles small amounts where amount/10 would truncate to 0
    require!(
        relayer_fee.saturating_mul(10) <= amount,
        PrivacyErrorV2::RelayerFeeOutOfRange
    );

    // Validate asset ID matches
    require!(
        asset_id == ctx.accounts.asset_vault.asset_id,
        PrivacyErrorV2::AssetIdMismatch
    );

    // Validate withdrawal amount (handles both fixed denomination and balance check)
    // For fixed denomination pools, this enforces exact amount match.
    ctx.accounts.asset_vault.validate_withdrawal_amount(amount)?;

    // Validate sufficient vault balance
    require!(
        ctx.accounts.vault_token_account.amount >= amount,
        PrivacyErrorV2::InsufficientBalance
    );

    // Validate relayer if registered
    if let Some(ref relayer_node) = ctx.accounts.relayer_node {
        require!(
            relayer_node.is_active,
            PrivacyErrorV2::RelayerNotActive
        );
        require!(
            relayer_node.operator == ctx.accounts.relayer.key(),
            PrivacyErrorV2::Unauthorized
        );
        // Validate fee matches registered relayer's rate
        let expected_fee = relayer_node.calculate_fee(amount)?;
        require!(
            relayer_fee <= expected_fee,
            PrivacyErrorV2::RelayerFeeOutOfRange
        );
    }

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;
    let slot = clock.slot;

    // Validate timestamp is sane
    require!(timestamp > 0, PrivacyErrorV2::InvalidTimestamp);

    // =========================================================================
    // PROOF VERIFICATION (before any state changes)
    // =========================================================================

    // Construct public inputs for proof verification
    // Must match withdraw.circom public signal order:
    // merkle_root, nullifier_hash, asset_id, recipient, amount, relayer, relayer_fee, public_data_hash
    let public_inputs = WithdrawPublicInputs::new(
        merkle_root,
        nullifier_hash,
        asset_id,
        recipient,
        amount,
        ctx.accounts.relayer.key(),
        relayer_fee,
        [0u8; 32], // public_data_hash (reserved for future use)
    );
    public_inputs.validate()?;

    // Verify the ZK proof
    let field_elements = public_inputs.to_field_elements();
    let is_valid = verify_proof_bytes(
        &ctx.accounts.vk_account,
        &proof_data,
        &field_elements,
    )?;

    require!(is_valid, PrivacyErrorV2::InvalidProof);

    // =========================================================================
    // STATE CHANGES (only after proof verification succeeds)
    // =========================================================================

    // Mark nullifier as spent (this is atomic with account creation)
    // If the nullifier was already spent, account creation would have failed
    ctx.accounts.spent_nullifier.initialize(
        ctx.accounts.pool_config.key(),
        nullifier_hash,
        asset_id,
        SpendType::Withdraw,
        timestamp,
        slot,
        ctx.accounts.relayer.key(),
        ctx.bumps.spent_nullifier,
    );

    // Calculate recipient amount after relayer fee
    let recipient_amount = amount
        .checked_sub(relayer_fee)
        .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

    // Create vault signer seeds for CPI
    let pool_key = ctx.accounts.pool_config.key();
    let vault_bump = ctx.accounts.asset_vault.bump;
    let vault_seeds: &[&[u8]] = &[
        AssetVault::SEED_PREFIX,
        pool_key.as_ref(),
        asset_id.as_ref(),
        &[vault_bump],
    ];

    // Transfer tokens to recipient
    if recipient_amount > 0 {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.asset_vault.to_account_info(),
            },
            &[vault_seeds],
        );
        token::transfer(transfer_ctx, recipient_amount)?;
    }

    // Transfer fee to relayer
    if relayer_fee > 0 {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.relayer_token_account.to_account_info(),
                authority: ctx.accounts.asset_vault.to_account_info(),
            },
            &[vault_seeds],
        );
        token::transfer(transfer_ctx, relayer_fee)?;
    }

    // Update asset vault statistics
    ctx.accounts.asset_vault.record_withdrawal(amount, timestamp)?;

    // Update pool statistics
    ctx.accounts.pool_config.record_withdrawal(timestamp)?;

    // Update relayer statistics if registered
    if let Some(relayer_node) = ctx.accounts.relayer_node.as_mut() {
        relayer_node.record_transaction(relayer_fee, timestamp)?;
    }

    // =========================================================================
    // EMIT PRIVACY-PRESERVING EVENT
    // =========================================================================

    // Emit minimal, privacy-preserving withdraw event.
    // Does NOT include recipient or amount to prevent easy indexing/correlation.
    //
    // While recipient and amount ARE visible in transaction accounts (required
    // for token delivery), omitting them from events makes large-scale
    // correlation significantly harder - events are the primary data source
    // for most indexing infrastructure.
    emit!(WithdrawMaspEvent {
        pool: ctx.accounts.pool_config.key(),
        nullifier_hash,
        asset_id,
        relayer: ctx.accounts.relayer.key(),
        relayer_fee,
        timestamp,
    });

    // Debug event - only emitted when event-debug feature is enabled
    // WARNING: MUST NOT be enabled in mainnet builds
    #[cfg(feature = "event-debug")]
    {
        emit!(WithdrawMaspDebugEvent {
            pool: ctx.accounts.pool_config.key(),
            nullifier_hash,
            recipient,
            amount,
            asset_id,
            relayer: ctx.accounts.relayer.key(),
            relayer_fee,
            timestamp,
        });

        msg!(
            "MASP withdrawal (debug): amount={}, recipient={}, fee={}",
            amount,
            recipient,
            relayer_fee
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_relayer_fee_validation_small_amounts() {
        // Test that small amounts can still have relayer fees
        // amount = 100, max fee should be 10 (10%)
        let amount: u64 = 100;
        let relayer_fee: u64 = 10;
        assert!(relayer_fee.saturating_mul(10) <= amount); // 100 <= 100 ✓

        // amount = 15, max fee should be 1 (not 0!)
        let amount: u64 = 15;
        let relayer_fee: u64 = 1;
        assert!(relayer_fee.saturating_mul(10) <= amount); // 10 <= 15 ✓

        // amount = 5, max fee should be 0
        let amount: u64 = 5;
        let relayer_fee: u64 = 0;
        assert!(relayer_fee.saturating_mul(10) <= amount); // 0 <= 5 ✓

        // Reject excessive fee
        let amount: u64 = 100;
        let relayer_fee: u64 = 11;
        assert!(!(relayer_fee.saturating_mul(10) <= amount)); // 110 > 100 ✗
    }

    #[test]
    fn test_min_withdrawal_amount() {
        assert_eq!(MIN_WITHDRAWAL_AMOUNT, 100);
    }
}
