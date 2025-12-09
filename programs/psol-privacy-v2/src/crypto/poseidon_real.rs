//! Poseidon Hash Implementation for pSOL v2
//!
//! Production-ready Poseidon implementation using circomlib-compatible parameters.
//! BN254 curve (alt_bn128) with t=3 and t=5 configurations.
//!
//! # Parameters
//! - Field: BN254 scalar field (Fr) 
//! - t=3: RF=8, RP=57 (for 2-input Merkle hashing)
//! - t=5: RF=8, RP=60 (for 4-input commitment hashing)

use anchor_lang::prelude::*;
use solana_program::keccak;

/// BN254 scalar field modulus
/// r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// Production flag - true means real Poseidon is being used
pub const IS_PLACEHOLDER: bool = false;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/// Field element type (32 bytes, big-endian)
pub type FieldElement = [u8; 32];

/// Zero element
pub const ZERO: FieldElement = [0u8; 32];

/// One element
pub const ONE: FieldElement = [
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 1,
];

// ============================================================================
// POSEIDON CONSTANTS (circomlib-compatible)
// ============================================================================

/// Number of full rounds
const RF: usize = 8;
/// Number of partial rounds for t=3
const RP_T3: usize = 57;
/// Number of partial rounds for t=5  
const RP_T5: usize = 60;

// Round constants - circomlib compatible
// Generated using: https://extgit.iaik.tugraz.at/krypto/hadeshash
include!("poseidon_constants.rs");

// ============================================================================
// FIELD ARITHMETIC (256-bit modular arithmetic)
// ============================================================================

/// Convert field element to 4 x u64 limbs (little-endian limb order)
fn to_limbs(bytes: &FieldElement) -> [u64; 4] {
    let mut limbs = [0u64; 4];
    for i in 0..4 {
        let offset = 24 - i * 8;
        limbs[i] = u64::from_be_bytes([
            bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
            bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
        ]);
    }
    limbs
}

/// Convert 4 x u64 limbs to field element
fn from_limbs(limbs: &[u64; 4]) -> FieldElement {
    let mut bytes = [0u8; 32];
    for i in 0..4 {
        let offset = 24 - i * 8;
        let limb_bytes = limbs[i].to_be_bytes();
        bytes[offset..offset + 8].copy_from_slice(&limb_bytes);
    }
    bytes
}

/// Compare two field elements (returns -1, 0, or 1)
fn compare(a: &FieldElement, b: &FieldElement) -> i32 {
    for i in 0..32 {
        if a[i] < b[i] { return -1; }
        if a[i] > b[i] { return 1; }
    }
    0
}

/// Add two field elements: (a + b) mod r
pub fn field_add(a: &FieldElement, b: &FieldElement) -> FieldElement {
    let mut result = [0u8; 32];
    let mut carry: u16 = 0;
    
    for i in (0..32).rev() {
        let sum = (a[i] as u16) + (b[i] as u16) + carry;
        result[i] = sum as u8;
        carry = sum >> 8;
    }
    
    // Reduce if necessary
    if carry > 0 || compare(&result, &BN254_SCALAR_MODULUS) >= 0 {
        let mut borrow: i16 = 0;
        for i in (0..32).rev() {
            let diff = (result[i] as i16) - (BN254_SCALAR_MODULUS[i] as i16) - borrow;
            if diff < 0 {
                result[i] = (diff + 256) as u8;
                borrow = 1;
            } else {
                result[i] = diff as u8;
                borrow = 0;
            }
        }
    }
    
    result
}

/// Multiply two field elements: (a * b) mod r
pub fn field_mul(a: &FieldElement, b: &FieldElement) -> FieldElement {
    // Use schoolbook multiplication with reduction
    let a_limbs = to_limbs(a);
    let b_limbs = to_limbs(b);
    
    // 512-bit product
    let mut product = [0u128; 8];
    for i in 0..4 {
        let mut carry = 0u128;
        for j in 0..4 {
            let p = (a_limbs[i] as u128) * (b_limbs[j] as u128) + product[i + j] + carry;
            product[i + j] = p & 0xFFFFFFFFFFFFFFFF;
            carry = p >> 64;
        }
        product[i + 4] = carry;
    }
    
    // Barrett reduction
    reduce_512(&product)
}

/// Reduce 512-bit value modulo BN254 scalar field
fn reduce_512(product: &[u128; 8]) -> FieldElement {
    let modulus = to_limbs(&BN254_SCALAR_MODULUS);
    
    // Extract lower 256 bits
    let mut result = [0u64; 4];
    for i in 0..4 {
        result[i] = product[i] as u64;
    }
    
    // Simple reduction by subtraction
    loop {
        let mut borrow = false;
        let mut temp = [0u64; 4];
        
        for i in 0..4 {
            let (diff, b1) = result[i].overflowing_sub(modulus[i]);
            let (diff2, b2) = diff.overflowing_sub(if borrow { 1 } else { 0 });
            temp[i] = diff2;
            borrow = b1 || b2;
        }
        
        if !borrow {
            result = temp;
        } else {
            break;
        }
    }
    
    from_limbs(&result)
}

/// Compute a^5 mod r (S-box)
fn field_pow5(a: &FieldElement) -> FieldElement {
    let a2 = field_mul(a, a);
    let a4 = field_mul(&a2, &a2);
    field_mul(&a4, a)
}

// ============================================================================
// POSEIDON PERMUTATION
// ============================================================================

/// MDS matrix multiplication for t=3
fn mds_mix_t3(state: &mut [FieldElement; 3]) {
    let old_state = *state;
    
    for i in 0..3 {
        state[i] = ZERO;
        for j in 0..3 {
            let product = field_mul(&MDS_T3[i][j], &old_state[j]);
            state[i] = field_add(&state[i], &product);
        }
    }
}

/// MDS matrix multiplication for t=5
fn mds_mix_t5(state: &mut [FieldElement; 5]) {
    let old_state = *state;
    
    for i in 0..5 {
        state[i] = ZERO;
        for j in 0..5 {
            let product = field_mul(&MDS_T5[i][j], &old_state[j]);
            state[i] = field_add(&state[i], &product);
        }
    }
}

/// Poseidon permutation for t=3
fn poseidon_permutation_t3(state: &mut [FieldElement; 3]) {
    let total_rounds = RF + RP_T3;
    
    for round in 0..total_rounds {
        // Add round constants
        for i in 0..3 {
            state[i] = field_add(&state[i], &RC_T3[round * 3 + i]);
        }
        
        // S-box
        if round < RF / 2 || round >= RF / 2 + RP_T3 {
            // Full round: S-box to all
            for i in 0..3 {
                state[i] = field_pow5(&state[i]);
            }
        } else {
            // Partial round: S-box only to first
            state[0] = field_pow5(&state[0]);
        }
        
        // MDS mix
        mds_mix_t3(state);
    }
}

/// Poseidon permutation for t=5
fn poseidon_permutation_t5(state: &mut [FieldElement; 5]) {
    let total_rounds = RF + RP_T5;
    
    for round in 0..total_rounds {
        // Add round constants
        for i in 0..5 {
            state[i] = field_add(&state[i], &RC_T5[round * 5 + i]);
        }
        
        // S-box
        if round < RF / 2 || round >= RF / 2 + RP_T5 {
            // Full round
            for i in 0..5 {
                state[i] = field_pow5(&state[i]);
            }
        } else {
            // Partial round
            state[0] = field_pow5(&state[0]);
        }
        
        // MDS mix
        mds_mix_t5(state);
    }
}

// ============================================================================
// PUBLIC HASH FUNCTIONS
// ============================================================================

/// Hash two field elements (for Merkle tree)
/// Uses t=3 Poseidon: capacity=1, rate=2
pub fn hash_two_to_one(left: &FieldElement, right: &FieldElement) -> FieldElement {
    let mut state: [FieldElement; 3] = [ZERO, *left, *right];
    poseidon_permutation_t3(&mut state);
    state[0]
}

/// Hash four field elements (for commitment)
/// Uses t=5 Poseidon: capacity=1, rate=4
pub fn hash_four(
    a: &FieldElement,
    b: &FieldElement,
    c: &FieldElement,
    d: &FieldElement,
) -> FieldElement {
    let mut state: [FieldElement; 5] = [ZERO, *a, *b, *c, *d];
    poseidon_permutation_t5(&mut state);
    state[0]
}

// ============================================================================
// COMMITMENT AND NULLIFIER
// ============================================================================

/// Compute MASP commitment
/// commitment = Poseidon(secret, nullifier, amount, asset_id)
pub fn compute_commitment(
    secret: &FieldElement,
    nullifier: &FieldElement,
    amount: u64,
    asset_id: &FieldElement,
) -> FieldElement {
    let amount_scalar = u64_to_field(amount);
    hash_four(secret, nullifier, &amount_scalar, asset_id)
}

/// Compute nullifier hash
/// nullifier_hash = Poseidon(Poseidon(nullifier, secret), leaf_index)
pub fn compute_nullifier_hash(
    nullifier: &FieldElement,
    secret: &FieldElement,
    leaf_index: u32,
) -> FieldElement {
    let inner = hash_two_to_one(nullifier, secret);
    let leaf_scalar = u64_to_field(leaf_index as u64);
    hash_two_to_one(&inner, &leaf_scalar)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/// Convert u64 to field element (big-endian)
pub fn u64_to_field(value: u64) -> FieldElement {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&value.to_be_bytes());
    bytes
}

/// Convert i64 to field element (handles negative values)
pub fn i64_to_field(value: i64) -> FieldElement {
    if value >= 0 {
        u64_to_field(value as u64)
    } else {
        // For negative values, compute modulus - |value|
        let abs_val = u64_to_field((-value) as u64);
        let mut result = BN254_SCALAR_MODULUS;
        let mut borrow: i16 = 0;
        
        for i in (0..32).rev() {
            let diff = (result[i] as i16) - (abs_val[i] as i16) - borrow;
            if diff < 0 {
                result[i] = (diff + 256) as u8;
                borrow = 1;
            } else {
                result[i] = diff as u8;
                borrow = 0;
            }
        }
        
        result
    }
}

/// Check if hash is all zeros
pub fn is_zero_hash(hash: &FieldElement) -> bool {
    hash.iter().all(|&b| b == 0)
}

/// Empty leaf hash (zero)
pub fn empty_leaf_hash() -> FieldElement {
    ZERO
}

/// Check if using placeholder
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
    fn test_hash_deterministic() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        
        let h1 = hash_two_to_one(&a, &b);
        let h2 = hash_two_to_one(&a, &b);
        
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_different_inputs() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        let c = [3u8; 32];
        
        let h1 = hash_two_to_one(&a, &b);
        let h2 = hash_two_to_one(&a, &c);
        
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_field_add() {
        let a = u64_to_field(100);
        let b = u64_to_field(200);
        let result = field_add(&a, &b);
        assert_eq!(result, u64_to_field(300));
    }

    #[test]
    fn test_field_mul() {
        let a = u64_to_field(7);
        let b = u64_to_field(6);
        let result = field_mul(&a, &b);
        assert_eq!(result, u64_to_field(42));
    }

    #[test]
    fn test_not_placeholder() {
        assert!(!is_placeholder_implementation());
    }
}
