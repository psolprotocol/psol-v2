//! Pause Pool V2 Instruction
//!
//! Pauses the pool, preventing all deposits, withdrawals, and transfers.
//! Only admin instructions remain available when paused.

use anchor_lang::prelude::*;

use crate::events::PoolPausedV2;
use crate::PausePoolV2;

/// Handler for pause_pool_v2 instruction
pub fn handler(ctx: Context<PausePoolV2>) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Pause the pool
    pool_config.set_paused(true);
    pool_config.last_activity_at = timestamp;

    // Emit event
    emit!(PoolPausedV2 {
        pool: pool_config.key(),
        authority: ctx.accounts.authority.key(),
        timestamp,
    });

    msg!("Pool paused by authority");

    Ok(())
}
