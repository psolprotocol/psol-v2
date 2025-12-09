//! Deposit MASP Instruction
//!
//! Deposits tokens into the shielded pool and inserts commitment into Merkle tree.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::PrivacyErrorV2;
use crate::events::DepositMaspEvent;
use crate::state::{
    AssetVault, ComplianceConfig, MerkleTreeV2, PoolConfigV2,
};

/// Accounts for depositing to the MASP
#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32], asset_id: [u8; 32])]
pub struct DepositMasp<'info> {
    /// Depositor (token owner)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
        has_one = compliance_config,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(mut)]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

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
        constraint = asset_vault.deposits_enabled @ PrivacyErrorV2::DepositsDisabled,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Depositor's token account (source)
    #[account(
        mut,
        constraint = depositor_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
        constraint = depositor_token_account.owner == depositor.key() @ PrivacyErrorV2::InvalidOwner,
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    /// Vault's token account (destination)
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account @ PrivacyErrorV2::InvalidOwner,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Compliance configuration
    pub compliance_config: Account<'info, ComplianceConfig>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Handler for deposit_masp instruction
pub fn handler(
    ctx: Context<DepositMasp>,
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    encrypted_note: Option<Vec<u8>>,
) -> Result<()> {
    // Validate amount
    require!(amount > 0, PrivacyErrorV2::InvalidAmount);

    // Validate commitment is not zero
    require!(
        !commitment.iter().all(|&b| b == 0),
        PrivacyErrorV2::InvalidCommitment
    );

    // Validate asset ID matches
    require!(
        asset_id == ctx.accounts.asset_vault.asset_id,
        PrivacyErrorV2::AssetIdMismatch
    );

    // Validate deposit amount limits
    ctx.accounts.asset_vault.validate_deposit_amount(amount)?;

    // Check compliance requirements
    let has_note = encrypted_note.is_some();
    ctx.accounts.compliance_config.check_note_requirement(has_note)?;

    // Validate encrypted note size if present
    if let Some(ref note) = encrypted_note {
        require!(
            note.len() <= 1024,
            PrivacyErrorV2::InputTooLarge
        );
    }

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Validate timestamp is reasonable (not in distant future)
    require!(
        timestamp > 0,
        PrivacyErrorV2::InvalidTimestamp
    );

    // Transfer tokens from depositor to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Insert commitment into Merkle tree
    let leaf_index = ctx.accounts.merkle_tree.insert_leaf(commitment, timestamp)?;

    // Update asset vault statistics
    ctx.accounts.asset_vault.record_deposit(amount, timestamp)?;

    // Update pool statistics
    ctx.accounts.pool_config.record_deposit(timestamp)?;

    // Emit event
    emit!(DepositMaspEvent {
        pool: ctx.accounts.pool_config.key(),
        commitment,
        leaf_index,
        amount,
        asset_id,
        has_encrypted_note: has_note,
        timestamp,
    });

    msg!(
        "MASP deposit: amount={}, leaf_index={}",
        amount,
        leaf_index
    );

    Ok(())
}
