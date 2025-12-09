//! Pool Configuration State - pSOL v2
//!
//! # MASP Pool Configuration
//! The pool config is the root account for a pSOL v2 instance.
//! Unlike v1, it supports multiple assets sharing one Merkle tree.
//!
//! # Security Properties
//! - Authority changes require 2-step process
//! - VKs can be locked per proof type
//! - All operations use checked arithmetic
//! - Pool can be paused in emergencies

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::ProofType;

/// Main pool configuration account for MASP v2
///
/// PDA Seeds: `[b"pool_v2", authority.key().as_ref()]`
#[account]
pub struct PoolConfigV2 {
    /// Current pool authority (admin)
    pub authority: Pubkey,

    /// Pending authority for 2-step transfer (zero if none)
    pub pending_authority: Pubkey,

    /// Associated Merkle tree account
    pub merkle_tree: Pubkey,

    /// Relayer registry account
    pub relayer_registry: Pubkey,

    /// Compliance configuration account
    pub compliance_config: Pubkey,

    /// Merkle tree depth (immutable after init)
    pub tree_depth: u8,

    /// Number of registered assets
    pub registered_asset_count: u16,

    /// Maximum number of assets allowed
    pub max_assets: u16,

    /// PDA bump seed
    pub bump: u8,

    /// Pool paused flag
    pub is_paused: bool,

    /// VK configuration flags (bitfield for each ProofType)
    /// Bit 0: Deposit VK configured
    /// Bit 1: Withdraw VK configured
    /// Bit 2: JoinSplit VK configured
    /// Bit 3: Membership VK configured
    pub vk_configured: u8,

    /// VK lock flags (bitfield, same layout as vk_configured)
    pub vk_locked: u8,

    /// Total deposits across all assets
    pub total_deposits: u64,

    /// Total withdrawals across all assets
    pub total_withdrawals: u64,

    /// Total join-split operations
    pub total_join_splits: u64,

    /// Total membership proofs verified
    pub total_membership_proofs: u64,

    /// Pool creation timestamp
    pub created_at: i64,

    /// Last activity timestamp
    pub last_activity_at: i64,

    /// Schema version for migrations
    pub version: u8,

    /// Feature flags (for gradual rollout)
    /// Bit 0: MASP enabled
    /// Bit 1: JoinSplit enabled
    /// Bit 2: Membership proofs enabled
    /// Bit 3: Shielded CPI enabled
    /// Bit 4: Compliance required
    pub feature_flags: u8,

    /// Reserved space for future upgrades
    pub _reserved: [u8; 64],
}

impl PoolConfigV2 {
    pub const LEN: usize = 8 // discriminator
        + 32 // authority
        + 32 // pending_authority
        + 32 // merkle_tree
        + 32 // relayer_registry
        + 32 // compliance_config
        + 1  // tree_depth
        + 2  // registered_asset_count
        + 2  // max_assets
        + 1  // bump
        + 1  // is_paused
        + 1  // vk_configured
        + 1  // vk_locked
        + 8  // total_deposits
        + 8  // total_withdrawals
        + 8  // total_join_splits
        + 8  // total_membership_proofs
        + 8  // created_at
        + 8  // last_activity_at
        + 1  // version
        + 1  // feature_flags
        + 64; // reserved

    pub const VERSION: u8 = 2;
    pub const DEFAULT_MAX_ASSETS: u16 = 100;

    // Feature flag constants
    pub const FEATURE_MASP: u8 = 1 << 0;
    pub const FEATURE_JOIN_SPLIT: u8 = 1 << 1;
    pub const FEATURE_MEMBERSHIP: u8 = 1 << 2;
    pub const FEATURE_SHIELDED_CPI: u8 = 1 << 3;
    pub const FEATURE_COMPLIANCE: u8 = 1 << 4;

    /// Initialize pool configuration
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        &mut self,
        authority: Pubkey,
        merkle_tree: Pubkey,
        relayer_registry: Pubkey,
        compliance_config: Pubkey,
        tree_depth: u8,
        bump: u8,
        timestamp: i64,
    ) {
        self.authority = authority;
        self.pending_authority = Pubkey::default();
        self.merkle_tree = merkle_tree;
        self.relayer_registry = relayer_registry;
        self.compliance_config = compliance_config;
        self.tree_depth = tree_depth;
        self.registered_asset_count = 0;
        self.max_assets = Self::DEFAULT_MAX_ASSETS;
        self.bump = bump;
        self.is_paused = false;
        self.vk_configured = 0;
        self.vk_locked = 0;
        self.total_deposits = 0;
        self.total_withdrawals = 0;
        self.total_join_splits = 0;
        self.total_membership_proofs = 0;
        self.created_at = timestamp;
        self.last_activity_at = timestamp;
        self.version = Self::VERSION;
        // Enable MASP and basic features by default
        self.feature_flags = Self::FEATURE_MASP;
        self._reserved = [0u8; 64];
    }

    // =========================================================================
    // Guard Methods
    // =========================================================================

    #[inline]
    pub fn require_not_paused(&self) -> Result<()> {
        require!(!self.is_paused, PrivacyErrorV2::PoolPaused);
        Ok(())
    }

    #[inline]
    pub fn require_vk_configured(&self, proof_type: ProofType) -> Result<()> {
        let mask = 1u8 << (proof_type as u8);
        require!(
            self.vk_configured & mask != 0,
            PrivacyErrorV2::VerificationKeyNotSet
        );
        Ok(())
    }

    #[inline]
    pub fn require_vk_unlocked(&self, proof_type: ProofType) -> Result<()> {
        let mask = 1u8 << (proof_type as u8);
        require!(
            self.vk_locked & mask == 0,
            PrivacyErrorV2::VerificationKeyLocked
        );
        Ok(())
    }

    #[inline]
    pub fn require_feature_enabled(&self, feature: u8) -> Result<()> {
        require!(
            self.feature_flags & feature != 0,
            PrivacyErrorV2::FeatureDisabled
        );
        Ok(())
    }

    #[inline]
    pub fn require_join_split_enabled(&self) -> Result<()> {
        self.require_feature_enabled(Self::FEATURE_JOIN_SPLIT)
    }

    #[inline]
    pub fn require_membership_enabled(&self) -> Result<()> {
        self.require_feature_enabled(Self::FEATURE_MEMBERSHIP)
    }

    #[inline]
    pub fn require_shielded_cpi_enabled(&self) -> Result<()> {
        self.require_feature_enabled(Self::FEATURE_SHIELDED_CPI)
    }

    // =========================================================================
    // VK Management
    // =========================================================================

    pub fn set_vk_configured(&mut self, proof_type: ProofType) {
        let mask = 1u8 << (proof_type as u8);
        self.vk_configured |= mask;
    }

    pub fn lock_vk(&mut self, proof_type: ProofType) {
        let mask = 1u8 << (proof_type as u8);
        self.vk_locked |= mask;
    }

    pub fn is_vk_configured(&self, proof_type: ProofType) -> bool {
        let mask = 1u8 << (proof_type as u8);
        self.vk_configured & mask != 0
    }

    pub fn is_vk_locked(&self, proof_type: ProofType) -> bool {
        let mask = 1u8 << (proof_type as u8);
        self.vk_locked & mask != 0
    }

    // =========================================================================
    // Asset Management
    // =========================================================================

    pub fn can_register_asset(&self) -> bool {
        self.registered_asset_count < self.max_assets
    }

    pub fn register_asset(&mut self) -> Result<()> {
        require!(self.can_register_asset(), PrivacyErrorV2::TooManyAssets);
        self.registered_asset_count = self
            .registered_asset_count
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        Ok(())
    }

    // =========================================================================
    // Statistics
    // =========================================================================

    pub fn record_deposit(&mut self, timestamp: i64) -> Result<()> {
        self.total_deposits = self
            .total_deposits
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        self.last_activity_at = timestamp;
        Ok(())
    }

    pub fn record_withdrawal(&mut self, timestamp: i64) -> Result<()> {
        self.total_withdrawals = self
            .total_withdrawals
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        self.last_activity_at = timestamp;
        Ok(())
    }

    pub fn record_join_split(&mut self, timestamp: i64) -> Result<()> {
        self.total_join_splits = self
            .total_join_splits
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        self.last_activity_at = timestamp;
        Ok(())
    }

    pub fn record_membership_proof(&mut self, timestamp: i64) -> Result<()> {
        self.total_membership_proofs = self
            .total_membership_proofs
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        self.last_activity_at = timestamp;
        Ok(())
    }

    // =========================================================================
    // Pause Control
    // =========================================================================

    #[inline]
    pub fn set_paused(&mut self, paused: bool) {
        self.is_paused = paused;
    }

    // =========================================================================
    // Authority Management
    // =========================================================================

    pub fn initiate_authority_transfer(&mut self, new_authority: Pubkey) -> Result<()> {
        require!(
            new_authority != Pubkey::default(),
            PrivacyErrorV2::InvalidAuthority
        );
        require!(
            new_authority != self.authority,
            PrivacyErrorV2::InvalidAuthority
        );
        self.pending_authority = new_authority;
        Ok(())
    }

    pub fn accept_authority_transfer(&mut self, acceptor: Pubkey) -> Result<()> {
        require!(
            self.pending_authority != Pubkey::default(),
            PrivacyErrorV2::NoPendingAuthority
        );
        require!(
            acceptor == self.pending_authority,
            PrivacyErrorV2::Unauthorized
        );
        self.authority = self.pending_authority;
        self.pending_authority = Pubkey::default();
        Ok(())
    }

    pub fn cancel_authority_transfer(&mut self) {
        self.pending_authority = Pubkey::default();
    }

    #[inline]
    pub fn has_pending_transfer(&self) -> bool {
        self.pending_authority != Pubkey::default()
    }

    // =========================================================================
    // Feature Management
    // =========================================================================

    pub fn enable_feature(&mut self, feature: u8) {
        self.feature_flags |= feature;
    }

    pub fn disable_feature(&mut self, feature: u8) {
        self.feature_flags &= !feature;
    }

    pub fn is_feature_enabled(&self, feature: u8) -> bool {
        self.feature_flags & feature != 0
    }
}

/// PDA seeds for PoolConfigV2
impl PoolConfigV2 {
    pub const SEED_PREFIX: &'static [u8] = b"pool_v2";

    pub fn find_pda(program_id: &Pubkey, authority: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[Self::SEED_PREFIX, authority.as_ref()],
            program_id,
        )
    }

    pub fn seeds<'a>(authority: &'a Pubkey, bump: &'a [u8; 1]) -> [&'a [u8]; 3] {
        [Self::SEED_PREFIX, authority.as_ref(), bump]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vk_flags() {
        let mut config = PoolConfigV2 {
            authority: Pubkey::default(),
            pending_authority: Pubkey::default(),
            merkle_tree: Pubkey::default(),
            relayer_registry: Pubkey::default(),
            compliance_config: Pubkey::default(),
            tree_depth: 20,
            registered_asset_count: 0,
            max_assets: 100,
            bump: 0,
            is_paused: false,
            vk_configured: 0,
            vk_locked: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            total_join_splits: 0,
            total_membership_proofs: 0,
            created_at: 0,
            last_activity_at: 0,
            version: 2,
            feature_flags: 0,
            _reserved: [0u8; 64],
        };

        // Test VK configuration
        assert!(!config.is_vk_configured(ProofType::Withdraw));
        config.set_vk_configured(ProofType::Withdraw);
        assert!(config.is_vk_configured(ProofType::Withdraw));
        assert!(!config.is_vk_configured(ProofType::JoinSplit));

        // Test VK locking
        assert!(!config.is_vk_locked(ProofType::Withdraw));
        config.lock_vk(ProofType::Withdraw);
        assert!(config.is_vk_locked(ProofType::Withdraw));
    }

    #[test]
    fn test_feature_flags() {
        let mut config = PoolConfigV2 {
            authority: Pubkey::default(),
            pending_authority: Pubkey::default(),
            merkle_tree: Pubkey::default(),
            relayer_registry: Pubkey::default(),
            compliance_config: Pubkey::default(),
            tree_depth: 20,
            registered_asset_count: 0,
            max_assets: 100,
            bump: 0,
            is_paused: false,
            vk_configured: 0,
            vk_locked: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            total_join_splits: 0,
            total_membership_proofs: 0,
            created_at: 0,
            last_activity_at: 0,
            version: 2,
            feature_flags: PoolConfigV2::FEATURE_MASP,
            _reserved: [0u8; 64],
        };

        assert!(config.is_feature_enabled(PoolConfigV2::FEATURE_MASP));
        assert!(!config.is_feature_enabled(PoolConfigV2::FEATURE_JOIN_SPLIT));

        config.enable_feature(PoolConfigV2::FEATURE_JOIN_SPLIT);
        assert!(config.is_feature_enabled(PoolConfigV2::FEATURE_JOIN_SPLIT));

        config.disable_feature(PoolConfigV2::FEATURE_JOIN_SPLIT);
        assert!(!config.is_feature_enabled(PoolConfigV2::FEATURE_JOIN_SPLIT));
    }
}
