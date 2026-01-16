//! Initialize Yield Registry Instruction

use crate::error::PrivacyErrorV2;
use crate::state::{PoolConfigV2, YieldRegistry};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitYieldRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PoolConfigV2::SEED_PREFIX, authority.key().as_ref()],
        bump = pool_config.bump,
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    #[account(
        init,
        payer = authority,
        space = YieldRegistry::LEN,
        seeds = [YieldRegistry::SEED_PREFIX, pool_config.key().as_ref()],
        bump,
    )]
    pub yield_registry: Account<'info, YieldRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitYieldRegistry>) -> Result<()> {
    ctx.accounts.yield_registry.initialize(
        ctx.accounts.pool_config.key(),
        ctx.accounts.authority.key(),
        ctx.bumps.yield_registry,
    );

    msg!(
        "Yield registry initialized for pool {}",
        ctx.accounts.pool_config.key()
    );
    Ok(())
}
