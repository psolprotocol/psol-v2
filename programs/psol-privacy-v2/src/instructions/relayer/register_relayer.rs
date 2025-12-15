//! Register Relayer Instruction
//!
//! Registers a new relayer node with the pool.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::RelayerRegistered;
use crate::state::MAX_RELAYER_METADATA_URI_LEN;
use crate::RegisterRelayer;

/// Handler for register_relayer instruction
pub fn handler(
    ctx: Context<RegisterRelayer>,
    fee_bps: u16,
    metadata_uri: String,
) -> Result<()> {
    let registry = &mut ctx.accounts.relayer_registry;
    let relayer_node = &mut ctx.accounts.relayer_node;

    // Validate metadata URI length
    require!(
        metadata_uri.len() <= MAX_RELAYER_METADATA_URI_LEN,
        PrivacyErrorV2::InputTooLarge
    );

    // Validate fee is within bounds
    registry.validate_fee(fee_bps)?;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Register with registry
    registry.register_relayer(timestamp)?;

    // Initialize relayer node
    relayer_node.initialize(
        registry.key(),
        ctx.accounts.operator.key(),
        fee_bps,
        metadata_uri,
        ctx.bumps.relayer_node,
        timestamp,
    );

    // Emit event
    emit!(RelayerRegistered {
        pool: ctx.accounts.pool_config.key(),
        registry: registry.key(),
        relayer: relayer_node.key(),
        operator: ctx.accounts.operator.key(),
        fee_bps,
        timestamp,
    });

    msg!(
        "Relayer registered: operator={}, fee={} bps",
        ctx.accounts.operator.key(),
        fee_bps
    );

    Ok(())
}
