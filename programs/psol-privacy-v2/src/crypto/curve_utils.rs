//! BN254 Elliptic Curve Utilities for pSOL v2
//!
//! Provides curve operations using Solana's alt_bn128 precompiles.

use anchor_lang::prelude::*;
use solana_program::alt_bn128::prelude::*;

use crate::error::PrivacyErrorV2;

// ============================================================================
// TYPE ALIASES
// ============================================================================

/// G1 point in uncompressed format (64 bytes)
pub type G1Point = [u8; 64];

/// G2 point in uncompressed format (128 bytes)  
pub type G2Point = [u8; 128];

/// Scalar field element (32 bytes)
pub type ScalarField = [u8; 32];

/// Pairing element for multi-pairing check
pub type PairingElement = [u8; 192]; // G1 (64) + G2 (128)

// ============================================================================
// CONSTANTS
// ============================================================================

/// G1 identity (point at infinity)
pub const G1_IDENTITY: G1Point = [0u8; 64];

/// G2 identity (point at infinity)
pub const G2_IDENTITY: G2Point = [0u8; 128];

/// G1 generator point
pub const G1_GENERATOR: G1Point = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
];

/// BN254 field modulus (p)
pub const BN254_FIELD_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// BN254 scalar field modulus (r)
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

// ============================================================================
// G1 OPERATIONS
// ============================================================================

/// Check if G1 point is identity (all zeros)
pub fn is_g1_identity(point: &G1Point) -> bool {
    point.iter().all(|&b| b == 0)
}

/// Validate G1 point is on curve
/// 
/// # Security
/// - Validates point is on the BN254 curve using the precompile
/// - For production, consider adding explicit subgroup checks
pub fn validate_g1_point(point: &G1Point) -> Result<()> {
    // Check for identity point (allowed)
    if is_g1_identity(point) {
        return Ok(());
    }
    
    // Validate coordinates are within field
    let x = &point[0..32];
    let y = &point[32..64];
    
    // x and y must be less than field modulus
    if !is_less_than_modulus(x, &BN254_FIELD_MODULUS) {
        msg!("G1 point x coordinate >= field modulus");
        return Err(error!(PrivacyErrorV2::InvalidProof));
    }
    if !is_less_than_modulus(y, &BN254_FIELD_MODULUS) {
        msg!("G1 point y coordinate >= field modulus");
        return Err(error!(PrivacyErrorV2::InvalidProof));
    }
    
    // Use alt_bn128 precompile for on-curve validation by attempting addition with identity
    let input = [point.as_slice(), &G1_IDENTITY].concat();
    
    alt_bn128_addition(&input)
        .map_err(|_| {
            msg!("G1 point is not on curve");
            error!(PrivacyErrorV2::InvalidProof)
        })?;
    
    Ok(())
}

/// Helper to check if bytes (big-endian) are less than modulus
fn is_less_than_modulus(bytes: &[u8], modulus: &[u8; 32]) -> bool {
    if bytes.len() != 32 {
        return false;
    }
    for i in 0..32 {
        if bytes[i] < modulus[i] {
            return true;
        }
        if bytes[i] > modulus[i] {
            return false;
        }
    }
    false // Equal to modulus = invalid
}

/// Negate G1 point
pub fn negate_g1(point: &G1Point) -> Result<G1Point> {
    if is_g1_identity(point) {
        return Ok(G1_IDENTITY);
    }

    let mut neg = *point;
    
    // Negate y coordinate: y' = p - y
    let y = &point[32..64];
    let mut y_neg = [0u8; 32];
    
    // Subtract y from field modulus
    let mut borrow = 0u16;
    for i in (0..32).rev() {
        let diff = (BN254_FIELD_MODULUS[i] as u16)
            .wrapping_sub(y[i] as u16)
            .wrapping_sub(borrow);
        y_neg[i] = diff as u8;
        borrow = if diff > 0xFF { 1 } else { 0 };
    }
    
    neg[32..64].copy_from_slice(&y_neg);
    Ok(neg)
}

/// Add two G1 points
pub fn g1_add(a: &G1Point, b: &G1Point) -> Result<G1Point> {
    let input = [a.as_slice(), b.as_slice()].concat();
    
    let result = alt_bn128_addition(&input)
        .map_err(|_| error!(PrivacyErrorV2::InvalidProof))?;
    
    let mut output = G1_IDENTITY;
    output.copy_from_slice(&result[..64]);
    Ok(output)
}

/// Scalar multiplication on G1
pub fn g1_scalar_mul(point: &G1Point, scalar: &ScalarField) -> Result<G1Point> {
    let input = [point.as_slice(), scalar.as_slice()].concat();
    
    let result = alt_bn128_multiplication(&input)
        .map_err(|_| error!(PrivacyErrorV2::InvalidProof))?;
    
    let mut output = G1_IDENTITY;
    output.copy_from_slice(&result[..64]);
    Ok(output)
}

// ============================================================================
// G2 OPERATIONS
// ============================================================================

/// Check if G2 point is identity
pub fn is_g2_identity(point: &G2Point) -> bool {
    point.iter().all(|&b| b == 0)
}

/// Validate G2 point (enhanced validation)
/// 
/// # Security
/// - Checks for non-zero (identity not allowed for most proof elements)
/// - Validates coordinates are within field
/// - Full on-curve validation happens in pairing
pub fn validate_g2_point(point: &G2Point) -> Result<()> {
    // G2 identity is typically not valid for proof elements
    if is_g2_identity(point) {
        msg!("G2 point is identity (invalid for proof elements)");
        return Err(error!(PrivacyErrorV2::InvalidProof));
    }
    
    // Validate all coordinate components are within field
    // G2 has 4 components of 32 bytes each (x_c0, x_c1, y_c0, y_c1)
    for i in 0..4 {
        let start = i * 32;
        let component = &point[start..start + 32];
        if !is_less_than_modulus(component, &BN254_FIELD_MODULUS) {
            msg!("G2 point component {} >= field modulus", i);
            return Err(error!(PrivacyErrorV2::InvalidProof));
        }
    }
    
    Ok(())
}

/// Validate G2 point allowing identity (for some VK elements)
pub fn validate_g2_point_allow_identity(point: &G2Point) -> Result<()> {
    if is_g2_identity(point) {
        return Ok(());
    }
    
    // Validate all coordinate components are within field
    for i in 0..4 {
        let start = i * 32;
        let component = &point[start..start + 32];
        if !is_less_than_modulus(component, &BN254_FIELD_MODULUS) {
            msg!("G2 point component {} >= field modulus", i);
            return Err(error!(PrivacyErrorV2::InvalidProof));
        }
    }
    
    Ok(())
}

// ============================================================================
// SCALAR OPERATIONS
// ============================================================================

/// Check if scalar is valid (< modulus)
pub fn is_valid_scalar(scalar: &ScalarField) -> bool {
    for i in 0..32 {
        if scalar[i] < BN254_SCALAR_MODULUS[i] {
            return true;
        }
        if scalar[i] > BN254_SCALAR_MODULUS[i] {
            return false;
        }
    }
    false // Equal to modulus = invalid
}

/// Convert u64 to scalar field element
pub fn u64_to_scalar(value: u64) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[24..32].copy_from_slice(&value.to_be_bytes());
    scalar
}

/// Convert i64 to scalar field element (handles negative via modular arithmetic)
/// 
/// # Security
/// - Handles i64::MIN edge case properly
/// - Uses modular reduction for negative values
pub fn i64_to_scalar(value: i64) -> ScalarField {
    if value >= 0 {
        u64_to_scalar(value as u64)
    } else {
        // Handle i64::MIN specially to avoid overflow on negation
        let abs_value = if value == i64::MIN {
            // i64::MIN absolute value is 2^63 which fits in u64
            (i64::MAX as u64) + 1
        } else {
            (-value) as u64
        };
        
        // Negative: compute r - |value| (where r is scalar field modulus)
        let mut scalar = BN254_SCALAR_MODULUS;
        
        let mut borrow = 0u16;
        let abs_bytes = abs_value.to_be_bytes();
        
        for i in (24..32).rev() {
            let diff = (scalar[i] as u16)
                .wrapping_sub(abs_bytes[i - 24] as u16)
                .wrapping_sub(borrow);
            scalar[i] = diff as u8;
            borrow = if diff > 0xFF { 1 } else { 0 };
        }
        
        // Propagate borrow
        for i in (0..24).rev() {
            if borrow == 0 {
                break;
            }
            let diff = (scalar[i] as u16).wrapping_sub(borrow);
            scalar[i] = diff as u8;
            borrow = if diff > 0xFF { 1 } else { 0 };
        }
        
        scalar
    }
}

/// Convert Pubkey to scalar (take first 31 bytes to ensure < modulus)
pub fn pubkey_to_scalar(pubkey: &Pubkey) -> ScalarField {
    let mut scalar = [0u8; 32];
    scalar[1..32].copy_from_slice(&pubkey.to_bytes()[0..31]);
    scalar
}

// ============================================================================
// PAIRING OPERATIONS
// ============================================================================

/// Create pairing element from G1 and G2 points
pub fn make_pairing_element(g1: &G1Point, g2: &G2Point) -> PairingElement {
    let mut element = [0u8; 192];
    element[..64].copy_from_slice(g1);
    element[64..].copy_from_slice(g2);
    element
}

/// Verify multi-pairing equation = 1 (identity)
pub fn verify_pairing(elements: &[PairingElement]) -> Result<bool> {
    if elements.is_empty() {
        return Ok(true);
    }

    let input: Vec<u8> = elements.iter().flat_map(|e| e.iter().copied()).collect();
    
    let result = alt_bn128_pairing(&input)
        .map_err(|_| error!(PrivacyErrorV2::InvalidProof))?;
    
    // Result is 1 (32-byte big-endian) if pairing product equals identity
    let is_valid = result[31] == 1 && result[..31].iter().all(|&b| b == 0);
    
    Ok(is_valid)
}

/// Compute vk_x = IC[0] + Σ(public_input[i] * IC[i+1])
pub fn compute_vk_x(ic: &[[u8; 64]], public_inputs: &[[u8; 32]]) -> Result<G1Point> {
    if ic.len() != public_inputs.len() + 1 {
        msg!(
            "IC length {} != public_inputs length {} + 1",
            ic.len(),
            public_inputs.len()
        );
        return Err(error!(PrivacyErrorV2::InvalidPublicInputs));
    }

    // Start with IC[0]
    let mut vk_x = ic[0];

    // Add each public_input[i] * IC[i+1]
    for (i, input) in public_inputs.iter().enumerate() {
        let ic_point = &ic[i + 1];
        
        // Compute input * IC[i+1]
        let product = g1_scalar_mul(ic_point, input)?;
        
        // Add to accumulator
        vk_x = g1_add(&vk_x, &product)?;
    }

    Ok(vk_x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_checks() {
        assert!(is_g1_identity(&G1_IDENTITY));
        assert!(is_g2_identity(&G2_IDENTITY));
        
        let non_zero = [1u8; 64];
        assert!(!is_g1_identity(&non_zero));
    }

    #[test]
    fn test_u64_to_scalar() {
        let scalar = u64_to_scalar(1000);
        assert_eq!(scalar[31], 0xe8); // 1000 = 0x3e8
        assert_eq!(scalar[30], 0x03);
    }

    #[test]
    fn test_i64_to_scalar_positive() {
        let pos = i64_to_scalar(100);
        let from_u64 = u64_to_scalar(100);
        assert_eq!(pos, from_u64);
    }
}
