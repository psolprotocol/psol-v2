//! Prove Membership Instruction
//!
//! Proves pool membership above a threshold without spending any commitments.
//! Useful for reputation systems, governance, or access control.
//!
//! # Implementation Status
//!
//! This instruction is reserved for pSOL v2.1 and is NOT LIVE yet.
//! The membership proof circuit has not been finalized, so this handler
//! returns `NotImplemented` after performing basic state validation.
//!
//! When the circuit is ready, this will enable:
//! - Prove ownership of commitment >= threshold amount
//! - No spending or nullifier revelation
//! - Time-bound proofs via binding hash
//! - Integration with governance and reputation systems

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::ProofType;
use crate::ProveMembership;

/// Handler for prove_membership instruction
///
/// # Status: NOT IMPLEMENTED
///
/// This handler performs basic state validation but returns `NotImplemented`
/// because the membership proof ZK circuit is not yet finalized. Once the
/// circuit is deployed and VK is set, this instruction will be enabled.
///
/// # Future Behavior
///
/// When implemented, this will:
/// 1. Compute a binding hash to prevent proof replay
/// 2. Verify the Groth16 membership proof
/// 3. NOT reveal or spend any nullifiers
/// 4. Return true/false and emit MembershipProofVerified event
/// 5. Enable use cases like governance voting rights verification
pub fn handler(
    ctx: Context<ProveMembership>,
    _proof_data: Vec<u8>,
    _merkle_root: [u8; 32],
    threshold: u64,
    asset_id: [u8; 32],
) -> Result<bool> {
    // =========================================================================
    // BASIC STATE VALIDATION
    // These checks verify the instruction could succeed if circuits were ready
    // =========================================================================

    // Threshold must be positive
    require!(threshold > 0, PrivacyErrorV2::InvalidAmount);

    // Asset ID cannot be zero
    require!(
        !asset_id.iter().all(|&b| b == 0),
        PrivacyErrorV2::AssetNotRegistered
    );

    // Check membership proofs are enabled
    ctx.accounts.pool_config.require_membership_enabled()?;

    // Check VK is configured (even though we won't use it yet)
    ctx.accounts.pool_config.require_vk_configured(ProofType::Membership)?;

    // =========================================================================
    // FEATURE NOT YET IMPLEMENTED
    // The membership circuit is reserved for v2.1
    // =========================================================================

    msg!("Membership proofs are reserved for pSOL v2.1");
    msg!("This feature requires the membership ZK circuit which is not yet deployed");
    msg!("The circuit will allow proving balance >= {} without spending", threshold);

    Err(error!(PrivacyErrorV2::NotImplemented))
}
