//! Events for pSOL v2 (PRIVACY-SAFE)
//!
//! # Privacy Considerations
//!
//! Production events do NOT include:
//! - Depositor addresses
//! - Amounts
//! - Any information that could link deposits
//!
//! Debug events (feature-gated) MAY include sensitive data for testing,
//! but cannot be compiled into release builds.

use anchor_lang::prelude::*;

/// Deposit added to pending buffer (PRIVACY-SAFE)
///
/// Does NOT include:
/// - Depositor address
/// - Amount
#[event]
pub struct DepositPendingEvent {
    /// Pool where deposit was made
    pub pool: Pubkey,

    /// Commitment (privacy-preserving hash)
    pub commitment: [u8; 32],

    /// Index in pending buffer
    pub buffer_index: u32,

    /// Asset ID
    pub asset_id: [u8; 32],

    /// Timestamp
    pub timestamp: i64,
}

/// Debug-only deposit event (PRIVACY-LEAKING - TEST ONLY)
///
/// ⚠️ ONLY AVAILABLE WITH event-debug FEATURE
/// ⚠️ COMPILE ERROR IF USED IN RELEASE BUILD
#[cfg(feature = "event-debug")]
#[event]
pub struct DepositPendingDebugEvent {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub buffer_index: u32,
    
    // ⚠️ PRIVACY LEAK - DEBUG ONLY
    pub amount: u64,
    pub asset_id: [u8; 32],
    pub depositor: Pubkey,
    
    pub has_encrypted_note: bool,
    pub timestamp: i64,
}

// Compile-time guard: Prevent event-debug in release builds
#[cfg(all(feature = "event-debug", not(debug_assertions)))]
compile_error!("event-debug feature cannot be enabled in release builds - it leaks privacy-sensitive data");

/// Batch of deposits processed
#[event]
pub struct BatchProcessedEvent {
    /// Pool where batch was processed
    pub pool: Pubkey,

    /// Batcher who processed the batch
    pub batcher: Pubkey,

    /// Number of deposits in this batch
    pub batch_size: u32,

    /// Starting leaf index in Merkle tree
    pub start_leaf_index: u64,

    /// Ending leaf index in Merkle tree
    pub end_leaf_index: u64,

    /// Merkle root after batch processing
    pub merkle_root: [u8; 32],

    /// Timestamp
    pub timestamp: i64,
}

/// Withdrawal processed (PRIVACY-PRESERVING)
#[event]
pub struct WithdrawMaspEvent {
    /// Pool where withdrawal occurred
    pub pool: Pubkey,

    /// Merkle root used for proof
    pub merkle_root: [u8; 32],

    /// Nullifier hash (prevents double-spend)
    pub nullifier_hash: [u8; 32],

    /// Relayer who processed withdrawal
    pub relayer: Pubkey,

    /// Relayer fee paid
    pub relayer_fee: u64,

    /// Asset withdrawn
    pub asset_id: [u8; 32],

    /// Timestamp
    pub timestamp: i64,
}

/// Pool configuration updated
#[event]
pub struct PoolConfigUpdatedEvent {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub updated_field: String,
    pub timestamp: i64,
}

/// Asset vault registered
#[event]
pub struct AssetVaultRegisteredEvent {
    pub pool: Pubkey,
    pub asset_id: [u8; 32],
    pub mint: Pubkey,
    pub timestamp: i64,
}

/// Relayer registered or updated
#[event]
pub struct RelayerUpdatedEvent {
    pub registry: Pubkey,
    pub relayer: Pubkey,
    pub operator: Pubkey,
    pub fee_bps: u16,
    pub is_active: bool,
    pub timestamp: i64,
}

/// Batcher role created or updated
#[event]
pub struct BatcherRoleUpdatedEvent {
    pub pool: Pubkey,
    pub batcher: Pubkey,
    pub is_enabled: bool,
    pub timestamp: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deposit_pending_event_privacy() {
        // Verify DepositPendingEvent does NOT have depositor or amount fields
        let event = DepositPendingEvent {
            pool: Pubkey::default(),
            commitment: [0u8; 32],
            buffer_index: 0,
            asset_id: [0u8; 32],
            timestamp: 0,
        };

        // Compile-time check: These fields should not exist
        // event.depositor;  // Compile error - good!
        // event.amount;     // Compile error - good!
        
        let _ = event;
    }

    #[test]
    #[cfg(feature = "event-debug")]
    fn test_debug_event_has_private_data() {
        // Debug event SHOULD have private data (for testing only)
        let event = DepositPendingDebugEvent {
            pool: Pubkey::default(),
            commitment: [0u8; 32],
            buffer_index: 0,
            amount: 1000,
            asset_id: [0u8; 32],
            depositor: Pubkey::default(),
            has_encrypted_note: false,
            timestamp: 0,
        };

        assert_eq!(event.amount, 1000);
    }
}
