//! pSOL Privacy Pool v2 - Multi-Asset Shielded Pool (MASP)
//!
//! # Status
//!
//! **pSOL v2 is an experimental, next-generation MASP and shielded accounting design.**
//!
//! This codebase compiles and encodes the target architecture, but:
//! - Circuits and SRS are still in progress
//! - Relayer SDK for v2 is pending
//! - Independent security audit is pending
//!
//! # Implemented Features (Production Ready with Circuits)
//!
//! - Pool initialization with configurable Merkle tree depth
//! - Multi-asset registration and vault management
//! - MASP deposits with commitment insertion
//! - MASP withdrawals with proof verification and nullifier tracking
//! - Verification key management (set, lock) per proof type
//! - On-chain relayer registry with fee bounds
//! - Pool pause/unpause and authority transfer (2-step)
//! - Compliance configuration and audit metadata
//!
//! # Reserved Features (Circuits Not Yet Deployed)
//!
//! The following features have validated account structures and state guards
//! but return `NotImplemented` because their ZK circuits are not finalized:
//!
//! - **Join-Split Transfers**: Private N-to-M transfers (reserved for v2.1)
//! - **Membership Proofs**: Prove balance ≥ threshold without spending
//! - **Shielded CPI**: DeFi integrations (Jupiter, lending, staking)
//!
//! # Overview
//! pSOL v2 extends v1 with:
//! - Multi-Asset Shielded Pool (MASP): Single Merkle tree for SOL and SPL tokens
//! - Join-Split private transfers: Internal transfers without touching public vault
//! - Shielded CPI interface: Integration hooks for DeFi protocols
//! - On-chain relayer registry: Structured relayer management with fee rules
//! - Compliance layer: Optional encrypted audit metadata
//! - Membership proofs: Prove pool membership without spending
//!
//! # Architecture
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                      PoolConfigV2                               │
//! │  (authority, asset_registry, relayer_config, compliance_config) │
//! └─────────────────────────────────────────────────────────────────┘
//!                                │
//!         ┌──────────────────────┼──────────────────────┐
//!         ▼                      ▼                      ▼
//! ┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
//! │ MerkleTreeV2  │    │ AssetVault[N]   │    │ RelayerRegistry │
//! │ (shared tree) │    │ (per-asset)     │    │ (node accounts) │
//! └───────────────┘    └─────────────────┘    └─────────────────┘
//!         │
//!         ▼
//! ┌───────────────────────────────────────────────────────────────┐
//! │                    SpentNullifier (PDA per nullifier)          │
//! └───────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Proof Types
//! - `DepositMasp`: Proves valid deposit commitment
//! - `WithdrawMasp`: Proves valid withdrawal with nullifier
//! - `JoinSplit`: Proves N inputs → M outputs value conservation
//! - `Membership`: Proves pool membership ≥ threshold without spending

use anchor_lang::prelude::*;

pub mod crypto;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

// Re-export all instruction account structs
pub use instructions::*;

declare_id!("21DbY1WykakReEX8RjpirJMxtgoa6vhd77EF6d3oC6Xo");

// Client accounts bridge for #[program] macro
// These must use pub(crate) visibility to avoid E0365 errors
// Only include instructions that are actually defined in #[program] module below
pub(crate) use crate::instructions::initialize_pool_v2::__client_accounts_initialize_pool_v2;
pub(crate) use crate::instructions::initialize_pool_registries::__client_accounts_initialize_pool_registries;
pub(crate) use crate::instructions::register_asset::__client_accounts_register_asset;
pub(crate) use crate::instructions::set_verification_key_v2::__client_accounts_set_verification_key_v2;
pub(crate) use crate::instructions::set_verification_key_v2::__client_accounts_lock_verification_key_v2;
pub(crate) use crate::instructions::admin::pause_v2::__client_accounts_pause_pool_v2;
pub(crate) use crate::instructions::admin::unpause_v2::__client_accounts_unpause_pool_v2;
pub(crate) use crate::instructions::admin::authority_v2::__client_accounts_initiate_authority_transfer_v2;
pub(crate) use crate::instructions::admin::authority_v2::__client_accounts_accept_authority_transfer_v2;
pub(crate) use crate::instructions::admin::authority_v2::__client_accounts_cancel_authority_transfer_v2;
pub(crate) use crate::instructions::relayer::configure_registry::__client_accounts_configure_relayer_registry;
pub(crate) use crate::instructions::relayer::register_relayer::__client_accounts_register_relayer;
pub(crate) use crate::instructions::relayer::update_relayer::__client_accounts_update_relayer;
pub(crate) use crate::instructions::relayer::deactivate_relayer::__client_accounts_deactivate_relayer;
pub(crate) use crate::instructions::deposit_masp::__client_accounts_deposit_masp;

#[program]
pub mod psol_privacy_v2 {
    use super::*;

    // =========================================================================
    // POOL ADMINISTRATION
    // =========================================================================

    /// Initialize a new MASP pool
    ///
    /// # Arguments
    /// * `tree_depth` - Merkle tree depth (4-24, determines max commitments)
    /// * `root_history_size` - Number of historical roots to maintain (min 30)
    pub fn initialize_pool_v2(
        ctx: Context<InitializePoolV2>,
        tree_depth: u8,
        root_history_size: u16,
    ) -> Result<()> {
        instructions::initialize_pool_v2::handler(ctx, tree_depth, root_history_size)
    }

    /// Initialize pool registries (part 2)
    ///
    /// Must be called after initialize_pool_v2
    pub fn initialize_pool_registries(ctx: Context<InitializePoolRegistries>) -> Result<()> {
        instructions::initialize_pool_registries::handler(ctx)
    }

    /// Register a new asset (SPL token) with the pool
    ///
    /// # Arguments
    /// * `asset_id` - Unique identifier for this asset (usually mint address hash)
    pub fn register_asset(ctx: Context<RegisterAsset>, asset_id: [u8; 32]) -> Result<()> {
        instructions::register_asset::handler(ctx, asset_id)
    }

    /// Set verification key for a specific proof type
    ///
    /// # Arguments
    /// * `proof_type` - Type of proof (Deposit, Withdraw, JoinSplit, Membership)
    /// * `vk_alpha_g1` - Alpha point in G1
    /// * `vk_beta_g2` - Beta point in G2
    /// * `vk_gamma_g2` - Gamma point in G2
    /// * `vk_delta_g2` - Delta point in G2
    /// * `vk_ic` - IC points for public inputs
    #[allow(clippy::too_many_arguments)]
    pub fn set_verification_key_v2(
        ctx: Context<SetVerificationKeyV2>,
        proof_type: ProofType,
        vk_alpha_g1: [u8; 64],
        vk_beta_g2: [u8; 128],
        vk_gamma_g2: [u8; 128],
        vk_delta_g2: [u8; 128],
        vk_ic: Vec<[u8; 64]>,
    ) -> Result<()> {
        instructions::set_verification_key_v2::handler(
            ctx,
            proof_type,
            vk_alpha_g1,
            vk_beta_g2,
            vk_gamma_g2,
            vk_delta_g2,
            vk_ic,
        )
    }

    /// Lock a verification key (makes it immutable)
    pub fn lock_verification_key_v2(
        ctx: Context<LockVerificationKeyV2>,
        proof_type: ProofType,
    ) -> Result<()> {
        instructions::set_verification_key_v2::lock_handler(ctx, proof_type)
    }

    /// Pause the pool (admin only)
    pub fn pause_pool_v2(ctx: Context<PausePoolV2>) -> Result<()> {
        instructions::admin::pause_v2::handler(ctx)
    }

    /// Unpause the pool (admin only)
    pub fn unpause_pool_v2(ctx: Context<UnpausePoolV2>) -> Result<()> {
        instructions::admin::unpause_v2::handler(ctx)
    }

    /// Initiate authority transfer (2-step process)
    pub fn initiate_authority_transfer_v2(
        ctx: Context<InitiateAuthorityTransferV2>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::authority_v2::initiate_handler(ctx, new_authority)
    }

    /// Accept authority transfer
    pub fn accept_authority_transfer_v2(ctx: Context<AcceptAuthorityTransferV2>) -> Result<()> {
        instructions::admin::authority_v2::accept_handler(ctx)
    }

    /// Cancel pending authority transfer
    pub fn cancel_authority_transfer_v2(ctx: Context<CancelAuthorityTransferV2>) -> Result<()> {
        instructions::admin::authority_v2::cancel_handler(ctx)
    }

    // =========================================================================
    // RELAYER REGISTRY
    // =========================================================================

    /// Configure global relayer parameters
    pub fn configure_relayer_registry(
        ctx: Context<ConfigureRelayerRegistry>,
        min_fee_bps: u16,
        max_fee_bps: u16,
        require_stake: bool,
        min_stake_amount: u64,
    ) -> Result<()> {
        instructions::relayer::configure_registry::handler(
            ctx,
            min_fee_bps,
            max_fee_bps,
            require_stake,
            min_stake_amount,
        )
    }

    /// Register a new relayer node
    pub fn register_relayer(
        ctx: Context<RegisterRelayer>,
        fee_bps: u16,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::relayer::register_relayer::handler(ctx, fee_bps, metadata_uri)
    }

    /// Update relayer configuration
    pub fn update_relayer(
        ctx: Context<UpdateRelayer>,
        fee_bps: Option<u16>,
        metadata_uri: Option<String>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::relayer::update_relayer::handler(ctx, fee_bps, metadata_uri, is_active)
    }

    /// Deactivate a relayer (can be reactivated)
    pub fn deactivate_relayer(ctx: Context<DeactivateRelayer>) -> Result<()> {
        instructions::relayer::deactivate_relayer::handler(ctx)
    }

    // =========================================================================
    // MASP CORE OPERATIONS
    // =========================================================================

    /// Deposit assets into the shielded pool (MASP)
    ///
    /// # Arguments
    /// * `amount` - Amount to deposit
    /// * `commitment` - Poseidon commitment = hash(secret, nullifier, amount, asset_id)
    /// * `asset_id` - Asset identifier (derived from mint)
    /// * `encrypted_note` - Optional encrypted note for recipient
    #[allow(clippy::too_many_arguments)]
    pub fn deposit_masp(
    ctx: Context<DepositMasp>,
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    proof_data: Vec<u8>,
    encrypted_note: Option<Vec<u8>>,
) -> Result<()> {
    instructions::deposit_masp::handler(ctx, amount, commitment, asset_id, proof_data, encrypted_note)
}


// =========================================================================
// SHARED TYPES
// =========================================================================

/// Proof types supported by pSOL v2
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProofType {
    /// Deposit proof (proves valid commitment)
    Deposit = 0,
    /// Withdrawal proof (proves valid nullifier and membership)
    Withdraw = 1,
    /// Join-Split proof (proves value conservation in internal transfer)
    JoinSplit = 2,
    /// Membership proof (proves stake ≥ threshold without spending)
    Membership = 3,
}

impl ProofType {
    pub fn as_seed(&self) -> &[u8] {
        match self {
            ProofType::Deposit => b"vk_deposit",
            ProofType::Withdraw => b"vk_withdraw",
            ProofType::JoinSplit => b"vk_joinsplit",
            ProofType::Membership => b"vk_membership",
        }
    }
}

/// Shielded action types for CPI
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ShieldedActionType {
    /// Swap via DEX (e.g., Jupiter)
    DexSwap = 0,
    /// Deposit to lending protocol
    LendingDeposit = 1,
    /// Borrow from lending protocol
    LendingBorrow = 2,
    /// Stake tokens
    Stake = 3,
    /// Unstake tokens
    Unstake = 4,
    /// Custom action (protocol-specific)
    Custom = 255,
}

// Re-exports
pub use error::PrivacyErrorV2;
pub use events::*;
pub use state::{
    AssetVault, ComplianceConfig, MerkleTreeV2, PoolConfigV2, RelayerNode, RelayerRegistry,
    SpentNullifierV2, VerificationKeyAccountV2,
};
}