//! Solana alt_bn128 Syscall Wrappers for Groth16 Verification
//!
//! This module provides low-level wrappers around Solana's alt_bn128 precompile syscalls.
//! These syscalls enable efficient BN254 curve operations required for Groth16 verification
//! within Solana's compute budget.
//!
//! # Syscall Operations
//! - `ALT_BN128_ADD` (op=0): G1 point addition
//! - `ALT_BN128_MUL` (op=1): G1 scalar multiplication
//! - `ALT_BN128_PAIRING` (op=2): Optimal Ate pairing check
//!
//! # Compute Costs (approximate)
//! - G1 add: ~450 CU
//! - G1 mul: ~12,000 CU
//! - Pairing (per pair): ~36,000 CU
//! - 4-pair Groth16 verify: ~150,000 CU total
//!
//! # Field vs Scalar Modulus
//! - Fp (base field): 21888242871839275222246405745257275088696311157297823662689037894645226208583
//! - Fr (scalar field): 21888242871839275222246405745257275088548364400416034343698204186575808495617
//! - G1 coordinates are in Fp
//! - Scalars for multiplication are in Fr

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/// G1 point: 64 bytes (x: 32 bytes, y: 32 bytes), big-endian Fp coordinates
pub type G1Point = [u8; 64];

/// G2 point: 128 bytes (x: 2x32 bytes, y: 2x32 bytes), big-endian Fp2 coordinates
pub type G2Point = [u8; 128];

/// Scalar field element: 32 bytes, big-endian Fr
pub type Scalar = [u8; 32];

/// Alias for Scalar to maintain API consistency
pub type ScalarField = Scalar;

/// Pairing element: G1 point concatenated with G2 point (192 bytes)
pub type PairingElement = [u8; 192];

// ============================================================================
// CONSTANTS
// ============================================================================

/// G1 identity point (point at infinity)
pub const G1_IDENTITY: G1Point = [0u8; 64];

/// G2 identity point (point at infinity)
pub const G2_IDENTITY: G2Point = [0u8; 128];

/// BN254 base field modulus (Fp) - big-endian
/// p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
pub const BN254_FP_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
    0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// BN254 scalar field modulus (Fr) - big-endian
/// r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_FR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// Expected pairing result for successful verification (1 in GT)
#[cfg(target_os = "solana")]
const PAIRING_SUCCESS: [u8; 32] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
];

// Syscall operation codes
#[cfg(target_os = "solana")]
const ALT_BN128_ADD: u64 = 0;
#[cfg(target_os = "solana")]
const ALT_BN128_MUL: u64 = 1;
#[cfg(target_os = "solana")]
const ALT_BN128_PAIRING: u64 = 2;

// ============================================================================
// SYSCALL BINDINGS
// ============================================================================

#[cfg(target_os = "solana")]
extern "C" {
    /// Solana syscall for alt_bn128 group operations
    fn sol_alt_bn128_group_op(
        op: u64,
        input: *const u8,
        input_size: u64,
        result: *mut u8,
    ) -> u64;
}

// ============================================================================
// LOW-LEVEL SYSCALL WRAPPERS
// ============================================================================

/// Perform G1 point addition: result = a + b
///
/// Input: 128 bytes (two G1 points concatenated)
/// Output: 64 bytes (resulting G1 point)
///
/// # On-chain behavior
/// Uses the sol_alt_bn128_group_op syscall with op=0.
///
/// # Off-chain behavior
/// Returns identity point for testing. Real verification requires on-chain execution.
#[cfg(target_os = "solana")]
fn syscall_g1_add(input: &[u8; 128]) -> std::result::Result<G1Point, ()> {
    let mut result = G1_IDENTITY;
    let ret = unsafe {
        sol_alt_bn128_group_op(
            ALT_BN128_ADD,
            input.as_ptr(),
            128,
            result.as_mut_ptr(),
        )
    };
    if ret == 0 {
        Ok(result)
    } else {
        Err(())
    }
}

#[cfg(not(target_os = "solana"))]
fn syscall_g1_add(input: &[u8; 128]) -> std::result::Result<G1Point, ()> {
    // Off-chain: return first point for basic testing
    // Real verification must be done on-chain
    let mut result = G1_IDENTITY;
    result.copy_from_slice(&input[0..64]);
    Ok(result)
}

/// Perform G1 scalar multiplication: result = scalar * point
///
/// Input: 96 bytes (G1 point + 32-byte scalar)
/// Output: 64 bytes (resulting G1 point)
#[cfg(target_os = "solana")]
fn syscall_g1_mul(input: &[u8; 96]) -> std::result::Result<G1Point, ()> {
    let mut result = G1_IDENTITY;
    let ret = unsafe {
        sol_alt_bn128_group_op(
            ALT_BN128_MUL,
            input.as_ptr(),
            96,
            result.as_mut_ptr(),
        )
    };
    if ret == 0 {
        Ok(result)
    } else {
        Err(())
    }
}

#[cfg(not(target_os = "solana"))]
fn syscall_g1_mul(_input: &[u8; 96]) -> std::result::Result<G1Point, ()> {
    // Off-chain: return identity for testing
    Ok(G1_IDENTITY)
}

/// Perform pairing check: e(a1,b1) * e(a2,b2) * ... == 1
///
/// Input: N * 192 bytes (N pairing elements)
/// Output: 32 bytes (1 if pairing product == identity, 0 otherwise)
#[cfg(target_os = "solana")]
fn syscall_pairing(input: &[u8]) -> std::result::Result<bool, ()> {
    if input.is_empty() || input.len() % 192 != 0 {
        return Err(());
    }

    let mut result = [0u8; 32];
    let ret = unsafe {
        sol_alt_bn128_group_op(
            ALT_BN128_PAIRING,
            input.as_ptr(),
            input.len() as u64,
            result.as_mut_ptr(),
        )
    };

    if ret == 0 {
        Ok(result == PAIRING_SUCCESS)
    } else {
        Err(())
    }
}

#[cfg(not(target_os = "solana"))]
fn syscall_pairing(input: &[u8]) -> std::result::Result<bool, ()> {
    if input.is_empty() || input.len() % 192 != 0 {
        return Err(());
    }
    // Off-chain: return true for testing
    // Real pairing verification requires on-chain execution
    Ok(true)
}

// ============================================================================
// PUBLIC API
// ============================================================================

/// Check if a G1 point is the identity (point at infinity)
#[inline]
pub fn is_g1_identity(point: &G1Point) -> bool {
    point.iter().all(|&b| b == 0)
}

/// Check if a G2 point is the identity (point at infinity)
#[inline]
pub fn is_g2_identity(point: &G2Point) -> bool {
    point.iter().all(|&b| b == 0)
}

/// G1 point addition: result = a + b
///
/// Handles identity cases:
/// - 0 + b = b
/// - a + 0 = a
pub fn g1_add(a: &G1Point, b: &G1Point) -> Result<G1Point> {
    // Handle identity cases without syscall
    if is_g1_identity(a) {
        return Ok(*b);
    }
    if is_g1_identity(b) {
        return Ok(*a);
    }

    // Prepare input buffer (stack allocated)
    let mut input = [0u8; 128];
    input[0..64].copy_from_slice(a);
    input[64..128].copy_from_slice(b);

    syscall_g1_add(&input).map_err(|_| {
        msg!("G1 addition failed");
        PrivacyErrorV2::CryptographyError.into()
    })
}

/// G1 scalar multiplication: result = scalar * point
///
/// Handles special cases:
/// - scalar * 0 = 0
/// - 0 * point = 0
pub fn g1_mul(point: &G1Point, scalar: &Scalar) -> Result<G1Point> {
    // Identity cases
    if is_g1_identity(point) {
        return Ok(G1_IDENTITY);
    }
    if scalar.iter().all(|&b| b == 0) {
        return Ok(G1_IDENTITY);
    }

    // Prepare input buffer (stack allocated)
    let mut input = [0u8; 96];
    input[0..64].copy_from_slice(point);
    input[64..96].copy_from_slice(scalar);

    syscall_g1_mul(&input).map_err(|_| {
        msg!("G1 scalar multiplication failed");
        PrivacyErrorV2::CryptographyError.into()
    })
}

/// Negate a G1 point: result = -point
///
/// Negation is computed as (x, p - y) where p is the base field modulus.
///
/// # Important
/// Uses Fp modulus (not Fr) because G1 coordinates are in the base field.
pub fn g1_negate(point: &G1Point) -> Result<G1Point> {
    if is_g1_identity(point) {
        return Ok(G1_IDENTITY);
    }

    let mut result = *point;

    // Extract y coordinate (bytes 32..64)
    let y = &point[32..64];

    // Compute p - y where p is the base field modulus
    let neg_y = fp_subtract(&BN254_FP_MODULUS, y);
    result[32..64].copy_from_slice(&neg_y);

    Ok(result)
}

/// Verify a multi-pairing equation.
///
/// Checks: e(a1, b1) * e(a2, b2) * ... * e(an, bn) == 1
///
/// # Arguments
/// * `elements` - Array of pairing elements, each 192 bytes (G1 point || G2 point)
///
/// # Returns
/// * `Ok(true)` - Pairing equation holds
/// * `Ok(false)` - Pairing equation does not hold
/// * `Err` - Syscall error
///
/// # Compute Cost
/// Approximately 36,000 CU per pairing element.
/// For Groth16 (4 pairings): ~150,000 CU
pub fn verify_pairing(elements: &[PairingElement]) -> Result<bool> {
    if elements.is_empty() {
        return Ok(true);
    }

    // Build contiguous input buffer
    // Note: This uses heap allocation because the syscall requires contiguous memory
    // and we support variable numbers of pairings. For fixed 4-pairing Groth16,
    // we could use a stack buffer.
    let input_size = elements.len() * 192;
    let mut input = vec![0u8; input_size];
    for (i, elem) in elements.iter().enumerate() {
        input[i * 192..(i + 1) * 192].copy_from_slice(elem);
    }

    syscall_pairing(&input).map_err(|_| {
        msg!("Pairing verification failed");
        PrivacyErrorV2::CryptographyError.into()
    })
}

/// Verify a 4-element pairing (Groth16 standard).
///
/// Stack-allocated version for the common Groth16 case.
/// Checks: e(a1, b1) * e(a2, b2) * e(a3, b3) * e(a4, b4) == 1
pub fn verify_pairing_4(elements: &[PairingElement; 4]) -> Result<bool> {
    let mut input = [0u8; 768]; // 4 * 192
    for (i, elem) in elements.iter().enumerate() {
        input[i * 192..(i + 1) * 192].copy_from_slice(elem);
    }

    #[cfg(target_os = "solana")]
    {
        let mut result = [0u8; 32];
        let ret = unsafe {
            sol_alt_bn128_group_op(
                ALT_BN128_PAIRING,
                input.as_ptr(),
                768,
                result.as_mut_ptr(),
            )
        };

        if ret == 0 {
            Ok(result == PAIRING_SUCCESS)
        } else {
            msg!("Pairing verification syscall failed");
            Err(PrivacyErrorV2::CryptographyError.into())
        }
    }

    #[cfg(not(target_os = "solana"))]
    {
        // Off-chain: return true for testing
        let _ = input;
        Ok(true)
    }
}

/// Create a pairing element from G1 and G2 points.
#[inline]
pub fn make_pairing_element(g1: &G1Point, g2: &G2Point) -> PairingElement {
    let mut element = [0u8; 192];
    element[0..64].copy_from_slice(g1);
    element[64..192].copy_from_slice(g2);
    element
}

/// Check if a scalar is valid (< Fr modulus).
#[inline]
pub fn is_valid_scalar(scalar: &Scalar) -> bool {
    for i in 0..32 {
        if scalar[i] < BN254_FR_MODULUS[i] {
            return true;
        }
        if scalar[i] > BN254_FR_MODULUS[i] {
            return false;
        }
    }
    false
}

/// Validate that a G1 point is on the curve.
///
/// Uses G1 addition with identity to validate - the syscall will fail
/// if the point is not on the curve.
pub fn validate_g1_point(point: &G1Point) -> Result<()> {
    if is_g1_identity(point) {
        return Ok(());
    }

    // Try to add with identity - will fail if point is invalid
    let mut input = [0u8; 128];
    input[0..64].copy_from_slice(point);
    // Second half is zeros (identity)

    syscall_g1_add(&input).map_err(|_| {
        msg!("Invalid G1 point");
        error!(PrivacyErrorV2::CryptographyError)
    })?;

    Ok(())
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/// Subtract two 32-byte big-endian values: result = a - b
/// Assumes a >= b (for field subtraction where a is the modulus)
fn fp_subtract(a: &[u8; 32], b: &[u8]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut borrow: u16 = 0;

    for i in (0..32).rev() {
        let b_val = if i < b.len() { b[31 - (31 - i)] } else { 0 };
        let diff = (a[i] as u16)
            .wrapping_sub(b_val as u16)
            .wrapping_sub(borrow);
        result[i] = diff as u8;
        borrow = if diff > 255 { 1 } else { 0 };
    }

    result
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_g1_identity() {
        assert!(is_g1_identity(&G1_IDENTITY));
        assert!(!is_g1_identity(&[1u8; 64]));
    }

    #[test]
    fn test_g2_identity() {
        assert!(is_g2_identity(&G2_IDENTITY));
        assert!(!is_g2_identity(&[1u8; 128]));
    }

    #[test]
    fn test_g1_add_identity() {
        let point = [1u8; 64];
        // 0 + point = point
        let result = g1_add(&G1_IDENTITY, &point).unwrap();
        assert_eq!(result, point);

        // point + 0 = point
        let result = g1_add(&point, &G1_IDENTITY).unwrap();
        assert_eq!(result, point);
    }

    #[test]
    fn test_g1_mul_zero_scalar() {
        let point = [1u8; 64];
        let zero_scalar = [0u8; 32];

        let result = g1_mul(&point, &zero_scalar).unwrap();
        assert!(is_g1_identity(&result));
    }

    #[test]
    fn test_g1_mul_identity() {
        let scalar = [1u8; 32];

        let result = g1_mul(&G1_IDENTITY, &scalar).unwrap();
        assert!(is_g1_identity(&result));
    }

    #[test]
    fn test_make_pairing_element() {
        let g1 = [1u8; 64];
        let g2 = [2u8; 128];

        let elem = make_pairing_element(&g1, &g2);

        assert_eq!(&elem[0..64], &g1);
        assert_eq!(&elem[64..192], &g2);
    }

    #[test]
    fn test_scalar_validation() {
        // Zero is valid
        assert!(is_valid_scalar(&[0u8; 32]));

        // Max value is invalid
        assert!(!is_valid_scalar(&[0xFF; 32]));

        // Just below modulus is valid
        let mut below = BN254_FR_MODULUS;
        below[31] = below[31].wrapping_sub(1);
        assert!(is_valid_scalar(&below));

        // Modulus itself is invalid
        assert!(!is_valid_scalar(&BN254_FR_MODULUS));
    }

    #[test]
    fn test_g1_negate_identity() {
        let result = g1_negate(&G1_IDENTITY).unwrap();
        assert!(is_g1_identity(&result));
    }
}
