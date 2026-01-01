//! Cryptographic Primitives for pSOL Privacy Pool v2
//!
//! This module provides production-ready cryptographic operations:
//!
//! - **Poseidon Hash**: Circom-compatible hash for commitments and Merkle trees
//! - **Alt BN128 Syscalls**: Wrappers for Solana's BN254 precompile operations
//! - **Groth16 Verifier**: Zero-knowledge proof verification using syscalls
//! - **Curve Utilities**: G1/G2 point operations for VK computations
//!
//! # Security Notes
//!
//! - All scalar inputs are validated to be < field modulus
//! - Invalid inputs are REJECTED, never silently reduced
//! - The Groth16 verifier uses Solana syscalls for on-chain efficiency

pub mod alt_bn128_syscalls;
pub mod curve_utils;
pub mod groth16;
pub mod groth16_verifier;
pub mod keccak;
pub mod poseidon;
pub mod public_inputs;

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Curve utilities and types
pub use curve_utils::{
    G1Point, G2Point, PairingElement, ScalarField,
    G1_IDENTITY, G2_IDENTITY, G1_GENERATOR,
    BN254_FIELD_MODULUS, BN254_SCALAR_MODULUS,
    validate_g1_point, negate_g1, g1_add, g1_scalar_mul,
    is_g1_identity,
    validate_g2_point, validate_g2_point_allow_identity, is_g2_identity,
    is_valid_scalar, u64_to_scalar, pubkey_to_scalar, i64_to_scalar,
    verify_pairing, verify_pairing_4, make_pairing_element, compute_vk_x,
};

// Alt BN128 syscalls (for direct access when needed)
pub use alt_bn128_syscalls::{
    BN254_FP_MODULUS, BN254_FR_MODULUS,
    g1_mul, g1_negate,
};

// Groth16 verifier
pub use groth16_verifier::{
    verify_groth16_proof,
    verify_proof_bytes,
    Groth16Proof,
    PROOF_DATA_LEN,
    is_valid_proof_length,
};

// Keccak utilities
pub use keccak::{
    keccak256,
    keccak256_concat,
    derive_asset_id,
    derive_asset_id_u32,
    hash_verification_key,
    hash_commitment,
};

// Poseidon hash (production implementation)
pub use poseidon::{
    hash_two_to_one,
    poseidon_hash_3,
    poseidon_hash_4,
    poseidon_hash,
    compute_commitment,
    compute_nullifier_hash,
    verify_commitment,
    u64_to_scalar_be,
    u64_to_scalar_le,
    i64_to_scalar_be,
    u64_to_bytes32,
    is_zero_hash,
    empty_leaf_hash,
    is_valid_scalar as poseidon_is_valid_scalar,
    is_placeholder_implementation,
    IS_PLACEHOLDER,
    BN254_SCALAR_MODULUS as POSEIDON_FIELD_MODULUS,
    ScalarField as PoseidonScalarField,
};

// Public input builders
pub use public_inputs::{
    DepositPublicInputs,
    WithdrawPublicInputs,
    JoinSplitPublicInputs,
    MembershipPublicInputs,
    WithdrawPublicInputsBuilder,
    JoinSplitPublicInputsBuilder,
    MAX_JS_INPUTS,
    MAX_JS_OUTPUTS,
};
