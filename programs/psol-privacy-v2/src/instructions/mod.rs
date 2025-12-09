//! Instruction handlers for pSOL Privacy Pool v2
//!
//! This module contains all instruction implementations for the MASP protocol.
//!
//! # Module Organization
//!
//! - **Core Instructions**: Pool initialization, asset registration, VK management
//! - **Admin**: Pause/unpause, authority transfer
//! - **Relayer**: Registry configuration and relayer management
//! - **MASP Operations**: Deposit, withdraw, private transfer
//! - **Membership**: Stake threshold proofs
//! - **Compliance**: Audit metadata and configuration
//! - **Shielded CPI**: DeFi integration hooks

// Core instructions
pub mod initialize_pool_v2;
pub mod register_asset;
pub mod set_verification_key_v2;

// MASP core operations
pub mod deposit_masp;
pub mod withdraw_masp;
pub mod private_transfer;
pub mod prove_membership;

// Submodules
pub mod admin;
pub mod relayer;
pub mod compliance;
pub mod shielded_cpi;

// Re-export all context structs for lib.rs
pub use initialize_pool_v2::InitializePoolV2;
pub use register_asset::RegisterAsset;
pub use set_verification_key_v2::{SetVerificationKeyV2, LockVerificationKeyV2};

pub use deposit_masp::DepositMasp;
pub use withdraw_masp::WithdrawMasp;
pub use private_transfer::PrivateTransferJoinSplit;
pub use prove_membership::ProveMembership;

pub use admin::{
    PausePoolV2,
    UnpausePoolV2,
    InitiateAuthorityTransferV2,
    AcceptAuthorityTransferV2,
    CancelAuthorityTransferV2,
};

pub use relayer::{
    ConfigureRelayerRegistry,
    RegisterRelayer,
    UpdateRelayer,
    DeactivateRelayer,
};

pub use compliance::{
    ConfigureCompliance,
    AttachAuditMetadata,
};

pub use shielded_cpi::ExecuteShieldedAction;
