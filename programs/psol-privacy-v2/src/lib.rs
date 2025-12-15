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
//!

use anchor_lang::prelude::*;

pub mod crypto;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod psol_privacy_v2 {
    use super::*;

    // =========================================================================
    // MASP CORE OPERATIONS
    // =========================================================================

    /// Deposit assets into the shielded pool (MASP)
    ///
    /// # Arguments
    /// * `amount` - Amount to deposit
    /// * `commitment` - Poseidon commitment = hash(secret, nullifier, amount, asset_id)
    /// * `asset_id` - Asset identifier (derived from mint)
    /// * `proof_data` - Groth16 proof bytes (256 bytes)
    /// * `encrypted_note` - Optional encrypted note for recipient
    #[allow(clippy::too_many_arguments)]
    pub fn deposit_masp(
        ctx: Context<DepositMasp>,
        amount: u64,
        commitment: [u8; 32],
        asset_id: [u8; 32],
    ) -> Result<()> {
        instructions::deposit_masp::handler(
            ctx,
            amount,
            commitment,
            asset_id,
        )
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
        merkle_root: [u8; 32],
        nullifier_hash: [u8; 32],
        recipient: Pubkey,
        amount: u64,
        asset_id: [u8; 32],
        relayer_fee: u64,
    ) -> Result<()> {
        instructions::withdraw_masp::handler(
            ctx,
            merkle_root,
            nullifier_hash,
            recipient,
            amount,
            asset_id,
            relayer_fee,
        )
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
