//! Configure Asset Instruction - pSOL v2
//!
//! Allows pool authority to configure asset-specific settings including:
//! - Fixed denomination mode for stronger privacy
//! - Deposit/withdrawal enable/disable
//! - Deposit limits (min/max)
//!
//! # Fixed Denomination Mode
//!
//! When enabled, all deposits and withdrawals for this asset MUST use exactly
//! the specified denomination amount. This provides stronger privacy by making
//! all transactions indistinguishable by value, increasing the anonymity set.
//!
//! ## Privacy Trade-offs
//!
//! **Flexible amounts (default)**:
//! - More convenient for users
//! - Supports arbitrary deposit/withdrawal amounts
//! - Easier to correlate by matching amounts
//!
//! **Fixed denomination**:
//! - Stronger anonymity set (all transactions look identical)
//! - Eliminates amount-based correlation attacks
//! - Requires multiple transactions for larger amounts
//! - Common in mixer-like privacy systems (e.g., Tornado Cash)

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::AssetConfigUpdated;
use crate::state::{AssetVault, PoolConfigV2};

/// Accounts for configuring asset settings
#[derive(Accounts)]
pub struct ConfigureAsset<'info> {
    /// Pool authority (must be signer)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Asset vault to configure
    #[account(
        mut,
        constraint = asset_vault.pool == pool_config.key() @ PrivacyErrorV2::InvalidVaultPool,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
    )]
    pub asset_vault: Account<'info, AssetVault>,
}

/// Handler for configuring asset settings
///
/// # Arguments
/// * `deposits_enabled` - Optional: enable/disable deposits
/// * `withdrawals_enabled` - Optional: enable/disable withdrawals
/// * `min_deposit` - Optional: minimum deposit amount (ignored if fixed denomination)
/// * `max_deposit` - Optional: maximum deposit amount (ignored if fixed denomination)
/// * `is_fixed_denomination` - Optional: enable/disable fixed denomination mode
/// * `fixed_denomination` - Optional: the exact amount required (must be > 0 if enabling)
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<ConfigureAsset>,
    deposits_enabled: Option<bool>,
    withdrawals_enabled: Option<bool>,
    min_deposit: Option<u64>,
    max_deposit: Option<u64>,
    is_fixed_denomination: Option<bool>,
    fixed_denomination: Option<u64>,
) -> Result<()> {
    let asset_vault = &mut ctx.accounts.asset_vault;
    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Update deposit/withdrawal flags if provided
    if let Some(enabled) = deposits_enabled {
        asset_vault.set_deposits_enabled(enabled);
    }

    if let Some(enabled) = withdrawals_enabled {
        asset_vault.set_withdrawals_enabled(enabled);
    }

    // Update deposit limits if provided (only relevant for flexible mode)
    if let Some(min) = min_deposit {
        if let Some(max) = max_deposit {
            asset_vault.set_deposit_limits(min, max)?;
        } else {
            asset_vault.set_deposit_limits(min, asset_vault.max_deposit)?;
        }
    } else if let Some(max) = max_deposit {
        asset_vault.set_deposit_limits(asset_vault.min_deposit, max)?;
    }

    // Update fixed denomination mode if provided
    if let Some(is_fixed) = is_fixed_denomination {
        if is_fixed {
            // When enabling fixed denomination, a denomination amount must be provided
            let denomination = fixed_denomination.ok_or(error!(PrivacyErrorV2::InvalidAmount))?;
            asset_vault.set_fixed_denomination(true, denomination)?;
            
            msg!(
                "Fixed denomination enabled: {} units",
                denomination
            );
        } else {
            // Disable fixed denomination
            asset_vault.disable_fixed_denomination();
            
            msg!("Fixed denomination disabled, using flexible amounts");
        }
    } else if let Some(denomination) = fixed_denomination {
        // If only denomination is provided without explicit enable flag,
        // update the denomination amount (must already be in fixed mode)
        if asset_vault.is_fixed_denomination {
            asset_vault.set_fixed_denomination(true, denomination)?;
        } else {
            // Enable fixed denomination with the provided amount
            asset_vault.set_fixed_denomination(true, denomination)?;
        }
    }

    asset_vault.last_activity_at = timestamp;

    // Emit configuration update event
    emit!(AssetConfigUpdated {
        pool: ctx.accounts.pool_config.key(),
        asset_id: asset_vault.asset_id,
        deposits_enabled: asset_vault.deposits_enabled,
        withdrawals_enabled: asset_vault.withdrawals_enabled,
        is_fixed_denomination: asset_vault.is_fixed_denomination,
        fixed_denomination: asset_vault.fixed_denomination,
        timestamp,
    });

    msg!(
        "Asset configured: fixed_denom={}, denom_amount={}",
        asset_vault.is_fixed_denomination,
        asset_vault.fixed_denomination
    );

    Ok(())
}
