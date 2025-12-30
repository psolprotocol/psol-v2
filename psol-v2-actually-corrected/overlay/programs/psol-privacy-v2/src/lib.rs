//! pSOL Privacy Protocol v2 - MASP on Solana
//! 
//! Combined hardening:
//! - Fail-closed cryptography (from crypto hardening package)
//! - Secure batching with PDA authorization (from batching fixes)
//! - Privacy-safe pending buffer
//! - Real keccak256 hashing

use anchor_lang::prelude::*;

// Compile-time guard: Prevent release builds with insecure-dev
#[cfg(all(feature = "insecure-dev", not(debug_assertions)))]
compile_error!("insecure-dev cannot be enabled in release builds - this would deploy placeholder crypto to production");

// Compile-time guard: Prevent release builds with event-debug
#[cfg(all(feature = "event-debug", not(debug_assertions)))]
compile_error!("event-debug cannot be enabled in release builds - it leaks privacy-sensitive data");

declare_id!("pSoL2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

// Modules
pub mod error;
pub mod events;
pub mod state;
pub mod instructions;
pub mod crypto;  // Fail-closed crypto module

// Re-exports
pub use error::PrivacyErrorV2;
pub use events::*;
pub use state::*;
pub use instructions::*;

/// Proof type identifier
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ProofType {
    Deposit = 0,
    Withdraw = 1,
    JoinSplit = 2,
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

#[program]
pub mod psol_privacy_v2 {
    use super::*;

    // =========================================================================
    // POOL INITIALIZATION
    // =========================================================================

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        tree_depth: u8,
        root_history_size: u16,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, tree_depth, root_history_size)
    }

    // =========================================================================
    // ASSET MANAGEMENT
    // =========================================================================

    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        asset_id: [u8; 32],
    ) -> Result<()> {
        instructions::register_asset::handler(ctx, asset_id)
    }

    // =========================================================================
    // DEPOSITS (Privacy-Safe Batching)
    // =========================================================================

    pub fn deposit_masp(
        ctx: Context<DepositMasp>,
        amount: u64,
        commitment: [u8; 32],
        asset_id: [u8; 32],
        proof_data: Vec<u8>,
        encrypted_note: Option<Vec<u8>>,
    ) -> Result<()> {
        instructions::deposit_masp::handler(
            ctx,
            amount,
            commitment,
            asset_id,
            proof_data,
            encrypted_note,
        )
    }

    /// Process a batch of pending deposits
    ///
    /// Inserts commitments from pending buffer into Merkle tree.
    ///
    /// # Arguments
    /// * `max_to_process` - Maximum deposits to process (1-50)
    ///
    /// # Authorization
    /// Caller must be either:
    /// - Pool authority, OR
    /// - Have an enabled BatcherRole PDA
    pub fn batch_process_deposits(
        ctx: Context<BatchProcessDeposits>,
        max_to_process: u16,
    ) -> Result<()> {
        instructions::batch_process_deposits::handler(ctx, max_to_process)
    }

    // =========================================================================
    // WITHDRAWALS (Fail-Closed Verification)
    // =========================================================================

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

    // =========================================================================
    // RELAYER MANAGEMENT
    // =========================================================================

    pub fn register_relayer(
        ctx: Context<RegisterRelayer>,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::register_relayer::handler(ctx, fee_bps)
    }

    pub fn update_relayer(
        ctx: Context<UpdateRelayer>,
        fee_bps: Option<u16>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_relayer::handler(ctx, fee_bps, is_active)
    }

    pub fn attach_metadata(
        ctx: Context<AttachMetadata>,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::attach_metadata::handler(ctx, metadata_uri)
    }

    // =========================================================================
    // VERIFICATION KEY MANAGEMENT
    // =========================================================================

    pub fn set_verification_key(
        ctx: Context<SetVerificationKey>,
        proof_type: ProofType,
        vk_hash: [u8; 32],
        vk_data: Vec<u8>,
    ) -> Result<()> {
        instructions::set_verification_key::handler(ctx, proof_type, vk_hash, vk_data)
    }

    // =========================================================================
    // ADMINISTRATIVE
    // =========================================================================

    pub fn pause_pool(ctx: Context<PausePool>) -> Result<()> {
        instructions::pause_pool::handler(ctx)
    }

    pub fn unpause_pool(ctx: Context<UnpausePool>) -> Result<()> {
        instructions::unpause_pool::handler(ctx)
    }
}
