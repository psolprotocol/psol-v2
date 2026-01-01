//! BN254 Elliptic Curve Utilities for pSOL v2

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

use super::alt_bn128_syscalls;

pub type G1Point = [u8; 64];
pub type G2Point = [u8; 128];
pub type ScalarField = [u8; 32];
pub type PairingElement = [u8; 192];

pub const G1_IDENTITY: G1Point = [0u8; 64];
pub const G2_IDENTITY: G2Point = [0u8; 128];
pub const G1_GENERATOR: G1Point = [
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
];
pub const BN254_FIELD_MODULUS: [u8; 32] = [
    0x30,0x64,0x4e,0x72,0xe1,0x31,0xa0,0x29,0xb8,0x50,0x45,0xb6,0x81,0x81,0x58,0x5d,
    0x97,0x81,0x6a,0x91,0x68,0x71,0xca,0x8d,0x3c,0x20,0x8c,0x16,0xd8,0x7c,0xfd,0x47,
];
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30,0x64,0x4e,0x72,0xe1,0x31,0xa0,0x29,0xb8,0x50,0x45,0xb6,0x81,0x81,0x58,0x5d,
    0x28,0x33,0xe8,0x48,0x79,0xb9,0x70,0x91,0x43,0xe1,0xf5,0x93,0xf0,0x00,0x00,0x01,
];

#[inline] pub fn is_g1_identity(p: &G1Point) -> bool { p.iter().all(|&b| b == 0) }
#[inline] pub fn is_g2_identity(p: &G2Point) -> bool { p.iter().all(|&b| b == 0) }

pub fn validate_g1_point(point: &G1Point) -> Result<()> {
    if is_g1_identity(point) { return Ok(()); }
    // Validation trick: syscall will error on invalid point encoding.
    // We add the point to itself (requires a syscall; avoids the identity early-return path).
    let _ = alt_bn128_syscalls::g1_add(point, point)?;
    Ok(())
}
pub fn validate_g2_point(_: &G2Point) -> Result<()> { Ok(()) }
pub fn validate_g2_point_allow_identity(_: &G2Point) -> Result<()> { Ok(()) }

pub fn negate_g1(point: &G1Point) -> Result<G1Point> {
    if is_g1_identity(point) { return Ok(G1_IDENTITY); }
    let mut result = *point;
    let mut y = [0u8; 32];
    y.copy_from_slice(&point[32..64]);
    // y = (-y mod p). IMPORTANT: if y == 0, result must be 0 (not p).
    if y.iter().all(|&b| b == 0) {
        result[32..64].copy_from_slice(&[0u8; 32]);
    } else {
        result[32..64].copy_from_slice(&field_subtract(&BN254_FIELD_MODULUS, &y));
    }
    Ok(result)
}

pub fn g1_add(a: &G1Point, b: &G1Point) -> Result<G1Point> {
    if is_g1_identity(a) { return Ok(*b); }
    if is_g1_identity(b) { return Ok(*a); }
    alt_bn128_syscalls::g1_add(a, b)
}

pub fn g1_scalar_mul(point: &G1Point, scalar: &ScalarField) -> Result<G1Point> {
    if is_g1_identity(point) || scalar.iter().all(|&b| b == 0) { return Ok(G1_IDENTITY); }
    alt_bn128_syscalls::g1_mul(point, scalar)
}

pub fn is_valid_scalar(s: &ScalarField) -> bool {
    for i in 0..32 {
        if s[i] < BN254_SCALAR_MODULUS[i] { return true; }
        if s[i] > BN254_SCALAR_MODULUS[i] { return false; }
    }
    false
}

pub fn u64_to_scalar(v: u64) -> ScalarField {
    let mut s = [0u8; 32];
    s[24..32].copy_from_slice(&v.to_be_bytes());
    s
}

pub fn i64_to_scalar(v: i64) -> ScalarField {
    if v >= 0 { u64_to_scalar(v as u64) }
    else { field_subtract(&BN254_SCALAR_MODULUS, &u64_to_scalar(if v == i64::MIN { (i64::MAX as u64)+1 } else { (-v) as u64 })) }
}

pub fn pubkey_to_scalar(pk: &Pubkey) -> ScalarField {
    let mut s = [0u8; 32];
    s[1..32].copy_from_slice(&pk.to_bytes()[0..31]);
    s
}

pub fn make_pairing_element(g1: &G1Point, g2: &G2Point) -> PairingElement {
    let mut e = [0u8; 192];
    e[0..64].copy_from_slice(g1);
    e[64..192].copy_from_slice(g2);
    e
}

pub fn verify_pairing(elements: &[PairingElement]) -> Result<bool> {
    // Allocation-free fast-path for the only arity we use (Groth16 uses 4 pairs).
    if elements.len() != 4 {
        msg!("Unsupported pairing arity: expected 4, got {}", elements.len());
        return Err(PrivacyErrorV2::CryptographyError.into());
    }
    let pairs: &[PairingElement; 4] = elements.try_into().map_err(|_| PrivacyErrorV2::CryptographyError)?;
    alt_bn128_syscalls::pairing_check_4(pairs)
}

pub fn compute_vk_x(ic: &[[u8; 64]], inputs: &[[u8; 32]]) -> Result<G1Point> {
    if ic.len() != inputs.len() + 1 { return Err(PrivacyErrorV2::InvalidPublicInputs.into()); }
    let mut vk_x = ic[0];
    for (inp, icp) in inputs.iter().zip(ic.iter().skip(1)) {
        vk_x = g1_add(&vk_x, &g1_scalar_mul(icp, inp)?)?;
    }
    Ok(vk_x)
}

fn field_subtract(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut r = [0u8; 32];
    let mut borrow: u16 = 0;
    for i in (0..32).rev() {
        let d = (a[i] as u16).wrapping_sub(b[i] as u16).wrapping_sub(borrow);
        r[i] = d as u8;
        borrow = if d > 255 { 1 } else { 0 };
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn test_identity() { assert!(is_g1_identity(&G1_IDENTITY)); }
    #[test] fn test_scalar() { assert_eq!(u64_to_scalar(42)[31], 42); }
}
