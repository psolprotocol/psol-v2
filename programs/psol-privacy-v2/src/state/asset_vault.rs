//! Asset Vault State - pSOL v2 MASP
//!
//! # Multi-Asset Support
//! Each registered asset has its own vault account storing:
//! - SPL token account for that asset
//! - Deposit/withdrawal statistics
//! - Asset-specific configuration
//!
//! # Fixed Denomination Pools
//! Vaults can be configured as fixed-denomination pools for stronger privacy.
//! When `is_fixed_denomination` is true, all deposits and withdrawals MUST
//! use exactly `fixed_denomination` amount. This eliminates amount-based
//! correlation attacks by ensuring all transactions are indistinguishable
//! by value.
//!
//! ## Privacy Trade-offs
//! - **Flexible amounts**: More convenient, supports any amount, but easier
//!   to correlate deposits/withdrawals by matching amounts.
//! - **Fixed denomination**: Stronger anonymity set (all txs look identical),
//!   but requires multiple transactions for larger amounts.
//!
//! ## Common Denominations
//! For SPL tokens with 6 decimals (e.g., USDC), common fixed denominations:
//! - 1_000_000 (1 unit)
//! - 10_000_000 (10 units)
//! - 100_000_000 (100 units)
//! - 1_000_000_000 (1000 units)
//!
//! # Asset ID
//! asset_id = Keccak256(mint_address)[0..32]
//! This provides a consistent 32-byte identifier for use in commitments.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;

/// Maximum length for asset metadata URI
pub const MAX_METADATA_URI_LEN: usize = 200;

/// Asset vault account - one per registered asset
///
/// PDA Seeds: `[b"vault_v2", pool.key().as_ref(), asset_id.as_ref()]`
#[account]
pub struct AssetVault {
    /// Reference to parent pool
    pub pool: Pubkey,

    /// Asset identifier (derived from mint)
    pub asset_id: [u8; 32],

    /// SPL token mint address
    pub mint: Pubkey,

    /// Token account holding shielded assets
    pub token_account: Pubkey,

    /// PDA bump seed
    pub bump: u8,

    /// Whether this asset is active
    pub is_active: bool,

    /// Whether deposits are enabled
    pub deposits_enabled: bool,

    /// Whether withdrawals are enabled
    pub withdrawals_enabled: bool,

    /// Minimum deposit amount (in token base units)
    pub min_deposit: u64,

    /// Maximum deposit amount per transaction
    pub max_deposit: u64,

    /// Total value deposited (lifetime)
    pub total_deposited: u64,

    /// Total value withdrawn (lifetime)
    pub total_withdrawn: u64,

    /// Current shielded balance (should match token account)
    pub shielded_balance: u64,

    /// Number of deposits
    pub deposit_count: u64,

    /// Number of withdrawals
    pub withdrawal_count: u64,

    /// Asset registration timestamp
    pub registered_at: i64,

    /// Last activity timestamp
    pub last_activity_at: i64,

    /// Token decimals (cached from mint)
    pub decimals: u8,

    /// Asset type (0 = SPL Token, 1 = Native SOL wrapped, 2 = Token-2022)
    pub asset_type: u8,

    /// Whether this vault enforces fixed denomination for stronger privacy
    ///
    /// When true, all deposits and withdrawals MUST use exactly `fixed_denomination`
    /// amount. This provides stronger privacy by making all transactions
    /// indistinguishable by value, increasing the effective anonymity set.
    pub is_fixed_denomination: bool,

    /// Fixed denomination amount (only used when `is_fixed_denomination` is true)
    ///
    /// All deposits and withdrawals must be exactly this amount.
    /// Set to 0 when flexible amounts are allowed.
    pub fixed_denomination: u64,

    /// Optional metadata URI for asset info
    pub metadata_uri: String,

    /// Reserved for future use
    pub _reserved: [u8; 23],
}

impl AssetVault {
    pub fn space(metadata_uri_len: usize) -> usize {
        8                           // discriminator
            + 32                    // pool
            + 32                    // asset_id
            + 32                    // mint
            + 32                    // token_account
            + 1                     // bump
            + 1                     // is_active
            + 1                     // deposits_enabled
            + 1                     // withdrawals_enabled
            + 8                     // min_deposit
            + 8                     // max_deposit
            + 8                     // total_deposited
            + 8                     // total_withdrawn
            + 8                     // shielded_balance
            + 8                     // deposit_count
            + 8                     // withdrawal_count
            + 8                     // registered_at
            + 8                     // last_activity_at
            + 1                     // decimals
            + 1                     // asset_type
            + 1                     // is_fixed_denomination
            + 8                     // fixed_denomination
            + 4 + metadata_uri_len  // metadata_uri (String)
            + 23                    // reserved (reduced from 32)
    }

    pub const DEFAULT_SPACE: usize = Self::space(MAX_METADATA_URI_LEN);

    /// Asset type constants
    pub const ASSET_TYPE_SPL: u8 = 0;
    pub const ASSET_TYPE_NATIVE_SOL: u8 = 1;
    pub const ASSET_TYPE_TOKEN_2022: u8 = 2;

    /// Initialize a new asset vault
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        &mut self,
        pool: Pubkey,
        asset_id: [u8; 32],
        mint: Pubkey,
        token_account: Pubkey,
        bump: u8,
        decimals: u8,
        asset_type: u8,
        timestamp: i64,
    ) {
        self.pool = pool;
        self.asset_id = asset_id;
        self.mint = mint;
        self.token_account = token_account;
        self.bump = bump;
        self.is_active = true;
        self.deposits_enabled = true;
        self.withdrawals_enabled = true;
        self.min_deposit = 0;
        self.max_deposit = u64::MAX;
        self.total_deposited = 0;
        self.total_withdrawn = 0;
        self.shielded_balance = 0;
        self.deposit_count = 0;
        self.withdrawal_count = 0;
        self.registered_at = timestamp;
        self.last_activity_at = timestamp;
        self.decimals = decimals;
        self.asset_type = asset_type;
        self.is_fixed_denomination = false;
        self.fixed_denomination = 0;
        self.metadata_uri = String::new();
        self._reserved = [0u8; 23];
    }

    // =========================================================================
    // Guard Methods
    // =========================================================================

    #[inline]
    pub fn require_active(&self) -> Result<()> {
        require!(self.is_active, PrivacyErrorV2::AssetNotActive);
        Ok(())
    }

    #[inline]
    pub fn require_deposits_enabled(&self) -> Result<()> {
        require!(self.deposits_enabled, PrivacyErrorV2::DepositsDisabled);
        Ok(())
    }

    #[inline]
    pub fn require_withdrawals_enabled(&self) -> Result<()> {
        require!(self.withdrawals_enabled, PrivacyErrorV2::WithdrawalsDisabled);
        Ok(())
    }

    pub fn validate_deposit_amount(&self, amount: u64) -> Result<()> {
        // If fixed denomination is enabled, amount must match exactly
        if self.is_fixed_denomination {
            require!(
                amount == self.fixed_denomination,
                PrivacyErrorV2::DenominationMismatch
            );
        } else {
            // Otherwise, use flexible min/max validation
            require!(amount >= self.min_deposit, PrivacyErrorV2::BelowMinimumDeposit);
            require!(amount <= self.max_deposit, PrivacyErrorV2::ExceedsMaximumDeposit);
        }
        Ok(())
    }

    pub fn validate_withdrawal_amount(&self, amount: u64) -> Result<()> {
        // If fixed denomination is enabled, amount must match exactly
        if self.is_fixed_denomination {
            require!(
                amount == self.fixed_denomination,
                PrivacyErrorV2::DenominationMismatch
            );
        }
        
        require!(
            amount <= self.shielded_balance,
            PrivacyErrorV2::InsufficientBalance
        );
        Ok(())
    }

    /// Check if the vault uses fixed denomination for stronger privacy
    #[inline]
    pub fn is_fixed_denomination_pool(&self) -> bool {
        self.is_fixed_denomination
    }

    /// Get the required denomination amount (0 if flexible)
    #[inline]
    pub fn get_required_denomination(&self) -> u64 {
        if self.is_fixed_denomination {
            self.fixed_denomination
        } else {
            0
        }
    }

    // =========================================================================
    // Balance Management
    // =========================================================================

    pub fn record_deposit(&mut self, amount: u64, timestamp: i64) -> Result<()> {
        self.total_deposited = self
            .total_deposited
            .checked_add(amount)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        self.shielded_balance = self
            .shielded_balance
            .checked_add(amount)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        self.deposit_count = self
            .deposit_count
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        self.last_activity_at = timestamp;
        Ok(())
    }

    pub fn record_withdrawal(&mut self, amount: u64, timestamp: i64) -> Result<()> {
        self.total_withdrawn = self
            .total_withdrawn
            .checked_add(amount)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        self.shielded_balance = self
            .shielded_balance
            .checked_sub(amount)
            .ok_or(error!(PrivacyErrorV2::InsufficientBalance))?;

        self.withdrawal_count = self
            .withdrawal_count
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        self.last_activity_at = timestamp;
        Ok(())
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    pub fn set_active(&mut self, active: bool) {
        self.is_active = active;
    }

    pub fn set_deposits_enabled(&mut self, enabled: bool) {
        self.deposits_enabled = enabled;
    }

    pub fn set_withdrawals_enabled(&mut self, enabled: bool) {
        self.withdrawals_enabled = enabled;
    }

    pub fn set_deposit_limits(&mut self, min: u64, max: u64) -> Result<()> {
        require!(min <= max, PrivacyErrorV2::InvalidAmount);
        self.min_deposit = min;
        self.max_deposit = max;
        Ok(())
    }

    pub fn set_metadata_uri(&mut self, uri: String) -> Result<()> {
        require!(uri.len() <= MAX_METADATA_URI_LEN, PrivacyErrorV2::InputTooLarge);
        self.metadata_uri = uri;
        Ok(())
    }

    /// Configure fixed denomination mode for stronger privacy
    ///
    /// When enabled, all deposits and withdrawals must use exactly the
    /// specified denomination amount. This eliminates amount-based
    /// correlation attacks.
    ///
    /// # Arguments
    /// * `enabled` - Whether to enable fixed denomination mode
    /// * `denomination` - The exact amount required (must be > 0 if enabled)
    ///
    /// # Errors
    /// * `InvalidAmount` - If enabled but denomination is 0
    pub fn set_fixed_denomination(&mut self, enabled: bool, denomination: u64) -> Result<()> {
        if enabled {
            require!(denomination > 0, PrivacyErrorV2::InvalidAmount);
        }
        self.is_fixed_denomination = enabled;
        self.fixed_denomination = if enabled { denomination } else { 0 };
        Ok(())
    }

    /// Disable fixed denomination mode (revert to flexible amounts)
    pub fn disable_fixed_denomination(&mut self) {
        self.is_fixed_denomination = false;
        self.fixed_denomination = 0;
    }
}

/// PDA seeds for AssetVault
impl AssetVault {
    pub const SEED_PREFIX: &'static [u8] = b"vault_v2";

    pub fn find_pda(program_id: &Pubkey, pool: &Pubkey, asset_id: &[u8; 32]) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[Self::SEED_PREFIX, pool.as_ref(), asset_id.as_ref()],
            program_id,
        )
    }

    pub fn seeds<'a>(
        pool: &'a Pubkey,
        asset_id: &'a [u8; 32],
        bump: &'a [u8; 1],
    ) -> [&'a [u8]; 4] {
        [Self::SEED_PREFIX, pool.as_ref(), asset_id.as_ref(), bump]
    }
}

/// Helper to compute asset_id from mint address
pub fn compute_asset_id(mint: &Pubkey) -> [u8; 32] {
    use solana_program::keccak;
    keccak::hash(mint.as_ref()).to_bytes()
}

/// Native SOL asset ID (special case)
pub const NATIVE_SOL_ASSET_ID: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_id_computation() {
        let mint = Pubkey::new_unique();
        let id1 = compute_asset_id(&mint);
        let id2 = compute_asset_id(&mint);
        assert_eq!(id1, id2);

        let mint2 = Pubkey::new_unique();
        let id3 = compute_asset_id(&mint2);
        assert_ne!(id1, id3);
    }

    #[test]
    fn test_space_calculation() {
        let space = AssetVault::DEFAULT_SPACE;
        assert!(space < 1000); // Should be reasonably small
    }

    #[test]
    fn test_fixed_denomination_enable_disable() {
        let mut vault = AssetVault {
            pool: Pubkey::default(),
            asset_id: [0u8; 32],
            mint: Pubkey::default(),
            token_account: Pubkey::default(),
            bump: 0,
            is_active: true,
            deposits_enabled: true,
            withdrawals_enabled: true,
            min_deposit: 0,
            max_deposit: u64::MAX,
            total_deposited: 0,
            total_withdrawn: 0,
            shielded_balance: 1000000,
            deposit_count: 0,
            withdrawal_count: 0,
            registered_at: 0,
            last_activity_at: 0,
            decimals: 6,
            asset_type: AssetVault::ASSET_TYPE_SPL,
            is_fixed_denomination: false,
            fixed_denomination: 0,
            metadata_uri: String::new(),
            _reserved: [0u8; 23],
        };

        // Initially flexible mode
        assert!(!vault.is_fixed_denomination_pool());
        assert_eq!(vault.get_required_denomination(), 0);

        // Enable fixed denomination of 100 units
        let denomination = 100_000_000u64; // 100 tokens with 6 decimals
        vault.set_fixed_denomination(true, denomination).unwrap();
        
        assert!(vault.is_fixed_denomination_pool());
        assert_eq!(vault.get_required_denomination(), denomination);
        assert_eq!(vault.fixed_denomination, denomination);

        // Disable fixed denomination
        vault.disable_fixed_denomination();
        
        assert!(!vault.is_fixed_denomination_pool());
        assert_eq!(vault.get_required_denomination(), 0);
        assert_eq!(vault.fixed_denomination, 0);
    }

    #[test]
    fn test_fixed_denomination_zero_rejected() {
        let mut vault = AssetVault {
            pool: Pubkey::default(),
            asset_id: [0u8; 32],
            mint: Pubkey::default(),
            token_account: Pubkey::default(),
            bump: 0,
            is_active: true,
            deposits_enabled: true,
            withdrawals_enabled: true,
            min_deposit: 0,
            max_deposit: u64::MAX,
            total_deposited: 0,
            total_withdrawn: 0,
            shielded_balance: 0,
            deposit_count: 0,
            withdrawal_count: 0,
            registered_at: 0,
            last_activity_at: 0,
            decimals: 6,
            asset_type: AssetVault::ASSET_TYPE_SPL,
            is_fixed_denomination: false,
            fixed_denomination: 0,
            metadata_uri: String::new(),
            _reserved: [0u8; 23],
        };

        // Enabling with 0 denomination should fail
        let result = vault.set_fixed_denomination(true, 0);
        assert!(result.is_err());
    }
}
