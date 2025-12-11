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

pub mod deposit_masp;
pub mod withdraw_masp;

// Re-export for convenience
pub use deposit_masp::{handler as deposit_masp_handler, DepositMasp};
pub use withdraw_masp::{handler as withdraw_masp_handler, WithdrawMasp};

// Placeholder modules - implement as needed
// pub mod initialize_pool;
// pub mod register_asset;
// pub mod set_verification_key;
// pub mod joinsplit;
// pub mod membership_proof;
