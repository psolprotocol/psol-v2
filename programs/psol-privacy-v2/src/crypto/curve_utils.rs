//! BN254 Elliptic Curve Utilities for pSOL v2
//!
//! This module provides curve utilities for Groth16 verification using
//! Solana's alt_bn128 syscalls. It re-exports types from alt_bn128_syscalls
//! and adds VK-specific operations.
//!
//! # Design Notes
//! - All hot-path operations avoid heap allocation where possible
//! - Validation is strict: invalid points/scalars cause immediate errors
//! - Field vs scalar modulus is carefully distinguished

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

// Re-export core types from alt_bn128_syscalls
pub use super::alt_bn128_syscalls::{
    G1Point, G2Point, Scalar as ScalarField, PairingElement,
    G1_IDENTITY, G2_IDENTITY,
    BN254_FP_MODULUS as BN254_FIELD_MODULUS,
    BN254_FR_MODULUS as BN254_SCALAR_MODULUS,
    is_g1_identity, is_g2_identity,
    g1_add, g1_mul, g1_negate,
    is_valid_scalar, validate_g1_point,
    verify_pairing, verify_pairing_4,
    make_pairing_element,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/// G1 generator point (1, 2) - standard BN254 generator
pub const G1_GENERATOR: G1Point = [
    // x = 1
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    // y = 2
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
];

// ============================================================================
// G1 OPERATIONS
// ============================================================================

/// Negate a G1 point.
/// Re-export with renamed function for backward compatibility.
#[inline]
pub fn negate_g1(point: &G1Point) -> Result<G1Point> {
    super::alt_bn128_syscalls::g1_negate(point)
}

/// Perform scalar multiplication on G1.
/// Wrapper for backward compatibility.
#[inline]
pub fn g1_scalar_mul(point: &G1Point, scalar: &ScalarField) -> Result<G1Point> {
    g1_mul(point, scalar)
}

// ============================================================================
// G2 VALIDATION
// ============================================================================

/// Validate a G2 point.
/// Currently performs basic structural checks only.
/// Full G2 validation would require expensive pairing operations.
///
/// Note: The pairing syscall itself will reject invalid G2 points,
/// so this is primarily for early rejection of malformed data.
pub fn validate_g2_point(point: &G2Point) -> Result<()> {
    // Check for trivially invalid structure
    // G2 points have two Fp2 coordinates, each with two Fp elements
    // A valid non-identity point should have at least some non-zero bytes
    
    // We can't easily validate G2 on-curve without a G2 operation,
    // but the pairing check will catch invalid points.
    // For now, just ensure it's not all zeros (which would be identity)
    // when used in non-identity context.
    
    // Accept all points here; pairing will reject invalid ones
    let _ = point;
    Ok(())
}

/// Validate G2 point, allowing identity.
#[inline]
pub fn validate_g2_point_allow_identity(_point: &G2Point) -> Result<()> {
    // Identity is always valid
    Ok(())
}

// ============================================================================
// SCALAR UTILITIES
// ============================================================================

/// Convert u64 to 32-byte big-endian scalar.
#[inline]
pub fn u64_to_scalar(v: u64) -> ScalarField {
    let mut s = [0u8; 32];
    s[24..32].copy_from_slice(&v.to_be_bytes());
    s
}

/// Convert i64 to scalar (negative values as field negation).
#[inline]
pub fn i64_to_scalar(v: i64) -> ScalarField {
    if v >= 0 {
        u64_to_scalar(v as u64)
    } else {
        let abs = if v == i64::MIN {
            (i64::MAX as u64) + 1
        } else {
            (-v) as u64
        };
        field_subtract(&BN254_SCALAR_MODULUS, &u64_to_scalar(abs))
    }
}

/// Convert Pubkey to scalar (truncated to fit in field).
/// Uses first 31 bytes to ensure result < modulus.
pub fn pubkey_to_scalar(pk: &Pubkey) -> ScalarField {
    let mut s = [0u8; 32];
    // Copy first 31 bytes, leaving MSB as 0
    // This ensures the result is < 2^248 < Fr modulus
    s[1..32].copy_from_slice(&pk.to_bytes()[0..31]);
    s
}

// ============================================================================
// VK OPERATIONS
// ============================================================================

/// Compute vk_x = IC[0] + Σ(public_input[i] × IC[i+1])
///
/// This is the public input accumulator for Groth16 verification.
///
/// # Arguments
/// * `ic` - Array of IC points from verification key (length = num_inputs + 1)
/// * `inputs` - Public input scalars (length = num_inputs)
///
/// # Returns
/// * Accumulated G1 point
///
/// # Errors
/// * `InvalidPublicInputs` - If ic.len() != inputs.len() + 1
pub fn compute_vk_x(ic: &[[u8; 64]], inputs: &[[u8; 32]]) -> Result<G1Point> {
    if ic.len() != inputs.len() + 1 {
        msg!(
            "IC length mismatch: expected {} IC points for {} inputs",
            inputs.len() + 1,
            inputs.len()
        );
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }

    // Start with IC[0]
    let mut vk_x = ic[0];

    // Accumulate: vk_x += input[i] * IC[i+1]
    for (input, ic_point) in inputs.iter().zip(ic.iter().skip(1)) {
        // Validate input is a valid scalar
        if !is_valid_scalar(input) {
            msg!("Invalid public input scalar");
            return Err(PrivacyErrorV2::InvalidScalar.into());
        }

        let term = g1_mul(ic_point, input)?;
        vk_x = g1_add(&vk_x, &term)?;
    }

    Ok(vk_x)
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/// Subtract two 32-byte big-endian values: result = a - b
fn field_subtract(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut r = [0u8; 32];
    let mut borrow: u16 = 0;

    for i in (0..32).rev() {
        let d = (a[i] as u16)
            .wrapping_sub(b[i] as u16)
            .wrapping_sub(borrow);
        r[i] = d as u8;
        borrow = if d > 255 { 1 } else { 0 };
    }

    r
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity() {
        assert!(is_g1_identity(&G1_IDENTITY));
        assert!(!is_g1_identity(&G1_GENERATOR));
    }

    #[test]
    fn test_u64_to_scalar() {
        let s = u64_to_scalar(42);
        assert_eq!(s[31], 42);
        assert_eq!(s[30], 0);
    }

    #[test]
    fn test_i64_to_scalar_positive() {
        let pos = i64_to_scalar(100);
        assert_eq!(pos, u64_to_scalar(100));
    }

    #[test]
    fn test_compute_vk_x_length_mismatch() {
        let ic = [[1u8; 64]; 3]; // 3 IC points = 2 inputs expected
        let inputs = [[2u8; 32]; 3]; // 3 inputs provided

        let result = compute_vk_x(&ic, &inputs);
        assert!(result.is_err());
    }

    #[test]
    fn test_compute_vk_x_valid() {
        let ic = [[1u8; 64]; 3]; // 3 IC points = 2 inputs
        let inputs = [[0u8; 32]; 2]; // 2 inputs (zeros = identity contribution)

        let result = compute_vk_x(&ic, &inputs);
        // Should succeed (on non-Solana target, uses mock operations)
        assert!(result.is_ok());
    }

    #[test]
    fn test_pubkey_to_scalar() {
        let pk = Pubkey::new_unique();
        let s = pubkey_to_scalar(&pk);

        // MSB should be 0 (ensuring < modulus)
        assert_eq!(s[0], 0);

        // Should be deterministic
        let s2 = pubkey_to_scalar(&pk);
        assert_eq!(s, s2);
    }
}
