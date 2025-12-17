//! Verification Key storage for Groth16 proofs - pSOL v2
//!
//! # Multiple VK Support
//!
//! Unlike v1, pSOL v2 supports multiple verification keys for different
//! proof types: Deposit, Withdraw, JoinSplit, and Membership.
//!
//! Each VK is stored in a separate PDA account based on proof type.
//!
//! # IC Points
//!
//! For Groth16 proofs, the number of IC points = number of public inputs + 1.
//! IC[0] is the constant term, IC[1..n] correspond to each public input.
//!
//! # Security
//!
//! - VKs must come from a properly executed trusted setup (MPC ceremony)
//! - Each VK can be locked independently
//! - Compromised VK = compromised proof type
//! - VK hash is computed for integrity verification

use anchor_lang::prelude::*;

use crate::ProofType;

/// Groth16 Verification Key account - pSOL v2
///
/// PDA Seeds: `[proof_type.as_seed(), pool_config.key().as_ref()]`
///
/// # Point Encodings
///
/// - G1 points: 64 bytes (32 bytes x, 32 bytes y) - uncompressed, big-endian
/// - G2 points: 128 bytes (64 bytes x, 64 bytes y) - uncompressed, big-endian
///
/// # Trusted Setup
///
/// The verification key comes from a trusted setup ceremony (Phase 2).
/// For production, use a multi-party computation (MPC) ceremony to ensure
/// no single party knows the toxic waste.
#[account]
pub struct VerificationKeyAccountV2 {
    /// Reference to parent pool
    pub pool: Pubkey,

    /// Proof type this VK is for (0=Deposit, 1=Withdraw, 2=JoinSplit, 3=Membership)
    pub proof_type: u8,

    /// α ∈ G1 - Part of the verification equation
    pub vk_alpha_g1: [u8; 64],

    /// β ∈ G2 - Part of the verification equation
    pub vk_beta_g2: [u8; 128],

    /// γ ∈ G2 - Used for public input accumulation
    pub vk_gamma_g2: [u8; 128],

    /// δ ∈ G2 - Used for proof verification
    pub vk_delta_g2: [u8; 128],

    /// Number of IC points (= number of public inputs + 1)
    pub vk_ic_len: u8,

    /// IC points ∈ G1 - Used for public input linear combination
    /// vk_x = IC[0] + Σ(public_input[i] * IC[i+1])
    pub vk_ic: Vec<[u8; 64]>,

    /// Whether this VK has been initialized with actual data
    pub is_initialized: bool,

    /// Whether this VK is locked (immutable)
    pub is_locked: bool,

    /// PDA bump seed
    pub bump: u8,

    /// Timestamp when VK was set
    pub set_at: i64,

    /// Timestamp when VK was locked (0 if not locked)
    pub locked_at: i64,

    /// Keccak256 hash of the VK for integrity verification
    pub vk_hash: [u8; 32],

    /// Reserved for future use
    pub _reserved: [u8; 32],
}

impl VerificationKeyAccountV2 {
    /// Calculate space for VK account
    pub fn space(max_ic_points: u8) -> usize {
        8                                       // discriminator
            + 32                                // pool
            + 1                                 // proof_type
            + 64                                // vk_alpha_g1
            + 128                               // vk_beta_g2
            + 128                               // vk_gamma_g2
            + 128                               // vk_delta_g2
            + 1                                 // vk_ic_len
            + 4 + (64 * max_ic_points as usize) // vk_ic (vec)
            + 1                                 // is_initialized
            + 1                                 // is_locked
            + 1                                 // bump
            + 8                                 // set_at
            + 8                                 // locked_at
            + 32                                // vk_hash
            + 32                                // reserved
    }

    /// Expected IC points for each proof type.
    ///
    /// # Important
    ///
    /// For Groth16: IC points = public inputs + 1
    /// - IC[0] is the constant term
    /// - IC[1..n] correspond to each public input
    ///
    /// # Circuit Public Inputs
    ///
    /// ## Deposit (3 inputs → 4 IC points)
    /// 1. commitment
    /// 2. amount
    /// 3. asset_id
    ///
    /// ## Withdraw (8 inputs → 9 IC points)
    /// 1. merkle_root
    /// 2. nullifier_hash
    /// 3. asset_id
    /// 4. recipient
    /// 5. amount
    /// 6. relayer
    /// 7. relayer_fee
    /// 8. public_data_hash
    ///
    /// ## JoinSplit (9 inputs → 10 IC points)
    /// 1. merkle_root
    /// 2. asset_id
    /// 3. input_nullifier_0
    /// 4. input_nullifier_1
    /// 5. output_commitment_0
    /// 6. output_commitment_1
    /// 7. public_amount
    /// 8. relayer
    /// 9. relayer_fee
    ///
    /// ## Membership (4 inputs → 5 IC points)
    /// 1. merkle_root
    /// 2. commitment_hash
    /// 3. threshold
    /// 4. asset_id
    pub fn expected_ic_points(proof_type: ProofType) -> u8 {
        match proof_type {
            ProofType::Deposit => 4,    // 3 public inputs + 1
            ProofType::Withdraw => 9,   // 8 public inputs + 1
            ProofType::JoinSplit => 10, // 9 public inputs + 1
            ProofType::Membership => 5, // 4 public inputs + 1
        }
    }

    /// Get number of expected public inputs for a proof type
    pub fn expected_public_inputs_for_type(proof_type: ProofType) -> u8 {
        Self::expected_ic_points(proof_type) - 1
    }

    /// Default max IC points (covers all proof types with margin)
    pub const DEFAULT_MAX_IC_POINTS: u8 = 15;

    /// Seed prefix for PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"vk_v2";

    /// Initialize the VK account (empty, not yet configured)
    pub fn initialize(&mut self, pool: Pubkey, proof_type: ProofType, bump: u8) {
        self.pool = pool;
        self.proof_type = proof_type as u8;
        self.vk_alpha_g1 = [0u8; 64];
        self.vk_beta_g2 = [0u8; 128];
        self.vk_gamma_g2 = [0u8; 128];
        self.vk_delta_g2 = [0u8; 128];
        self.vk_ic_len = 0;
        self.vk_ic = Vec::new();
        self.is_initialized = false;
        self.is_locked = false;
        self.bump = bump;
        self.set_at = 0;
        self.locked_at = 0;
        self.vk_hash = [0u8; 32];
        self._reserved = [0u8; 32];
    }

    /// Set the verification key data
    ///
    /// # Arguments
    ///
    /// * `alpha_g1` - α point in G1 (64 bytes)
    /// * `beta_g2` - β point in G2 (128 bytes)
    /// * `gamma_g2` - γ point in G2 (128 bytes)
    /// * `delta_g2` - δ point in G2 (128 bytes)
    /// * `ic` - IC points in G1 (variable length)
    /// * `timestamp` - Current timestamp
    ///
    /// # Panics
    ///
    /// Does not panic, but caller should validate:
    /// - VK is not locked
    /// - IC length matches expected for proof type
    #[allow(clippy::too_many_arguments)]
    pub fn set_vk(
        &mut self,
        alpha_g1: [u8; 64],
        beta_g2: [u8; 128],
        gamma_g2: [u8; 128],
        delta_g2: [u8; 128],
        ic: Vec<[u8; 64]>,
        timestamp: i64,
    ) {
        self.vk_alpha_g1 = alpha_g1;
        self.vk_beta_g2 = beta_g2;
        self.vk_gamma_g2 = gamma_g2;
        self.vk_delta_g2 = delta_g2;
        self.vk_ic_len = ic.len() as u8;
        self.vk_ic = ic;
        self.is_initialized = true;
        self.set_at = timestamp;

        // Compute VK hash for integrity verification
        self.vk_hash = self.compute_vk_hash();
    }

    /// Lock the VK (make immutable)
    ///
    /// Once locked, the VK cannot be modified. This is important for
    /// production deployments to prevent VK replacement attacks.
    pub fn lock(&mut self, timestamp: i64) {
        self.is_locked = true;
        self.locked_at = timestamp;
    }

    /// Check if VK is properly initialized and valid
    pub fn is_valid(&self) -> bool {
        self.is_initialized 
            && self.vk_ic_len > 0 
            && self.vk_ic.len() == self.vk_ic_len as usize
    }

    /// Get expected number of public inputs based on IC length
    pub fn expected_public_inputs(&self) -> u8 {
        if self.vk_ic_len > 0 {
            self.vk_ic_len - 1
        } else {
            0
        }
    }

    /// Validate that VK IC length matches expected for proof type
    ///
    /// This should be called when setting a VK to ensure it matches
    /// the expected circuit.
    pub fn validate_ic_length(&self) -> bool {
        if let Some(proof_type) = self.get_proof_type() {
            self.vk_ic_len == Self::expected_ic_points(proof_type)
        } else {
            false
        }
    }

    /// Validate that provided IC length matches expected for proof type
    ///
    /// Use this before setting a VK to validate the input.
    pub fn validate_ic_length_for_type(proof_type: ProofType, ic_len: u8) -> bool {
        ic_len == Self::expected_ic_points(proof_type)
    }

    /// Get proof type from stored value
    pub fn get_proof_type(&self) -> Option<ProofType> {
        match self.proof_type {
            0 => Some(ProofType::Deposit),
            1 => Some(ProofType::Withdraw),
            2 => Some(ProofType::JoinSplit),
            3 => Some(ProofType::Membership),
            _ => None,
        }
    }

    /// Compute Keccak256 hash of VK for integrity verification
    fn compute_vk_hash(&self) -> [u8; 32] {
        use anchor_lang::solana_program::keccak;

        let mut data = Vec::with_capacity(512 + self.vk_ic.len() * 64);
        data.extend_from_slice(&self.vk_alpha_g1);
        data.extend_from_slice(&self.vk_beta_g2);
        data.extend_from_slice(&self.vk_gamma_g2);
        data.extend_from_slice(&self.vk_delta_g2);
        for ic in &self.vk_ic {
            data.extend_from_slice(ic);
        }

        keccak::hash(&data).to_bytes()
    }

    /// Verify VK integrity by recomputing hash
    pub fn verify_integrity(&self) -> bool {
        let computed = self.compute_vk_hash();
        computed == self.vk_hash
    }

    /// Get VK as verification helper struct
    pub fn to_vk(&self) -> VerificationKeyV2 {
        VerificationKeyV2::from(self)
    }
}

/// Helper struct for verification operations
///
/// This is a lightweight copy of the VK data for use in verification
/// without needing the full account structure.
#[derive(Clone, Debug)]
pub struct VerificationKeyV2 {
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
    pub ic: Vec<[u8; 64]>,
}

impl From<&VerificationKeyAccountV2> for VerificationKeyV2 {
    fn from(account: &VerificationKeyAccountV2) -> Self {
        VerificationKeyV2 {
            alpha_g1: account.vk_alpha_g1,
            beta_g2: account.vk_beta_g2,
            gamma_g2: account.vk_gamma_g2,
            delta_g2: account.vk_delta_g2,
            ic: account.vk_ic.clone(),
        }
    }
}

impl VerificationKeyV2 {
    /// Get number of public inputs this VK expects
    pub fn num_public_inputs(&self) -> usize {
        if self.ic.is_empty() {
            0
        } else {
            self.ic.len() - 1
        }
    }
}

/// PDA derivation for VerificationKeyAccountV2
impl VerificationKeyAccountV2 {
    /// Find PDA for a verification key
    pub fn find_pda(
        program_id: &Pubkey,
        pool: &Pubkey,
        proof_type: ProofType,
    ) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[proof_type.as_seed(), pool.as_ref()],
            program_id,
        )
    }

    /// Get seeds for signing
    pub fn seeds<'a>(
        proof_type: &'a ProofType,
        pool: &'a Pubkey,
        bump: &'a [u8; 1],
    ) -> [&'a [u8]; 3] {
        [proof_type.as_seed(), pool.as_ref(), bump]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expected_ic_points() {
        // IC points = public inputs + 1
        // Deposit: commitment, amount, asset_id = 3 inputs → 4 IC
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::Deposit), 4);
        
        // Withdraw: merkle_root, nullifier_hash, asset_id, recipient, 
        //           amount, relayer, relayer_fee, public_data_hash = 8 inputs → 9 IC
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::Withdraw), 9);
        
        // JoinSplit: merkle_root, asset_id, input_nullifiers[2], output_commitments[2],
        //            public_amount, relayer, relayer_fee = 9 inputs → 10 IC
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::JoinSplit), 10);
        
        // Membership: merkle_root, commitment_hash, threshold, asset_id = 4 inputs → 5 IC
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::Membership), 5);
    }

    #[test]
    fn test_expected_public_inputs_for_type() {
        assert_eq!(VerificationKeyAccountV2::expected_public_inputs_for_type(ProofType::Deposit), 3);
        assert_eq!(VerificationKeyAccountV2::expected_public_inputs_for_type(ProofType::Withdraw), 8);
        assert_eq!(VerificationKeyAccountV2::expected_public_inputs_for_type(ProofType::JoinSplit), 9);
        assert_eq!(VerificationKeyAccountV2::expected_public_inputs_for_type(ProofType::Membership), 4);
    }

    #[test]
    fn test_space_calculation() {
        let space = VerificationKeyAccountV2::space(15);
        // Should fit in reasonable account size
        assert!(space < 2000);
        assert!(space > 500); // But not trivially small
    }

    #[test]
    fn test_ic_validation() {
        let mut vk = VerificationKeyAccountV2 {
            pool: Pubkey::new_unique(),
            proof_type: ProofType::Withdraw as u8,
            vk_alpha_g1: [0u8; 64],
            vk_beta_g2: [0u8; 128],
            vk_gamma_g2: [0u8; 128],
            vk_delta_g2: [0u8; 128],
            vk_ic_len: 9, // Correct for Withdraw (8 public inputs + 1)
            vk_ic: vec![[0u8; 64]; 9],
            is_initialized: true,
            is_locked: false,
            bump: 0,
            set_at: 0,
            locked_at: 0,
            vk_hash: [0u8; 32],
            _reserved: [0u8; 32],
        };
        
        assert!(vk.validate_ic_length());
        assert!(vk.is_valid());
        
        // Wrong IC length
        vk.vk_ic_len = 8;
        assert!(!vk.validate_ic_length());
    }

    #[test]
    fn test_validate_ic_length_for_type() {
        assert!(VerificationKeyAccountV2::validate_ic_length_for_type(ProofType::Deposit, 4));
        assert!(!VerificationKeyAccountV2::validate_ic_length_for_type(ProofType::Deposit, 3));
        assert!(!VerificationKeyAccountV2::validate_ic_length_for_type(ProofType::Deposit, 5));

        assert!(VerificationKeyAccountV2::validate_ic_length_for_type(ProofType::Withdraw, 9));
        assert!(!VerificationKeyAccountV2::validate_ic_length_for_type(ProofType::Withdraw, 8));
    }

    #[test]
    fn test_get_proof_type() {
        let mut vk = VerificationKeyAccountV2 {
            pool: Pubkey::new_unique(),
            proof_type: 0,
            vk_alpha_g1: [0u8; 64],
            vk_beta_g2: [0u8; 128],
            vk_gamma_g2: [0u8; 128],
            vk_delta_g2: [0u8; 128],
            vk_ic_len: 0,
            vk_ic: vec![],
            is_initialized: false,
            is_locked: false,
            bump: 0,
            set_at: 0,
            locked_at: 0,
            vk_hash: [0u8; 32],
            _reserved: [0u8; 32],
        };

        vk.proof_type = 0;
        assert_eq!(vk.get_proof_type(), Some(ProofType::Deposit));

        vk.proof_type = 1;
        assert_eq!(vk.get_proof_type(), Some(ProofType::Withdraw));

        vk.proof_type = 2;
        assert_eq!(vk.get_proof_type(), Some(ProofType::JoinSplit));

        vk.proof_type = 3;
        assert_eq!(vk.get_proof_type(), Some(ProofType::Membership));

        vk.proof_type = 255;
        assert_eq!(vk.get_proof_type(), None);
    }

    #[test]
    fn test_vk_hash_integrity() {
        let mut vk = VerificationKeyAccountV2 {
            pool: Pubkey::new_unique(),
            proof_type: ProofType::Deposit as u8,
            vk_alpha_g1: [1u8; 64],
            vk_beta_g2: [2u8; 128],
            vk_gamma_g2: [3u8; 128],
            vk_delta_g2: [4u8; 128],
            vk_ic_len: 4,
            vk_ic: vec![[5u8; 64]; 4],
            is_initialized: true,
            is_locked: false,
            bump: 0,
            set_at: 0,
            locked_at: 0,
            vk_hash: [0u8; 32],
            _reserved: [0u8; 32],
        };

        // Compute hash
        vk.vk_hash = vk.compute_vk_hash();

        // Verify integrity passes
        assert!(vk.verify_integrity());

        // Tamper with data
        vk.vk_alpha_g1[0] = 99;

        // Verify integrity fails
        assert!(!vk.verify_integrity());
    }

    #[test]
    fn test_verification_key_v2_helper() {
        let account = VerificationKeyAccountV2 {
            pool: Pubkey::new_unique(),
            proof_type: ProofType::Withdraw as u8,
            vk_alpha_g1: [1u8; 64],
            vk_beta_g2: [2u8; 128],
            vk_gamma_g2: [3u8; 128],
            vk_delta_g2: [4u8; 128],
            vk_ic_len: 9,
            vk_ic: vec![[5u8; 64]; 9],
            is_initialized: true,
            is_locked: false,
            bump: 0,
            set_at: 0,
            locked_at: 0,
            vk_hash: [0u8; 32],
            _reserved: [0u8; 32],
        };

        let vk = VerificationKeyV2::from(&account);
        assert_eq!(vk.alpha_g1, [1u8; 64]);
        assert_eq!(vk.ic.len(), 9);
        assert_eq!(vk.num_public_inputs(), 8);
    }
}
