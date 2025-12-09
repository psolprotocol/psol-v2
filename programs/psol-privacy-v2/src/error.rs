//! Error Types for pSOL Privacy Pool v2

use anchor_lang::prelude::*;

#[error_code]
pub enum PrivacyErrorV2 {
    // =========================================================================
    // PROOF ERRORS (6000-6019)
    // =========================================================================
    
    #[msg("Invalid proof: verification failed")]
    InvalidProof, // 6000

    #[msg("Invalid proof format: expected 256 bytes")]
    InvalidProofFormat, // 6001

    #[msg("Invalid public inputs for proof verification")]
    InvalidPublicInputs, // 6002

    #[msg("Verification key not configured for this proof type")]
    VerificationKeyNotSet, // 6003

    #[msg("Verification key is locked and cannot be modified")]
    VerificationKeyLocked, // 6004

    #[msg("Proof type not supported")]
    UnsupportedProofType, // 6005

    #[msg("Circuit not implemented: proof verification unavailable")]
    ProofNotImplemented, // 6006

    #[msg("VK IC length mismatch for proof type")]
    VkIcLengthMismatch, // 6007

    // =========================================================================
    // MERKLE TREE ERRORS (6020-6039)
    // =========================================================================

    #[msg("Merkle root not in recent history")]
    InvalidMerkleRoot, // 6020

    #[msg("Merkle tree is full")]
    MerkleTreeFull, // 6021

    #[msg("Tree depth must be between 4 and 24")]
    InvalidTreeDepth, // 6022

    #[msg("Root history size must be at least 30")]
    InvalidRootHistorySize, // 6023

    // =========================================================================
    // NULLIFIER ERRORS (6040-6049)
    // =========================================================================

    #[msg("Nullifier already spent")]
    NullifierAlreadySpent, // 6040

    #[msg("Invalid nullifier: cannot be all zeros")]
    InvalidNullifier, // 6041

    #[msg("Too many nullifiers for join-split (max 2)")]
    TooManyNullifiers, // 6042

    #[msg("Duplicate nullifier in input set")]
    DuplicateNullifier, // 6043

    // =========================================================================
    // AMOUNT/VALUE ERRORS (6050-6069)
    // =========================================================================

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount, // 6050

    #[msg("Insufficient vault balance")]
    InsufficientBalance, // 6051

    #[msg("Relayer fee exceeds withdrawal amount")]
    RelayerFeeExceedsAmount, // 6052

    #[msg("Amount below minimum deposit")]
    BelowMinimumDeposit, // 6053

    #[msg("Amount exceeds maximum deposit")]
    ExceedsMaximumDeposit, // 6054

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow, // 6055

    #[msg("Join-split value conservation failed")]
    ValueConservationFailed, // 6056

    // =========================================================================
    // ASSET ERRORS (6070-6089)
    // =========================================================================

    #[msg("Token mint does not match pool configuration")]
    InvalidMint, // 6070

    #[msg("Asset not registered with pool")]
    AssetNotRegistered, // 6071

    #[msg("Asset is not active")]
    AssetNotActive, // 6072

    #[msg("Too many assets registered")]
    TooManyAssets, // 6073

    #[msg("Asset ID mismatch")]
    AssetIdMismatch, // 6074

    #[msg("Deposits are disabled for this asset")]
    DepositsDisabled, // 6075

    #[msg("Withdrawals are disabled for this asset")]
    WithdrawalsDisabled, // 6076

    // =========================================================================
    // COMMITMENT ERRORS (6090-6099)
    // =========================================================================

    #[msg("Invalid commitment: cannot be all zeros")]
    InvalidCommitment, // 6090

    #[msg("Too many output commitments for join-split (max 2)")]
    TooManyOutputs, // 6091

    // =========================================================================
    // AUTHORIZATION ERRORS (6100-6119)
    // =========================================================================

    #[msg("Unauthorized: caller is not pool authority")]
    Unauthorized, // 6100

    #[msg("Invalid authority address")]
    InvalidAuthority, // 6101

    #[msg("No pending authority transfer")]
    NoPendingAuthority, // 6102

    #[msg("Recipient does not match proof public inputs")]
    RecipientMismatch, // 6103

    // =========================================================================
    // RELAYER ERRORS (6120-6139)
    // =========================================================================

    #[msg("Relayer not registered")]
    RelayerNotRegistered, // 6120

    #[msg("Relayer not active")]
    RelayerNotActive, // 6121

    #[msg("Relayer fee out of allowed range")]
    RelayerFeeOutOfRange, // 6122

    #[msg("Invalid fee configuration")]
    InvalidFeeConfiguration, // 6123

    #[msg("Relayer registrations are closed")]
    RegistrationsClosed, // 6124

    #[msg("Insufficient relayer stake")]
    InsufficientStake, // 6125

    // =========================================================================
    // STATE ERRORS (6140-6159)
    // =========================================================================

    #[msg("Pool is paused")]
    PoolPaused, // 6140

    #[msg("Pool is not paused")]
    PoolNotPaused, // 6141

    #[msg("Account already initialized")]
    AlreadyInitialized, // 6142

    #[msg("Account data corrupted")]
    CorruptedData, // 6143

    #[msg("Operation exceeds safe limits")]
    LimitExceeded, // 6144

    #[msg("Invalid timestamp")]
    InvalidTimestamp, // 6145

    // =========================================================================
    // FEATURE ERRORS (6160-6179)
    // =========================================================================

    #[msg("Feature not enabled for this pool")]
    FeatureDisabled, // 6160

    #[msg("Feature not implemented in this version")]
    NotImplemented, // 6161

    #[msg("Join-split not enabled")]
    JoinSplitDisabled, // 6162

    #[msg("Membership proofs not enabled")]
    MembershipProofsDisabled, // 6163

    #[msg("Shielded CPI not enabled")]
    ShieldedCpiDisabled, // 6164

    // =========================================================================
    // COMPLIANCE ERRORS (6180-6199)
    // =========================================================================

    #[msg("Encrypted note required for this pool")]
    EncryptedNoteRequired, // 6180

    #[msg("Invalid encrypted note format")]
    InvalidEncryptedNote, // 6181

    #[msg("Audit metadata already attached")]
    MetadataAlreadyAttached, // 6182

    // =========================================================================
    // INPUT VALIDATION (6200-6219)
    // =========================================================================

    #[msg("Input exceeds maximum allowed length")]
    InputTooLarge, // 6200

    #[msg("Invalid account owner")]
    InvalidOwner, // 6201

    #[msg("Invalid account discriminator")]
    InvalidDiscriminator, // 6202

    // =========================================================================
    // CPI ERRORS (6220-6239)
    // =========================================================================

    #[msg("Shielded action not supported")]
    UnsupportedShieldedAction, // 6220

    #[msg("CPI call failed")]
    CpiCallFailed, // 6221

    #[msg("Invalid action data")]
    InvalidActionData, // 6222
}

impl PrivacyErrorV2 {
    /// Get numeric error code
    /// Note: Anchor assigns error codes starting at 6000 based on enum variant order
    pub fn error_code(&self) -> u32 {
        // Just return the discriminant offset for reference
        // Actual error code assignment is handled by Anchor's #[error_code]
        *self as u32
    }
}
