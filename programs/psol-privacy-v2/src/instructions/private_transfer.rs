//! Private Transfer (Join-Split) Instruction
//!
//! Performs private transfers within the shielded pool using the join-split circuit.
//! Supports N inputs to M outputs with optional public inflow/outflow.
//!
//! # Implementation Status
//!
//! This instruction is reserved for pSOL v2.1 and is NOT LIVE yet.
//! The join-split circuit has not been finalized, so this handler returns
//! `NotImplemented` after performing basic state validation.
//!
//! When the circuit is ready, this will enable:
//! - Internal shielded transfers (no public flow)
//! - Combined deposit + split
//! - Combined merge + withdrawal
//! - Multi-party private payments

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::ProofType;
use crate::PrivateTransferJoinSplit;

/// Maximum number of input nullifiers (design target)
pub const MAX_INPUTS: usize = 2;

/// Maximum number of output commitments (design target)
pub const MAX_OUTPUTS: usize = 2;

/// Handler for private_transfer_join_split instruction
///
/// # Status: NOT IMPLEMENTED
///
/// This handler performs basic state validation but returns `NotImplemented`
/// because the join-split ZK circuit is not yet finalized. Once the circuit
/// is deployed and VK is set, this instruction will be enabled.
///
/// # Future Behavior
///
/// When implemented, this will:
/// 1. Verify the Groth16 join-split proof
/// 2. Mark all input nullifiers as spent
/// 3. Handle public inflows/outflows if public_amount != 0
/// 4. Insert output commitments into the Merkle tree
/// 5. Pay relayer fee from the public outflow
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<PrivateTransferJoinSplit>,
    _proof_data: Vec<u8>,
    _merkle_root: [u8; 32],
    input_nullifiers: Vec<[u8; 32]>,
    output_commitments: Vec<[u8; 32]>,
    _public_amount: i64,
    asset_id: [u8; 32],
    _relayer_fee: u64,
    _encrypted_outputs: Option<Vec<Vec<u8>>>,
) -> Result<()> {
    // =========================================================================
    // BASIC STATE VALIDATION
    // These checks verify the instruction could succeed if circuits were ready
    // =========================================================================

    // Validate input counts
    require!(
        !input_nullifiers.is_empty() && input_nullifiers.len() <= MAX_INPUTS,
        PrivacyErrorV2::TooManyNullifiers
    );
    require!(
        !output_commitments.is_empty() && output_commitments.len() <= MAX_OUTPUTS,
        PrivacyErrorV2::TooManyOutputs
    );

    // Validate asset ID matches
    require!(
        asset_id == ctx.accounts.asset_vault.asset_id,
        PrivacyErrorV2::AssetIdMismatch
    );

    // Check join-split feature is enabled in pool config
    ctx.accounts.pool_config.require_join_split_enabled()?;

    // Check VK is configured (even though we won't use it yet)
    ctx.accounts.pool_config.require_vk_configured(ProofType::JoinSplit)?;

    // =========================================================================
    // FEATURE NOT YET IMPLEMENTED
    // The join-split circuit is reserved for v2.1
    // =========================================================================

    msg!("Join-split private transfers are reserved for pSOL v2.1");
    msg!("This feature requires the join-split ZK circuit which is not yet deployed");
    msg!("Use deposit_masp and withdraw_masp for current privacy operations");

    Err(error!(PrivacyErrorV2::NotImplemented))
}
