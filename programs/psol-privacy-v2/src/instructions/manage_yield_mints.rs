//! Manage Yield Mints Instruction

use crate::error::PrivacyErrorV2;
use crate::state::{PoolConfigV2, YieldRegistry};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ManageYieldMints<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PoolConfigV2::SEED_PREFIX, authority.key().as_ref()],
        bump = pool_config.bump,
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    #[account(
        mut,
        seeds = [YieldRegistry::SEED_PREFIX, pool_config.key().as_ref()],
        bump = yield_registry.bump,
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
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
