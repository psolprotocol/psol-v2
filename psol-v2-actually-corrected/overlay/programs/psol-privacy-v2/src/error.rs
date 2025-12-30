//! Error codes for pSOL v2 Privacy Protocol
//!
//! Combined error codes from:
//! - Crypto hardening package (CryptoNotImplemented, etc.)
//! - Batching fixes (BufferFull, BatchNotReady, etc.)

use anchor_lang::prelude::*;

#[error_code]
pub enum PrivacyErrorV2 {
    // =========================================================================
    // CRYPTOGRAPHY ERRORS
    // =========================================================================

    #[msg("Cryptography not implemented - build with --features insecure-dev for local testing only")]
    CryptoNotImplemented,

    #[msg("Proof verification failed - invalid zero-knowledge proof")]
    ProofVerificationFailedInvalid,

    #[msg("Invalid proof format - expected 256 bytes")]
    InvalidProofFormat,

    // =========================================================================
    // POOL & CONFIGURATION ERRORS
    // =========================================================================

    #[msg("Pool is paused")]
    PoolPaused,

    #[msg("Invalid pool reference")]
    InvalidPoolReference,

    #[msg("Unauthorized - insufficient permissions")]
    Unauthorized,

    // =========================================================================
    // MERKLE TREE ERRORS
    // =========================================================================

    #[msg("Merkle tree is full - cannot accept more deposits")]
    MerkleTreeFull,

    #[msg("Invalid Merkle tree for this pool")]
    InvalidMerkleTreePool,

    #[msg("Invalid Merkle root")]
    InvalidMerkleRoot,

    // =========================================================================
    // ASSET & VAULT ERRORS
    // =========================================================================

    #[msg("Asset ID mismatch")]
    AssetIdMismatch,

    #[msg("Asset not active")]
    AssetNotActive,

    #[msg("Deposits disabled for this asset")]
    DepositsDisabled,

    #[msg("Invalid vault for this pool")]
    InvalidVaultPool,

    #[msg("Invalid vault token account")]
    InvalidVaultTokenAccount,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Invalid token owner")]
    InvalidTokenOwner,

    // =========================================================================
    // DEPOSIT ERRORS
    // =========================================================================

    #[msg("Invalid amount - must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid commitment - cannot be zero")]
    InvalidCommitment,

    #[msg("Invalid proof")]
    InvalidProof,

    // =========================================================================
    // BATCHING ERRORS
    // =========================================================================

    #[msg("Pending deposits buffer is full")]
    BufferFull,

    #[msg("No pending deposits to process")]
    NoPendingDeposits,

    #[msg("Batch not ready for processing - timing constraints not met")]
    BatchNotReady,

    #[msg("Invalid batch size - must be between 1 and MAX_BATCH_SIZE")]
    InvalidBatchSize,

    // =========================================================================
    // WITHDRAWAL ERRORS
    // =========================================================================

    #[msg("Nullifier already spent - double-spend attempt")]
    NullifierAlreadySpent,

    #[msg("Invalid recipient")]
    InvalidRecipient,

    #[msg("Invalid relayer fee")]
    InvalidRelayerFee,

    // =========================================================================
    // RELAYER ERRORS
    // =========================================================================

    #[msg("Invalid relayer registry")]
    InvalidRelayerRegistry,

    #[msg("Relayer not active")]
    RelayerNotActive,

    #[msg("Invalid relayer")]
    InvalidRelayer,

    // =========================================================================
    // VERIFICATION KEY ERRORS
    // =========================================================================

    #[msg("Invalid verification key for this pool")]
    InvalidVerificationKeyPool,

    #[msg("Invalid verification key type")]
    InvalidVerificationKeyType,

    #[msg("Verification key not set")]
    VerificationKeyNotSet,

    // =========================================================================
    // METADATA ERRORS
    // =========================================================================

    #[msg("Invalid metadata URI format")]
    InvalidMetadataUri,

    #[msg("Invalid input - failed validation")]
    InvalidInput,

    // =========================================================================
    // SYSTEM ERRORS
    // =========================================================================

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,

    #[msg("Invalid account state")]
    InvalidAccountState,

    #[msg("Account not initialized")]
    AccountNotInitialized,

    #[msg("Account already initialized")]
    AccountAlreadyInitialized,
}
