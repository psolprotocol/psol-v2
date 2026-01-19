//! Set Feature Flags Instruction
//!
//! Allows pool authority to enable/disable feature flags on the pool.
//! This includes FEATURE_YIELD_ENFORCEMENT for LST yield fee enforcement.

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;
use crate::state::PoolConfigV2;

#[derive(Accounts)]
pub struct SetFeatureFlags<'info> {
    /// Pool authority - must be signer
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool config - validated via has_one (no PDA seeds constraint)
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::InvalidAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

/// Enable a feature flag
pub fn enable_feature(ctx: Context<SetFeatureFlags>, feature: u8) -> Result<()> {
    // Validate feature bit is a single valid flag
    require!(
        feature.count_ones() == 1 && feature <= PoolConfigV2::FEATURE_YIELD_ENFORCEMENT,
        PrivacyErrorV2::InvalidFeatureFlag
    );
    
    ctx.accounts.pool_config.enable_feature(feature);
    
    msg!("Feature {} enabled. New flags: {}", feature, ctx.accounts.pool_config.feature_flags);
    Ok(())
}

/// Disable a feature flag
pub fn disable_feature(ctx: Context<SetFeatureFlags>, feature: u8) -> Result<()> {
    // Validate feature bit is a single valid flag
    require!(
        feature.count_ones() == 1 && feature <= PoolConfigV2::FEATURE_YIELD_ENFORCEMENT,
        PrivacyErrorV2::InvalidFeatureFlag
    );
    
    // Don't allow disabling MASP (core functionality)
    require!(
        feature != PoolConfigV2::FEATURE_MASP,
        PrivacyErrorV2::CannotDisableCoreFeature
    );
    
    ctx.accounts.pool_config.disable_feature(feature);
    
    msg!("Feature {} disabled. New flags: {}", feature, ctx.accounts.pool_config.feature_flags);
    Ok(())
}
