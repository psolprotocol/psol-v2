//! Verification Key storage for Groth16 proofs - pSOL v2
//!
//! # Multiple VK Support
//! Unlike v1, pSOL v2 supports multiple verification keys for different
//! proof types: Deposit, Withdraw, JoinSplit, and Membership.
//!
//! Each VK is stored in a separate PDA account based on proof type.
//!
//! # Security
//! - VKs must come from a properly executed trusted setup
//! - Each VK can be locked independently
//! - Compromised VK = compromised proof type

use anchor_lang::prelude::*;

use crate::ProofType;

/// Groth16 Verification Key account - pSOL v2
///
/// PDA Seeds: `[proof_type.as_seed(), pool_config.key().as_ref()]`
///
/// # Point Encodings
/// - G1 points: 64 bytes (32 bytes x, 32 bytes y) - uncompressed
/// - G2 points: 128 bytes (64 bytes x, 64 bytes y) - uncompressed
#[account]
pub struct VerificationKeyAccountV2 {
    /// Reference to parent pool
    pub pool: Pubkey,

    /// Proof type this VK is for
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
    /// IC[0] + Σ(public_input[i] * IC[i+1])
    pub vk_ic: Vec<[u8; 64]>,

    /// Whether this VK has been initialized
    pub is_initialized: bool,

    /// Whether this VK is locked (immutable)
    pub is_locked: bool,

    /// PDA bump seed
    pub bump: u8,

    /// Timestamp when VK was set
    pub set_at: i64,

    /// Timestamp when VK was locked (0 if not locked)
    pub locked_at: i64,

    /// Hash of the VK for integrity verification
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

    /// Expected IC points for each proof type
    pub fn expected_ic_points(proof_type: ProofType) -> u8 {
        match proof_type {
            // Withdraw: root, nullifier, recipient, amount, asset_id, relayer, relayer_fee
            ProofType::Withdraw => 8,
            // Deposit: commitment, asset_id
            ProofType::Deposit => 3,
            // JoinSplit: root, nullifiers[2], outputs[2], public_amount, asset_id, relayer_fee
            ProofType::JoinSplit => 10,
            // Membership: root, threshold, asset_id
            ProofType::Membership => 4,
        }
    }

    /// Default max IC points
    pub const DEFAULT_MAX_IC_POINTS: u8 = 15;

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

        // Compute VK hash for integrity
        self.vk_hash = self.compute_vk_hash();
    }

    /// Lock the VK (make immutable)
    pub fn lock(&mut self, timestamp: i64) {
        self.is_locked = true;
        self.locked_at = timestamp;
    }

    /// Check if VK is properly initialized
    pub fn is_valid(&self) -> bool {
        self.is_initialized && self.vk_ic_len > 0
    }

    /// Get expected number of public inputs based on IC length
    pub fn expected_public_inputs(&self) -> u8 {
        if self.vk_ic_len > 0 {
            self.vk_ic_len - 1
        } else {
            0
        }
    }

    /// Get proof type
    pub fn get_proof_type(&self) -> Option<ProofType> {
        match self.proof_type {
            0 => Some(ProofType::Deposit),
            1 => Some(ProofType::Withdraw),
            2 => Some(ProofType::JoinSplit),
            3 => Some(ProofType::Membership),
            _ => None,
        }
    }

    /// Compute hash of VK for integrity verification
    fn compute_vk_hash(&self) -> [u8; 32] {
        use solana_program::keccak;

        let mut data = Vec::with_capacity(512);
        data.extend_from_slice(&self.vk_alpha_g1);
        data.extend_from_slice(&self.vk_beta_g2);
        data.extend_from_slice(&self.vk_gamma_g2);
        data.extend_from_slice(&self.vk_delta_g2);
        for ic in &self.vk_ic {
            data.extend_from_slice(ic);
        }

        keccak::hash(&data).to_bytes()
    }

    /// Verify VK integrity
    pub fn verify_integrity(&self) -> bool {
        let computed = self.compute_vk_hash();
        computed == self.vk_hash
    }
}

/// Helper struct for verification operations
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

/// PDA seeds for VerificationKeyAccountV2
impl VerificationKeyAccountV2 {
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
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::Withdraw), 8);
        assert_eq!(VerificationKeyAccountV2::expected_ic_points(ProofType::JoinSplit), 10);
    }

    #[test]
    fn test_space_calculation() {
        let space = VerificationKeyAccountV2::space(15);
        assert!(space < 2000); // Should be reasonably sized
    }
}
