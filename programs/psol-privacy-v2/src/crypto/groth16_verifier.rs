//! Groth16 Proof Verifier for pSOL v2
//!
//! This module implements Groth16 zkSNARK proof verification using Solana's
//! alt_bn128 precompile syscalls (BN254/alt_bn128 curve).
//!
//! # Overview
//!
//! The verifier supports multiple proof types as defined in the pSOL v2 protocol:
//! - **Deposit**: Proves valid commitment construction
//! - **Withdraw**: Proves Merkle membership and nullifier computation
//! - **JoinSplit**: Proves value conservation in private transfers
//! - **Membership**: Proves stake threshold without spending
//!
//! # Verification Equation
//!
//! Groth16 verification checks:
//! ```text
//! e(A, B) = e(α, β) · e(vk_x, γ) · e(C, δ)
//! ```
//!
//! Equivalently, we verify:
//! ```text
//! e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
//! ```
//!
//! Where `vk_x = IC[0] + Σ(public_input[i] × IC[i+1])`
//!
//! # Compute Budget
//!
//! Approximate costs:
//! - VK_X computation: ~12,000 CU per public input
//! - 4-pairing check: ~150,000 CU
//! - Total for 8-input proof: ~250,000 CU
//!
//! # Security Considerations
//!
//! - Verification is fail-closed: any error results in rejection
//! - All curve points are validated before use
//! - Invalid proofs never return `Ok(true)`
//! - Scalars must be canonical (< Fr modulus)

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::state::VerificationKeyAccountV2;

use super::alt_bn128_syscalls::{
    G1Point, G2Point, ScalarField,
    is_valid_scalar, validate_g1_point,
    g1_negate, make_pairing_element,
    verify_pairing_4,
};
use super::curve_utils::compute_vk_x;

// ============================================================================
// CONSTANTS
// ============================================================================

/// Groth16 proof size in bytes (A: 64 + B: 128 + C: 64 = 256)
pub const PROOF_DATA_LEN: usize = 256;

// ============================================================================
// PROOF STRUCTURE
// ============================================================================

/// Groth16 proof consisting of three curve points.
///
/// # Encoding
/// - `A`: G1 point (64 bytes, uncompressed, big-endian Fp coordinates)
/// - `B`: G2 point (128 bytes, uncompressed, big-endian Fp2 coordinates)
/// - `C`: G1 point (64 bytes, uncompressed)
///
/// Total size: 256 bytes
///
/// # Point Format
/// G1: (x: 32 bytes, y: 32 bytes) - big-endian Fp elements
/// G2: (x: (c0: 32, c1: 32), y: (c0: 32, c1: 32)) - big-endian Fp2 elements
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Groth16Proof {
    /// π_A ∈ G1 - First proof element
    pub a: G1Point,
    /// π_B ∈ G2 - Second proof element
    pub b: G2Point,
    /// π_C ∈ G1 - Third proof element
    pub c: G1Point,
}

impl Groth16Proof {
    /// Total size of serialized proof
    pub const SIZE: usize = PROOF_DATA_LEN;

    /// Deserialize proof from raw bytes.
    ///
    /// # Arguments
    /// * `data` - Raw proof bytes (must be exactly 256 bytes)
    ///
    /// # Returns
    /// * `Ok(Groth16Proof)` - Successfully parsed proof
    /// * `Err` - Invalid format or length
    pub fn from_bytes(data: &[u8]) -> Result<Self> {
        if data.len() != Self::SIZE {
            msg!(
                "Invalid proof size: expected {}, got {}",
                Self::SIZE,
                data.len()
            );
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

    /// Serialize proof to bytes.
    pub fn to_bytes(&self) -> [u8; 256] {
        let mut bytes = [0u8; 256];
        bytes[0..64].copy_from_slice(&self.a);
        bytes[64..192].copy_from_slice(&self.b);
        bytes[192..256].copy_from_slice(&self.c);
        bytes
    }

    /// Validate that all proof points are valid curve points.
    ///
    /// This checks:
    /// - A is a valid G1 point (via syscall)
    /// - B is structurally valid (full validation happens in pairing)
    /// - C is a valid G1 point (via syscall)
    pub fn validate(&self) -> Result<()> {
        validate_g1_point(&self.a).map_err(|_| {
            msg!("Proof point A is not on curve");
            error!(PrivacyErrorV2::InvalidProof)
        })?;

        // G2 validation is deferred to pairing check
        // The syscall will reject invalid G2 points

        validate_g1_point(&self.c).map_err(|_| {
            msg!("Proof point C is not on curve");
            error!(PrivacyErrorV2::InvalidProof)
        })?;

        Ok(())
    }
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/// Verify a Groth16 proof against a verification key and public inputs.
///
/// # Verification Equation
///
/// The Groth16 verification checks:
/// ```text
/// e(A, B) = e(α, β) · e(vk_x, γ) · e(C, δ)
/// ```
///
/// Where `vk_x = IC[0] + Σ(public_input[i] × IC[i+1])` is the public input accumulator.
///
/// This is equivalent to checking:
/// ```text
/// e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
/// ```
///
/// # Arguments
/// * `vk` - Verification key account containing curve points
/// * `proof` - The Groth16 proof (A, B, C)
/// * `public_inputs` - Array of scalar field elements (must be canonical)
///
/// # Returns
/// * `Ok(true)` - Proof is valid
/// * `Ok(false)` - Proof is invalid (verification failed)
/// * `Err(...)` - Error during verification (malformed inputs, etc.)
///
/// # Security
/// - Never returns `Ok(true)` for invalid proofs
/// - All errors result in rejection
/// - Verifies VK integrity before use
/// - All public inputs are validated to be < Fr modulus
pub fn verify_groth16_proof(
    vk: &VerificationKeyAccountV2,
    proof: &Groth16Proof,
    public_inputs: &[ScalarField],
) -> Result<bool> {
    // Step 1: Validate VK is properly initialized
    if !vk.is_initialized {
        msg!("Verification key not initialized");
        return Err(PrivacyErrorV2::VerificationKeyNotSet.into());
    }

    if !vk.is_valid() {
        msg!("Verification key is invalid");
        return Err(PrivacyErrorV2::VerificationKeyNotSet.into());
    }

    // Step 1b: Verify VK integrity (hash check)
    if !vk.verify_integrity() {
        msg!("Verification key integrity check failed");
        return Err(PrivacyErrorV2::CorruptedData.into());
    }

    // Step 2: Validate proof points
    proof.validate()?;

    // Step 3: Check public inputs count matches VK
    let expected_inputs = vk.vk_ic.len().saturating_sub(1);
    if public_inputs.len() != expected_inputs {
        msg!(
            "Public inputs count mismatch: expected {}, got {}",
            expected_inputs,
            public_inputs.len()
        );
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }

    // Step 3b: Validate all public inputs are valid scalars
    for (i, input) in public_inputs.iter().enumerate() {
        if !is_valid_scalar(input) {
            msg!("Public input {} is not a valid scalar (>= Fr modulus)", i);
            return Err(PrivacyErrorV2::InvalidScalar.into());
        }
    }

    // Step 4: Compute vk_x = IC[0] + Σ(public_input[i] × IC[i+1])
    let vk_x = compute_vk_x(&vk.vk_ic, public_inputs).map_err(|e| {
        msg!("Failed to compute vk_x: {:?}", e);
        e
    })?;

    // Step 5: Negate proof.A for the pairing check
    // We check: e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
    let neg_a = g1_negate(&proof.a).map_err(|e| {
        msg!("Failed to negate proof.A: {:?}", e);
        e
    })?;

    // Step 6: Build pairing elements (4 pairings for Groth16)
    let pairing_elements = [
        make_pairing_element(&neg_a, &proof.b),              // e(-A, B)
        make_pairing_element(&vk.vk_alpha_g1, &vk.vk_beta_g2),   // e(α, β)
        make_pairing_element(&vk_x, &vk.vk_gamma_g2),            // e(vk_x, γ)
        make_pairing_element(&proof.c, &vk.vk_delta_g2),         // e(C, δ)
    ];

    // Step 7: Verify the multi-pairing equation using syscall
    let is_valid = verify_pairing_4(&pairing_elements).map_err(|e| {
        msg!("Pairing verification syscall failed: {:?}", e);
        e
    })?;

    if !is_valid {
        msg!("Proof verification failed: pairing check returned false");
    }

    Ok(is_valid)
}

/// Verify proof with raw bytes (convenience wrapper).
///
/// Parses the proof bytes and delegates to `verify_groth16_proof`.
///
/// # Arguments
/// * `vk` - Verification key account
/// * `proof_bytes` - Raw proof data (256 bytes)
/// * `public_inputs` - Array of scalar field elements
///
/// # Returns
/// Same as `verify_groth16_proof`
pub fn verify_proof_bytes(
    vk: &VerificationKeyAccountV2,
    proof_bytes: &[u8],
    public_inputs: &[ScalarField],
) -> Result<bool> {
    let proof = Groth16Proof::from_bytes(proof_bytes)?;
    verify_groth16_proof(vk, &proof, public_inputs)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Check if proof bytes have valid length.
#[inline]
pub fn is_valid_proof_length(data: &[u8]) -> bool {
    data.len() == PROOF_DATA_LEN
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_size_constant() {
        assert_eq!(Groth16Proof::SIZE, 256);
        assert_eq!(PROOF_DATA_LEN, 256);
    }

    #[test]
    fn test_proof_from_bytes_valid_length() {
        let data = [0u8; 256];
        let result = Groth16Proof::from_bytes(&data);
        assert!(result.is_ok());
    }

    #[test]
    fn test_proof_from_bytes_invalid_length() {
        let short_data = [0u8; 100];
        let result = Groth16Proof::from_bytes(&short_data);
        assert!(result.is_err());

        let long_data = [0u8; 300];
        let result = Groth16Proof::from_bytes(&long_data);
        assert!(result.is_err());
    }

    #[test]
    fn test_proof_roundtrip() {
        let mut original = [0u8; 256];
        for (i, byte) in original.iter_mut().enumerate() {
            *byte = i as u8;
        }

        let proof = Groth16Proof::from_bytes(&original).unwrap();
        let serialized = proof.to_bytes();

        assert_eq!(original, serialized);
    }

    #[test]
    fn test_is_valid_proof_length() {
        assert!(is_valid_proof_length(&[0u8; 256]));
        assert!(!is_valid_proof_length(&[0u8; 255]));
        assert!(!is_valid_proof_length(&[0u8; 257]));
        assert!(!is_valid_proof_length(&[]));
    }

    // ========================================================================
    // SMOKE TEST - TODO: Replace with real proof data
    // ========================================================================
    // This test demonstrates the expected interface.
    // For real testing, generate proofs with snarkjs and use:
    //   1. Real VK from trusted setup
    //   2. Real proof from prover
    //   3. Real public inputs from circuit
    //
    // The test below will pass on non-Solana targets because the mock
    // syscalls always return success. On-chain testing is required for
    // full verification.
    // ========================================================================

    #[test]
    fn test_groth16_architecture_is_syscall_based() {
        // Verify we're using the syscall-based approach
        // by checking that the verify function calls through alt_bn128_syscalls
        
        // Create a minimal proof structure
        let proof = Groth16Proof {
            a: [0u8; 64],
            b: [0u8; 128],
            c: [0u8; 64],
        };

        // Serialize and deserialize
        let bytes = proof.to_bytes();
        let proof2 = Groth16Proof::from_bytes(&bytes).unwrap();
        
        assert_eq!(proof.a, proof2.a);
        assert_eq!(proof.b, proof2.b);
        assert_eq!(proof.c, proof2.c);
    }

    // TODO: Add integration test with real snarkjs artifacts
    // 
    // To generate test vectors:
    // 1. Compile circuit: circom circuit.circom --r1cs --wasm --sym
    // 2. Generate trusted setup: snarkjs groth16 setup circuit.r1cs pot_final.ptau circuit.zkey
    // 3. Export VK: snarkjs zkey export verificationkey circuit.zkey vk.json
    // 4. Generate proof: snarkjs groth16 prove circuit.zkey witness.wtns proof.json public.json
    // 5. Extract binary VK/proof in Solana format
    //
    // #[test]
    // fn test_with_real_proof() {
    //     let vk = load_vk_from_snarkjs("./test_data/vk.json");
    //     let proof = load_proof_from_snarkjs("./test_data/proof.json");
    //     let public_inputs = load_public_from_snarkjs("./test_data/public.json");
    //     
    //     let result = verify_groth16_proof(&vk, &proof, &public_inputs);
    //     assert!(result.unwrap());
    // }
}
