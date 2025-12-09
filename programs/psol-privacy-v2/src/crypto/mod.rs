//! Cryptographic Primitives for pSOL Privacy Pool v2
//!
//! # Module Overview
//!
//! ## groth16_verifier
//! Production-ready Groth16 proof verification using Solana's alt_bn128 precompiles.
//!
//! ## poseidon
//! Hash functions for Merkle tree and commitment generation.
//!
//! ## public_inputs
//! Public input encoding for different ZK circuits.
//!
//! ## curve_utils
//! BN254 elliptic curve operations.
//!
//! # Security Model
//! - All verification functions are fail-closed
//! - Invalid proofs are always rejected
//! - Curve points are validated before use

pub mod curve_utils;
pub mod groth16_verifier;
pub mod poseidon;
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
    validate_g2_point, is_g2_identity,
    
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
};

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

pub use poseidon::{
    hash_two_to_one,
    is_zero_hash,
    empty_leaf_hash,
    u64_to_bytes32,
    u64_to_bytes32_be,
    is_placeholder_implementation,
};

// ============================================================================
// PUBLIC INPUTS
// ============================================================================

pub use public_inputs::{
    WithdrawPublicInputs,
    JoinSplitPublicInputs,
    MembershipPublicInputs,
    DepositPublicInputs,
};
