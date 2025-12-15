//! Configure Relayer Registry Instruction
//!
//! Configures global relayer parameters including fee bounds and staking requirements.

use anchor_lang::prelude::*;

use crate::events::RelayerRegistryConfigured;
use crate::ConfigureRelayerRegistry;

/// Handler for configure_relayer_registry instruction
pub fn handler(
    ctx: Context<ConfigureRelayerRegistry>,
    min_fee_bps: u16,
    max_fee_bps: u16,
    require_stake: bool,
    min_stake_amount: u64,
) -> Result<()> {
    let registry = &mut ctx.accounts.relayer_registry;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Configure the registry
    registry.configure(
        min_fee_bps,
        max_fee_bps,
        require_stake,
        min_stake_amount,
        timestamp,
    )?;

    // Emit event
    emit!(RelayerRegistryConfigured {
        pool: ctx.accounts.pool_config.key(),
        registry: registry.key(),
        min_fee_bps,
        max_fee_bps,
        require_stake,
        min_stake_amount,
        timestamp,
    });

    msg!(
        "Relayer registry configured: fee range {}..{} bps, stake: {} (min: {})",
        min_fee_bps,
        max_fee_bps,
        require_stake,
        min_stake_amount
    );

    Ok(())
}
