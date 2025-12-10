//! Poseidon Hash for pSOL v2
//!
//! Production implementation using Solana's Poseidon syscall.
<<<<<<< HEAD
//! Compatible with circomlib (BN254 curve, x^5 S-box).
//!
//! # Compatibility
//!
//! This implementation matches:
//! - circomlib's `poseidon.circom` (circuits)
//! - circomlibjs's `buildPoseidon` (SDK)
//!
//! All three (on-chain, circuit, SDK) MUST produce identical hashes
//! for the same inputs, or proof verification will fail.

use anchor_lang::prelude::*;
use solana_program::poseidon::{hashv, Endianness, Parameters, PoseidonHash};
=======
//! Compatible with circomlib / circomlibjs on BN254 (x^5 S-box).
//!
//! All three surfaces must agree for proofs to verify:
//! - Circuits (withdraw.circom, deposit.circom, …)
//! - SDK (poseidon.ts / note.ts)
//! - On-chain (this file)

use anchor_lang::prelude::*;
use solana_program::poseidon::{hashv, Endianness, Parameters};
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)

use crate::error::PrivacyErrorV2;

// Re-export from curve_utils for convenience
pub type ScalarField = [u8; 32];

/// BN254 scalar field modulus (r)
/// r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

<<<<<<< HEAD
/// Flag indicating this is a production implementation
=======
/// Flag indicating placeholder vs real implementation.
/// This must be `false` in production.
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub const IS_PLACEHOLDER: bool = false;

// ============================================================================
// CORE HASH FUNCTIONS
// ============================================================================

/// Hash two field elements using Poseidon.
///
<<<<<<< HEAD
/// Used for Merkle tree internal nodes: `parent = H(left, right)`
///
/// # Arguments
/// * `left` - Left child (32 bytes, big-endian)
/// * `right` - Right child (32 bytes, big-endian)
///
/// # Returns
/// Hash output as 32-byte big-endian array.
///
/// # Compatibility
/// Matches `hashTwo(left, right)` in SDK and `Poseidon(2)` in circom.
pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> Result<ScalarField> {
    let result = hashv(
        Parameters::Bn254X5,      // BN254 curve, x^5 S-box (circom-compatible)
        Endianness::BigEndian,    // Match circomlibjs endianness
        &[left.as_slice(), right.as_slice()],
    ).map_err(|e| {
        msg!("Poseidon hash_two_to_one failed: {:?}", e);
        error!(PrivacyErrorV2::CryptographyError)
    })?;

    Ok(result.to_bytes())
=======
/// Used for Merkle tree internal nodes:
/// `parent = H(left, right)`
///
/// Signature kept compatible with the previous Keccak placeholder:
/// returns `[u8; 32]` and never `Result`, so Merkle tree code does not change.
pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> [u8; 32] {
    let result = hashv(
        Parameters::Bn254X5,    // BN254 curve, x^5 S-box (circom compatible)
        Endianness::BigEndian,  // Interpret inputs as big-endian field elements
        &[left.as_slice(), right.as_slice()],
    )
    .expect("Poseidon hash_two_to_one syscall failed");

    result.to_bytes()
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
}

/// Hash four field elements using Poseidon.
///
<<<<<<< HEAD
/// Used for commitment computation: `commitment = H(secret, nullifier, amount, asset_id)`
///
/// # Arguments
/// * `input0` - First element (secret)
/// * `input1` - Second element (nullifier)
/// * `input2` - Third element (amount as scalar)
/// * `input3` - Fourth element (asset_id)
///
/// # Returns
/// Hash output as 32-byte big-endian array.
///
/// # Compatibility
/// Matches `hashFour(a, b, c, d)` in SDK and `Poseidon(4)` in circom.
=======
/// Used for MASP commitments:
/// `commitment = H(secret, nullifier, amount, asset_id)`
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub fn poseidon_hash_4(
    input0: &ScalarField,
    input1: &ScalarField,
    input2: &ScalarField,
    input3: &ScalarField,
<<<<<<< HEAD
) -> Result<ScalarField> {
=======
) -> [u8; 32] {
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
    let result = hashv(
        Parameters::Bn254X5,
        Endianness::BigEndian,
        &[
            input0.as_slice(),
            input1.as_slice(),
            input2.as_slice(),
            input3.as_slice(),
        ],
<<<<<<< HEAD
    ).map_err(|e| {
        msg!("Poseidon hash_4 failed: {:?}", e);
        error!(PrivacyErrorV2::CryptographyError)
    })?;

    Ok(result.to_bytes())
=======
    )
    .expect("Poseidon poseidon_hash_4 syscall failed");

    result.to_bytes()
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
}

/// Hash variable number of inputs using Poseidon.
///
<<<<<<< HEAD
/// Routes to the appropriate hash function based on input count.
/// Supported: 1, 2, 3, 4 inputs.
=======
/// This is mainly for tests / tooling, not the main Merkle tree path.
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub fn poseidon_hash(inputs: &[ScalarField]) -> Result<ScalarField> {
    if inputs.is_empty() || inputs.len() > 12 {
        msg!("Poseidon: unsupported input count {}", inputs.len());
        return Err(error!(PrivacyErrorV2::InvalidAmount));
    }

    let input_slices: Vec<&[u8]> = inputs.iter().map(|x| x.as_slice()).collect();

    let result = hashv(
        Parameters::Bn254X5,
        Endianness::BigEndian,
        &input_slices,
<<<<<<< HEAD
    ).map_err(|e| {
        msg!("Poseidon hash failed: {:?}", e);
=======
    )
    .map_err(|e| {
        msg!("Poseidon hash syscall failed: {:?}", e);
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
        error!(PrivacyErrorV2::CryptographyError)
    })?;

    Ok(result.to_bytes())
}

// ============================================================================
// COMMITMENT / NULLIFIER FUNCTIONS
// ============================================================================

/// Compute MASP commitment.
///
<<<<<<< HEAD
/// ```text
/// commitment = Poseidon(secret, nullifier, amount, asset_id)
/// ```
///
/// This matches the circuit (withdraw.circom lines 41-48):
=======
/// Matches withdraw.circom:
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
/// ```circom
/// component commitment_hasher = Poseidon(4);
/// commitment_hasher.inputs[0] <== secret;
/// commitment_hasher.inputs[1] <== nullifier;
/// commitment_hasher.inputs[2] <== amount;
/// commitment_hasher.inputs[3] <== asset_id;
/// ```
<<<<<<< HEAD
///
/// # Arguments
/// * `secret` - Random blinding factor (private)
/// * `nullifier` - Nullifier preimage (private)
/// * `amount` - Token amount
/// * `asset_id` - Asset identifier
///
/// # Returns
/// The commitment hash (inserted as leaf in Merkle tree).
=======
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub fn compute_commitment(
    secret: &ScalarField,
    nullifier: &ScalarField,
    amount: u64,
    asset_id: &ScalarField,
) -> Result<ScalarField> {
<<<<<<< HEAD
    let amount_scalar = u64_to_scalar_be(amount);
    poseidon_hash_4(secret, nullifier, &amount_scalar, asset_id)
=======
    // Represent amount as BN254 field element, big-endian
    let amount_scalar = u64_to_bytes32_be(amount);
    Ok(poseidon_hash_4(secret, nullifier, &amount_scalar, asset_id))
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
}

/// Compute nullifier hash.
///
<<<<<<< HEAD
=======
/// Correct formula (matches withdraw.circom + SDK):
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
/// ```text
/// nullifier_hash = Poseidon(Poseidon(nullifier, secret), leaf_index)
/// ```
///
<<<<<<< HEAD
/// This matches the circuit (withdraw.circom lines 52-63):
=======
/// Circom:
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
/// ```circom
/// component nullifier_inner = Poseidon(2);
/// nullifier_inner.inputs[0] <== nullifier;
/// nullifier_inner.inputs[1] <== secret;
///
/// component nullifier_outer = Poseidon(2);
/// nullifier_outer.inputs[0] <== nullifier_inner.out;
/// nullifier_outer.inputs[1] <== leaf_index;
/// ```
///
<<<<<<< HEAD
/// And the SDK (poseidon.ts):
/// ```typescript
=======
/// SDK (poseidon.ts):
/// ```ts
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
/// const inner = hashTwo(nullifier, secret);
/// return hashTwo(inner, leafIndex);
/// ```
///
<<<<<<< HEAD
/// # CRITICAL
/// The previous implementation was WRONG - it computed:
/// `H(H(nullifier, secret), H(leaf_index, 0))`
/// 
/// The correct formula (matching circuit and SDK) is:
/// `H(H(nullifier, secret), leaf_index)`
///
/// # Arguments
/// * `nullifier` - Nullifier preimage
/// * `secret` - Secret blinding factor
/// * `leaf_index` - Position of commitment in Merkle tree
///
/// # Returns
/// The nullifier hash (used to mark commitment as spent).
=======
/// The previous Rust implementation was wrong:
/// it did `H(H(nullifier, secret), H(leaf_index, 0))`.
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub fn compute_nullifier_hash(
    nullifier: &ScalarField,
    secret: &ScalarField,
    leaf_index: u32,
) -> Result<ScalarField> {
<<<<<<< HEAD
    // Convert leaf_index to scalar (big-endian to match circom field element)
    let index_scalar = u64_to_scalar_be(leaf_index as u64);

    // Inner hash: Poseidon(nullifier, secret)
    let inner = hash_two_to_one(nullifier, secret)?;

    // Outer hash: Poseidon(inner, leaf_index)
    // NOTE: This is the CORRECT formula matching circuit and SDK
    // Previous implementation incorrectly did: H(inner, H(leaf_index, 0))
    hash_two_to_one(&inner, &index_scalar)
=======
    // Convert leaf_index to field element (big-endian)
    let index_scalar = u64_to_bytes32_be(leaf_index as u64);

    // Inner: H(nullifier, secret)
    let inner = hash_two_to_one(nullifier, secret);

    // Outer: H(inner, leaf_index)
    Ok(hash_two_to_one(&inner, &index_scalar))
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
}

// ============================================================================
// UTILITIES
// ============================================================================

<<<<<<< HEAD
/// Convert u64 to 32-byte scalar (big-endian).
///
/// Big-endian is used because:
/// 1. circomlibjs uses big-endian for field elements
/// 2. Solana's Poseidon syscall with BigEndian mode expects this
///
/// # Example
/// ```
/// let scalar = u64_to_scalar_be(1000);
/// // scalar[24..32] contains 0x00000000000003e8 (big-endian)
/// ```
pub fn u64_to_scalar_be(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[24..32].copy_from_slice(&value.to_be_bytes());
    scalar
}

/// Convert u64 to 32-byte scalar (little-endian).
///
/// Provided for compatibility, but big-endian is preferred for Poseidon.
pub fn u64_to_scalar_le(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[..8].copy_from_slice(&value.to_le_bytes());
    scalar
}

// Keep old name for backward compatibility
pub fn u64_to_bytes32(value: u64) -> ScalarField {
    u64_to_scalar_be(value)
}

/// Check if a hash is all zeros.
pub fn is_zero_hash(hash: &ScalarField) -> bool {
    hash.iter().all(|&b| b == 0)
}

/// Return the empty leaf hash (zero).
///
/// In the Merkle tree, empty leaves are represented as 0.
pub fn empty_leaf_hash() -> ScalarField {
    [0u8; 32]
}

/// Check if using placeholder implementation.
///
/// Returns `false` for this production implementation.
=======
/// Convert u64 to 32-byte array (little-endian).
///
/// Kept for backward compatibility. Prefer the `_be` variant below for
/// anything that goes into Poseidon.
pub fn u64_to_bytes32(value: u64) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&value.to_le_bytes());
    bytes
}

/// Convert u64 to 32-byte array (big-endian).
///
/// This is what should be used for field elements passed into Poseidon.
pub fn u64_to_bytes32_be(value: u64) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&value.to_be_bytes());
    bytes
}

/// Check if a hash is all zeros.
pub fn is_zero_hash(hash: &[u8; 32]) -> bool {
    hash.iter().all(|&b| b == 0)
}

/// Canonical empty leaf hash (all zeros).
pub fn empty_leaf_hash() -> [u8; 32] {
    [0u8; 32]
}

/// Report whether this file is still using a placeholder implementation.
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
pub fn is_placeholder_implementation() -> bool {
    IS_PLACEHOLDER
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_not_placeholder() {
        assert!(!is_placeholder_implementation());
    }

    #[test]
<<<<<<< HEAD
    fn test_u64_to_scalar_be() {
        let scalar = u64_to_scalar_be(0x0102030405060708);
        assert_eq!(&scalar[24..32], &[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        assert_eq!(&scalar[0..24], &[0u8; 24]);
    }

    #[test]
    fn test_is_zero_hash() {
        assert!(is_zero_hash(&[0u8; 32]));
        assert!(!is_zero_hash(&[1u8; 32]));
        
        let mut partial = [0u8; 32];
        partial[31] = 1;
        assert!(!is_zero_hash(&partial));
    }

    #[test]
    fn test_empty_leaf() {
        let empty = empty_leaf_hash();
        assert!(is_zero_hash(&empty));
    }

    // Integration test - requires Solana runtime for syscall
    // These would be run in an Anchor test environment
    //
    // #[test]
    // fn test_hash_matches_sdk() {
    //     // Test vector from SDK:
    //     // hashTwo(1, 2) should equal specific value
    //     let one = u64_to_scalar_be(1);
    //     let two = u64_to_scalar_be(2);
    //     let hash = hash_two_to_one(&one, &two).unwrap();
    //     
    //     // Expected from circomlibjs: (run in JS to get this)
    //     // const poseidon = await buildPoseidon();
    //     // const hash = poseidon([1n, 2n]);
    //     // console.log(poseidon.F.toObject(hash).toString(16));
    //     let expected = [...]; // Fill in from SDK test
    //     assert_eq!(hash, expected);
    // }
=======
    fn test_zero_helpers() {
        let z = empty_leaf_hash();
        assert!(is_zero_hash(&z));
        let mut non_zero = z;
        non_zero[31] = 1;
        assert!(!is_zero_hash(&non_zero));
    }

    #[test]
    fn test_u64_to_be_bytes() {
        let v = 0x0102030405060708u64;
        let be = u64_to_bytes32_be(v);
        assert_eq!(&be[24..32], &v.to_be_bytes());
    }

    #[test]
    fn test_not_placeholder() {
        assert!(!is_placeholder_implementation());
    }
>>>>>>> feb3db3 (feat: integrate Groth16 deposit verification into MASP and relayer)
}
