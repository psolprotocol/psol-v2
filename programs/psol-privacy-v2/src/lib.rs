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

use instructions::*;

// Default (localnet)
#[cfg(not(any(feature = "devnet", feature = "mainnet")))]
declare_id!("PSoL1111111111111111111111111111111111111111");

// Devnet
#[cfg(feature = "devnet")]
declare_id!("PSoLDev111111111111111111111111111111111111");

// Mainnet
#[cfg(feature = "mainnet")]
declare_id!("PSoLMain11111111111111111111111111111111111");

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
        encrypted_note: Option<Vec<u8>>,
    ) -> Result<()> {
        instructions::deposit_masp::handler(ctx, amount, commitment, asset_id, encrypted_note)
    }

    /// Withdraw assets from the shielded pool (MASP)
    ///
    /// # Arguments
    /// * `proof_data` - Groth16 proof bytes (256 bytes)
    /// * `merkle_root` - Tree root at time of proof generation
    /// * `nullifier_hash` - Nullifier to prevent double-spend
    /// * `recipient` - Destination address
    /// * `amount` - Withdrawal amount
    /// * `asset_id` - Asset identifier
    /// * `relayer_fee` - Fee paid to relayer (deducted from amount)
    #[allow(clippy::too_many_arguments)]
    pub fn withdraw_masp(
        ctx: Context<WithdrawMasp>,
        proof_data: Vec<u8>,
        merkle_root: [u8; 32],
        nullifier_hash: [u8; 32],
        recipient: Pubkey,
        amount: u64,
        asset_id: [u8; 32],
        relayer_fee: u64,
    ) -> Result<()> {
        instructions::withdraw_masp::handler(
            ctx,
            proof_data,
            merkle_root,
            nullifier_hash,
            recipient,
            amount,
            asset_id,
            relayer_fee,
        )
    }

    /// Private transfer (Join-Split) - internal transfer without touching vault
    ///
    /// # Arguments
    /// * `proof_data` - Groth16 proof for join-split circuit
    /// * `merkle_root` - Tree root
    /// * `input_nullifiers` - Nullifiers for spent inputs (max 2)
    /// * `output_commitments` - New commitments for outputs (max 2)
    /// * `public_amount` - Net public flow (positive = deposit, negative = withdraw, 0 = internal)
    /// * `asset_id` - Asset being transferred
    /// * `relayer_fee` - Fee for relayer
    /// * `encrypted_outputs` - Encrypted notes for output recipients
    #[allow(clippy::too_many_arguments)]
    pub fn private_transfer_join_split(
        ctx: Context<PrivateTransferJoinSplit>,
        proof_data: Vec<u8>,
        merkle_root: [u8; 32],
        input_nullifiers: Vec<[u8; 32]>,
        output_commitments: Vec<[u8; 32]>,
        public_amount: i64,
        asset_id: [u8; 32],
        relayer_fee: u64,
        encrypted_outputs: Option<Vec<Vec<u8>>>,
    ) -> Result<()> {
        instructions::private_transfer::handler(
            ctx,
            proof_data,
            merkle_root,
            input_nullifiers,
            output_commitments,
            public_amount,
            asset_id,
            relayer_fee,
            encrypted_outputs,
        )
    }

    // =========================================================================
    // MEMBERSHIP & COMPLIANCE
    // =========================================================================

    /// Prove pool membership without spending
    ///
    /// Returns true and emits event if user can prove membership ≥ threshold
    ///
    /// # Arguments
    /// * `proof_data` - Groth16 proof for membership circuit
    /// * `merkle_root` - Tree root
    /// * `threshold` - Minimum commitment value to prove
    /// * `asset_id` - Asset for threshold check
    pub fn prove_membership(
        ctx: Context<ProveMembership>,
        proof_data: Vec<u8>,
        merkle_root: [u8; 32],
        threshold: u64,
        asset_id: [u8; 32],
    ) -> Result<bool> {
        instructions::prove_membership::handler(ctx, proof_data, merkle_root, threshold, asset_id)
    }

    /// Configure compliance/audit metadata settings
    pub fn configure_compliance(
        ctx: Context<ConfigureCompliance>,
        require_encrypted_note: bool,
        audit_pubkey: Option<Pubkey>,
        metadata_schema_version: u8,
    ) -> Result<()> {
        instructions::compliance::configure_compliance::handler(
            ctx,
            require_encrypted_note,
            audit_pubkey,
            metadata_schema_version,
        )
    }

    /// Attach encrypted audit metadata to existing commitment
    pub fn attach_audit_metadata(
        ctx: Context<AttachAuditMetadata>,
        commitment: [u8; 32],
        encrypted_metadata: Vec<u8>,
    ) -> Result<()> {
        instructions::compliance::attach_metadata::handler(ctx, commitment, encrypted_metadata)
    }

    // =========================================================================
    // SHIELDED CPI (for DeFi integration)
    // =========================================================================

    /// Execute shielded action via CPI
    ///
    /// Allows external protocols to interact with shielded balances
    /// Example: Jupiter swap integration
    ///
    /// # Arguments
    /// * `action_type` - Type of shielded action
    /// * `proof_data` - Proof authorizing the action
    /// * `action_data` - Serialized action parameters
    pub fn execute_shielded_action(
        ctx: Context<ExecuteShieldedAction>,
        action_type: ShieldedActionType,
        proof_data: Vec<u8>,
        action_data: Vec<u8>,
    ) -> Result<()> {
        instructions::shielded_cpi::execute_action::handler(ctx, action_type, proof_data, action_data)
    }
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
