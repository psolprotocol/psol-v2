//! Solana alt_bn128 (BN254) syscalls – minimal, allocation-free wrappers.
//!
//! This module is the *only* place that should touch the raw `sol_alt_bn128_group_op` syscall.
//! Everything else should call these wrappers to keep encoding rules and error handling consistent.
//!
//! Encoding:
//! - G1 points are 64 bytes: `[x (32 BE) || y (32 BE)]`, uncompressed.
//! - G2 points are 128 bytes: `[x_c0 (32 BE) || x_c1 (32 BE) || y_c0 (32 BE) || y_c1 (32 BE)]`, uncompressed.
//! - Scalars are 32 bytes BE (Fr), canonicality is enforced elsewhere (see `curve_utils::is_valid_scalar`).
//!
//! IMPORTANT:
//! - On non-Solana targets (host tests), these functions fail-closed with `CryptographyError`.
//!   Do NOT stub these to return success: it hides real issues and can invalidate tests.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;

use super::curve_utils::{G1Point, PairingElement, ScalarField};

// These are only referenced on-chain (`target_os = "solana"`).
#[allow(dead_code)]
const ALT_BN128_ADD: u64 = 0;
#[allow(dead_code)]
const ALT_BN128_MUL: u64 = 1;
#[allow(dead_code)]
const ALT_BN128_PAIRING: u64 = 2;

#[cfg(target_os = "solana")]
extern "C" {
    fn sol_alt_bn128_group_op(op: u64, input: *const u8, input_size: u64, result: *mut u8) -> u64;
}

#[inline(always)]
fn err_crypto() -> anchor_lang::error::Error {
    error!(PrivacyErrorV2::CryptographyError)
}

/// Add two G1 points using the Solana syscall.
///
/// Input/Output are uncompressed, big-endian coordinates.
pub fn g1_add(a: &G1Point, b: &G1Point) -> Result<G1Point> {
    let mut input = [0u8; 128];
    input[0..64].copy_from_slice(a);
    input[64..128].copy_from_slice(b);

    #[cfg(target_os = "solana")]
    {
        let mut out = [0u8; 64];
        let ret = unsafe {
            sol_alt_bn128_group_op(ALT_BN128_ADD, input.as_ptr(), input.len() as u64, out.as_mut_ptr())
        };
        if ret != 0 {
            return Err(err_crypto());
        }
        return Ok(out);
    }

    #[cfg(not(target_os = "solana"))]
    {
        let _ = input;
        Err(err_crypto())
    }
}

/// Multiply a G1 point by an Fr scalar using the Solana syscall.
pub fn g1_mul(point: &G1Point, scalar: &ScalarField) -> Result<G1Point> {
    let mut input = [0u8; 96];
    input[0..64].copy_from_slice(point);
    input[64..96].copy_from_slice(scalar);

    #[cfg(target_os = "solana")]
    {
        let mut out = [0u8; 64];
        let ret = unsafe {
            sol_alt_bn128_group_op(ALT_BN128_MUL, input.as_ptr(), input.len() as u64, out.as_mut_ptr())
        };
        if ret != 0 {
            return Err(err_crypto());
        }
        return Ok(out);
    }

    #[cfg(not(target_os = "solana"))]
    {
        let _ = input;
        Err(err_crypto())
    }
}

/// Perform an alt_bn128 pairing check over 4 pairs (allocation-free).
///
/// This is the only arity required by Groth16 verification here:
/// `e(-A,B) * e(alpha,beta) * e(vk_x,gamma) * e(C,delta) == 1`.
pub fn pairing_check_4(pairs: &[PairingElement; 4]) -> Result<bool> {
    let mut input = [0u8; 192 * 4];
    input[0..192].copy_from_slice(&pairs[0]);
    input[192..384].copy_from_slice(&pairs[1]);
    input[384..576].copy_from_slice(&pairs[2]);
    input[576..768].copy_from_slice(&pairs[3]);

    #[cfg(target_os = "solana")]
    {
        let mut out = [0u8; 32];
        let ret = unsafe {
            sol_alt_bn128_group_op(ALT_BN128_PAIRING, input.as_ptr(), input.len() as u64, out.as_mut_ptr())
        };
        if ret != 0 {
            return Err(err_crypto());
        }
        // Success is encoded as 0...01 (big-endian).
        let mut success = [0u8; 32];
        success[31] = 1;
        return Ok(out == success);
    }

    #[cfg(not(target_os = "solana"))]
    {
        let _ = input;
        Err(err_crypto())
    }
}

