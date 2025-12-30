//! Poseidon Hash for pSOL v2 - PLACEHOLDER using simple hash

use anchor_lang::prelude::*;

pub type ScalarField = [u8; 32];

pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

pub const IS_PLACEHOLDER: bool = true;

fn simple_hash(data: &[u8]) -> [u8; 32] {
    let mut hash = [0u8; 32];
    for (i, chunk) in data.chunks(32).enumerate() {
        for (j, &byte) in chunk.iter().enumerate() {
            if j < 32 {
                hash[j] ^= byte.wrapping_add(i as u8);
            }
        }
    }
    hash
}

pub fn hash_two_to_one(left: &ScalarField, right: &ScalarField) -> Result<ScalarField> {
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(left);
    data.extend_from_slice(right);
    Ok(simple_hash(&data))
}

pub fn poseidon_hash_3(a: &ScalarField, b: &ScalarField, c: &ScalarField) -> Result<ScalarField> {
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(a);
    data.extend_from_slice(b);
    data.extend_from_slice(c);
    Ok(simple_hash(&data))
}

pub fn poseidon_hash_4(input0: &ScalarField, input1: &ScalarField, input2: &ScalarField, input3: &ScalarField) -> Result<ScalarField> {
    let mut data = Vec::with_capacity(128);
    data.extend_from_slice(input0);
    data.extend_from_slice(input1);
    data.extend_from_slice(input2);
    data.extend_from_slice(input3);
    Ok(simple_hash(&data))
}

pub fn poseidon_hash(inputs: &[ScalarField]) -> Result<ScalarField> {
    let mut data = Vec::with_capacity(inputs.len() * 32);
    for input in inputs {
        data.extend_from_slice(input);
    }
    Ok(simple_hash(&data))
}

pub fn compute_commitment(secret: &ScalarField, nullifier: &ScalarField, amount: u64, asset_id: &ScalarField) -> Result<ScalarField> {
    let amount_scalar = u64_to_scalar_be(amount);
    poseidon_hash_4(secret, nullifier, &amount_scalar, asset_id)
}

pub fn compute_nullifier_hash(nullifier: &ScalarField, secret: &ScalarField, leaf_index: u32) -> Result<ScalarField> {
    let index_scalar = u64_to_scalar_be(leaf_index as u64);
    let inner = hash_two_to_one(nullifier, secret)?;
    hash_two_to_one(&inner, &index_scalar)
}

pub fn verify_commitment(commitment: &ScalarField, secret: &ScalarField, nullifier: &ScalarField, amount: u64, asset_id: &ScalarField) -> Result<bool> {
    let computed = compute_commitment(secret, nullifier, amount, asset_id)?;
    Ok(computed == *commitment)
}

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

#[inline]
pub fn is_placeholder_implementation() -> bool { IS_PLACEHOLDER }

pub fn is_valid_scalar(_scalar: &ScalarField) -> bool { true }

pub fn reduce_scalar(scalar: &ScalarField) -> ScalarField { *scalar }
