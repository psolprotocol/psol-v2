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

pub mod admin;
pub mod compliance;
pub mod deposit_masp;
pub mod initialize_pool_v2;
pub mod private_transfer;
pub mod prove_membership;
pub mod register_asset;
pub mod relayer;
pub mod set_verification_key_v2;
pub mod shielded_cpi;
pub mod withdraw_masp;

// Re-export for convenience
pub use deposit_masp::{handler as deposit_masp_handler, DepositMasp};
pub use withdraw_masp::{handler as withdraw_masp_handler, WithdrawMasp};
pub use initialize_pool_v2::InitializePoolV2;
pub use register_asset::RegisterAsset;
pub use set_verification_key_v2::{SetVerificationKeyV2, LockVerificationKeyV2};
pub use admin::{
    PausePoolV2, UnpausePoolV2, InitiateAuthorityTransferV2, AcceptAuthorityTransferV2,
    CancelAuthorityTransferV2,
};
pub use relayer::{
    ConfigureRelayerRegistry, RegisterRelayer, UpdateRelayer, DeactivateRelayer,
};
pub use private_transfer::PrivateTransferJoinSplit;
pub use prove_membership::ProveMembership;
pub use compliance::{ConfigureCompliance, AttachAuditMetadata};
pub use shielded_cpi::ExecuteShieldedAction;
