//! Update Relayer Instruction
//!
//! Updates relayer configuration including fee and metadata.

use anchor_lang::prelude::*;

use crate::events::RelayerUpdated;
use crate::UpdateRelayer;

/// Handler for update_relayer instruction
pub fn handler(
    ctx: Context<UpdateRelayer>,
    fee_bps: Option<u16>,
    metadata_uri: Option<String>,
    is_active: Option<bool>,
) -> Result<()> {
    let registry = &mut ctx.accounts.relayer_registry;
    let relayer_node = &mut ctx.accounts.relayer_node;

    // If updating fee, validate it's within bounds
    if let Some(fee) = fee_bps {
        registry.validate_fee(fee)?;
    }

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Track if we're changing active status
    let was_active = relayer_node.is_active;
    let will_be_active = is_active.unwrap_or(was_active);

    // Update relayer node
    relayer_node.update(fee_bps, metadata_uri, is_active, timestamp)?;

    // Update registry counts if active status changed
    if was_active && !will_be_active {
        registry.deactivate_relayer(timestamp)?;
    } else if !was_active && will_be_active {
        registry.reactivate_relayer(timestamp)?;
    }

    // Emit event
    emit!(RelayerUpdated {
        pool: ctx.accounts.pool_config.key(),
        relayer: relayer_node.key(),
        operator: ctx.accounts.operator.key(),
        fee_bps: relayer_node.fee_bps,
        is_active: relayer_node.is_active,
        timestamp,
    });

    msg!(
        "Relayer updated: fee={} bps, active={}",
        relayer_node.fee_bps,
        relayer_node.is_active
    );

    Ok(())
}
