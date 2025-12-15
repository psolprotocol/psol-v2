//! Register Asset Instruction
//!
//! Registers a new SPL token asset with the MASP pool.
//! Creates an AssetVault account to hold shielded tokens.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::AssetRegistered;
use crate::state::AssetVault;
use crate::RegisterAsset;

/// Handler for register_asset instruction
pub fn handler(ctx: Context<RegisterAsset>, asset_id: [u8; 32]) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;
    
    // Verify pool can register more assets
    require!(
        pool_config.can_register_asset(),
        PrivacyErrorV2::TooManyAssets
    );

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Get bump from context
    let vault_bump = ctx.bumps.asset_vault;

    // Initialize the asset vault
    ctx.accounts.asset_vault.initialize(
        pool_config.key(),
        asset_id,
        ctx.accounts.mint.key(),
        ctx.accounts.vault_token_account.key(),
        vault_bump,
        ctx.accounts.mint.decimals,
        AssetVault::ASSET_TYPE_SPL,
        timestamp,
    );

    // Update pool config
    pool_config.register_asset()?;
    pool_config.last_activity_at = timestamp;

    // Emit event
    emit!(AssetRegistered {
        pool: pool_config.key(),
        asset_id,
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.asset_vault.key(),
        decimals: ctx.accounts.mint.decimals,
        timestamp,
    });

    msg!(
        "Registered asset: mint={}, decimals={}",
        ctx.accounts.mint.key(),
        ctx.accounts.mint.decimals
    );

    Ok(())
}
