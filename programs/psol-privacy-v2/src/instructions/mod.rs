//! Instructions for pSOL Privacy Pool v2
//!
//! This module contains all instruction handlers for the MASP protocol.
//!
//! # Instruction Categories
//!
//! ## Pool Management
//! - `initialize_pool` - Create a new privacy pool
//! - `pause_pool` / `unpause_pool` - Emergency controls
//! - `transfer_authority` - Two-step authority transfer
//!
//! ## Asset Management
//! - `register_asset` - Add new asset to pool
//! - `configure_asset` - Update asset settings
//!
//! ## Verification Keys
//! - `set_verification_key` - Configure circuit VK
//! - `lock_verification_key` - Make VK immutable
//!
//! ## Core Privacy Operations
//! - `deposit_masp` - Deposit tokens into shielded pool
//! - `withdraw_masp` - Withdraw tokens from shielded pool
//! - `joinsplit` - Private transfer within pool
//!
//! ## Advanced Features
//! - `membership_proof` - Prove balance threshold
//! - `shielded_cpi` - Composable privacy (future)
//!
//! ## Relayer Operations
//! - `configure_relayer_registry` - Set relayer rules
//! - `register_relayer` - Add new relayer
//! - `update_relayer` - Modify relayer settings
//! - `deactivate_relayer` - Deactivate relayer

// ============================================================================
// Pool administration / configuration
// ============================================================================
pub mod initialize_pool_v2;
pub mod register_asset;
pub mod set_verification_key_v2;

pub mod admin;
pub mod compliance;
pub mod relayer;

// ============================================================================
// Core MASP instructions
// ============================================================================
pub mod deposit_masp;
pub mod withdraw_masp;

// ============================================================================
// Reserved (not live yet, but account wiring exists)
// ============================================================================
pub mod private_transfer;
pub mod prove_membership;
pub mod shielded_cpi;

// ============================================================================
// Re-exports (used by `use instructions::*;` in lib.rs)
// ============================================================================
pub use admin::*;
pub use compliance::*;
pub use initialize_pool_v2::InitializePoolV2;
pub use private_transfer::PrivateTransferJoinSplit;
pub use prove_membership::ProveMembership;
pub use register_asset::RegisterAsset;
pub use relayer::*;
pub use set_verification_key_v2::{LockVerificationKeyV2, SetVerificationKeyV2};
pub use shielded_cpi::*;

pub use deposit_masp::DepositMasp;
pub use withdraw_masp::WithdrawMasp;
