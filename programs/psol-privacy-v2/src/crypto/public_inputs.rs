//! Public Inputs for ZK Circuits - pSOL v2
//!
//! This module defines public input structures for all proof types:
//! - Deposit: MASP deposit with asset_id
//! - Withdraw: MASP withdrawal with asset_id and relayer
//! - JoinSplit: Private transfer with multiple inputs/outputs
//! - Membership: Stake threshold proof without spending
//!
//! # Field Element Encoding
//! All values are encoded as 32-byte big-endian field elements
//! in the BN254 scalar field.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;

use super::{u64_to_scalar, i64_to_scalar, pubkey_to_scalar, ScalarField};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Maximum number of input nullifiers in a join-split
pub const MAX_JS_INPUTS: usize = 4;

/// Maximum number of output commitments in a join-split
pub const MAX_JS_OUTPUTS: usize = 4;

// ============================================================================
// DEPOSIT PUBLIC INPUTS
// ============================================================================

/// Public inputs for MASP deposit circuit verification.
///
/// The deposit circuit proves:
/// - commitment = Poseidon(secret, nullifier, amount, asset_id)
/// - amount > 0
///
/// # Fields (3 inputs)
/// 1. commitment - The computed commitment hash
/// 2. amount - Deposit amount
/// 3. asset_id - Asset identifier (Keccak256(mint))
#[derive(Clone, Debug)]
pub struct DepositPublicInputs {
    /// Commitment hash being inserted into tree
    pub commitment: [u8; 32],
    
    /// Deposit amount
    pub amount: u64,
    
    /// Asset identifier (Keccak256 of mint pubkey)
    pub asset_id: [u8; 32],
}

impl DepositPublicInputs {
    /// Number of public inputs for deposit verification
    pub const COUNT: usize = 3;

    /// Create new deposit public inputs
    pub fn new(commitment: [u8; 32], amount: u64, asset_id: [u8; 32]) -> Self {
        Self {
            commitment,
            amount,
            asset_id,
        }
    }

    /// Validate deposit public inputs
    pub fn validate(&self) -> Result<()> {
        // Commitment cannot be zero
        require!(
            !self.commitment.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidCommitment
        );

        // Amount must be positive
        require!(self.amount > 0, PrivacyErrorV2::InvalidAmount);

        // Asset ID cannot be zero (would indicate unregistered asset)
        require!(
            !self.asset_id.iter().all(|&b| b == 0),
            PrivacyErrorV2::AssetNotRegistered
        );

        Ok(())
    }

    /// Convert to field elements for Groth16 verification
    pub fn to_field_elements(&self) -> Vec<ScalarField> {
        vec![
            self.commitment,
            u64_to_scalar(self.amount),
            self.asset_id,
        ]
    }
}

// ============================================================================
// WITHDRAW PUBLIC INPUTS
// ============================================================================

/// Public inputs for MASP withdrawal circuit verification.
///
/// The withdrawal circuit proves:
/// - Commitment was in tree at merkle_root
/// - nullifier_hash = Poseidon(nullifier, secret)
/// - Value conservation: amount withdrawn = amount in commitment
/// - Asset ID matches
///
/// # Fields (8 inputs)
/// 1. merkle_root - Tree root for membership proof
/// 2. nullifier_hash - Prevents double-spending
/// 3. asset_id - Asset being withdrawn
/// 4. recipient - Address receiving funds
/// 5. amount - Withdrawal amount (before fee)
/// 6. relayer - Relayer address
/// 7. relayer_fee - Fee paid to relayer
/// 8. public_data_hash - Optional hash of encrypted metadata
#[derive(Clone, Debug)]
pub struct WithdrawPublicInputs {
    /// Merkle root of the commitment tree
    pub merkle_root: [u8; 32],
    
    /// Nullifier hash (prevents double-spend)
    pub nullifier_hash: [u8; 32],
    
    /// Asset identifier
    pub asset_id: [u8; 32],
    
    /// Recipient address (who receives the tokens)
    pub recipient: Pubkey,
    
    /// Withdrawal amount (before fee)
    pub amount: u64,
    
    /// Relayer address (submits tx on behalf of user)
    pub relayer: Pubkey,
    
    /// Fee paid to relayer (deducted from amount)
    pub relayer_fee: u64,
    
    /// Optional hash of encrypted metadata (0 if none)
    pub public_data_hash: [u8; 32],
}

impl WithdrawPublicInputs {
    /// Number of public inputs for withdrawal verification
    pub const COUNT: usize = 8;

    /// Create new withdrawal public inputs
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        merkle_root: [u8; 32],
        nullifier_hash: [u8; 32],
        asset_id: [u8; 32],
        recipient: Pubkey,
        amount: u64,
        relayer: Pubkey,
        relayer_fee: u64,
        public_data_hash: [u8; 32],
    ) -> Self {
        Self {
            merkle_root,
            nullifier_hash,
            asset_id,
            recipient,
            amount,
            relayer,
            relayer_fee,
            public_data_hash,
        }
    }

    /// Validate withdrawal public inputs
    pub fn validate(&self) -> Result<()> {
        // Merkle root cannot be zero
        require!(
            !self.merkle_root.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidMerkleRoot
        );

        // Nullifier cannot be zero
        require!(
            !self.nullifier_hash.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidNullifier
        );

        // Asset ID cannot be zero
        require!(
            !self.asset_id.iter().all(|&b| b == 0),
            PrivacyErrorV2::AssetNotRegistered
        );

        // Amount must be positive
        require!(self.amount > 0, PrivacyErrorV2::InvalidAmount);

        // Fee cannot exceed amount
        require!(
            self.relayer_fee <= self.amount,
            PrivacyErrorV2::RelayerFeeExceedsAmount
        );

        Ok(())
    }

    /// Convert to field elements for Groth16 verification
    pub fn to_field_elements(&self) -> Vec<ScalarField> {
        vec![
            self.merkle_root,
            self.nullifier_hash,
            self.asset_id,
            pubkey_to_scalar(&self.recipient),
            u64_to_scalar(self.amount),
            pubkey_to_scalar(&self.relayer),
            u64_to_scalar(self.relayer_fee),
            self.public_data_hash,
        ]
    }

    /// Calculate net amount after fee
    pub fn net_amount(&self) -> Result<u64> {
        self.amount
            .checked_sub(self.relayer_fee)
            .ok_or_else(|| error!(PrivacyErrorV2::ArithmeticOverflow))
    }

    /// Check if this is a self-relay (recipient == relayer, no fee)
    pub fn is_self_relay(&self) -> bool {
        self.recipient == self.relayer && self.relayer_fee == 0
    }
}

// ============================================================================
// JOIN-SPLIT PUBLIC INPUTS
// ============================================================================

/// Public inputs for join-split private transfer circuit.
///
/// The join-split circuit proves:
/// - All input commitments exist in tree at merkle_root
/// - All input nullifiers are correctly computed
/// - All output commitments are correctly computed
/// - Value conservation: sum(inputs) = sum(outputs) + public_amount
/// - Asset ID is consistent across all inputs/outputs
///
/// # Fields (variable, up to 10 for 2-in-2-out)
/// 1. merkle_root - Tree root for all input membership proofs
/// 2. asset_id - Asset being transferred
/// 3..N+2. nullifier_hashes[N] - Input nullifiers
/// N+3..N+M+2. output_commitments[M] - Output commitments
/// N+M+3. public_amount - Net public inflow/outflow (can be negative)
#[derive(Clone, Debug)]
pub struct JoinSplitPublicInputs {
    /// Merkle root of the commitment tree
    pub merkle_root: [u8; 32],
    
    /// Asset identifier (must be same for all inputs/outputs)
    pub asset_id: [u8; 32],
    
    /// Input nullifier hashes (up to MAX_JS_INPUTS)
    pub nullifier_hashes: Vec<[u8; 32]>,
    
    /// Output commitment hashes (up to MAX_JS_OUTPUTS)
    pub output_commitments: Vec<[u8; 32]>,
    
    /// Net public amount flow
    /// Positive: deposit additional funds
    /// Negative: withdraw funds
    /// Zero: pure private transfer
    pub public_amount: i64,
    
    /// Relayer address (for any public flows)
    pub relayer: Pubkey,
    
    /// Relayer fee
    pub relayer_fee: u64,
}

impl JoinSplitPublicInputs {
    /// Base count: merkle_root, asset_id, public_amount, relayer, relayer_fee
    pub const BASE_COUNT: usize = 5;

    /// Create new join-split public inputs
    pub fn new(
        merkle_root: [u8; 32],
        asset_id: [u8; 32],
        nullifier_hashes: Vec<[u8; 32]>,
        output_commitments: Vec<[u8; 32]>,
        public_amount: i64,
        relayer: Pubkey,
        relayer_fee: u64,
    ) -> Self {
        Self {
            merkle_root,
            asset_id,
            nullifier_hashes,
            output_commitments,
            public_amount,
            relayer,
            relayer_fee,
        }
    }

    /// Get total number of public inputs
    pub fn count(&self) -> usize {
        Self::BASE_COUNT + self.nullifier_hashes.len() + self.output_commitments.len()
    }

    /// Validate join-split public inputs
    pub fn validate(&self) -> Result<()> {
        // Merkle root cannot be zero
        require!(
            !self.merkle_root.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidMerkleRoot
        );

        // Asset ID cannot be zero
        require!(
            !self.asset_id.iter().all(|&b| b == 0),
            PrivacyErrorV2::AssetNotRegistered
        );

        // Must have at least one input
        require!(
            !self.nullifier_hashes.is_empty(),
            PrivacyErrorV2::TooManyNullifiers
        );

        // Cannot exceed max inputs
        require!(
            self.nullifier_hashes.len() <= MAX_JS_INPUTS,
            PrivacyErrorV2::TooManyNullifiers
        );

        // Must have at least one output
        require!(
            !self.output_commitments.is_empty(),
            PrivacyErrorV2::InvalidCommitment
        );

        // Cannot exceed max outputs
        require!(
            self.output_commitments.len() <= MAX_JS_OUTPUTS,
            PrivacyErrorV2::InvalidCommitment
        );

        // All nullifiers must be non-zero
        for nullifier in &self.nullifier_hashes {
            require!(
                !nullifier.iter().all(|&b| b == 0),
                PrivacyErrorV2::InvalidNullifier
            );
        }

        // All output commitments must be non-zero
        for commitment in &self.output_commitments {
            require!(
                !commitment.iter().all(|&b| b == 0),
                PrivacyErrorV2::InvalidCommitment
            );
        }

        // All nullifiers must be unique
        for i in 0..self.nullifier_hashes.len() {
            for j in (i + 1)..self.nullifier_hashes.len() {
                require!(
                    self.nullifier_hashes[i] != self.nullifier_hashes[j],
                    PrivacyErrorV2::DuplicateNullifier
                );
            }
        }

        // Relayer fee validation for public outflows
        if self.public_amount < 0 {
            let outflow = (-self.public_amount) as u64;
            require!(
                self.relayer_fee <= outflow,
                PrivacyErrorV2::RelayerFeeExceedsAmount
            );
        }

        Ok(())
    }

    /// Convert to field elements for Groth16 verification
    pub fn to_field_elements(&self) -> Vec<ScalarField> {
        let mut elements = Vec::with_capacity(self.count());
        
        // Fixed elements
        elements.push(self.merkle_root);
        elements.push(self.asset_id);
        
        // Nullifiers
        for nullifier in &self.nullifier_hashes {
            elements.push(*nullifier);
        }
        
        // Output commitments
        for commitment in &self.output_commitments {
            elements.push(*commitment);
        }
        
        // Public amount (as signed field element)
        elements.push(i64_to_scalar(self.public_amount));
        
        // Relayer info
        elements.push(pubkey_to_scalar(&self.relayer));
        elements.push(u64_to_scalar(self.relayer_fee));
        
        elements
    }

    /// Check if this is a pure private transfer (no public flow)
    pub fn is_pure_private(&self) -> bool {
        self.public_amount == 0
    }

    /// Check if this involves a deposit (public inflow)
    pub fn is_deposit(&self) -> bool {
        self.public_amount > 0
    }

    /// Check if this involves a withdrawal (public outflow)
    pub fn is_withdrawal(&self) -> bool {
        self.public_amount < 0
    }

    /// Get net withdrawal amount after fee (only valid if is_withdrawal)
    pub fn net_withdrawal(&self) -> Result<u64> {
        if !self.is_withdrawal() {
            return Err(error!(PrivacyErrorV2::InvalidAmount));
        }
        let outflow = (-self.public_amount) as u64;
        outflow
            .checked_sub(self.relayer_fee)
            .ok_or_else(|| error!(PrivacyErrorV2::ArithmeticOverflow))
    }
}

// ============================================================================
// MEMBERSHIP PUBLIC INPUTS
// ============================================================================

/// Public inputs for membership proof circuit.
///
/// The membership circuit proves:
/// - User owns a commitment in the tree with amount >= threshold
/// - Does NOT reveal nullifier (no spending)
///
/// # Fields (4 inputs)
/// 1. merkle_root - Tree root for membership proof
/// 2. asset_id - Asset being proven
/// 3. threshold - Minimum amount threshold
/// 4. public_key_hash - Deterministic identifier for the prover
#[derive(Clone, Debug)]
pub struct MembershipPublicInputs {
    /// Merkle root of the commitment tree
    pub merkle_root: [u8; 32],
    
    /// Asset identifier
    pub asset_id: [u8; 32],
    
    /// Minimum amount threshold to prove
    pub threshold: u64,
    
    /// Hash of prover's public key (for identity binding)
    pub public_key_hash: [u8; 32],
}

impl MembershipPublicInputs {
    /// Number of public inputs for membership verification
    pub const COUNT: usize = 4;

    /// Create new membership public inputs
    pub fn new(
        merkle_root: [u8; 32],
        asset_id: [u8; 32],
        threshold: u64,
        public_key_hash: [u8; 32],
    ) -> Self {
        Self {
            merkle_root,
            asset_id,
            threshold,
            public_key_hash,
        }
    }

    /// Validate membership public inputs
    pub fn validate(&self) -> Result<()> {
        // Merkle root cannot be zero
        require!(
            !self.merkle_root.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidMerkleRoot
        );

        // Asset ID cannot be zero
        require!(
            !self.asset_id.iter().all(|&b| b == 0),
            PrivacyErrorV2::AssetNotRegistered
        );

        // Threshold must be positive
        require!(self.threshold > 0, PrivacyErrorV2::InvalidAmount);

        // Public key hash cannot be zero
        require!(
            !self.public_key_hash.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidPublicInputs
        );

        Ok(())
    }

    /// Convert to field elements for Groth16 verification
    pub fn to_field_elements(&self) -> Vec<ScalarField> {
        vec![
            self.merkle_root,
            self.asset_id,
            u64_to_scalar(self.threshold),
            self.public_key_hash,
        ]
    }
}

// ============================================================================
// BUILDER PATTERNS
// ============================================================================

/// Builder for WithdrawPublicInputs
#[derive(Default)]
pub struct WithdrawPublicInputsBuilder {
    merkle_root: Option<[u8; 32]>,
    nullifier_hash: Option<[u8; 32]>,
    asset_id: Option<[u8; 32]>,
    recipient: Option<Pubkey>,
    amount: Option<u64>,
    relayer: Option<Pubkey>,
    relayer_fee: Option<u64>,
    public_data_hash: Option<[u8; 32]>,
}

impl WithdrawPublicInputsBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self::default()
    }

    /// Set merkle root
    pub fn merkle_root(mut self, root: [u8; 32]) -> Self {
        self.merkle_root = Some(root);
        self
    }

    /// Set nullifier hash
    pub fn nullifier_hash(mut self, hash: [u8; 32]) -> Self {
        self.nullifier_hash = Some(hash);
        self
    }

    /// Set asset ID
    pub fn asset_id(mut self, id: [u8; 32]) -> Self {
        self.asset_id = Some(id);
        self
    }

    /// Set recipient
    pub fn recipient(mut self, recipient: Pubkey) -> Self {
        self.recipient = Some(recipient);
        self
    }

    /// Set amount
    pub fn amount(mut self, amount: u64) -> Self {
        self.amount = Some(amount);
        self
    }

    /// Set relayer
    pub fn relayer(mut self, relayer: Pubkey) -> Self {
        self.relayer = Some(relayer);
        self
    }

    /// Set relayer fee
    pub fn relayer_fee(mut self, fee: u64) -> Self {
        self.relayer_fee = Some(fee);
        self
    }

    /// Set public data hash
    pub fn public_data_hash(mut self, hash: [u8; 32]) -> Self {
        self.public_data_hash = Some(hash);
        self
    }

    /// Build for self-relay (recipient = relayer, no fee)
    pub fn build_self_relay(mut self) -> Result<WithdrawPublicInputs> {
        let recipient = self.recipient.ok_or(error!(PrivacyErrorV2::InvalidAmount))?;
        self.relayer = Some(recipient);
        self.relayer_fee = Some(0);
        self.build()
    }

    /// Build the public inputs
    pub fn build(self) -> Result<WithdrawPublicInputs> {
        let inputs = WithdrawPublicInputs {
            merkle_root: self.merkle_root.ok_or(error!(PrivacyErrorV2::InvalidMerkleRoot))?,
            nullifier_hash: self.nullifier_hash.ok_or(error!(PrivacyErrorV2::InvalidNullifier))?,
            asset_id: self.asset_id.ok_or(error!(PrivacyErrorV2::AssetNotRegistered))?,
            recipient: self.recipient.ok_or(error!(PrivacyErrorV2::RecipientMismatch))?,
            amount: self.amount.ok_or(error!(PrivacyErrorV2::InvalidAmount))?,
            relayer: self.relayer.ok_or(error!(PrivacyErrorV2::RelayerNotRegistered))?,
            relayer_fee: self.relayer_fee.unwrap_or(0),
            public_data_hash: self.public_data_hash.unwrap_or([0u8; 32]),
        };

        inputs.validate()?;
        Ok(inputs)
    }
}

/// Builder for JoinSplitPublicInputs
#[derive(Default)]
pub struct JoinSplitPublicInputsBuilder {
    merkle_root: Option<[u8; 32]>,
    asset_id: Option<[u8; 32]>,
    nullifier_hashes: Vec<[u8; 32]>,
    output_commitments: Vec<[u8; 32]>,
    public_amount: i64,
    relayer: Option<Pubkey>,
    relayer_fee: u64,
}

impl JoinSplitPublicInputsBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self::default()
    }

    /// Set merkle root
    pub fn merkle_root(mut self, root: [u8; 32]) -> Self {
        self.merkle_root = Some(root);
        self
    }

    /// Set asset ID
    pub fn asset_id(mut self, id: [u8; 32]) -> Self {
        self.asset_id = Some(id);
        self
    }

    /// Add an input nullifier
    pub fn add_nullifier(mut self, nullifier: [u8; 32]) -> Self {
        self.nullifier_hashes.push(nullifier);
        self
    }

    /// Add an output commitment
    pub fn add_output(mut self, commitment: [u8; 32]) -> Self {
        self.output_commitments.push(commitment);
        self
    }

    /// Set public amount
    pub fn public_amount(mut self, amount: i64) -> Self {
        self.public_amount = amount;
        self
    }

    /// Set relayer
    pub fn relayer(mut self, relayer: Pubkey) -> Self {
        self.relayer = Some(relayer);
        self
    }

    /// Set relayer fee
    pub fn relayer_fee(mut self, fee: u64) -> Self {
        self.relayer_fee = fee;
        self
    }

    /// Build the public inputs
    pub fn build(self) -> Result<JoinSplitPublicInputs> {
        let inputs = JoinSplitPublicInputs {
            merkle_root: self.merkle_root.ok_or(error!(PrivacyErrorV2::InvalidMerkleRoot))?,
            asset_id: self.asset_id.ok_or(error!(PrivacyErrorV2::AssetNotRegistered))?,
            nullifier_hashes: self.nullifier_hashes,
            output_commitments: self.output_commitments,
            public_amount: self.public_amount,
            relayer: self.relayer.unwrap_or(Pubkey::default()),
            relayer_fee: self.relayer_fee,
        };

        inputs.validate()?;
        Ok(inputs)
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/// Convert u64 to 32-byte field element (big-endian)
#[allow(dead_code)]
fn u64_to_field(value: u64) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&value.to_be_bytes());
    bytes
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    // ----- Deposit tests -----
    
    #[test]
    fn test_deposit_valid() {
        let inputs = DepositPublicInputs::new(
            [1u8; 32],
            1000,
            [2u8; 32],
        );
        assert!(inputs.validate().is_ok());
        assert_eq!(inputs.to_field_elements().len(), DepositPublicInputs::COUNT);
    }

    #[test]
    fn test_deposit_zero_commitment() {
        let inputs = DepositPublicInputs::new(
            [0u8; 32],
            1000,
            [2u8; 32],
        );
        assert!(inputs.validate().is_err());
    }

    // ----- Withdraw tests -----

    #[test]
    fn test_withdraw_valid() {
        let inputs = WithdrawPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            [3u8; 32],
            test_pubkey(),
            1000,
            test_pubkey(),
            100,
            [0u8; 32],
        );
        assert!(inputs.validate().is_ok());
        assert_eq!(inputs.to_field_elements().len(), WithdrawPublicInputs::COUNT);
    }

    #[test]
    fn test_withdraw_fee_exceeds() {
        let inputs = WithdrawPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            [3u8; 32],
            test_pubkey(),
            100,
            test_pubkey(),
            200,
            [0u8; 32],
        );
        assert!(inputs.validate().is_err());
    }

    // ----- JoinSplit tests -----

    #[test]
    fn test_join_split_valid() {
        let inputs = JoinSplitPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            vec![[3u8; 32], [4u8; 32]],
            vec![[5u8; 32], [6u8; 32]],
            0,
            test_pubkey(),
            0,
        );
        assert!(inputs.validate().is_ok());
        assert!(inputs.is_pure_private());
    }

    #[test]
    fn test_join_split_with_deposit() {
        let inputs = JoinSplitPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            vec![[3u8; 32]],
            vec![[5u8; 32]],
            1000,
            test_pubkey(),
            0,
        );
        assert!(inputs.validate().is_ok());
        assert!(inputs.is_deposit());
        assert!(!inputs.is_withdrawal());
    }

    #[test]
    fn test_join_split_with_withdrawal() {
        let inputs = JoinSplitPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            vec![[3u8; 32]],
            vec![[5u8; 32]],
            -1000,
            test_pubkey(),
            100,
        );
        assert!(inputs.validate().is_ok());
        assert!(inputs.is_withdrawal());
        assert_eq!(inputs.net_withdrawal().unwrap(), 900);
    }

    #[test]
    fn test_join_split_duplicate_nullifiers() {
        let inputs = JoinSplitPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            vec![[3u8; 32], [3u8; 32]], // Same nullifier twice
            vec![[5u8; 32]],
            0,
            test_pubkey(),
            0,
        );
        assert!(inputs.validate().is_err());
    }

    // ----- Membership tests -----

    #[test]
    fn test_membership_valid() {
        let inputs = MembershipPublicInputs::new(
            [1u8; 32],
            [2u8; 32],
            1000,
            [4u8; 32],
        );
        assert!(inputs.validate().is_ok());
        assert_eq!(inputs.to_field_elements().len(), MembershipPublicInputs::COUNT);
    }

    // ----- Builder tests -----

    #[test]
    fn test_withdraw_builder() {
        let result = WithdrawPublicInputsBuilder::new()
            .merkle_root([1u8; 32])
            .nullifier_hash([2u8; 32])
            .asset_id([3u8; 32])
            .recipient(test_pubkey())
            .amount(1000)
            .relayer(test_pubkey())
            .relayer_fee(100)
            .build();
        assert!(result.is_ok());
    }

    #[test]
    fn test_join_split_builder() {
        let result = JoinSplitPublicInputsBuilder::new()
            .merkle_root([1u8; 32])
            .asset_id([2u8; 32])
            .add_nullifier([3u8; 32])
            .add_output([4u8; 32])
            .public_amount(0)
            .build();
        assert!(result.is_ok());
    }
}
