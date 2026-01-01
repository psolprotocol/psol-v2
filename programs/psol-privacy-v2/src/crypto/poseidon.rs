//! Poseidon hash (BN254 / alt_bn128 Fr) – circom-compatible, correctness-first.
//!
//! Requirements enforced here:
//! - **No placeholder behavior**: all functions are real Poseidon, no fallback-to-zero.
//! - **No silent canonicalization**: all inputs MUST be canonical Fr encodings.
//!   Encoding is **32-byte big-endian** integer with value `< r` (BN254 scalar modulus).
//! - **No heap allocations in hot paths**: hashing uses stack-only fixed-size buffers.
//!
//! Circuit compatibility:
//! - Parameters are generated from `light-poseidon` (circom-compatible bn254_x5) at *build time*
//!   and embedded as constants (see `build.rs` and the `include!` below).

use anchor_lang::prelude::*;

use ark_bn254::Fr;
use ark_ff::PrimeField;

use crate::error::PrivacyErrorV2;

pub type ScalarField = [u8; 32];

/// BN254 scalar field modulus `r` (a.k.a. alt_bn128 Fr modulus), big-endian.
///
/// MUST match:
/// - circom circuits (circomlibjs / snarkjs field)
/// - off-chain generator
/// - on-chain verifier/hash inputs
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81,
    0x58, 0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93,
    0xf0, 0x00, 0x00, 0x01,
];

pub const IS_PLACEHOLDER: bool = false;

// Build-time generated Poseidon parameters (ARK + MDS) for BN254 x^5, circom compatible.
// This avoids linking `light-poseidon` (std) into the on-chain crate.
include!(concat!(env!("OUT_DIR"), "/poseidon_bn254_circom_params.rs"));

// ============================================================================
// Canonical Fr encoding helpers (big-endian, no reduction)
// ============================================================================

#[inline(always)]
fn is_canonical_fr_be(bytes: &ScalarField) -> bool {
    // Return true if bytes < modulus (big-endian).
    for i in 0..32 {
        if bytes[i] < BN254_SCALAR_MODULUS[i] {
            return true;
        }
        if bytes[i] > BN254_SCALAR_MODULUS[i] {
            return false;
        }
    }
    false // == modulus is invalid
}

#[inline(always)]
fn fr_from_be_bytes_canonical(bytes: &ScalarField) -> Result<Fr> {
    if !is_canonical_fr_be(bytes) {
        msg!("Non-canonical BN254 Fr encoding (bytes >= modulus)");
        return Err(PrivacyErrorV2::CryptographyError.into());
    }

    // Convert big-endian bytes -> arkworks BigInt limbs (little-endian limbs).
    let mut limbs = [0u64; 4];
    for limb_idx in 0..4 {
        let start = 32 - (limb_idx + 1) * 8;
        let end = start + 8;
        limbs[limb_idx] = u64::from_be_bytes(bytes[start..end].try_into().unwrap());
    }

    let bigint = <Fr as PrimeField>::BigInt::new(limbs);
    Fr::from_bigint(bigint).ok_or_else(|| {
        // Should not happen if our canonical check matches the field modulus,
        // but fail-closed if it does.
        msg!("Failed to parse canonical Fr encoding");
        error!(PrivacyErrorV2::CryptographyError)
    })
}

#[inline(always)]
fn fr_to_be_bytes(f: &Fr) -> ScalarField {
    let bigint = f.into_bigint();
    let limbs = bigint.0; // little-endian limbs
    let mut out = [0u8; 32];
    for limb_idx in 0..4 {
        let be = limbs[3 - limb_idx].to_be_bytes();
        out[limb_idx * 8..(limb_idx + 1) * 8].copy_from_slice(&be);
    }
    out
}

// ============================================================================
// Poseidon (BN254 x^5, circom) – allocation-free permutation for fixed arities
// ============================================================================

#[inline(always)]
fn fr_pow5(x: &Fr) -> Fr {
    // x^5 = x * (x^2)^2
    let x2 = *x * *x;
    let x4 = x2 * x2;
    x4 * *x
}

#[inline(always)]
fn fr_from_limbs(limbs: &[u64; 4]) -> Fr {
    // Safe because constants were generated from valid field elements.
    Fr::from(ark_ff::BigInteger256::new(*limbs))
}

#[inline(always)]
fn poseidon_perm_t3(mut state: [Fr; 3]) -> [Fr; 3] {
    let full_rounds = POSEIDON_BN254_T3_FULL_ROUNDS;
    let partial_rounds = POSEIDON_BN254_T3_PARTIAL_ROUNDS;
    let half_full = full_rounds / 2;
    let total_rounds = full_rounds + partial_rounds;

    // Round constants are flattened: ark[round * width + i].
    for round in 0..half_full {
        // ark
        let base = round * 3;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 2]);
        // sbox full
        state[0] = fr_pow5(&state[0]);
        state[1] = fr_pow5(&state[1]);
        state[2] = fr_pow5(&state[2]);
        // mds
        let tmp0 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][2]);
        let tmp1 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][2]);
        let tmp2 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][2]);
        state = [tmp0, tmp1, tmp2];
    }

    for round in half_full..half_full + partial_rounds {
        let base = round * 3;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 2]);
        // sbox partial
        state[0] = fr_pow5(&state[0]);
        // mds
        let tmp0 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][2]);
        let tmp1 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][2]);
        let tmp2 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][2]);
        state = [tmp0, tmp1, tmp2];
    }

    for round in half_full + partial_rounds..total_rounds {
        let base = round * 3;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T3_ARK[base + 2]);
        // sbox full
        state[0] = fr_pow5(&state[0]);
        state[1] = fr_pow5(&state[1]);
        state[2] = fr_pow5(&state[2]);
        // mds
        let tmp0 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[0][2]);
        let tmp1 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[1][2]);
        let tmp2 = state[0] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][0])
            + state[1] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][1])
            + state[2] * fr_from_limbs(&POSEIDON_BN254_T3_MDS[2][2]);
        state = [tmp0, tmp1, tmp2];
    }

    state
}

#[inline(always)]
fn poseidon_perm_t5(mut state: [Fr; 5]) -> [Fr; 5] {
    let full_rounds = POSEIDON_BN254_T5_FULL_ROUNDS;
    let partial_rounds = POSEIDON_BN254_T5_PARTIAL_ROUNDS;
    let half_full = full_rounds / 2;
    let total_rounds = full_rounds + partial_rounds;

    for round in 0..half_full {
        let base = round * 5;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 2]);
        state[3] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 3]);
        state[4] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 4]);
        state[0] = fr_pow5(&state[0]);
        state[1] = fr_pow5(&state[1]);
        state[2] = fr_pow5(&state[2]);
        state[3] = fr_pow5(&state[3]);
        state[4] = fr_pow5(&state[4]);
        let mut tmp = [Fr::from(0u64); 5];
        for i in 0..5 {
            tmp[i] = state[0] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][0])
                + state[1] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][1])
                + state[2] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][2])
                + state[3] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][3])
                + state[4] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][4]);
        }
        state = tmp;
    }

    for round in half_full..half_full + partial_rounds {
        let base = round * 5;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 2]);
        state[3] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 3]);
        state[4] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 4]);
        state[0] = fr_pow5(&state[0]);
        let mut tmp = [Fr::from(0u64); 5];
        for i in 0..5 {
            tmp[i] = state[0] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][0])
                + state[1] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][1])
                + state[2] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][2])
                + state[3] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][3])
                + state[4] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][4]);
        }
        state = tmp;
    }

    for round in half_full + partial_rounds..total_rounds {
        let base = round * 5;
        state[0] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base]);
        state[1] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 1]);
        state[2] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 2]);
        state[3] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 3]);
        state[4] += fr_from_limbs(&POSEIDON_BN254_T5_ARK[base + 4]);
        state[0] = fr_pow5(&state[0]);
        state[1] = fr_pow5(&state[1]);
        state[2] = fr_pow5(&state[2]);
        state[3] = fr_pow5(&state[3]);
        state[4] = fr_pow5(&state[4]);
        let mut tmp = [Fr::from(0u64); 5];
        for i in 0..5 {
            tmp[i] = state[0] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][0])
                + state[1] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][1])
                + state[2] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][2])
                + state[3] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][3])
                + state[4] * fr_from_limbs(&POSEIDON_BN254_T5_MDS[i][4]);
        }
        state = tmp;
    }

    state
}

/// Poseidon hash with 2 inputs (circomlib-compatible).
///
/// Inputs MUST be canonical BN254 Fr encodings (32-byte big-endian < modulus).
pub fn poseidon2(a: &ScalarField, b: &ScalarField) -> Result<ScalarField> {
    let a = fr_from_be_bytes_canonical(a)?;
    let b = fr_from_be_bytes_canonical(b)?;
    // circom Poseidon state = [domain_tag=0, a, b]
    let out = poseidon_perm_t3([Fr::from(0u64), a, b])[0];
    Ok(fr_to_be_bytes(&out))
}

/// Poseidon hash with 4 inputs (circomlib-compatible).
///
/// Inputs MUST be canonical BN254 Fr encodings (32-byte big-endian < modulus).
pub fn poseidon4(a: &ScalarField, b: &ScalarField, c: &ScalarField, d: &ScalarField) -> Result<ScalarField> {
    let a = fr_from_be_bytes_canonical(a)?;
    let b = fr_from_be_bytes_canonical(b)?;
    let c = fr_from_be_bytes_canonical(c)?;
    let d = fr_from_be_bytes_canonical(d)?;
    // circom Poseidon state = [domain_tag=0, a, b, c, d]
    let out = poseidon_perm_t5([Fr::from(0u64), a, b, c, d])[0];
    Ok(fr_to_be_bytes(&out))
}

// Backwards-compatible names used across the codebase.
pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> Result<ScalarField> {
    poseidon2(left, right)
}

pub fn poseidon_hash_4(input0: &ScalarField, input1: &ScalarField, input2: &ScalarField, input3: &ScalarField) -> Result<ScalarField> {
    poseidon4(input0, input1, input2, input3)
}

pub fn compute_commitment(secret: &ScalarField, nullifier: &ScalarField, amount: u64, asset_id: &ScalarField) -> Result<ScalarField> {
    // Engineering assumption (explicit):
    // `asset_id` passed into Poseidon MUST already be a canonical BN254 Fr element encoding.
    // If the protocol previously used raw Keccak256(mint) here, it must be mapped off-chain
    // into Fr *explicitly* and consistently with the circuit (no implicit reductions here).
    let amount_scalar = u64_to_scalar_be(amount);
    poseidon4(secret, nullifier, &amount_scalar, asset_id)
}

pub fn compute_nullifier_hash(nullifier: &ScalarField, secret: &ScalarField, leaf_index: u32) -> Result<ScalarField> {
    let index_scalar = u64_to_scalar_be(leaf_index as u64);
    let inner = poseidon2(nullifier, secret)?;
    poseidon2(&inner, &index_scalar)
}

pub fn verify_commitment(commitment: &ScalarField, secret: &ScalarField, nullifier: &ScalarField, amount: u64, asset_id: &ScalarField) -> Result<bool> {
    let computed = compute_commitment(secret, nullifier, amount, asset_id)?;
    Ok(computed == *commitment)
}

// ============================================================================
// Scalar encoding helpers used elsewhere
// ============================================================================

#[inline]
pub fn u64_to_scalar_be(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[24..32].copy_from_slice(&value.to_be_bytes());
    scalar
}

#[inline]
pub fn u64_to_scalar_le(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[..8].copy_from_slice(&value.to_le_bytes());
    scalar
}

#[inline]
pub fn i64_to_scalar_be(value: i64) -> ScalarField {
    // Canonical mapping from signed integers used for circuit inputs:
    // positive: standard big-endian encoding
    // negative: (r - |value|) in Fr, encoded as canonical big-endian bytes.
    if value >= 0 {
        u64_to_scalar_be(value as u64)
    } else {
        let abs_value = if value == i64::MIN { (i64::MAX as u64) + 1 } else { (-value) as u64 };
        let mut scalar = BN254_SCALAR_MODULUS;
        let mut borrow = 0u16;
        let abs_bytes = abs_value.to_be_bytes();
        for i in (24..32).rev() {
            let diff = (scalar[i] as u16).wrapping_sub(abs_bytes[i - 24] as u16).wrapping_sub(borrow);
            scalar[i] = diff as u8;
            borrow = if diff > 0xFF { 1 } else { 0 };
        }
        for i in (0..24).rev() {
            if borrow == 0 { break; }
            let diff = (scalar[i] as u16).wrapping_sub(borrow);
            scalar[i] = diff as u8;
            borrow = if diff > 0xFF { 1 } else { 0 };
        }
        scalar
    }
}

#[inline]
pub fn u64_to_bytes32(value: u64) -> ScalarField { u64_to_scalar_be(value) }

#[inline]
pub fn is_zero_hash(hash: &ScalarField) -> bool { hash.iter().all(|&b| b == 0) }

#[inline]
pub fn empty_leaf_hash() -> ScalarField { [0u8; 32] }

/// Strict validity check: canonical BN254 Fr encoding (big-endian < modulus).
pub fn is_valid_scalar(scalar: &ScalarField) -> bool { is_canonical_fr_be(scalar) }

// ============================================================================
// Tests (golden vectors)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_not_placeholder() {
        assert!(!IS_PLACEHOLDER, "Poseidon must not be a placeholder");
    }

    #[test]
    fn test_rejects_non_canonical_scalar() {
        // modulus is not a valid field element encoding
        let bad = BN254_SCALAR_MODULUS;
        let ok = poseidon2(&[0u8; 32], &[0u8; 32]);
        assert!(ok.is_ok());

        let err = poseidon2(&bad, &[0u8; 32]);
        assert!(err.is_err(), "must reject bytes >= modulus");
    }

    #[test]
    fn test_poseidon2_vector_1_2() {
        // Provenance: generated via `circomlibjs@0.1.7` buildPoseidon() (BN254 Fr),
        // with inputs interpreted as canonical integers 1 and 2.
        //
        // Repro command (from repo root):
        // `cd sdk && npm install --workspaces=false && node -e '<script in agent notes>'`
        let a = u64_to_scalar_be(1);
        let b = u64_to_scalar_be(2);
        let out = poseidon2(&a, &b).unwrap();

        let expected: [u8; 32] = [
            17, 92, 192, 245, 231, 214, 144, 65, 61, 246, 76, 107, 150, 98, 233, 207, 42, 54, 23,
            242, 116, 50, 69, 81, 158, 25, 96, 122, 68, 23, 24, 154,
        ];
        assert_eq!(out, expected);
    }

    #[test]
    fn test_poseidon4_vector_1_2_3_4() {
        // Provenance: generated via `circomlibjs@0.1.7` buildPoseidon() with inputs [1,2,3,4].
        let a = u64_to_scalar_be(1);
        let b = u64_to_scalar_be(2);
        let c = u64_to_scalar_be(3);
        let d = u64_to_scalar_be(4);
        let out = poseidon4(&a, &b, &c, &d).unwrap();
        let expected: [u8; 32] = [
            41, 156, 134, 125, 182, 193, 253, 215, 157, 206, 250, 64, 228, 81, 11, 152, 55, 230,
            14, 187, 28, 224, 102, 61, 186, 165, 37, 223, 101, 37, 4, 101,
        ];
        assert_eq!(out, expected);
    }

    #[test]
    fn test_compute_nullifier_hash_vector_2_1_7() {
        // Provenance: generated via `circomlibjs@0.1.7` buildPoseidon():
        // inner = poseidon2(nullifier=2, secret=1)
        // nullifier_hash = poseidon2(inner, leaf_index=7)
        let nullifier = u64_to_scalar_be(2);
        let secret = u64_to_scalar_be(1);
        let out = compute_nullifier_hash(&nullifier, &secret, 7).unwrap();
        let expected: [u8; 32] = [
            13, 153, 58, 215, 203, 151, 193, 149, 19, 9, 43, 51, 202, 21, 194, 106, 233, 109, 180,
            27, 234, 42, 108, 71, 88, 133, 118, 165, 24, 234, 200, 242,
        ];
        assert_eq!(out, expected);
    }
}
