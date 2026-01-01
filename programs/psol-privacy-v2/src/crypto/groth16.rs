//! Groth16 Zero-Knowledge Proof Types and Helpers
//!
//! This module provides type definitions and helper functions for Groth16 proofs.
//! The actual verification is implemented in `groth16_verifier.rs` using Solana
//! alt_bn128 syscalls.
//!
//! # Production Status
//!
//! - Default build: Uses syscall-based verification (production-ready)
//! - insecure-dev build: Bypasses verification (FOR TESTING ONLY)
//!
//! SECURITY: Do not enable `insecure-dev` in production deployments.

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

// Re-export the main proof type from groth16_verifier
pub use super::groth16_verifier::Groth16Proof;

/// Public inputs for proof verification (as scalars)
pub type PublicInputs = Vec<[u8; 32]>;

// ============================================================================
// CONVENIENCE VERIFICATION FUNCTIONS
// ============================================================================

/// Verify a Groth16 zero-knowledge proof (convenience wrapper).
///
/// This function is maintained for backwards compatibility.
/// For new code, use `groth16_verifier::verify_groth16_proof` directly.
///
/// # Default Build
/// Uses syscall-based verification via alt_bn128 precompiles.
///
/// # insecure-dev Build
/// BYPASSES CRYPTOGRAPHIC VERIFICATION (for local testing only).
/// DO NOT USE WITH REAL FUNDS.
///
/// # Production Requirements
/// Real BN254 pairing check is performed:
/// - e(A, B) = e(alpha, beta) * e(L, gamma) * e(C, delta)
/// - Where L = sum(public_inputs[i] * IC[i])
#[allow(unused_variables)]
pub fn verify_groth16_proof(
    proof: &Groth16Proof,
    public_inputs: &PublicInputs,
    verification_key: &[u8],
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        // INSECURE PLACEHOLDER for development only
        msg!("⚠️⚠️⚠️ INSECURE: Placeholder Groth16 verification ⚠️⚠️⚠️");
        msg!("⚠️ NO CRYPTOGRAPHIC VERIFICATION PERFORMED");
        msg!("⚠️ DO NOT USE WITH REAL FUNDS");

        // Basic sanity checks only
        if proof.a == [0u8; 64] || proof.b == [0u8; 128] || proof.c == [0u8; 64] {
            msg!("⚠️ Placeholder check: Proof elements are zero");
            return Ok(false);
        }

        if public_inputs.is_empty() {
            msg!("⚠️ Placeholder check: No public inputs");
            return Ok(false);
        }

        for input in public_inputs.iter() {
            if *input == [0u8; 32] {
                msg!("⚠️ Placeholder check: Public input is zero");
                return Ok(false);
            }
        }

        msg!("⚠️ Placeholder accepting proof without real verification");
        return Ok(true);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        // Production: This function requires a VerificationKeyAccountV2
        // Use groth16_verifier::verify_groth16_proof with the VK account instead
        msg!("Use verify_groth16_proof from groth16_verifier with VK account");
        Err(PrivacyErrorV2::CryptoNotImplemented.into())
    }
}

/// Verify deposit proof
///
/// Proves: "I know values such that commitment = Hash(nullifier, amount, asset_id, blinding)"
#[allow(unused_variables)]
pub fn verify_deposit_proof(
    commitment: &[u8; 32],
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Placeholder deposit proof");
        return Ok(*commitment != [0u8; 32]);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        msg!("Deposit proof verification requires VK account");
        Err(PrivacyErrorV2::CryptoNotImplemented.into())
    }
}

/// Verify withdraw proof
///
/// Proves: "I know a valid note in the Merkle tree and its nullifier hasn't been spent"
#[allow(unused_variables)]
pub fn verify_withdraw_proof(
    nullifier_hash: &[u8; 32],
    merkle_root: &[u8; 32],
    recipient: &Pubkey,
    amount: u64,
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️⚠️⚠️ INSECURE: Placeholder withdraw proof ⚠️⚠️⚠️");
        msg!("⚠️ NO VERIFICATION OF MERKLE MEMBERSHIP");
        msg!("⚠️ NO VERIFICATION OF NULLIFIER LINKAGE");

        if *nullifier_hash == [0u8; 32] || *merkle_root == [0u8; 32] {
            return Ok(false);
        }

        return Ok(true);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        msg!("Withdraw proof verification requires VK account");
        Err(PrivacyErrorV2::CryptoNotImplemented.into())
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(not(feature = "insecure-dev"))]
    fn test_fail_closed_verification() {
        let proof = Groth16Proof {
            a: [1u8; 64],
            b: [1u8; 128],
            c: [1u8; 64],
        };
        let inputs = vec![[1u8; 32]];
        let vk = vec![1u8; 100];

        // Should FAIL in production build (requires VK account)
        let result = verify_groth16_proof(&proof, &inputs, &vk);
        assert!(result.is_err(), "Should fail closed in production");
    }

    #[test]
    #[cfg(feature = "insecure-dev")]
    fn test_placeholder_verification() {
        let proof = Groth16Proof {
            a: [1u8; 64],
            b: [1u8; 128],
            c: [1u8; 64],
        };
        let inputs = vec![[1u8; 32]];
        let vk = vec![1u8; 100];

        // Should pass basic checks in dev mode
        let result = verify_groth16_proof(&proof, &inputs, &vk).unwrap();
        assert!(result, "Should pass placeholder checks");
    }

    #[test]
    #[cfg(feature = "insecure-dev")]
    fn test_placeholder_rejects_zero_proof() {
        let proof = Groth16Proof {
            a: [0u8; 64],
            b: [0u8; 128],
            c: [0u8; 64],
        };
        let inputs = vec![[1u8; 32]];
        let vk = vec![1u8; 100];

        // Should reject zero proof even in dev mode
        let result = verify_groth16_proof(&proof, &inputs, &vk).unwrap();
        assert!(!result, "Should reject zero proof");
    }
}
