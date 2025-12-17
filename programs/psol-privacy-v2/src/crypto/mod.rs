//! Cryptographic Primitives for pSOL Privacy Pool v2
//!
//! # Module Overview
//!
//! ## groth16_verifier
//! Production-ready Groth16 proof verification using Solana's alt_bn128 precompiles.
//!
//! ## poseidon
//! Hash functions for Merkle tree and commitment generation using Solana's Poseidon syscall.
//!
//! ## public_inputs
//! Public input encoding for different ZK circuits.
//!
//! ## curve_utils
//! BN254 elliptic curve operations.
//!
//! ## poseidon_constants / poseidon_constants_t3
//! Poseidon round constants (if needed for custom implementations).
//!
//! # Security Model
//! - All verification functions are fail-closed
//! - Invalid proofs are always rejected
//! - Curve points are validated before use
//! - Hash functions use syscalls for security and efficiency

pub mod curve_utils;
pub mod groth16_verifier;
pub mod poseidon;
#[cfg(feature = "poseidon-constants")]
pub mod poseidon_constants;
#[cfg(feature = "poseidon-constants")]
pub mod poseidon_constants_t3;
pub mod public_inputs;

// ============================================================================
// CURVE UTILITIES
// ============================================================================

pub use curve_utils::{
    // Point types
    G1Point, G2Point, PairingElement, ScalarField,
    
    // Constants
    G1_IDENTITY, G2_IDENTITY, G1_GENERATOR,
    BN254_FIELD_MODULUS, BN254_SCALAR_MODULUS,
    
    // G1 operations
    validate_g1_point, negate_g1, g1_add, g1_scalar_mul,
    is_g1_identity,
    
    // G2 operations
    validate_g2_point, validate_g2_point_allow_identity, is_g2_identity,
    
    // Scalar operations
    is_valid_scalar, u64_to_scalar, pubkey_to_scalar, i64_to_scalar,
    
    // Pairing operations
    verify_pairing, make_pairing_element, compute_vk_x,
};

// ============================================================================
// GROTH16 VERIFIER
// ============================================================================

pub use groth16_verifier::{
    verify_groth16_proof,
    verify_proof_bytes,
    Groth16Proof,
    PROOF_DATA_LEN,
    is_valid_proof_length,
};

// ============================================================================
// HASH FUNCTIONS (POSEIDON)
// ============================================================================

pub use poseidon::{
    // Core hash functions
    hash_two_to_one,
    poseidon_hash_3,
    poseidon_hash_4,
    poseidon_hash,
    
    // Commitment/Nullifier functions
    compute_commitment,
    compute_nullifier_hash,
    verify_commitment,
    
    // Scalar conversion utilities
    u64_to_scalar_be,
    u64_to_scalar_le,
    i64_to_scalar_be,
    u64_to_bytes32, // Alias for backward compatibility
    
    // Hash utilities
    is_zero_hash,
    empty_leaf_hash,
    is_valid_scalar as poseidon_is_valid_scalar,
    reduce_scalar,
    
    // Implementation info
    is_placeholder_implementation,
    IS_PLACEHOLDER,
    BN254_SCALAR_MODULUS as POSEIDON_FIELD_MODULUS,
    
    // Type re-export
    ScalarField as PoseidonScalarField,
};

// ============================================================================
// PUBLIC INPUTS
// ============================================================================

pub use public_inputs::{
    // Public input structures
    DepositPublicInputs,
    WithdrawPublicInputs,
    JoinSplitPublicInputs,
    MembershipPublicInputs,
    
    // Builders
    WithdrawPublicInputsBuilder,
    JoinSplitPublicInputsBuilder,
    
    // Constants
    MAX_JS_INPUTS,
    MAX_JS_OUTPUTS,
};
