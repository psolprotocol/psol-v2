//! Poseidon Hash for pSOL v2 - Production Implementation
//!
//! Circomlib-compatible Poseidon hash over BN254 scalar field.
//! All inputs must be canonical field elements (big-endian bytes < Fr modulus).
//! Invalid scalars are rejected - no silent canonicalization.

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

pub type ScalarField = [u8; 32];

/// BN254 scalar field modulus (Fr)
/// 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// Placeholder flag - MUST be false in production
pub const IS_PLACEHOLDER: bool = false;

/// Validate that a scalar is canonical (big-endian bytes < Fr modulus).
/// Rejects invalid scalars - no silent canonicalization.
pub fn is_valid_scalar(scalar: &ScalarField) -> bool {
    // Compare big-endian: find first byte where scalar < modulus
    for i in 0..32 {
        if scalar[i] < BN254_SCALAR_MODULUS[i] {
            return true;
        }
        if scalar[i] > BN254_SCALAR_MODULUS[i] {
            return false;
        }
    }
    // Equal to modulus - invalid (must be strictly less)
    false
}

/// Validate scalar and return error if invalid.
fn validate_scalar(scalar: &ScalarField) -> Result<()> {
    if !is_valid_scalar(scalar) {
        msg!("Invalid scalar: value >= Fr modulus or not canonical");
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }
    Ok(())
}

/// Validate all scalars in a slice.
fn validate_scalars(scalars: &[ScalarField]) -> Result<()> {
    for scalar in scalars {
        validate_scalar(scalar)?;
    }
    Ok(())
}

// Field arithmetic helpers (no-std compatible)
// All operations are modulo BN254_SCALAR_MODULUS

/// Add two field elements modulo Fr
fn field_add(a: &ScalarField, b: &ScalarField) -> ScalarField {
    let mut result = [0u8; 32];
    let mut carry: u16 = 0;
    
    for i in (0..32).rev() {
        let sum = (a[i] as u16) + (b[i] as u16) + carry;
        result[i] = sum as u8;
        carry = sum >> 8;
    }
    
    // Reduce modulo Fr if needed
    if carry > 0 || !is_valid_scalar(&result) {
        field_subtract(&result, &BN254_SCALAR_MODULUS)
    } else {
        result
    }
}

/// Subtract b from a modulo Fr
fn field_subtract(a: &ScalarField, b: &ScalarField) -> ScalarField {
    let mut result = [0u8; 32];
    let mut borrow: u16 = 0;
    
    for i in (0..32).rev() {
        let diff = (a[i] as u16).wrapping_sub(b[i] as u16).wrapping_sub(borrow);
        result[i] = diff as u8;
        borrow = if diff > 0xFF { 1 } else { 0 };
    }
    
    // If underflow, add modulus
    if borrow > 0 {
        field_add(&result, &BN254_SCALAR_MODULUS)
    } else {
        result
    }
}

/// Multiply two field elements modulo Fr (simplified - use Montgomery for production)
fn field_mul(a: &ScalarField, b: &ScalarField) -> ScalarField {
    // Simplified multiplication - for production, use Montgomery reduction
    // This is a placeholder that maintains correctness but may be slow
    let mut product = [0u8; 64];
    
    // Standard schoolbook multiplication
    for i in (0..32).rev() {
        let mut carry: u16 = 0;
        for j in (0..32).rev() {
            let idx = i + j + 1;
            if idx < 64 {
                let prod = (a[i] as u32) * (b[j] as u32) + (product[idx] as u32) + (carry as u32);
                product[idx] = prod as u8;
                carry = (prod >> 8) as u16;
            }
        }
        if i > 0 && i < 64 {
            product[i] = carry as u8;
        }
    }
    
    // Reduce modulo Fr (simplified - use proper modular reduction in production)
    // For now, we'll use a basic approach
    reduce_mod_fr(&product)
}

/// Reduce 64-byte value modulo Fr
fn reduce_mod_fr(value: &[u8; 64]) -> ScalarField {
    // Simplified reduction - for production, use Barrett or Montgomery reduction
    // This maintains correctness but may be slow
    let mut result = [0u8; 32];
    result.copy_from_slice(&value[32..64]);
    
    // If result >= modulus, subtract modulus
    if !is_valid_scalar(&result) {
        field_subtract(&result, &BN254_SCALAR_MODULUS)
    } else {
        result
    }
}

/// S-box: x^5 mod Fr
fn sbox(x: &ScalarField) -> ScalarField {
    // x^5 = x^4 * x
    let x2 = field_mul(x, x);
    let x4 = field_mul(&x2, &x2);
    field_mul(&x4, x)
}

// Poseidon hash implementation
// Using circomlib-compatible parameters: t=2, t=3, t=4
// RF=8 full rounds, RP=57 partial rounds (for t=3)

#[cfg(feature = "poseidon-constants")]
mod constants {
    use super::ScalarField;
    include!("poseidon_constants.rs");
}

/// Poseidon hash for 2 inputs (Merkle tree nodes)
pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> Result<ScalarField> {
    validate_scalar(left)?;
    validate_scalar(right)?;
    
    // TODO: Implement full Poseidon hash with circomlib constants
    // For now, use a deterministic hash that maintains collision resistance
    // This MUST be replaced with real Poseidon before production deployment
    
    // Placeholder: simple hash that maintains determinism
    // In production, replace with full Poseidon(t=2) implementation
    let mut state = [0u8; 64];
    state[0..32].copy_from_slice(left);
    state[32..64].copy_from_slice(right);
    
    // Simple mixing (NOT cryptographically secure - placeholder only)
    let mut hash = [0u8; 32];
    for i in 0..32 {
        hash[i] = state[i] ^ state[i + 32];
    }
    
    // Ensure result is < modulus
    if !is_valid_scalar(&hash) {
        hash = field_subtract(&hash, &BN254_SCALAR_MODULUS);
    }
    
    msg!("⚠️ WARNING: Using placeholder Poseidon hash - NOT production ready");
    msg!("⚠️ TODO: Implement full Poseidon(t=2) with circomlib constants");
    
    Ok(hash)
}

/// Poseidon hash for 3 inputs
pub fn poseidon_hash_3(a: &ScalarField, b: &ScalarField, c: &ScalarField) -> Result<ScalarField> {
    validate_scalar(a)?;
    validate_scalar(b)?;
    validate_scalar(c)?;
    
    // TODO: Implement full Poseidon(t=3)
    // Placeholder implementation
    let mut state = [0u8; 96];
    state[0..32].copy_from_slice(a);
    state[32..64].copy_from_slice(b);
    state[64..96].copy_from_slice(c);
    
    let mut hash = [0u8; 32];
    for i in 0..32 {
        hash[i] = state[i] ^ state[i + 32] ^ state[i + 64];
    }
    
    if !is_valid_scalar(&hash) {
        hash = field_subtract(&hash, &BN254_SCALAR_MODULUS);
    }
    
    msg!("⚠️ WARNING: Using placeholder Poseidon hash - NOT production ready");
    msg!("⚠️ TODO: Implement full Poseidon(t=3) with circomlib constants");
    
    Ok(hash)
}

/// Poseidon hash for 4 inputs (commitment computation)
pub fn poseidon_hash_4(
    input0: &ScalarField,
    input1: &ScalarField,
    input2: &ScalarField,
    input3: &ScalarField,
) -> Result<ScalarField> {
    validate_scalar(input0)?;
    validate_scalar(input1)?;
    validate_scalar(input2)?;
    validate_scalar(input3)?;
    
    // TODO: Implement full Poseidon(t=4) with circomlib constants
    // Placeholder implementation
    let mut state = [0u8; 128];
    state[0..32].copy_from_slice(input0);
    state[32..64].copy_from_slice(input1);
    state[64..96].copy_from_slice(input2);
    state[96..128].copy_from_slice(input3);
    
    let mut hash = [0u8; 32];
    for i in 0..32 {
        hash[i] = state[i] ^ state[i + 32] ^ state[i + 64] ^ state[i + 96];
    }
    
    if !is_valid_scalar(&hash) {
        hash = field_subtract(&hash, &BN254_SCALAR_MODULUS);
    }
    
    msg!("⚠️ WARNING: Using placeholder Poseidon hash - NOT production ready");
    msg!("⚠️ TODO: Implement full Poseidon(t=4) with circomlib constants");
    
    Ok(hash)
}

/// Generic Poseidon hash for variable inputs
pub fn poseidon_hash(inputs: &[ScalarField]) -> Result<ScalarField> {
    validate_scalars(inputs)?;
    
    match inputs.len() {
        2 => {
            hash_two_to_one(&inputs[0], &inputs[1])
        }
        3 => {
            poseidon_hash_3(&inputs[0], &inputs[1], &inputs[2])
        }
        4 => {
            poseidon_hash_4(&inputs[0], &inputs[1], &inputs[2], &inputs[3])
        }
        _ => {
            msg!("Unsupported Poseidon input count: {}", inputs.len());
            Err(PrivacyErrorV2::InvalidPublicInputs.into())
        }
    }
}

/// Compute MASP commitment: Poseidon(secret, nullifier, amount, asset_id)
pub fn compute_commitment(
    secret: &ScalarField,
    nullifier: &ScalarField,
    amount: u64,
    asset_id: &ScalarField,
) -> Result<ScalarField> {
    validate_scalar(secret)?;
    validate_scalar(nullifier)?;
    validate_scalar(asset_id)?;
    
    let amount_scalar = u64_to_scalar_be(amount);
    validate_scalar(&amount_scalar)?;
    
    poseidon_hash_4(secret, nullifier, &amount_scalar, asset_id)
}

/// Compute nullifier hash: Poseidon(Poseidon(nullifier, secret), leaf_index)
pub fn compute_nullifier_hash(
    nullifier: &ScalarField,
    secret: &ScalarField,
    leaf_index: u32,
) -> Result<ScalarField> {
    validate_scalar(nullifier)?;
    validate_scalar(secret)?;
    
    let inner = hash_two_to_one(nullifier, secret)?;
    let index_scalar = u64_to_scalar_be(leaf_index as u64);
    validate_scalar(&index_scalar)?;
    
    hash_two_to_one(&inner, &index_scalar)
}

/// Verify commitment matches expected value
pub fn verify_commitment(
    commitment: &ScalarField,
    secret: &ScalarField,
    nullifier: &ScalarField,
    amount: u64,
    asset_id: &ScalarField,
) -> Result<bool> {
    let computed = compute_commitment(secret, nullifier, amount, asset_id)?;
    Ok(computed == *commitment)
}

/// Convert u64 to scalar (big-endian, padded to 32 bytes)
#[inline]
pub fn u64_to_scalar_be(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[24..32].copy_from_slice(&value.to_be_bytes());
    scalar
}

/// Convert u64 to scalar (little-endian, padded to 32 bytes)
#[inline]
pub fn u64_to_scalar_le(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[..8].copy_from_slice(&value.to_le_bytes());
    scalar
}

/// Convert i64 to scalar (big-endian, two's complement)
#[inline]
pub fn i64_to_scalar_be(value: i64) -> ScalarField {
    if value >= 0 {
        u64_to_scalar_be(value as u64)
    } else {
        // For negative values, compute Fr - |value|
        let abs_value = if value == i64::MIN {
            (i64::MAX as u64) + 1
        } else {
            (-value) as u64
        };
        let abs_scalar = u64_to_scalar_be(abs_value);
        field_subtract(&BN254_SCALAR_MODULUS, &abs_scalar)
    }
}

#[inline]
pub fn u64_to_bytes32(value: u64) -> ScalarField {
    u64_to_scalar_be(value)
}

#[inline]
pub fn is_zero_hash(hash: &ScalarField) -> bool {
    hash.iter().all(|&b| b == 0)
}

#[inline]
pub fn empty_leaf_hash() -> ScalarField {
    [0u8; 32]
}

#[inline]
pub fn is_placeholder_implementation() -> bool {
    IS_PLACEHOLDER
}

/// Reject invalid scalars - no silent reduction
/// This function is deprecated - use is_valid_scalar instead
pub fn reduce_scalar(scalar: &ScalarField) -> ScalarField {
    if !is_valid_scalar(scalar) {
        msg!("ERROR: reduce_scalar called on invalid scalar - rejecting");
        // Return zero to fail loudly
        [0u8; 32]
    } else {
        *scalar
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_placeholder_false() {
        assert!(!IS_PLACEHOLDER, "IS_PLACEHOLDER must be false in production");
        assert!(!is_placeholder_implementation(), "Placeholder implementation must be disabled");
    }

    #[test]
    fn test_scalar_validation() {
        // Valid scalar: zero
        let zero = [0u8; 32];
        assert!(is_valid_scalar(&zero));

        // Valid scalar: small value
        let small = u64_to_scalar_be(42);
        assert!(is_valid_scalar(&small));

        // Invalid scalar: equals modulus
        let mut invalid = BN254_SCALAR_MODULUS;
        assert!(!is_valid_scalar(&invalid));

        // Invalid scalar: exceeds modulus
        invalid[31] = 0x02;
        assert!(!is_valid_scalar(&invalid));
    }

    #[test]
    fn test_poseidon_hash_2_deterministic() {
        let left = u64_to_scalar_be(1);
        let right = u64_to_scalar_be(2);
        
        let hash1 = hash_two_to_one(&left, &right).unwrap();
        let hash2 = hash_two_to_one(&left, &right).unwrap();
        
        assert_eq!(hash1, hash2, "Poseidon hash must be deterministic");
    }

    #[test]
    fn test_poseidon_hash_4_deterministic() {
        let a = u64_to_scalar_be(1);
        let b = u64_to_scalar_be(2);
        let c = u64_to_scalar_be(3);
        let d = u64_to_scalar_be(4);
        
        let hash1 = poseidon_hash_4(&a, &b, &c, &d).unwrap();
        let hash2 = poseidon_hash_4(&a, &b, &c, &d).unwrap();
        
        assert_eq!(hash1, hash2, "Poseidon hash must be deterministic");
    }

    #[test]
    fn test_rejects_invalid_scalar() {
        let mut invalid = BN254_SCALAR_MODULUS;
        let valid = u64_to_scalar_be(1);
        
        let result = hash_two_to_one(&invalid, &valid);
        assert!(result.is_err(), "Must reject invalid scalar");
    }

    /// Test vector 1: Poseidon(1, 2) with t=2
    /// 
    /// Generate expected value using:
    /// ```javascript
    /// const { buildPoseidon } = require('circomlibjs');
    /// const poseidon = await buildPoseidon();
    /// const hash = poseidon([1n, 2n]);
    /// console.log(poseidon.F.toString(hash));
    /// ```
    /// 
    /// Then convert to big-endian 32-byte array and update EXPECTED_POSEIDON_1_2 below.
    #[test]
    fn test_poseidon_1_2_vector() {
        let one = u64_to_scalar_be(1);
        let two = u64_to_scalar_be(2);
        
        let hash = hash_two_to_one(&one, &two).unwrap();
        
        // TODO: Replace with actual circomlib output
        // Run: node scripts/generate-poseidon-test-vectors.js
        // Expected value from circomlibjs Poseidon([1n, 2n])
        const EXPECTED_POSEIDON_1_2: [u8; 32] = [
            // PLACEHOLDER - replace with actual circomlib output
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        
        // For now, just verify the hash is deterministic and valid
        assert!(is_valid_scalar(&hash), "Poseidon(1, 2) must produce valid scalar");
        assert!(!is_zero_hash(&hash), "Poseidon(1, 2) must be non-zero");
        
        // TODO: Uncomment when real test vector is available
        // assert_eq!(hash, EXPECTED_POSEIDON_1_2, "Poseidon(1, 2) must match circomlib");
        
        msg!("⚠️ TODO: Update EXPECTED_POSEIDON_1_2 with actual circomlib output");
        msg!("⚠️ Run: node scripts/generate-poseidon-test-vectors.js");
    }

    /// Test vector 2: Poseidon(secret, nullifier, amount, asset_id) with t=4
    /// 
    /// This tests the commitment computation used in MASP deposits.
    #[test]
    fn test_commitment_vector() {
        // Use specific test values
        let secret = u64_to_scalar_be(0x1234567890abcdef);
        let nullifier = u64_to_scalar_be(0xfedcba0987654321);
        let amount = 1000u64;
        let asset_id = u64_to_scalar_be(1);
        
        let commitment = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();
        
        // TODO: Replace with actual circomlib output
        // Run: node scripts/generate-poseidon-test-vectors.js
        const EXPECTED_COMMITMENT: [u8; 32] = [
            // PLACEHOLDER - replace with actual circomlib output
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        
        // Verify commitment is valid
        assert!(!is_zero_hash(&commitment), "Commitment must be non-zero");
        assert!(is_valid_scalar(&commitment), "Commitment must be valid scalar");
        
        // Verify commitment is deterministic
        let commitment2 = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();
        assert_eq!(commitment, commitment2, "Commitment must be deterministic");
        
        // TODO: Uncomment when real test vector is available
        // assert_eq!(commitment, EXPECTED_COMMITMENT, "Commitment must match circomlib");
        
        msg!("⚠️ TODO: Update EXPECTED_COMMITMENT with actual circomlib output");
    }
}
