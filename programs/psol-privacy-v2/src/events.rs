//! Events for pSOL Privacy Pool v2
//!
//! Events are emitted for indexing and client notification.
//! All events include pool reference and timestamp.

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

#[event]
pub struct DepositMaspEvent {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub leaf_index: u32,
    pub amount: u64,
    pub asset_id: [u8; 32],
    pub has_encrypted_note: bool,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawMaspEvent {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
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
// ERROR/DEBUG EVENTS
// =========================================================================

#[event]
pub struct DebugLog {
    pub pool: Pubkey,
    pub message: String,
    pub value: u64,
    pub timestamp: i64,
}
