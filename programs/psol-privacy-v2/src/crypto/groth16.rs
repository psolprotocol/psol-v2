//! Groth16 Zero-Knowledge Proof Verification
//!
//! Production implementation using Solana's alt_bn128 syscalls for BN254 curve operations.
//!
//! # Security
//!
//! - Fail-closed design: any error results in rejection
//! - All curve points are validated before use
//! - Invalid proofs never return `Ok(true)`
//!
//! # Build Modes
//!
//! - **Default (production)**: Uses real BN254 pairing verification
//! - **insecure-dev feature**: Bypasses verification for local testing ONLY
//!   - DO NOT USE WITH REAL FUNDS
//!   - Blocked in release builds via compile_error!

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::state::VerificationKeyAccountV2;

use super::curve_utils::{
    G1Point, G2Point, ScalarField,
    validate_g1_point, validate_g2_point,
    negate_g1, compute_vk_x, verify_pairing, make_pairing_element,
    is_valid_scalar,
};

// ============================================================================
// PROOF STRUCTURE
// ============================================================================

/// Groth16 proof structure (snarkjs-compatible format)
///
/// # Encoding
/// - `a`: G1 point (64 bytes) - π_A
/// - `b`: G2 point (128 bytes) - π_B  
/// - `c`: G1 point (64 bytes) - π_C
///
/// Total size: 256 bytes
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Groth16Proof {
    /// Proof element A (G1 point)
    pub a: [u8; 64],
    /// Proof element B (G2 point)  
    pub b: [u8; 128],
    /// Proof element C (G1 point)
    pub c: [u8; 64],
}

impl Groth16Proof {
    /// Total size of serialized proof
    pub const SIZE: usize = 256;

    /// Parse proof from raw bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self> {
        if data.len() != Self::SIZE {
            msg!("Invalid proof size: expected {}, got {}", Self::SIZE, data.len());
            return Err(PrivacyErrorV2::InvalidProofFormat.into());
        }

        let mut a = [0u8; 64];
        let mut b = [0u8; 128];
        let mut c = [0u8; 64];

        a.copy_from_slice(&data[0..64]);
        b.copy_from_slice(&data[64..192]);
        c.copy_from_slice(&data[192..256]);

        Ok(Self { a, b, c })
    }

    /// Serialize proof to bytes
    pub fn to_bytes(&self) -> [u8; 256] {
        let mut bytes = [0u8; 256];
        bytes[0..64].copy_from_slice(&self.a);
        bytes[64..192].copy_from_slice(&self.b);
        bytes[192..256].copy_from_slice(&self.c);
        bytes
    }

    /// Validate proof points are on curve
    pub fn validate(&self) -> Result<()> {
        validate_g1_point(&self.a).map_err(|_| {
            msg!("Proof point A is not on curve");
            error!(PrivacyErrorV2::InvalidProof)
        })?;

        validate_g2_point(&self.b).map_err(|_| {
            msg!("Proof point B is not valid");
            error!(PrivacyErrorV2::InvalidProof)
        })?;

        validate_g1_point(&self.c).map_err(|_| {
            msg!("Proof point C is not on curve");
            error!(PrivacyErrorV2::InvalidProof)
        })?;

        Ok(())
    }
}

/// Public inputs for proof verification
pub type PublicInputs = Vec<[u8; 32]>;

// ============================================================================
// MAIN VERIFICATION FUNCTION
// ============================================================================

/// Verify a Groth16 zero-knowledge proof.
///
/// # Verification Equation
///
/// Checks the pairing equation:
/// ```text
/// e(A, B) = e(α, β) · e(vk_x, γ) · e(C, δ)
/// ```
///
/// Equivalently (for multi-pairing check):
/// ```text
/// e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
/// ```
///
/// Where `vk_x = IC[0] + Σ(public_input[i] × IC[i+1])`
///
/// # Arguments
/// * `vk` - Verification key account
/// * `proof` - Groth16 proof (A, B, C points)
/// * `public_inputs` - Array of scalar field elements
///
/// # Returns
/// * `Ok(true)` - Proof is valid
/// * `Ok(false)` - Proof is invalid
/// * `Err(...)` - Error during verification
///
/// # Security
/// - Never returns `Ok(true)` for invalid proofs
/// - All errors result in rejection
pub fn verify_groth16_proof(
    vk: &VerificationKeyAccountV2,
    proof: &Groth16Proof,
    public_inputs: &[ScalarField],
) -> Result<bool> {
    // =========================================================================
    // INSECURE DEV MODE - LOCAL TESTING ONLY
    // =========================================================================
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️⚠️⚠️ INSECURE: Development mode - NO REAL VERIFICATION ⚠️⚠️⚠️");
        msg!("⚠️ DO NOT USE WITH REAL FUNDS");
        msg!("⚠️ This build is for local testing only");
        
        // Basic sanity checks only
        if proof.a == [0u8; 64] || proof.b == [0u8; 128] || proof.c == [0u8; 64] {
            msg!("⚠️ Dev mode: Rejecting zero proof");
            return Ok(false);
        }
        
        if public_inputs.is_empty() {
            msg!("⚠️ Dev mode: Rejecting empty public inputs");
            return Ok(false);
        }
        
        msg!("⚠️ Dev mode: Accepting proof without cryptographic verification");
        return Ok(true);
    }

    // =========================================================================
    // PRODUCTION VERIFICATION
    // =========================================================================
    #[cfg(not(feature = "insecure-dev"))]
    {
        // Step 1: Validate VK is properly initialized
        if !vk.is_initialized {
            msg!("Verification key not initialized");
            return Err(PrivacyErrorV2::VerificationKeyNotSet.into());
        }

        if !vk.is_valid() {
            msg!("Verification key is invalid");
            return Err(PrivacyErrorV2::VerificationKeyNotSet.into());
        }

        // Step 2: Verify VK integrity
        if !vk.verify_integrity() {
            msg!("Verification key integrity check failed");
            return Err(PrivacyErrorV2::CorruptedData.into());
        }

        // Step 3: Validate proof points
        proof.validate()?;

        // Step 4: Check public inputs count matches VK
        let expected_inputs = vk.vk_ic.len().saturating_sub(1);
        if public_inputs.len() != expected_inputs {
            msg!(
                "Public inputs count mismatch: expected {}, got {}",
                expected_inputs,
                public_inputs.len()
            );
            return Err(PrivacyErrorV2::InvalidPublicInputs.into());
        }

        // Step 5: Validate all public inputs are valid scalars
        for (i, input) in public_inputs.iter().enumerate() {
            if !is_valid_scalar(input) {
                msg!("Public input {} is not a valid scalar", i);
                return Err(PrivacyErrorV2::InvalidPublicInputs.into());
            }
        }

        // Step 6: Compute vk_x = IC[0] + Σ(public_input[i] × IC[i+1])
        let vk_x = compute_vk_x(&vk.vk_ic, public_inputs).map_err(|e| {
            msg!("Failed to compute vk_x: {:?}", e);
            e
        })?;

        // Step 7: Negate proof.A for the pairing check
        let neg_a = negate_g1(&proof.a).map_err(|e| {
            msg!("Failed to negate proof.A: {:?}", e);
            e
        })?;

        // Step 8: Build pairing elements
        // e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
        let pairing_elements = [
            make_pairing_element(&neg_a, &proof.b),              // e(-A, B)
            make_pairing_element(&vk.vk_alpha_g1, &vk.vk_beta_g2), // e(α, β)
            make_pairing_element(&vk_x, &vk.vk_gamma_g2),          // e(vk_x, γ)
            make_pairing_element(&proof.c, &vk.vk_delta_g2),       // e(C, δ)
        ];

        // Step 9: Verify the multi-pairing equation
        let is_valid = verify_pairing(&pairing_elements).map_err(|e| {
            msg!("Pairing verification failed: {:?}", e);
            e
        })?;

        if !is_valid {
            msg!("Proof verification failed: pairing check returned false");
        }

        Ok(is_valid)
    }
}

/// Convenience wrapper to verify proof from raw bytes.
pub fn verify_proof_bytes(
    vk: &VerificationKeyAccountV2,
    proof_bytes: &[u8],
    public_inputs: &[ScalarField],
) -> Result<bool> {
    let proof = Groth16Proof::from_bytes(proof_bytes)?;
    verify_groth16_proof(vk, &proof, public_inputs)
}

// ============================================================================
// PROOF-TYPE SPECIFIC VERIFICATION
// ============================================================================

/// Verify a deposit proof.
///
/// Proves: "I know (secret, nullifier, amount, asset_id, blinding) such that
///          commitment = Hash(secret, nullifier, amount, asset_id, blinding)"
pub fn verify_deposit_proof(
    vk: &VerificationKeyAccountV2,
    commitment: &[u8; 32],
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Dev mode deposit proof");
        return Ok(*commitment != [0u8; 32]);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        // Deposit proof has commitment as public input
        let public_inputs = vec![*commitment];
        verify_groth16_proof(vk, proof, &public_inputs)
    }
}

/// Verify a withdraw proof.
///
/// Proves: "I know a valid note in the Merkle tree and can compute its nullifier"
pub fn verify_withdraw_proof(
    vk: &VerificationKeyAccountV2,
    nullifier_hash: &[u8; 32],
    merkle_root: &[u8; 32],
    recipient: &Pubkey,
    amount: u64,
    relayer_fee: u64,
    asset_id: &[u8; 32],
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Dev mode withdraw proof");
        return Ok(*nullifier_hash != [0u8; 32] && *merkle_root != [0u8; 32]);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        use super::curve_utils::{u64_to_scalar, pubkey_to_scalar};
        
        // Build public inputs for withdraw circuit
        // Order must match circuit's public input order
        let public_inputs = vec![
            *nullifier_hash,
            *merkle_root,
            pubkey_to_scalar(recipient),
            u64_to_scalar(amount),
            u64_to_scalar(relayer_fee),
            *asset_id,
        ];
        
        verify_groth16_proof(vk, proof, &public_inputs)
    }
}

/// Verify a join-split (private transfer) proof.
///
/// Proves: "I know valid input notes and output notes such that sum(inputs) = sum(outputs)"
pub fn verify_joinsplit_proof(
    vk: &VerificationKeyAccountV2,
    public_inputs: &[ScalarField],
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Dev mode join-split proof");
        return Ok(!public_inputs.is_empty());
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        verify_groth16_proof(vk, proof, public_inputs)
    }
}

/// Verify a membership proof.
///
/// Proves: "I have a note in the Merkle tree without revealing which one"
pub fn verify_membership_proof(
    vk: &VerificationKeyAccountV2,
    merkle_root: &[u8; 32],
    proof: &Groth16Proof,
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Dev mode membership proof");
        return Ok(*merkle_root != [0u8; 32]);
    }

    #[cfg(not(feature = "insecure-dev"))]
    {
        let public_inputs = vec![*merkle_root];
        verify_groth16_proof(vk, proof, &public_inputs)
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_size() {
        assert_eq!(Groth16Proof::SIZE, 256);
    }

    #[test]
    fn test_proof_from_bytes_valid() {
        let data = [0u8; 256];
        let result = Groth16Proof::from_bytes(&data);
        assert!(result.is_ok());
    }

    #[test]
    fn test_proof_from_bytes_invalid_length() {
        let short = [0u8; 100];
        assert!(Groth16Proof::from_bytes(&short).is_err());

        let long = [0u8; 300];
        assert!(Groth16Proof::from_bytes(&long).is_err());
    }

    #[test]
    fn test_proof_roundtrip() {
        let mut data = [0u8; 256];
        for (i, byte) in data.iter_mut().enumerate() {
            *byte = i as u8;
        }

        let proof = Groth16Proof::from_bytes(&data).unwrap();
        let serialized = proof.to_bytes();
        assert_eq!(data, serialized);
    }
}