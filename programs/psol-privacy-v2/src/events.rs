//! Events for pSOL Privacy Pool v2
//!
//! Events are emitted for indexing and client notification.
//! All events include pool reference and timestamp.
//!
//! # Privacy Considerations
//!
//! Production events are designed to minimize privacy leakage:
//! - Deposit events do NOT include amount or depositor
//! - Withdraw events do NOT include recipient or amount
//!
//! While recipient/amount are visible in transaction accounts, removing them
//! from events makes it significantly harder to index and correlate at scale.
//!
//! Debug events (gated behind `event-debug` feature) include additional
//! information useful for development but MUST NOT be enabled in production.

use anchor_lang::prelude::*;

// =========================================================================
// POOL EVENTS
// =========================================================================

#[event]
pub struct PoolInitializedV2 {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub merkle_tree: Pubkey,
    pub relayer_registry: Pubkey,
    pub tree_depth: u8,
    pub root_history_size: u16,
    pub timestamp: i64,
}

#[event]
pub struct PoolPausedV2 {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PoolUnpausedV2 {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferInitiatedV2 {
    pub pool: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferCompletedV2 {
    pub pool: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferCancelledV2 {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub cancelled_pending: Pubkey,
    pub timestamp: i64,
}

// =========================================================================
// ASSET EVENTS
// =========================================================================

#[event]
pub struct AssetRegistered {
    pub pool: Pubkey,
    pub asset_id: [u8; 32],
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub decimals: u8,
    pub timestamp: i64,
}

#[event]
pub struct AssetConfigUpdated {
    pub pool: Pubkey,
    pub asset_id: [u8; 32],
    pub deposits_enabled: bool,
    pub withdrawals_enabled: bool,
    pub timestamp: i64,
}

// =========================================================================
// VK EVENTS
// =========================================================================

#[event]
pub struct VerificationKeySetV2 {
    pub pool: Pubkey,
    pub proof_type: u8,
    pub ic_length: u8,
    pub vk_hash: [u8; 32],
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VerificationKeyLockedV2 {
    pub pool: Pubkey,
    pub proof_type: u8,
    pub authority: Pubkey,
    pub timestamp: i64,
}

// =========================================================================
// DEPOSIT/WITHDRAW EVENTS
// =========================================================================

/// Privacy-preserving deposit event.
/// Does NOT include amount or depositor to prevent correlation attacks.
#[event]
pub struct DepositMaspEvent {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    /// Leaf index assigned in the shared Merkle tree
    pub leaf_index: u32,
    /// New Merkle root after insertion
    pub merkle_root: [u8; 32],
    /// Asset identifier (does not reveal depositor or amount)
    pub asset_id: [u8; 32],
    pub timestamp: i64,
}

/// Debug-only deposit event with additional information.
/// MUST NOT be enabled in production builds as it leaks privacy-sensitive data.
#[cfg(feature = "event-debug")]
#[event]
pub struct DepositMaspDebugEvent {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub leaf_index: u32,
    /// WARNING: Leaks correlation data
    pub amount: u64,
    pub asset_id: [u8; 32],
    /// WARNING: Reveals depositor identity
    pub depositor: Pubkey,
    pub has_encrypted_note: bool,
    pub timestamp: i64,
}

/// Privacy-preserving withdrawal event.
/// Does NOT include recipient or amount to minimize correlation attacks.
/// 
/// While recipient is visible in transaction accounts (for token delivery),
/// omitting it from events makes large-scale indexing and correlation
/// significantly harder.
/// 
/// The nullifier_hash is already public via the SpentNullifierV2 PDA.
#[event]
pub struct WithdrawMaspEvent {
    /// Pool this withdrawal belongs to
    pub pool: Pubkey,
    /// Spent nullifier (already public via SpentNullifierV2 account)
    pub nullifier_hash: [u8; 32],
    /// Asset identifier (Keccak(mint)[0..32])
    pub asset_id: [u8; 32],
    /// Relayer that submitted the transaction
    pub relayer: Pubkey,
    /// Fee paid to relayer (needed for relayer accounting)
    pub relayer_fee: u64,
    /// Event timestamp
    pub timestamp: i64,
}

/// Debug-only withdrawal event with full telemetry.
/// MUST NOT be enabled in mainnet builds as it leaks recipient and amount
/// at the event layer, making correlation trivial.
#[cfg(feature = "event-debug")]
#[event]
pub struct WithdrawMaspDebugEvent {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    /// WARNING: Leaks recipient identity
    pub recipient: Pubkey,
    /// WARNING: Leaks withdrawal amount
    pub amount: u64,
    pub asset_id: [u8; 32],
    pub relayer: Pubkey,
    pub relayer_fee: u64,
    pub timestamp: i64,
}

// =========================================================================
// JOIN-SPLIT EVENTS
// =========================================================================

#[event]
pub struct JoinSplitEvent {
    pub pool: Pubkey,
    /// Number of input nullifiers spent
    pub input_count: u8,
    /// Number of output commitments created
    pub output_count: u8,
    /// First nullifier hash (always present)
    pub nullifier_hash_0: [u8; 32],
    /// Second nullifier hash (zero if only 1 input)
    pub nullifier_hash_1: [u8; 32],
    /// First output commitment
    pub output_commitment_0: [u8; 32],
    /// Second output commitment (zero if only 1 output)
    pub output_commitment_1: [u8; 32],
    /// Public amount delta (positive = deposit, negative = withdraw, 0 = internal)
    pub public_amount: i64,
    /// Asset involved
    pub asset_id: [u8; 32],
    /// Relayer that submitted
    pub relayer: Pubkey,
    /// Fee paid
    pub relayer_fee: u64,
    /// Leaf indices for outputs
    pub output_leaf_indices: [u32; 2],
    pub timestamp: i64,
}

// =========================================================================
// MEMBERSHIP EVENTS
// =========================================================================

#[event]
pub struct MembershipProofVerified {
    pub pool: Pubkey,
    /// Threshold that was proven
    pub threshold: u64,
    /// Asset for the proof
    pub asset_id: [u8; 32],
    /// Merkle root used
    pub merkle_root: [u8; 32],
    /// Whether proof was valid
    pub is_valid: bool,
    pub timestamp: i64,
}

// =========================================================================
// RELAYER EVENTS
// =========================================================================

#[event]
pub struct RelayerRegistryConfigured {
    pub pool: Pubkey,
    pub registry: Pubkey,
    pub min_fee_bps: u16,
    pub max_fee_bps: u16,
    pub require_stake: bool,
    pub min_stake_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct RelayerRegistered {
    pub pool: Pubkey,
    pub registry: Pubkey,
    pub relayer: Pubkey,
    pub operator: Pubkey,
    pub fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct RelayerUpdated {
    pub pool: Pubkey,
    pub relayer: Pubkey,
    pub operator: Pubkey,
    pub fee_bps: u16,
    pub is_active: bool,
    pub timestamp: i64,
}

#[event]
pub struct RelayerDeactivated {
    pub pool: Pubkey,
    pub relayer: Pubkey,
    pub operator: Pubkey,
    pub timestamp: i64,
}

// =========================================================================
// COMPLIANCE EVENTS
// =========================================================================

#[event]
pub struct ComplianceConfigured {
    pub pool: Pubkey,
    pub require_encrypted_note: bool,
    pub audit_enabled: bool,
    pub audit_pubkey: Pubkey,
    pub compliance_level: u8,
    pub timestamp: i64,
}

#[event]
pub struct AuditMetadataAttached {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub schema_version: u8,
    pub data_length: u32,
    pub timestamp: i64,
}

// =========================================================================
// SHIELDED CPI EVENTS
// =========================================================================

#[event]
pub struct ShieldedActionExecuted {
    pub pool: Pubkey,
    pub action_type: u8,
    pub nullifier_hash: [u8; 32],
    pub output_commitment: [u8; 32],
    pub target_program: Pubkey,
    pub relayer: Pubkey,
    pub timestamp: i64,
}

// =========================================================================
// DEBUG EVENTS - GATED BEHIND event-debug FEATURE
// =========================================================================

/// Debug log event for development purposes only.
/// 
/// # Security Warning
/// 
/// This event is gated behind the `event-debug` feature flag and MUST NOT
/// be enabled in production builds. It can leak sensitive information
/// about pool operations.
#[cfg(feature = "event-debug")]
#[event]
pub struct DebugLog {
    pub pool: Pubkey,
    pub message: String,
    pub value: u64,
    pub timestamp: i64,
}

// =========================================================================
// HELPER MACROS FOR DEBUG LOGGING
// =========================================================================

/// Emit a debug log event (only when event-debug feature is enabled)
#[macro_export]
#[cfg(feature = "event-debug")]
macro_rules! debug_log {
    ($pool:expr, $msg:expr, $val:expr) => {
        emit!(crate::events::DebugLog {
            pool: $pool,
            message: $msg.to_string(),
            value: $val,
            timestamp: Clock::get()?.unix_timestamp,
        });
    };
}

/// No-op version when event-debug is disabled
#[macro_export]
#[cfg(not(feature = "event-debug"))]
macro_rules! debug_log {
    ($pool:expr, $msg:expr, $val:expr) => {
        // Debug logging disabled in production
    };
}

// =========================================================================
// TESTS
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deposit_event_is_privacy_preserving() {
        let event = DepositMaspEvent {
            pool: Pubkey::new_unique(),
            commitment: [1u8; 32],
            leaf_index: 0,
            merkle_root: [2u8; 32],
            asset_id: [3u8; 32],
            timestamp: 0,
        };
        assert_eq!(event.leaf_index, 0);
    }

    #[test]
    fn withdraw_event_is_privacy_preserving() {
        // Verify WithdrawMaspEvent doesn't have recipient or amount fields
        let event = WithdrawMaspEvent {
            pool: Pubkey::new_unique(),
            nullifier_hash: [1u8; 32],
            asset_id: [2u8; 32],
            relayer: Pubkey::new_unique(),
            relayer_fee: 1000,
            timestamp: 0,
        };
        // This test ensures the struct doesn't accidentally get
        // recipient/amount fields added back
        assert_eq!(event.relayer_fee, 1000);
    }

    #[cfg(feature = "event-debug")]
    #[test]
    fn debug_events_exist_when_feature_enabled() {
        let _deposit_debug = DepositMaspDebugEvent {
            pool: Pubkey::new_unique(),
            commitment: [0u8; 32],
            leaf_index: 0,
            amount: 1000,
            asset_id: [0u8; 32],
            depositor: Pubkey::new_unique(),
            has_encrypted_note: false,
            timestamp: 0,
        };

        let _withdraw_debug = WithdrawMaspDebugEvent {
            pool: Pubkey::new_unique(),
            nullifier_hash: [0u8; 32],
            recipient: Pubkey::new_unique(),
            amount: 1000,
            asset_id: [0u8; 32],
            relayer: Pubkey::new_unique(),
            relayer_fee: 100,
            timestamp: 0,
        };

        let _debug_log = DebugLog {
            pool: Pubkey::new_unique(),
            message: "test".to_string(),
            value: 42,
            timestamp: 0,
        };
    }
}
