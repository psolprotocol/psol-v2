//! Poseidon Hash for pSOL v2 - Production Implementation
//!
//! Uses light-poseidon for circom-compatible Poseidon hash on BN254 scalar field.
//! This implementation is compatible with circomlib's Poseidon hash used in ZK circuits.
//!
//! # Field Element Encoding
//! - All inputs are BN254 Fr (scalar field) elements
//! - Encoding: 32 bytes, big-endian
//! - Values MUST be less than BN254_SCALAR_MODULUS (canonical)
//! - Invalid inputs are REJECTED, never reduced or mapped to zero
//!
//! # Circuit Compatibility
//! - Compatible with: circomlib/circuits/poseidon.circom
//! - Hash function: Poseidon with t=2,3,4,5 (width = inputs + 1)
//! - Parameters: BN254-specific round constants from circomlib

use anchor_lang::prelude::*;
use ark_bn254::Fr;
use light_poseidon::{Poseidon, PoseidonBytesHasher};

use crate::error::PrivacyErrorV2;

/// 32-byte scalar field element (BN254 Fr), big-endian encoding
pub type ScalarField = [u8; 32];

/// BN254 scalar field modulus (Fr) - big-endian
/// r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// This is NOT a placeholder - production Poseidon implementation
pub const IS_PLACEHOLDER: bool = false;

// ============================================================================
// SCALAR VALIDATION - FAIL-FAST, NO SILENT REDUCTION
// ============================================================================

/// Check if a 32-byte value is a valid canonical BN254 scalar.
/// Returns true if value < BN254_SCALAR_MODULUS (big-endian comparison).
///
/// SECURITY: This function MUST be called on all hash inputs.
/// Invalid scalars are rejected - never silently reduced.
#[inline]
pub fn is_valid_scalar(scalar: &ScalarField) -> bool {
    // Big-endian comparison: check byte by byte from MSB
    for i in 0..32 {
        if scalar[i] < BN254_SCALAR_MODULUS[i] {
            return true; // Definitely less than modulus
        }
        if scalar[i] > BN254_SCALAR_MODULUS[i] {
            return false; // Definitely greater than modulus
        }
        // Equal, continue to next byte
    }
    // All bytes equal means scalar == modulus, which is invalid (must be < modulus)
    false
}

/// Validate a scalar and return error if invalid.
/// Use this before any hash operation.
#[inline]
fn require_valid_scalar(scalar: &ScalarField) -> Result<()> {
    if !is_valid_scalar(scalar) {
        msg!("Invalid scalar: value >= BN254 modulus");
        return Err(PrivacyErrorV2::InvalidScalar.into());
    }
    Ok(())
}

// ============================================================================
// POSEIDON HASH FUNCTIONS
// ============================================================================

/// Hash two field elements using Poseidon (t=3, width=3).
/// Used for Merkle tree internal nodes: H(left, right).
///
/// # Arguments
/// * `left` - Left child commitment (32 bytes, big-endian, canonical)
/// * `right` - Right child commitment (32 bytes, big-endian, canonical)
///
/// # Returns
/// * Hash output as 32-byte big-endian scalar
///
/// # Errors
/// * `InvalidScalar` - If any input is >= BN254 modulus
///
/// # Circuit Compatibility
/// Equivalent to: `component hasher = Poseidon(2); hasher.inputs[0] <== left; hasher.inputs[1] <== right;`
pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> Result<ScalarField> {
    require_valid_scalar(left)?;
    require_valid_scalar(right)?;

    let mut hasher = Poseidon::<Fr>::new_circom(2)
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    // light-poseidon expects big-endian input bytes
    let result = hasher
        .hash_bytes_be(&[left, right])
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    Ok(result)
}

/// Hash three field elements using Poseidon (t=4, width=4).
///
/// # Arguments
/// * `a`, `b`, `c` - Input scalars (32 bytes each, big-endian, canonical)
///
/// # Errors
/// * `InvalidScalar` - If any input is >= BN254 modulus
pub fn poseidon_hash_3(a: &ScalarField, b: &ScalarField, c: &ScalarField) -> Result<ScalarField> {
    require_valid_scalar(a)?;
    require_valid_scalar(b)?;
    require_valid_scalar(c)?;

    let mut hasher = Poseidon::<Fr>::new_circom(3)
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    let result = hasher
        .hash_bytes_be(&[a, b, c])
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    Ok(result)
}

/// Hash four field elements using Poseidon (t=5, width=5).
/// Used for commitment computation: H(secret, nullifier, amount, asset_id).
///
/// # Arguments
/// * `input0` - First scalar (secret)
/// * `input1` - Second scalar (nullifier)
/// * `input2` - Third scalar (amount as field element)
/// * `input3` - Fourth scalar (asset_id)
///
/// # Errors
/// * `InvalidScalar` - If any input is >= BN254 modulus
///
/// # Circuit Compatibility
/// Equivalent to: `component hasher = Poseidon(4); hasher.inputs[0..3] <== ...;`
pub fn poseidon_hash_4(
    input0: &ScalarField,
    input1: &ScalarField,
    input2: &ScalarField,
    input3: &ScalarField,
) -> Result<ScalarField> {
    require_valid_scalar(input0)?;
    require_valid_scalar(input1)?;
    require_valid_scalar(input2)?;
    require_valid_scalar(input3)?;

    let mut hasher = Poseidon::<Fr>::new_circom(4)
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    let result = hasher
        .hash_bytes_be(&[input0, input1, input2, input3])
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    Ok(result)
}

/// Hash arbitrary number of field elements (up to 16).
/// Prefer fixed-arity functions when possible for type safety.
///
/// # Errors
/// * `InvalidScalar` - If any input is >= BN254 modulus
/// * `CryptographyError` - If input count is 0 or > 16
pub fn poseidon_hash(inputs: &[ScalarField]) -> Result<ScalarField> {
    if inputs.is_empty() || inputs.len() > 16 {
        msg!("Poseidon hash requires 1-16 inputs, got {}", inputs.len());
        return Err(PrivacyErrorV2::CryptographyError.into());
    }

    for (i, input) in inputs.iter().enumerate() {
        if !is_valid_scalar(input) {
            msg!("Invalid scalar at index {}", i);
            return Err(PrivacyErrorV2::InvalidScalar.into());
        }
    }

    let mut hasher = Poseidon::<Fr>::new_circom(inputs.len())
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    // Collect references as &[u8] slices for the hasher
    let input_refs: Vec<&[u8]> = inputs.iter().map(|s| s.as_slice()).collect();
    let result = hasher
        .hash_bytes_be(&input_refs)
        .map_err(|_| PrivacyErrorV2::CryptographyError)?;

    Ok(result)
}

// ============================================================================
// MASP-SPECIFIC FUNCTIONS
// ============================================================================

/// Compute MASP commitment.
/// commitment = Poseidon(secret, nullifier, amount, asset_id)
///
/// # Arguments
/// * `secret` - Random blinding factor (32 bytes, canonical scalar)
/// * `nullifier` - Nullifier preimage (32 bytes, canonical scalar)
/// * `amount` - Token amount (as u64, converted to scalar)
/// * `asset_id` - Asset identifier (32 bytes, canonical scalar)
///
/// # Returns
/// * Commitment hash (32 bytes, big-endian)
///
/// # Circuit Compatibility
/// Must match: `Poseidon(4)[secret, nullifier, amount, asset_id]`
pub fn compute_commitment(
    secret: &ScalarField,
    nullifier: &ScalarField,
    amount: u64,
    asset_id: &ScalarField,
) -> Result<ScalarField> {
    let amount_scalar = u64_to_scalar_be(amount);
    poseidon_hash_4(secret, nullifier, &amount_scalar, asset_id)
}

/// Compute nullifier hash for spending a note.
/// nullifier_hash = Poseidon(Poseidon(nullifier, secret), leaf_index)
///
/// # Arguments
/// * `nullifier` - Nullifier preimage
/// * `secret` - Secret blinding factor
/// * `leaf_index` - Position in Merkle tree (as u32)
///
/// # Returns
/// * Nullifier hash that uniquely identifies this spend
///
/// # Circuit Compatibility
/// Must match the withdraw/joinsplit circuit nullifier computation.
pub fn compute_nullifier_hash(
    nullifier: &ScalarField,
    secret: &ScalarField,
    leaf_index: u32,
) -> Result<ScalarField> {
    let index_scalar = u64_to_scalar_be(leaf_index as u64);
    let inner = hash_two_to_one(nullifier, secret)?;
    hash_two_to_one(&inner, &index_scalar)
}

/// Verify that a commitment matches the given preimages.
///
/// # Returns
/// * `Ok(true)` if commitment == H(secret, nullifier, amount, asset_id)
/// * `Ok(false)` if commitment doesn't match
/// * `Err` on invalid inputs
pub fn verify_commitment(
    commitment: &ScalarField,
    secret: &ScalarField,
    nullifier: &ScalarField,
    amount: u64,
    asset_id: &ScalarField,
) -> Result<bool> {
    let computed = compute_commitment(secret, nullifier, amount, asset_id)?;
    // Constant-time comparison to prevent timing attacks
    let mut diff = 0u8;
    for i in 0..32 {
        diff |= computed[i] ^ commitment[i];
    }
    Ok(diff == 0)
}

// ============================================================================
// SCALAR CONVERSION UTILITIES
// ============================================================================

/// Convert u64 to 32-byte big-endian scalar.
/// The value is placed in the last 8 bytes (big-endian position).
///
/// This is the canonical encoding for circuit compatibility.
#[inline]
pub fn u64_to_scalar_be(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[24..32].copy_from_slice(&value.to_be_bytes());
    scalar
}

/// Convert u64 to 32-byte little-endian scalar.
/// The value is placed in the first 8 bytes.
///
/// WARNING: Only use this if your circuit expects little-endian encoding.
/// Most circomlib circuits use big-endian field element encoding.
#[inline]
pub fn u64_to_scalar_le(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[..8].copy_from_slice(&value.to_le_bytes());
    scalar
}

/// Convert i64 to 32-byte big-endian scalar (field element).
/// Negative values are represented as (modulus - abs(value)).
///
/// # Panics
/// Never panics - i64::MIN is handled correctly.
#[inline]
pub fn i64_to_scalar_be(value: i64) -> ScalarField {
    if value >= 0 {
        u64_to_scalar_be(value as u64)
    } else {
        // For negative: result = modulus - |value|
        let abs_value = if value == i64::MIN {
            (i64::MAX as u64) + 1
        } else {
            (-value) as u64
        };
        let abs_scalar = u64_to_scalar_be(abs_value);
        field_subtract(&BN254_SCALAR_MODULUS, &abs_scalar)
    }
}

/// Alias for u64_to_scalar_be for backwards compatibility.
#[inline]
pub fn u64_to_bytes32(value: u64) -> ScalarField {
    u64_to_scalar_be(value)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/// Check if a hash is all zeros.
#[inline]
pub fn is_zero_hash(hash: &ScalarField) -> bool {
    hash.iter().all(|&b| b == 0)
}

/// Get the empty leaf hash (zero).
/// In our Merkle tree, empty leaves are represented as 0.
#[inline]
pub fn empty_leaf_hash() -> ScalarField {
    [0u8; 32]
}

/// Check if this is the placeholder implementation.
/// Always returns false for production code.
#[inline]
pub fn is_placeholder_implementation() -> bool {
    IS_PLACEHOLDER
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/// Subtract two 32-byte big-endian values: result = a - b
/// Assumes a >= b (no underflow check).
fn field_subtract(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut borrow: u16 = 0;

    for i in (0..32).rev() {
        let diff = (a[i] as u16)
            .wrapping_sub(b[i] as u16)
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
    fn test_not_placeholder() {
        assert!(!IS_PLACEHOLDER);
        assert!(!is_placeholder_implementation());
    }

    #[test]
    fn test_scalar_validation() {
        // Zero is valid
        assert!(is_valid_scalar(&[0u8; 32]));

        // Small values are valid
        let small = u64_to_scalar_be(12345);
        assert!(is_valid_scalar(&small));

        // Value exactly at modulus is invalid
        assert!(!is_valid_scalar(&BN254_SCALAR_MODULUS));

        // Value above modulus is invalid
        let above_modulus = [0xFFu8; 32];
        assert!(!is_valid_scalar(&above_modulus));

        // Value just below modulus is valid
        let mut just_below = BN254_SCALAR_MODULUS;
        just_below[31] = 0x00; // Subtract 1 from last byte
        assert!(is_valid_scalar(&just_below));
    }

    #[test]
    fn test_hash_two_to_one_deterministic() {
        let left = [0u8; 32];
        let right = u64_to_scalar_be(1);

        let hash1 = hash_two_to_one(&left, &right).unwrap();
        let hash2 = hash_two_to_one(&left, &right).unwrap();

        assert_eq!(hash1, hash2, "Hash must be deterministic");
        assert!(!is_zero_hash(&hash1), "Hash of non-zero input should not be zero");
    }

    #[test]
    fn test_hash_different_inputs() {
        let a = u64_to_scalar_be(1);
        let b = u64_to_scalar_be(2);

        let hash_ab = hash_two_to_one(&a, &b).unwrap();
        let hash_ba = hash_two_to_one(&b, &a).unwrap();

        assert_ne!(hash_ab, hash_ba, "Order of inputs must matter");
    }

    #[test]
    fn test_commitment_deterministic() {
        let secret = u64_to_scalar_be(0x1234);
        let nullifier = u64_to_scalar_be(0x5678);
        let asset_id = u64_to_scalar_be(0xABCD);
        let amount = 1000u64;

        let c1 = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();
        let c2 = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();

        assert_eq!(c1, c2);
    }

    #[test]
    fn test_nullifier_hash_deterministic() {
        let nullifier = u64_to_scalar_be(0x1111);
        let secret = u64_to_scalar_be(0x2222);
        let leaf_index = 42u32;

        let h1 = compute_nullifier_hash(&nullifier, &secret, leaf_index).unwrap();
        let h2 = compute_nullifier_hash(&nullifier, &secret, leaf_index).unwrap();

        assert_eq!(h1, h2);
    }

    #[test]
    fn test_verify_commitment() {
        let secret = u64_to_scalar_be(0xAAAA);
        let nullifier = u64_to_scalar_be(0xBBBB);
        let asset_id = u64_to_scalar_be(0xCCCC);
        let amount = 5000u64;

        let commitment = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();

        // Should verify correctly
        assert!(verify_commitment(&commitment, &secret, &nullifier, amount, &asset_id).unwrap());

        // Wrong amount should fail
        assert!(!verify_commitment(&commitment, &secret, &nullifier, amount + 1, &asset_id).unwrap());
    }

    #[test]
    fn test_rejects_invalid_scalar() {
        let valid = [0u8; 32];
        let invalid = [0xFFu8; 32]; // > modulus

        // hash_two_to_one should reject invalid input
        assert!(hash_two_to_one(&valid, &invalid).is_err());
        assert!(hash_two_to_one(&invalid, &valid).is_err());
    }

    // ========================================================================
    // GOLDEN TEST VECTORS
    // ========================================================================
    // These vectors MUST match the off-chain circomlibjs implementation.
    // Generated with: hashTwo(0n, 1n) and hashFour(1n, 2n, 3n, 4n)
    //
    // If these tests fail after a dependency update, it indicates a breaking
    // change in the Poseidon parameters. DO NOT update the vectors without
    // verifying circuit compatibility.
    // ========================================================================

    #[test]
    fn test_poseidon_golden_vector_hash2() {
        // Vector: Poseidon(0, 1) computed with light-poseidon 0.2 (circom compatible)
        // This is the reference value from light-poseidon which implements circomlib Poseidon
        let left = [0u8; 32];
        let right = u64_to_scalar_be(1);

        let result = hash_two_to_one(&left, &right).unwrap();

        // Expected result from light-poseidon (same as circomlibjs for same parameters)
        // 0x1bd20834f5de9830c643778a2e88a3a1363c8b9ac083d36d75bf87c49953e65e
        let expected: [u8; 32] = [
            0x1b, 0xd2, 0x08, 0x34, 0xf5, 0xde, 0x98, 0x30,
            0xc6, 0x43, 0x77, 0x8a, 0x2e, 0x88, 0xa3, 0xa1,
            0x36, 0x3c, 0x8b, 0x9a, 0xc0, 0x83, 0xd3, 0x6d,
            0x75, 0xbf, 0x87, 0xc4, 0x99, 0x53, 0xe6, 0x5e,
        ];

        assert_eq!(
            result, expected,
            "Poseidon(0,1) mismatch!\nGot:      {}\nExpected: {}",
            hex::encode(result),
            hex::encode(expected)
        );
    }

    #[test]
    fn test_poseidon_golden_vector_hash4() {
        // Vector: Poseidon(1, 2, 3, 4) computed with light-poseidon 0.2
        // This is the reference value from light-poseidon which implements circomlib Poseidon
        let a = u64_to_scalar_be(1);
        let b = u64_to_scalar_be(2);
        let c = u64_to_scalar_be(3);
        let d = u64_to_scalar_be(4);

        let result = poseidon_hash_4(&a, &b, &c, &d).unwrap();

        // Expected result from light-poseidon
        // 0x299c867db6c1fdd79dcefa40e4510b9837e60ebb1ce0663dbaa525df65250465
        let expected: [u8; 32] = [
            0x29, 0x9c, 0x86, 0x7d, 0xb6, 0xc1, 0xfd, 0xd7,
            0x9d, 0xce, 0xfa, 0x40, 0xe4, 0x51, 0x0b, 0x98,
            0x37, 0xe6, 0x0e, 0xbb, 0x1c, 0xe0, 0x66, 0x3d,
            0xba, 0xa5, 0x25, 0xdf, 0x65, 0x25, 0x04, 0x65,
        ];

        assert_eq!(
            result, expected,
            "Poseidon(1,2,3,4) mismatch!\nGot:      {}\nExpected: {}",
            hex::encode(result),
            hex::encode(expected)
        );
    }

    #[test]
    fn test_u64_to_scalar_be() {
        let scalar = u64_to_scalar_be(0x0102030405060708);
        assert_eq!(&scalar[24..32], &[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        assert_eq!(&scalar[0..24], &[0u8; 24]);
    }

    #[test]
    fn test_i64_to_scalar_be_positive() {
        let pos = i64_to_scalar_be(42);
        let expected = u64_to_scalar_be(42);
        assert_eq!(pos, expected);
    }

    #[test]
    fn test_i64_to_scalar_be_negative() {
        // -1 in field = modulus - 1
        let neg_one = i64_to_scalar_be(-1);
        let mut expected = BN254_SCALAR_MODULUS;
        // Subtract 1
        expected[31] = expected[31].wrapping_sub(1);
        assert_eq!(neg_one, expected);
    }
}
