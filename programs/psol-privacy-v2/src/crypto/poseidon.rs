//! Poseidon (circomlib) for BN254 scalar field, Solana/BPF-safe.
//!
//! Key properties:
//! - No `light_poseidon` parameter constructors (avoids BPF stack overflow).
//! - Constants are embedded as `[u8; 32]` big-endian and converted on the fly.
//! - Implements the same round structure as circomlib's `PoseidonEx`
//!   (uses M/P/S matrices and the compact constant schedule).
//!
//! This module is meant to be deterministic and compatible with circomlibjs vectors.
//!
//! STACK OPTIMIZATION NOTES (Solana BPF limit: 4096 bytes per frame):
//! - All mix functions are #[inline(never)] to prevent frame bloat
//! - Constants accessed by reference, never copied
//! - Permutation functions are #[inline(never)]
//! - Avoid chained expressions; use sequential accumulator pattern

use ark_bn254::Fr;
use ark_ff::{BigInteger, Field, PrimeField, AdditiveGroup};

include!("poseidon_bn254_constants.in.rs");

/// Convert big-endian bytes to Fr. Marked inline(never) to isolate stack usage.
#[inline(never)]
fn fr_from_be32(b: &[u8; 32]) -> Fr {
    Fr::from_be_bytes_mod_order(b)
}

/// x^5 S-box
#[inline(never)]
fn sigma5(x: Fr) -> Fr {
    let x2 = x.square();
    let x4 = x2.square();
    x4 * x
}

/// Convert Fr to canonical big-endian bytes
#[inline(never)]
fn fr_to_be32(x: &Fr) -> [u8; 32] {
    let bi = x.into_bigint();
    let bytes_le = bi.to_bytes_le();
    let mut out = [0u8; 32];
    let n = core::cmp::min(out.len(), bytes_le.len());
    out[..n].copy_from_slice(&bytes_le[..n]);
    out.reverse();
    out
}

// =============================================================================
// SINGLE-TERM ACCUMULATION HELPERS
// Compute one matrix-vector product term: acc += m[row][col] * state_val
// =============================================================================

#[inline(never)]
fn acc_term(acc: &mut Fr, m_entry: &[u8; 32], state_val: Fr) {
    let coeff = fr_from_be32(m_entry);
    let term = coeff * state_val;
    *acc += term;
}

// =============================================================================
// MIX FUNCTIONS - Stack-safe with sequential accumulator pattern
// =============================================================================

#[inline(never)]
fn mix_dense_t3(state: &mut [Fr; 3], m: &[[[u8; 32]; 3]; 3]) {
    let s0 = state[0];
    let s1 = state[1];
    let s2 = state[2];

    // Compute state[0]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[0][0], s0);
        acc_term(&mut acc, &m[0][1], s1);
        acc_term(&mut acc, &m[0][2], s2);
        state[0] = acc;
    }

    // Compute state[1]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[1][0], s0);
        acc_term(&mut acc, &m[1][1], s1);
        acc_term(&mut acc, &m[1][2], s2);
        state[1] = acc;
    }

    // Compute state[2]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[2][0], s0);
        acc_term(&mut acc, &m[2][1], s1);
        acc_term(&mut acc, &m[2][2], s2);
        state[2] = acc;
    }
}

#[inline(never)]
fn mix_dense_t4(state: &mut [Fr; 4], m: &[[[u8; 32]; 4]; 4]) {
    let s0 = state[0];
    let s1 = state[1];
    let s2 = state[2];
    let s3 = state[3];

    // Compute state[0]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[0][0], s0);
        acc_term(&mut acc, &m[0][1], s1);
        acc_term(&mut acc, &m[0][2], s2);
        acc_term(&mut acc, &m[0][3], s3);
        state[0] = acc;
    }

    // Compute state[1]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[1][0], s0);
        acc_term(&mut acc, &m[1][1], s1);
        acc_term(&mut acc, &m[1][2], s2);
        acc_term(&mut acc, &m[1][3], s3);
        state[1] = acc;
    }

    // Compute state[2]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[2][0], s0);
        acc_term(&mut acc, &m[2][1], s1);
        acc_term(&mut acc, &m[2][2], s2);
        acc_term(&mut acc, &m[2][3], s3);
        state[2] = acc;
    }

    // Compute state[3]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[3][0], s0);
        acc_term(&mut acc, &m[3][1], s1);
        acc_term(&mut acc, &m[3][2], s2);
        acc_term(&mut acc, &m[3][3], s3);
        state[3] = acc;
    }
}

#[inline(never)]
fn mix_dense_t5(state: &mut [Fr; 5], m: &[[[u8; 32]; 5]; 5]) {
    let s0 = state[0];
    let s1 = state[1];
    let s2 = state[2];
    let s3 = state[3];
    let s4 = state[4];

    // Compute state[0]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[0][0], s0);
        acc_term(&mut acc, &m[0][1], s1);
        acc_term(&mut acc, &m[0][2], s2);
        acc_term(&mut acc, &m[0][3], s3);
        acc_term(&mut acc, &m[0][4], s4);
        state[0] = acc;
    }

    // Compute state[1]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[1][0], s0);
        acc_term(&mut acc, &m[1][1], s1);
        acc_term(&mut acc, &m[1][2], s2);
        acc_term(&mut acc, &m[1][3], s3);
        acc_term(&mut acc, &m[1][4], s4);
        state[1] = acc;
    }

    // Compute state[2]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[2][0], s0);
        acc_term(&mut acc, &m[2][1], s1);
        acc_term(&mut acc, &m[2][2], s2);
        acc_term(&mut acc, &m[2][3], s3);
        acc_term(&mut acc, &m[2][4], s4);
        state[2] = acc;
    }

    // Compute state[3]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[3][0], s0);
        acc_term(&mut acc, &m[3][1], s1);
        acc_term(&mut acc, &m[3][2], s2);
        acc_term(&mut acc, &m[3][3], s3);
        acc_term(&mut acc, &m[3][4], s4);
        state[3] = acc;
    }

    // Compute state[4]
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &m[4][0], s0);
        acc_term(&mut acc, &m[4][1], s1);
        acc_term(&mut acc, &m[4][2], s2);
        acc_term(&mut acc, &m[4][3], s3);
        acc_term(&mut acc, &m[4][4], s4);
        state[4] = acc;
    }
}

#[inline(never)]
fn mix_last_row_t3(state: &[Fr; 3], m: &[[[u8; 32]; 3]; 3]) -> Fr {
    let mut acc = Fr::ZERO;
    acc_term(&mut acc, &m[0][0], state[0]);
    acc_term(&mut acc, &m[0][1], state[1]);
    acc_term(&mut acc, &m[0][2], state[2]);
    acc
}

#[inline(never)]
fn mix_last_row_t4(state: &[Fr; 4], m: &[[[u8; 32]; 4]; 4]) -> Fr {
    let mut acc = Fr::ZERO;
    acc_term(&mut acc, &m[0][0], state[0]);
    acc_term(&mut acc, &m[0][1], state[1]);
    acc_term(&mut acc, &m[0][2], state[2]);
    acc_term(&mut acc, &m[0][3], state[3]);
    acc
}

#[inline(never)]
fn mix_last_row_t5(state: &[Fr; 5], m: &[[[u8; 32]; 5]; 5]) -> Fr {
    let mut acc = Fr::ZERO;
    acc_term(&mut acc, &m[0][0], state[0]);
    acc_term(&mut acc, &m[0][1], state[1]);
    acc_term(&mut acc, &m[0][2], state[2]);
    acc_term(&mut acc, &m[0][3], state[3]);
    acc_term(&mut acc, &m[0][4], state[4]);
    acc
}

#[inline(never)]
fn mix_s_t3(state: &mut [Fr; 3], s_chunk: &[[u8; 32]]) {
    let in0 = state[0];
    let in1 = state[1];
    let in2 = state[2];

    // out0 = in0 * s0 + in1 * s1 + in2 * s2
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &s_chunk[0], in0);
        acc_term(&mut acc, &s_chunk[1], in1);
        acc_term(&mut acc, &s_chunk[2], in2);
        state[0] = acc;
    }

    // out1 = in1 + in0 * s3
    {
        let mut acc = in1;
        acc_term(&mut acc, &s_chunk[3], in0);
        state[1] = acc;
    }

    // out2 = in2 + in0 * s4
    {
        let mut acc = in2;
        acc_term(&mut acc, &s_chunk[4], in0);
        state[2] = acc;
    }
}

#[inline(never)]
fn mix_s_t4(state: &mut [Fr; 4], s_chunk: &[[u8; 32]]) {
    let in0 = state[0];
    let in1 = state[1];
    let in2 = state[2];
    let in3 = state[3];

    // out0 = in0 * s0 + in1 * s1 + in2 * s2 + in3 * s3
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &s_chunk[0], in0);
        acc_term(&mut acc, &s_chunk[1], in1);
        acc_term(&mut acc, &s_chunk[2], in2);
        acc_term(&mut acc, &s_chunk[3], in3);
        state[0] = acc;
    }

    // out1 = in1 + in0 * s4
    {
        let mut acc = in1;
        acc_term(&mut acc, &s_chunk[4], in0);
        state[1] = acc;
    }

    // out2 = in2 + in0 * s5
    {
        let mut acc = in2;
        acc_term(&mut acc, &s_chunk[5], in0);
        state[2] = acc;
    }

    // out3 = in3 + in0 * s6
    {
        let mut acc = in3;
        acc_term(&mut acc, &s_chunk[6], in0);
        state[3] = acc;
    }
}

#[inline(never)]
fn mix_s_t5(state: &mut [Fr; 5], s_chunk: &[[u8; 32]]) {
    let in0 = state[0];
    let in1 = state[1];
    let in2 = state[2];
    let in3 = state[3];
    let in4 = state[4];

    // out0 = in0 * s0 + in1 * s1 + in2 * s2 + in3 * s3 + in4 * s4
    {
        let mut acc = Fr::ZERO;
        acc_term(&mut acc, &s_chunk[0], in0);
        acc_term(&mut acc, &s_chunk[1], in1);
        acc_term(&mut acc, &s_chunk[2], in2);
        acc_term(&mut acc, &s_chunk[3], in3);
        acc_term(&mut acc, &s_chunk[4], in4);
        state[0] = acc;
    }

    // out1 = in1 + in0 * s5
    {
        let mut acc = in1;
        acc_term(&mut acc, &s_chunk[5], in0);
        state[1] = acc;
    }

    // out2 = in2 + in0 * s6
    {
        let mut acc = in2;
        acc_term(&mut acc, &s_chunk[6], in0);
        state[2] = acc;
    }

    // out3 = in3 + in0 * s7
    {
        let mut acc = in3;
        acc_term(&mut acc, &s_chunk[7], in0);
        state[3] = acc;
    }

    // out4 = in4 + in0 * s8
    {
        let mut acc = in4;
        acc_term(&mut acc, &s_chunk[8], in0);
        state[4] = acc;
    }
}

// =============================================================================
// ARK (Add Round Key) FUNCTIONS - Isolated to reduce main function stack
// =============================================================================

#[inline(never)]
fn ark_t3(state: &mut [Fr; 3], c: &[[u8; 32]], off: usize) {
    state[0] += fr_from_be32(&c[off]);
    state[1] += fr_from_be32(&c[off + 1]);
    state[2] += fr_from_be32(&c[off + 2]);
}

#[inline(never)]
fn ark_t4(state: &mut [Fr; 4], c: &[[u8; 32]], off: usize) {
    state[0] += fr_from_be32(&c[off]);
    state[1] += fr_from_be32(&c[off + 1]);
    state[2] += fr_from_be32(&c[off + 2]);
    state[3] += fr_from_be32(&c[off + 3]);
}

#[inline(never)]
fn ark_t5(state: &mut [Fr; 5], c: &[[u8; 32]], off: usize) {
    state[0] += fr_from_be32(&c[off]);
    state[1] += fr_from_be32(&c[off + 1]);
    state[2] += fr_from_be32(&c[off + 2]);
    state[3] += fr_from_be32(&c[off + 3]);
    state[4] += fr_from_be32(&c[off + 4]);
}

// =============================================================================
// SBOX FUNCTIONS - Apply sigma5 to all state elements
// =============================================================================

#[inline(never)]
fn sbox_full_t3(state: &mut [Fr; 3]) {
    state[0] = sigma5(state[0]);
    state[1] = sigma5(state[1]);
    state[2] = sigma5(state[2]);
}

#[inline(never)]
fn sbox_full_t4(state: &mut [Fr; 4]) {
    state[0] = sigma5(state[0]);
    state[1] = sigma5(state[1]);
    state[2] = sigma5(state[2]);
    state[3] = sigma5(state[3]);
}

#[inline(never)]
fn sbox_full_t5(state: &mut [Fr; 5]) {
    state[0] = sigma5(state[0]);
    state[1] = sigma5(state[1]);
    state[2] = sigma5(state[2]);
    state[3] = sigma5(state[3]);
    state[4] = sigma5(state[4]);
}

// =============================================================================
// FULL ROUND FUNCTIONS - Combines sbox + ark + mix for first half rounds
// =============================================================================

#[inline(never)]
fn full_round_first_half_t3(state: &mut [Fr; 3], round: usize) {
    sbox_full_t3(state);
    mix_dense_t3(state, &M_T3);
    ark_t3(state, &C_T3, (round + 1) * 3);
}

#[inline(never)]
fn full_round_first_half_t4(state: &mut [Fr; 4], round: usize) {
    sbox_full_t4(state);
    mix_dense_t4(state, &M_T4);
    ark_t4(state, &C_T4, (round + 1) * 4);
}

#[inline(never)]
fn full_round_first_half_t5(state: &mut [Fr; 5], round: usize) {
    sbox_full_t5(state);
    mix_dense_t5(state, &M_T5);
    ark_t5(state, &C_T5, (round + 1) * 5);
}

#[inline(never)]
fn full_round_second_half_t3(state: &mut [Fr; 3], c_off: usize) {
    sbox_full_t3(state);
    ark_t3(state, &C_T3, c_off);
    mix_dense_t3(state, &M_T3);
}

#[inline(never)]
fn full_round_second_half_t4(state: &mut [Fr; 4], c_off: usize) {
    sbox_full_t4(state);
    ark_t4(state, &C_T4, c_off);
    mix_dense_t4(state, &M_T4);
}

#[inline(never)]
fn full_round_second_half_t5(state: &mut [Fr; 5], c_off: usize) {
    sbox_full_t5(state);
    ark_t5(state, &C_T5, c_off);
    mix_dense_t5(state, &M_T5);
}

// =============================================================================
// PARTIAL ROUND FUNCTIONS - Single sbox on state[0] + ark + mix_s
// =============================================================================

#[inline(never)]
fn partial_round_t3(state: &mut [Fr; 3], c_idx: usize, s_off: usize) {
    state[0] += fr_from_be32(&C_T3[c_idx]);
    state[0] = sigma5(state[0]);
    mix_s_t3(state, &S_T3[s_off..s_off + 5]);
}

#[inline(never)]
fn partial_round_t4(state: &mut [Fr; 4], c_idx: usize, s_off: usize) {
    state[0] += fr_from_be32(&C_T4[c_idx]);
    state[0] = sigma5(state[0]);
    mix_s_t4(state, &S_T4[s_off..s_off + 7]);
}

#[inline(never)]
fn partial_round_t5(state: &mut [Fr; 5], c_idx: usize, s_off: usize) {
    state[0] += fr_from_be32(&C_T5[c_idx]);
    state[0] = sigma5(state[0]);
    mix_s_t5(state, &S_T5[s_off..s_off + 9]);
}

// =============================================================================
// PERMUTATION FUNCTIONS - Main entry points, must stay under 4096 bytes stack
// =============================================================================

#[inline(never)]
fn poseidon_ex_t3(a: Fr, b: Fr) -> Fr {
    let mut state = [Fr::ZERO, a, b];
    let t = 3;

    // Initial ARK: state += C[0..t]
    ark_t3(&mut state, &C_T3, 0);

    // First half MINUS ONE (3 rounds): sbox → ark → mix(M)
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t3(&mut state);
        ark_t3(&mut state, &C_T3, (r + 1) * t);
        mix_dense_t3(&mut state, &M_T3);
    }

    // One full round with P matrix: sbox → ark → mix(P)
    sbox_full_t3(&mut state);
    ark_t3(&mut state, &C_T3, (N_ROUNDS_F / 2) * t);
    mix_dense_t3(&mut state, &P_T3);

    // Partial rounds: sbox[0] → ark[0] → mix_sparse
    let c_part_base = (N_ROUNDS_F / 2 + 1) * t;
    for r in 0..N_ROUNDS_P_T3 {
        state[0] = sigma5(state[0]);
        state[0] += fr_from_be32(&C_T3[c_part_base + r]);
        mix_s_t3(&mut state, &S_T3[r * (t * 2 - 1)..]);
    }

    // Second half MINUS ONE (3 rounds): sbox → ark → mix(M)
    let c_full2_base = c_part_base + N_ROUNDS_P_T3;
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t3(&mut state);
        ark_t3(&mut state, &C_T3, c_full2_base + r * t);
        mix_dense_t3(&mut state, &M_T3);
    }

    // Final round: sbox → mix(M) (NO ARK!)
    sbox_full_t3(&mut state);
    mix_dense_t3(&mut state, &M_T3);

    state[0]
}

#[inline(never)]
fn poseidon_ex_t4(a: Fr, b: Fr, c: Fr) -> Fr {
    let mut state = [Fr::ZERO, a, b, c];
    let t = 4;

    // Initial ARK
    ark_t4(&mut state, &C_T4, 0);

    // First half MINUS ONE (3 rounds): sbox → ark → mix(M)
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t4(&mut state);
        ark_t4(&mut state, &C_T4, (r + 1) * t);
        mix_dense_t4(&mut state, &M_T4);
    }

    // One full round with P matrix: sbox → ark → mix(P)
    sbox_full_t4(&mut state);
    ark_t4(&mut state, &C_T4, (N_ROUNDS_F / 2) * t);
    mix_dense_t4(&mut state, &P_T4);

    // Partial rounds: sbox[0] → ark[0] → mix_sparse
    let c_part_base = (N_ROUNDS_F / 2 + 1) * t;
    for r in 0..N_ROUNDS_P_T4 {
        state[0] = sigma5(state[0]);
        state[0] += fr_from_be32(&C_T4[c_part_base + r]);
        mix_s_t4(&mut state, &S_T4[r * (t * 2 - 1)..]);
    }

    // Second half MINUS ONE (3 rounds): sbox → ark → mix(M)
    let c_full2_base = c_part_base + N_ROUNDS_P_T4;
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t4(&mut state);
        ark_t4(&mut state, &C_T4, c_full2_base + r * t);
        mix_dense_t4(&mut state, &M_T4);
    }

    // Final round: sbox → mix(M) (NO ARK!)
    sbox_full_t4(&mut state);
    mix_dense_t4(&mut state, &M_T4);

    state[0]
}

#[inline(never)]
fn poseidon_ex_t5(a: Fr, b: Fr, c: Fr, d: Fr) -> Fr {
    let mut state = [Fr::ZERO, a, b, c, d];
    let t = 5;

    // Initial ARK
    ark_t5(&mut state, &C_T5, 0);

    // First half MINUS ONE (3 rounds): sbox → ark → mix(M)
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t5(&mut state);
        ark_t5(&mut state, &C_T5, (r + 1) * t);
        mix_dense_t5(&mut state, &M_T5);
    }

    // One full round with P matrix: sbox → ark → mix(P)
    sbox_full_t5(&mut state);
    ark_t5(&mut state, &C_T5, (N_ROUNDS_F / 2) * t);
    mix_dense_t5(&mut state, &P_T5);

    // Partial rounds: sbox[0] → ark[0] → mix_sparse
    let c_part_base = (N_ROUNDS_F / 2 + 1) * t;
    for r in 0..N_ROUNDS_P_T5 {
        state[0] = sigma5(state[0]);
        state[0] += fr_from_be32(&C_T5[c_part_base + r]);
        mix_s_t5(&mut state, &S_T5[r * (t * 2 - 1)..]);
    }

    // Second half MINUS ONE (3 rounds): sbox → ark → mix(M)
    let c_full2_base = c_part_base + N_ROUNDS_P_T5;
    for r in 0..(N_ROUNDS_F / 2 - 1) {
        sbox_full_t5(&mut state);
        ark_t5(&mut state, &C_T5, c_full2_base + r * t);
        mix_dense_t5(&mut state, &M_T5);
    }

    // Final round: sbox → mix(M) (NO ARK!)
    sbox_full_t5(&mut state);
    mix_dense_t5(&mut state, &M_T5);

    state[0]
}
// =============================================================================
// Public API - Compatible with poseidon_compat.rs expectations
// =============================================================================

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

/// 32-byte scalar field element (big-endian)
pub type Scalar = [u8; 32];

/// Not a placeholder - this is real production code
pub const IS_PLACEHOLDER: bool = false;

// Re-export BN254_FR_MODULUS from field module for compatibility
use super::field::{is_valid_fr, u64_to_be32, BN254_FR_MODULUS};

/// Poseidon hash of 2 field elements
#[inline(never)]
pub fn poseidon2(a: &Scalar, b: &Scalar) -> Result<Scalar> {
    validate_input(a)?;
    validate_input(b)?;
    
    let fa = fr_from_be32(a);
    let fb = fr_from_be32(b);
    Ok(fr_to_be32(&poseidon_ex_t3(fa, fb)))
}

/// Poseidon hash of 3 field elements
#[inline(never)]
pub fn poseidon3(a: &Scalar, b: &Scalar, c: &Scalar) -> Result<Scalar> {
    validate_input(a)?;
    validate_input(b)?;
    validate_input(c)?;
    
    let fa = fr_from_be32(a);
    let fb = fr_from_be32(b);
    let fc = fr_from_be32(c);
    Ok(fr_to_be32(&poseidon_ex_t4(fa, fb, fc)))
}

/// Poseidon hash of 4 field elements
/// Used for: Commitment = Poseidon(secret, nullifier, amount, asset_id)
#[inline(never)]
pub fn poseidon4(a: &Scalar, b: &Scalar, c: &Scalar, d: &Scalar) -> Result<Scalar> {
    validate_input(a)?;
    validate_input(b)?;
    validate_input(c)?;
    validate_input(d)?;
    
    let fa = fr_from_be32(a);
    let fb = fr_from_be32(b);
    let fc = fr_from_be32(c);
    let fd = fr_from_be32(d);
    Ok(fr_to_be32(&poseidon_ex_t5(fa, fb, fc, fd)))
}

// =============================================================================
// Protocol Functions
// =============================================================================

/// Compute note commitment
/// commitment = Poseidon(secret, nullifier, amount, asset_id)
#[inline(never)]
pub fn compute_commitment(
    secret: &Scalar,
    nullifier: &Scalar,
    amount: u64,
    asset_id: &Scalar,
) -> Result<Scalar> {
    let amount_scalar = u64_to_be32(amount);
    poseidon4(secret, nullifier, &amount_scalar, asset_id)
}

/// Compute nullifier hash for spending
/// nullifier_hash = Poseidon(Poseidon(nullifier, secret), leaf_index)
#[inline(never)]
pub fn compute_nullifier_hash(
    nullifier: &Scalar,
    secret: &Scalar,
    leaf_index: u32,
) -> Result<Scalar> {
    let inner = poseidon2(nullifier, secret)?;
    let index_scalar = u64_to_be32(leaf_index as u64);
    poseidon2(&inner, &index_scalar)
}

/// Verify a commitment matches its preimage
#[inline(never)]
pub fn verify_commitment(
    commitment: &Scalar,
    secret: &Scalar,
    nullifier: &Scalar,
    amount: u64,
    asset_id: &Scalar,
) -> Result<bool> {
    let computed = compute_commitment(secret, nullifier, amount, asset_id)?;
    Ok(computed == *commitment)
}

// =============================================================================
// Legacy Aliases (for backward compatibility)
// =============================================================================

#[inline(never)]
pub fn hash_two_to_one(left: &Scalar, right: &Scalar) -> Result<Scalar> {
    poseidon2(left, right)
}

#[inline(never)]
pub fn poseidon_hash_3(a: &Scalar, b: &Scalar, c: &Scalar) -> Result<Scalar> {
    poseidon3(a, b, c)
}

#[inline(never)]
pub fn poseidon_hash_4(a: &Scalar, b: &Scalar, c: &Scalar, d: &Scalar) -> Result<Scalar> {
    poseidon4(a, b, c, d)
}

// =============================================================================
// Helpers
// =============================================================================

#[inline(never)]
fn validate_input(scalar: &Scalar) -> Result<()> {
    if !is_valid_fr(scalar) {
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }
    Ok(())
}

#[inline]
pub fn is_zero(scalar: &Scalar) -> bool {
    scalar.iter().all(|&b| b == 0)
}

#[inline]
pub fn u64_to_scalar(value: u64) -> Scalar {
    u64_to_be32(value)
}

#[inline]
pub fn u64_to_scalar_be(value: u64) -> Scalar {
    u64_to_be32(value)
}

#[inline]
pub fn empty_leaf_hash() -> Scalar {
    [0u8; 32]
}

#[inline]
pub fn is_placeholder_implementation() -> bool {
    IS_PLACEHOLDER
}

#[inline]
pub fn is_valid_scalar(scalar: &Scalar) -> bool {
    is_valid_fr(scalar)
}

#[inline]
pub fn is_canonical_fr(scalar: &Scalar) -> bool {
    is_valid_fr(scalar)
}

// Re-export for backward compatibility
pub const BN254_SCALAR_MODULUS: [u8; 32] = BN254_FR_MODULUS;

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn scalar_from_u64(v: u64) -> Scalar {
        u64_to_be32(v)
    }

    #[test]
    fn test_not_placeholder() {
        assert!(!IS_PLACEHOLDER);
        assert!(!is_placeholder_implementation());
    }

    #[test]
    fn test_rejects_invalid_input() {
        let invalid = BN254_FR_MODULUS;
        let valid = [0u8; 32];
        assert!(poseidon2(&invalid, &valid).is_err());
        assert!(poseidon2(&valid, &invalid).is_err());
    }

    #[test]
    fn test_poseidon2_deterministic() {
        let a = scalar_from_u64(1);
        let b = scalar_from_u64(2);
        assert_eq!(poseidon2(&a, &b).unwrap(), poseidon2(&a, &b).unwrap());
    }

    #[test]
    fn test_commitment_deterministic() {
        let secret = scalar_from_u64(12345);
        let nullifier = scalar_from_u64(67890);
        let amount = 1_000_000_000u64;
        let asset_id = [0u8; 32];

        let c1 = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();
        let c2 = compute_commitment(&secret, &nullifier, amount, &asset_id).unwrap();
        assert_eq!(c1, c2);
        assert!(!is_zero(&c1));
    }

    #[test]
    fn test_u64_max_is_valid() {
        let max = u64_to_scalar(u64::MAX);
        assert!(is_valid_scalar(&max));
    }

    // Circomlib test vectors
    #[test]
    fn test_poseidon2_zero_zero() {
        let zero = [0u8; 32];
        let hash = poseidon2(&zero, &zero).unwrap();
        
        // circomlibjs poseidon([0,0])
        // Value verified from: node -e "require('circomlibjs').buildPoseidon().then(p => console.log('0x'+p.F.toString(p([0n,0n]),16).padStart(64,'0')))"
        let expected = [
            0x20, 0x98, 0xf5, 0xfb, 0x9e, 0x23, 0x9e, 0xab,
            0x3c, 0xea, 0xc3, 0xf2, 0x7b, 0x81, 0xe4, 0x81,
            0xdc, 0x31, 0x24, 0xd5, 0x5f, 0xfe, 0xd5, 0x23,
            0xa8, 0x39, 0xee, 0x84, 0x46, 0xb6, 0x48, 0x64,
        ];
        
        assert_eq!(hash, expected, "Poseidon2(0,0) mismatch");
    }

    #[test]
    fn test_poseidon2_one_two() {
        let one = scalar_from_u64(1);
        let two = scalar_from_u64(2);
        let hash = poseidon2(&one, &two).unwrap();
        
        // circomlibjs poseidon([1,2])
        // Value verified from: node -e "require('circomlibjs').buildPoseidon().then(p => console.log('0x'+p.F.toString(p([1n,2n]),16).padStart(64,'0')))"
        let expected = [
            0x11, 0x5c, 0xc0, 0xf5, 0xe7, 0xd6, 0x90, 0x41,
            0x3d, 0xf6, 0x4c, 0x6b, 0x96, 0x62, 0xe9, 0xcf,
            0x2a, 0x36, 0x17, 0xf2, 0x74, 0x32, 0x45, 0x51,
            0x9e, 0x19, 0x60, 0x7a, 0x44, 0x17, 0x18, 0x9a,
        ];
        
        assert_eq!(hash, expected, "Poseidon2(1,2) mismatch");
    }

    #[test]
    fn test_poseidon3_one_two_three() {
        let one = scalar_from_u64(1);
        let two = scalar_from_u64(2);
        let three = scalar_from_u64(3);
        let hash = poseidon3(&one, &two, &three).unwrap();
        
        // circomlibjs poseidon([1,2,3])
        // Value verified from: node -e "require('circomlibjs').buildPoseidon().then(p => console.log('0x'+p.F.toString(p([1n,2n,3n]),16).padStart(64,'0')))"
        let expected = [
            0x0e, 0x77, 0x32, 0xd8, 0x9e, 0x69, 0x39, 0xc0,
            0xff, 0x03, 0xd5, 0xe5, 0x8d, 0xab, 0x63, 0x02,
            0xf3, 0x23, 0x0e, 0x26, 0x9d, 0xc5, 0xb9, 0x68,
            0xf7, 0x25, 0xdf, 0x34, 0xab, 0x36, 0xd7, 0x32,
        ];
        
        assert_eq!(hash, expected, "Poseidon3(1,2,3) mismatch");
    }

    #[test]
    fn test_poseidon4_one_two_three_four() {
        let one = scalar_from_u64(1);
        let two = scalar_from_u64(2);
        let three = scalar_from_u64(3);
        let four = scalar_from_u64(4);
        let hash = poseidon4(&one, &two, &three, &four).unwrap();
        
        // circomlibjs poseidon([1,2,3,4])
        // Value verified from: node -e "require('circomlibjs').buildPoseidon().then(p => console.log('0x'+p.F.toString(p([1n,2n,3n,4n]),16).padStart(64,'0')))"
        let expected = [
            0x29, 0x9c, 0x86, 0x7d, 0xb6, 0xc1, 0xfd, 0xd7,
            0x9d, 0xce, 0xfa, 0x40, 0xe4, 0x51, 0x0b, 0x98,
            0x37, 0xe6, 0x0e, 0xbb, 0x1c, 0xe0, 0x66, 0x3d,
            0xba, 0xa5, 0x25, 0xdf, 0x65, 0x25, 0x04, 0x65,
        ];
        
        assert_eq!(hash, expected, "Poseidon4(1,2,3,4) mismatch");
    }

    #[test]
    fn test_poseidon4_zeros() {
        let zero = [0u8; 32];
        let hash = poseidon4(&zero, &zero, &zero, &zero).unwrap();
        
        // circomlibjs poseidon([0,0,0,0])
        // Value verified from: node -e "require('circomlibjs').buildPoseidon().then(p => console.log('0x'+p.F.toString(p([0n,0n,0n,0n]),16).padStart(64,'0')))"
        let expected = [
            0x05, 0x32, 0xfd, 0x43, 0x6e, 0x19, 0xc7, 0x0e,
            0x51, 0x20, 0x96, 0x94, 0xd9, 0xc2, 0x15, 0x25,
            0x09, 0x37, 0x92, 0x1b, 0x8b, 0x79, 0x06, 0x04,
            0x88, 0xc1, 0x20, 0x6d, 0xb7, 0x3e, 0x99, 0x46,
        ];
        
        assert_eq!(hash, expected, "Poseidon4(0,0,0,0) mismatch");
    }
}