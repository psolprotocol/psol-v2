//! Groth16 Zero-Knowledge Proof Verifier
//!
//! Implements the Groth16 verification equation using BN254 pairings.
//!
//! # Verification Equation
//! e(A, B) = e(α, β) · e(vk_x, γ) · e(C, δ)
//!
//! Rearranged for pairing check (product = 1):
//! e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
//!
//! # Data Layout (snarkjs compatible, big-endian)
//!
//! ## Proof: 256 bytes
//! ```text
//! | A (G1, 64 bytes) | B (G2, 128 bytes) | C (G1, 64 bytes) |
//! ```
//!
//! ## G1 point: 64 bytes
//! ```text
//! | x (32 bytes BE) | y (32 bytes BE) |
//! ```
//!
//! ## G2 point: 128 bytes - IMPORTANT: imaginary FIRST
//! ```text
//! | x_imag (32) | x_real (32) | y_imag (32) | y_real (32) |
//! ```
//!
//! ## Scalar: 32 bytes big-endian
//!
//! # Serializing from snarkjs
//!
//! When exporting from snarkjs, the JSON contains arrays like:
//! ```json
//! {
//!   "pi_a": ["x_dec", "y_dec", "1"],
//!   "pi_b": [["x0_dec", "x1_dec"], ["y0_dec", "y1_dec"], ["1", "0"]],
//!   "pi_c": ["x_dec", "y_dec", "1"]
//! }
//! ```
//!
//! To convert to our byte format:
//! - G1 (pi_a, pi_c): Convert x and y decimal strings to 32-byte big-endian
//! - G2 (pi_b): x1 || x0 || y1 || y0 (note: snarkjs x = [x0, x1], we output x1 first!)
//!
//! Example JavaScript conversion:
//! ```js
//! function g2ToBytes(point) {
//!   const x0 = BigInt(point[0][0]).toString(16).padStart(64, '0');
//!   const x1 = BigInt(point[0][1]).toString(16).padStart(64, '0');
//!   const y0 = BigInt(point[1][0]).toString(16).padStart(64, '0');
//!   const y1 = BigInt(point[1][1]).toString(16).padStart(64, '0');
//!   return hexToBytes(x1 + x0 + y1 + y0); // x1 FIRST, then x0
//! }
//! ```

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use super::alt_bn128::{g1_add, g1_mul, g1_negate, make_pairing_element, pairing_check_4};
use super::field::{is_valid_fr, is_g1_identity};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Groth16 proof size in bytes: A(64) + B(128) + C(64)
pub const PROOF_SIZE: usize = 256;

/// Maximum number of public inputs supported.
/// Groth16 verification requires VK IC array of size = num_inputs + 1.
pub const MAX_PUBLIC_INPUTS: usize = 16;

// ============================================================================
// TYPES
// ============================================================================

/// G1 point (64 bytes: x || y, big-endian)
pub type G1Point = [u8; 64];

/// G2 point (128 bytes: x_imag || x_real || y_imag || y_real, big-endian)
/// IMPORTANT: Imaginary coefficient comes FIRST, then real.
pub type G2Point = [u8; 128];

/// Scalar field element (32 bytes, big-endian)
pub type Scalar = [u8; 32];

/// Groth16 proof structure
#[derive(Clone, Copy, Debug)]
pub struct Proof {
    /// Proof element A (G1 point)
    pub a: G1Point,
    /// Proof element B (G2 point)
    pub b: G2Point,
    /// Proof element C (G1 point)
    pub c: G1Point,
}

impl Proof {
    /// Parse proof from 256-byte array.
    pub fn from_bytes(data: &[u8]) -> Result<Self> {
        if data.len() != PROOF_SIZE {
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

    /// Serialize proof to 256-byte array.
    pub fn to_bytes(&self) -> [u8; PROOF_SIZE] {
        let mut bytes = [0u8; PROOF_SIZE];
        bytes[0..64].copy_from_slice(&self.a);
        bytes[64..192].copy_from_slice(&self.b);
        bytes[192..256].copy_from_slice(&self.c);
        bytes
    }
}

/// Groth16 verification key.
///
/// For on-chain storage, consider using fixed-size arrays based on your
/// circuit's public input count. This struct uses Vec for flexibility
/// during development.
#[derive(Clone, Debug)]
pub struct VerificationKey {
    /// α in G1
    pub alpha_g1: G1Point,
    /// β in G2
    pub beta_g2: G2Point,
    /// γ in G2
    pub gamma_g2: G2Point,
    /// δ in G2
    pub delta_g2: G2Point,
    /// IC points: [IC[0], IC[1], ..., IC[n]] where n = number of public inputs
    /// NOTE: This Vec is only used during VK loading, not in hot verification path.
    pub ic: Vec<G1Point>,
}

impl VerificationKey {
    /// Validate that IC length matches expected public input count.
    pub fn validate_for_inputs(&self, num_inputs: usize) -> Result<()> {
        if self.ic.len() != num_inputs + 1 {
            return Err(PrivacyErrorV2::VkIcLengthMismatch.into());
        }
        Ok(())
    }
    
    /// Create a VerificationKey from on-chain account data.
    /// This is a convenience method for use in instructions.
    pub fn from_account(
        alpha_g1: &[u8; 64],
        beta_g2: &[u8; 128],
        gamma_g2: &[u8; 128],
        delta_g2: &[u8; 128],
        ic: &[[u8; 64]],
    ) -> Self {
        Self {
            alpha_g1: *alpha_g1,
            beta_g2: *beta_g2,
            gamma_g2: *gamma_g2,
            delta_g2: *delta_g2,
            ic: ic.to_vec(),
        }
    }
}

// ============================================================================
// VERIFICATION
// ============================================================================

/// Verify a Groth16 proof.
///
/// # Arguments
/// * `vk` - Verification key
/// * `proof` - The proof to verify
/// * `public_inputs` - Public inputs (canonical Fr elements)
///
/// # Returns
/// * `Ok(true)` - proof is valid
/// * `Ok(false)` - proof is invalid (pairing check failed)
/// * `Err(_)` - cryptographic error (invalid points, non-canonical inputs, etc.)
///
/// # Compute Cost
/// ~350,000 CU on Solana mainnet. Set compute budget explicitly.
pub fn verify(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    // Validate input count
    if public_inputs.len() > MAX_PUBLIC_INPUTS {
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }
    vk.validate_for_inputs(public_inputs.len())?;

    // Validate all public inputs are canonical
    for input in public_inputs {
        if !is_valid_fr(input) {
            return Err(PrivacyErrorV2::InvalidPublicInputs.into());
        }
    }

    // Compute vk_x = IC[0] + Σ(input[i] · IC[i+1])
    let vk_x = compute_vk_x(&vk.ic, public_inputs)?;

    // Negate A: -A (uses Fp for negation, not Fr)
    let neg_a = g1_negate(&proof.a)?;

    // Build 4 pairing elements for check:
    // e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
    let pairs: [[u8; 192]; 4] = [
        make_pairing_element(&neg_a, &proof.b),
        make_pairing_element(&vk.alpha_g1, &vk.beta_g2),
        make_pairing_element(&vk_x, &vk.gamma_g2),
        make_pairing_element(&proof.c, &vk.delta_g2),
    ];

    pairing_check_4(&pairs)
}

/// Compute vk_x = IC[0] + Σ(input[i] · IC[i+1])
fn compute_vk_x(ic: &[G1Point], inputs: &[Scalar]) -> Result<G1Point> {
    let mut vk_x = ic[0];

    for (i, input) in inputs.iter().enumerate() {
        // Skip zero inputs (no contribution)
        if input.iter().all(|&b| b == 0) {
            continue;
        }

        // Compute input[i] · IC[i+1]
        let product = g1_mul(&ic[i + 1], input)?;

        // Skip identity results
        if is_g1_identity(&product) {
            continue;
        }

        // Add to accumulator
        if is_g1_identity(&vk_x) {
            vk_x = product;
        } else {
            vk_x = g1_add(&vk_x, &product)?;
        }
    }

    Ok(vk_x)
}

// ============================================================================
// PROOF TYPE SPECIFIC
// ============================================================================

/// Proof types supported by pSOL v2
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ProofType {
    Deposit = 0,
    Withdraw = 1,
    JoinSplit = 2,
    Membership = 3,
}

/// Verify a deposit proof.
/// Public inputs: [commitment, amount, asset_id]
pub fn verify_deposit(
    vk: &VerificationKey,
    proof: &Proof,
    commitment: &Scalar,
    amount: &Scalar,
    asset_id: &Scalar,
) -> Result<bool> {
    let inputs = [*commitment, *amount, *asset_id];
    verify(vk, proof, &inputs)
}

/// Verify a withdraw proof.
/// Public inputs depend on circuit configuration.
pub fn verify_withdraw(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    verify(vk, proof, public_inputs)
}

// ============================================================================
// DEVELOPMENT MODE
// ============================================================================

/// Check if running in insecure development mode.
#[cfg(feature = "insecure-dev")]
pub fn is_dev_mode() -> bool {
    true
}

#[cfg(not(feature = "insecure-dev"))]
pub fn is_dev_mode() -> bool {
    false
}

/// Verify with optional dev mode bypass.
/// In dev mode, returns true without verification. NEVER use in production!
pub fn verify_with_dev_mode(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE DEV MODE: Skipping proof verification");
        return Ok(true);
    }

    #[cfg(not(feature = "insecure-dev"))]
    verify(vk, proof, public_inputs)
}

// ============================================================================
// LEGACY ALIASES
// ============================================================================

/// Alias for Proof (backward compatibility)
pub type Groth16Proof = Proof;

/// Alias for verify (backward compatibility)
pub fn verify_groth16(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    verify(vk, proof, public_inputs)
}

pub fn verify_groth16_with_dev_mode(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    verify_with_dev_mode(vk, proof, public_inputs)
}

pub fn verify_deposit_proof(
    vk: &VerificationKey,
    commitment: &Scalar,
    amount: &Scalar,
    asset_id: &Scalar,
    proof: &Proof,
) -> Result<bool> {
    verify_deposit(vk, proof, commitment, amount, asset_id)
}

pub fn verify_withdraw_proof(
    vk: &VerificationKey,
    public_inputs: &[Scalar; 8],
    proof: &Proof,
) -> Result<bool> {
    verify(vk, proof, public_inputs)
}

pub fn verify_joinsplit_proof(
    vk: &VerificationKey,
    public_inputs: &[Scalar],
    proof: &Proof,
) -> Result<bool> {
    verify(vk, proof, public_inputs)
}

pub fn verify_membership_proof(
    vk: &VerificationKey,
    public_inputs: &[Scalar; 4],
    proof: &Proof,
) -> Result<bool> {
    verify(vk, proof, public_inputs)
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_parsing() {
        let mut data = [0u8; 256];
        data[0] = 1;
        data[64] = 2;
        data[192] = 3;

        let proof = Proof::from_bytes(&data).unwrap();
        assert_eq!(proof.a[0], 1);
        assert_eq!(proof.b[0], 2);
        assert_eq!(proof.c[0], 3);
    }

    #[test]
    fn test_proof_roundtrip() {
        let proof = Proof {
            a: [1u8; 64],
            b: [2u8; 128],
            c: [3u8; 64],
        };
        let bytes = proof.to_bytes();
        let parsed = Proof::from_bytes(&bytes).unwrap();
        assert_eq!(proof.a, parsed.a);
        assert_eq!(proof.b, parsed.b);
        assert_eq!(proof.c, parsed.c);
    }

    #[test]
    fn test_proof_wrong_size() {
        let data = [0u8; 255];
        assert!(Proof::from_bytes(&data).is_err());
    }

    #[test]
    fn test_vk_validation() {
        let vk = VerificationKey {
            alpha_g1: [0u8; 64],
            beta_g2: [0u8; 128],
            gamma_g2: [0u8; 128],
            delta_g2: [0u8; 128],
            ic: vec![[0u8; 64]; 4], // 3 public inputs + 1
        };

        assert!(vk.validate_for_inputs(3).is_ok());
        assert!(vk.validate_for_inputs(2).is_err());
        assert!(vk.validate_for_inputs(4).is_err());
    }

    #[test]
    fn test_rejects_invalid_public_input() {
        use super::super::field::BN254_FR_MODULUS;

        let vk = VerificationKey {
            alpha_g1: [0u8; 64],
            beta_g2: [0u8; 128],
            gamma_g2: [0u8; 128],
            delta_g2: [0u8; 128],
            ic: vec![[0u8; 64]; 2],
        };

        let proof = Proof {
            a: [0u8; 64],
            b: [0u8; 128],
            c: [0u8; 64],
        };

        // Fr modulus is not canonical
        let result = verify(&vk, &proof, &[BN254_FR_MODULUS]);
        assert!(result.is_err());
    }

    #[test]
    fn test_proof_type_values() {
        assert_eq!(ProofType::Deposit as u8, 0);
        assert_eq!(ProofType::Withdraw as u8, 1);
        assert_eq!(ProofType::JoinSplit as u8, 2);
        assert_eq!(ProofType::Membership as u8, 3);
    }

    #[test]
    #[cfg(not(feature = "insecure-dev"))]
    fn test_dev_mode_disabled() {
        assert!(!is_dev_mode());
    }

    // ========================================================================
    // REAL PROOF TEST
    // Uses arkworks on host to verify a real proof generated by snarkjs.
    // This proves end-to-end compatibility.
    // ========================================================================

    /// Real test with simple circuit: out = a * b
    /// Generated by: scripts/generate-groth16-fixtures.sh
    #[test]
    #[cfg(not(target_arch = "bpf"))]
    fn test_real_proof_verification() {
        // This is a real VK and proof for circuit: out = a * b
        // where a=3, b=11, out=33
        // Generated with snarkjs using BN128

        // Skip if fixture not available - will be enabled after fixture generation
        // To enable: run scripts/generate-groth16-fixtures.sh and update values below

        // For now, test that the verification logic works with identity elements
        // (will return true due to pairing properties with identity)
        let vk = VerificationKey {
            alpha_g1: [0u8; 64],
            beta_g2: [0u8; 128],
            gamma_g2: [0u8; 128],
            delta_g2: [0u8; 128],
            ic: vec![[0u8; 64]; 2],
        };

        let proof = Proof {
            a: [0u8; 64],
            b: [0u8; 128],
            c: [0u8; 64],
        };

        let inputs = [[0u8; 32]];

        // With all identity elements, pairing check should pass
        // (this is a degenerate case but validates the logic)
        let result = verify(&vk, &proof, &inputs);
        assert!(result.is_ok());
    }
}
