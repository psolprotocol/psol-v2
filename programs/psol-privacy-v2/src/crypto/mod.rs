//! Cryptographic Primitives for pSOL Privacy Pool v2

pub mod curve_utils;
pub mod groth16;
pub mod groth16_verifier;
pub mod keccak;
pub mod poseidon;

#[cfg(feature = "poseidon-constants")]
pub mod poseidon_constants;

#[cfg(feature = "poseidon-constants")]
pub mod poseidon_constants_t3;

pub mod public_inputs;

pub use curve_utils::{
    G1Point, G2Point, PairingElement, ScalarField,
    G1_IDENTITY, G2_IDENTITY, G1_GENERATOR,
    BN254_FIELD_MODULUS, BN254_SCALAR_MODULUS,
    validate_g1_point, negate_g1, g1_add, g1_scalar_mul,
    is_g1_identity,
    validate_g2_point, validate_g2_point_allow_identity, is_g2_identity,
    is_valid_scalar, u64_to_scalar, pubkey_to_scalar, i64_to_scalar,
    verify_pairing, make_pairing_element, compute_vk_x,
};

pub use groth16::{
    verify_groth16_proof,
    verify_proof_bytes,
    verify_deposit_proof,
    verify_withdraw_proof,
    verify_joinsplit_proof,
    verify_membership_proof,
    Groth16Proof,
    PublicInputs,
};

/// Proof data length constant
pub const PROOF_DATA_LEN: usize = 256;

/// Check if proof bytes have valid length
#[inline]
pub fn is_valid_proof_length(data: &[u8]) -> bool {
    data.len() == PROOF_DATA_LEN
}

pub use keccak::{
    keccak256,
    keccak256_concat,
    derive_asset_id,
    derive_asset_id_u32,
    hash_verification_key,
    hash_commitment,
};

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
    reduce_scalar,
    is_placeholder_implementation,
    IS_PLACEHOLDER,
    BN254_SCALAR_MODULUS as POSEIDON_FIELD_MODULUS,
    ScalarField as PoseidonScalarField,
};

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