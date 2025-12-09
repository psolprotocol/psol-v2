//! Incremental Merkle Tree for MASP commitment storage - pSOL v2
//!
//! # Multi-Asset Shared Tree
//! Unlike v1, the v2 Merkle tree is shared across all assets.
//! Commitments include the asset_id to distinguish between assets
//! while maintaining a single anonymity set.
//!
//! # Commitment Format
//! commitment = Poseidon(secret, nullifier, amount, asset_id)
//!
//! # Performance
//! - O(log n) insertions using filled_subtrees pattern
//! - O(1) root history lookup for stale-proof tolerance

use anchor_lang::prelude::*;

use crate::crypto::poseidon;
use crate::error::PrivacyErrorV2;

/// Maximum supported tree depth (2^24 = ~16M leaves)
pub const MAX_TREE_DEPTH: u8 = 24;

/// Minimum supported tree depth
pub const MIN_TREE_DEPTH: u8 = 4;

/// Minimum root history size
pub const MIN_ROOT_HISTORY_SIZE: u16 = 30;

/// Default root history size
pub const DEFAULT_ROOT_HISTORY_SIZE: u16 = 100;

/// Incremental Merkle tree state account for MASP v2
///
/// PDA Seeds: `[b"merkle_tree_v2", pool_config.key().as_ref()]`
#[account]
pub struct MerkleTreeV2 {
    /// Reference to parent pool
    pub pool: Pubkey,

    /// Tree depth (immutable after init)
    pub depth: u8,

    /// Next leaf index to be filled (also = total leaves inserted)
    pub next_leaf_index: u32,

    /// Current root hash
    pub current_root: [u8; 32],

    /// Root history for withdrawal proofs (circular buffer)
    /// Allows users to prove against recent roots even if tree updated
    pub root_history: Vec<[u8; 32]>,

    /// Current position in circular root history buffer
    pub root_history_index: u16,

    /// Maximum root history size (set at init)
    pub root_history_size: u16,

    /// Filled subtrees for incremental updates
    /// Contains the rightmost non-zero hash at each level
    /// Length = depth
    pub filled_subtrees: Vec<[u8; 32]>,

    /// Precomputed zero values for each level
    /// zeros[0] = hash of empty leaf
    /// zeros[i] = hash(zeros[i-1], zeros[i-1])
    /// Length = depth + 1
    pub zeros: Vec<[u8; 32]>,

    /// Total deposits by leaf count (for statistics)
    pub total_leaves: u64,

    /// Last insertion timestamp
    pub last_insertion_at: i64,

    /// Tree version (for potential upgrades)
    pub version: u8,
}

impl MerkleTreeV2 {
    /// Calculate space needed for merkle tree account
    pub fn space(depth: u8, root_history_size: u16) -> usize {
        let depth_usize = depth as usize;
        let history_usize = root_history_size as usize;

        8                                       // discriminator
            + 32                                // pool
            + 1                                 // depth
            + 4                                 // next_leaf_index
            + 32                                // current_root
            + 4 + (32 * history_usize)          // root_history (vec)
            + 2                                 // root_history_index
            + 2                                 // root_history_size
            + 4 + (32 * depth_usize)            // filled_subtrees (vec)
            + 4 + (32 * (depth_usize + 1))      // zeros (vec)
            + 8                                 // total_leaves
            + 8                                 // last_insertion_at
            + 1                                 // version
    }

    pub const VERSION: u8 = 2;

    /// Initialize the Merkle tree with empty state
    pub fn initialize(
        &mut self,
        pool: Pubkey,
        depth: u8,
        root_history_size: u16,
    ) -> Result<()> {
        // Validate parameters
        require!(
            depth >= MIN_TREE_DEPTH && depth <= MAX_TREE_DEPTH,
            PrivacyErrorV2::InvalidTreeDepth
        );
        require!(
            root_history_size >= MIN_ROOT_HISTORY_SIZE,
            PrivacyErrorV2::InvalidRootHistorySize
        );

        self.pool = pool;
        self.depth = depth;
        self.next_leaf_index = 0;
        self.root_history_index = 0;
        self.root_history_size = root_history_size;
        self.total_leaves = 0;
        self.last_insertion_at = 0;
        self.version = Self::VERSION;

        // Compute and store zero values for all levels
        self.zeros = Self::compute_zero_values(depth);

        // Initialize filled subtrees with zeros
        self.filled_subtrees = self.zeros[..depth as usize].to_vec();

        // Initialize root history buffer
        self.root_history = vec![[0u8; 32]; root_history_size as usize];

        // Set initial root (root of empty tree)
        self.current_root = self.zeros[depth as usize];

        // Store initial root in history
        self.root_history[0] = self.current_root;

        Ok(())
    }

    /// Compute zero hash values for each tree level
    ///
    /// Level 0 = leaf level (zero leaf)
    /// Level depth = root level
    fn compute_zero_values(depth: u8) -> Vec<[u8; 32]> {
        let mut zeros = Vec::with_capacity((depth + 1) as usize);

        // Level 0: canonical zero leaf
        zeros.push([0u8; 32]);

        // Compute hash(zero[i-1], zero[i-1]) for each level
        for i in 1..=depth {
            let prev = &zeros[(i - 1) as usize];
            let zero_at_level = poseidon::hash_two_to_one(prev, prev);
            zeros.push(zero_at_level);
        }

        zeros
    }

    /// Insert a new commitment leaf into the tree
    ///
    /// # Arguments
    /// * `commitment` - 32-byte commitment hash
    /// * `timestamp` - Current timestamp for tracking
    ///
    /// # Returns
    /// The leaf index where commitment was inserted
    pub fn insert_leaf(&mut self, commitment: [u8; 32], timestamp: i64) -> Result<u32> {
        // Check tree capacity
        let max_leaves = 1u32
            .checked_shl(self.depth as u32)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        require!(
            self.next_leaf_index < max_leaves,
            PrivacyErrorV2::MerkleTreeFull
        );

        let leaf_index = self.next_leaf_index;
        let mut current_hash = commitment;
        let mut current_index = leaf_index;

        // Walk up the tree, updating hashes
        for level in 0..self.depth {
            let level_usize = level as usize;

            // Determine if this node is a left (0) or right (1) child
            let is_right_child = (current_index & 1) == 1;
            current_index >>= 1;

            if is_right_child {
                // Right child: hash with left sibling from filled_subtrees
                let left_sibling = self.filled_subtrees[level_usize];
                current_hash = poseidon::hash_two_to_one(&left_sibling, &current_hash);
            } else {
                // Left child: update filled_subtree, hash with zero
                self.filled_subtrees[level_usize] = current_hash;
                current_hash = poseidon::hash_two_to_one(&current_hash, &self.zeros[level_usize]);
            }
        }

        // Update current root
        self.current_root = current_hash;

        // Add to root history (circular buffer)
        self.root_history_index = (self.root_history_index + 1) % self.root_history_size;
        self.root_history[self.root_history_index as usize] = current_hash;

        // Increment leaf counter
        self.next_leaf_index = self
            .next_leaf_index
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;

        // Update statistics
        self.total_leaves = self
            .total_leaves
            .checked_add(1)
            .ok_or(error!(PrivacyErrorV2::ArithmeticOverflow))?;
        self.last_insertion_at = timestamp;

        Ok(leaf_index)
    }

    /// Insert multiple commitments in a batch (for join-split outputs)
    ///
    /// # Arguments
    /// * `commitments` - Vector of commitment hashes
    /// * `timestamp` - Current timestamp
    ///
    /// # Returns
    /// Vector of leaf indices where commitments were inserted
    pub fn insert_batch(
        &mut self,
        commitments: &[[u8; 32]],
        timestamp: i64,
    ) -> Result<Vec<u32>> {
        let mut indices = Vec::with_capacity(commitments.len());

        for commitment in commitments {
            let index = self.insert_leaf(*commitment, timestamp)?;
            indices.push(index);
        }

        Ok(indices)
    }

    /// Check if a root exists in recent history
    pub fn is_known_root(&self, root: &[u8; 32]) -> bool {
        // Check current root first (most common case)
        if *root == self.current_root {
            return true;
        }

        // Check history buffer
        self.root_history.iter().any(|r| r == root)
    }

    /// Get the current Merkle root
    pub fn get_current_root(&self) -> [u8; 32] {
        self.current_root
    }

    /// Get the next leaf index
    pub fn get_next_leaf_index(&self) -> u32 {
        self.next_leaf_index
    }

    /// Get tree capacity
    pub fn capacity(&self) -> u32 {
        1u32.checked_shl(self.depth as u32).unwrap_or(u32::MAX)
    }

    /// Check if tree is full
    pub fn is_full(&self) -> bool {
        self.next_leaf_index >= self.capacity()
    }

    /// Get available space in tree
    pub fn available_space(&self) -> u32 {
        self.capacity().saturating_sub(self.next_leaf_index)
    }

    /// Get fill percentage (0-100)
    pub fn fill_percentage(&self) -> u8 {
        let capacity = self.capacity() as u64;
        let used = self.next_leaf_index as u64;
        ((used * 100) / capacity) as u8
    }
}

/// PDA seeds for MerkleTreeV2
impl MerkleTreeV2 {
    pub const SEED_PREFIX: &'static [u8] = b"merkle_tree_v2";

    pub fn find_pda(program_id: &Pubkey, pool: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[Self::SEED_PREFIX, pool.as_ref()],
            program_id,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_space_calculation() {
        let space = MerkleTreeV2::space(20, 100);
        // Should be reasonable size
        assert!(space < 10_000_000); // Less than 10MB
    }

    #[test]
    fn test_zero_values_deterministic() {
        let zeros1 = MerkleTreeV2::compute_zero_values(10);
        let zeros2 = MerkleTreeV2::compute_zero_values(10);
        assert_eq!(zeros1, zeros2);
    }

    #[test]
    fn test_capacity() {
        let tree = MerkleTreeV2 {
            pool: Pubkey::default(),
            depth: 20,
            next_leaf_index: 0,
            current_root: [0u8; 32],
            root_history: vec![],
            root_history_index: 0,
            root_history_size: 100,
            filled_subtrees: vec![],
            zeros: vec![],
            total_leaves: 0,
            last_insertion_at: 0,
            version: 2,
        };

        assert_eq!(tree.capacity(), 1 << 20); // 2^20 = 1,048,576
        assert!(!tree.is_full());
    }
}
