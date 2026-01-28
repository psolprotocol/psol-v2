//! Clear Pending Buffer Instruction
//!
//! Emergency admin function to clear pending deposits buffer.
use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;
use crate::state::{PoolConfigV2, PendingDepositsBuffer};

#[derive(Accounts)]
pub struct ClearPendingBuffer<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Pending deposits buffer
    #[account(
        mut,
        constraint = pending_buffer.pool == pool_config.key() @ PrivacyErrorV2::InvalidVerificationKeyPool,
    )]
    pub pending_buffer: Account<'info, PendingDepositsBuffer>,
}

pub fn handler(ctx: Context<ClearPendingBuffer>) -> Result<()> {
    let pending = &mut ctx.accounts.pending_buffer;
    let count = pending.total_pending;
    pending.deposits.clear();
    pending.total_pending = 0;
    msg!("Cleared {} pending deposits", count);
    Ok(())
}
