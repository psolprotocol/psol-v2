//! Unpause Pool V2 Instruction
//!
//! Unpauses the pool, re-enabling all operations.

use anchor_lang::prelude::*;

use crate::events::PoolUnpausedV2;
use crate::UnpausePoolV2;

/// Handler for unpause_pool_v2 instruction
pub fn handler(ctx: Context<UnpausePoolV2>) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Unpause the pool
    pool_config.set_paused(false);
    pool_config.last_activity_at = timestamp;

    // Emit event
    emit!(PoolUnpausedV2 {
        pool: pool_config.key(),
        authority: ctx.accounts.authority.key(),
        timestamp,
    });

    msg!("Pool unpaused by authority");

    Ok(())
}
