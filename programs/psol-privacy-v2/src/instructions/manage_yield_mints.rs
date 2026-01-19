//! Manage Yield Mints Instruction
//!
//! Add or remove yield-bearing mints (LSTs) from the registry.
//! Only pool authority can manage mints.

use crate::error::PrivacyErrorV2;
use crate::state::{PoolConfigV2, YieldRegistry};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ManageYieldMints<'info> {
    /// Pool authority - must be signer
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool config - validated via has_one (no PDA seeds constraint)
    #[account(
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Yield registry - PDA derived from pool_config
    #[account(
        mut,
        seeds = [YieldRegistry::SEED_PREFIX, pool_config.key().as_ref()],
        bump = yield_registry.bump,
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
        constraint = yield_registry.pool_config == pool_config.key() @ PrivacyErrorV2::InvalidPoolReference,
    )]
    pub yield_registry: Account<'info, YieldRegistry>,
}

pub fn add_yield_mint(ctx: Context<ManageYieldMints>, mint: Pubkey) -> Result<()> {
    ctx.accounts.yield_registry.add_mint(mint)?;
    msg!("Added yield mint: {}", mint);
    Ok(())
}

pub fn remove_yield_mint(ctx: Context<ManageYieldMints>, mint: Pubkey) -> Result<()> {
    ctx.accounts.yield_registry.remove_mint(&mint)?;
    msg!("Removed yield mint: {}", mint);
    Ok(())
}
