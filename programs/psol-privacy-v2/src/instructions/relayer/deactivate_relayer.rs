//! Deactivate Relayer Instruction
//!
//! Deactivates a relayer node. Can be reactivated later via update_relayer.

use anchor_lang::prelude::*;

use crate::events::RelayerDeactivated;
use crate::DeactivateRelayer;

/// Handler for deactivate_relayer instruction
pub fn handler(ctx: Context<DeactivateRelayer>) -> Result<()> {
    let registry = &mut ctx.accounts.relayer_registry;
    let relayer_node = &mut ctx.accounts.relayer_node;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Deactivate the relayer
    relayer_node.deactivate(timestamp);
    registry.deactivate_relayer(timestamp)?;

    // Emit event
    emit!(RelayerDeactivated {
        pool: ctx.accounts.pool_config.key(),
        relayer: relayer_node.key(),
        operator: ctx.accounts.operator.key(),
        timestamp,
    });

    msg!("Relayer deactivated: {}", relayer_node.key());

    Ok(())
}
