//! Reset Merkle Tree Instruction
//!
//! Admin function to reset merkle tree state to empty.
use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;
use crate::state::{PoolConfigV2, MerkleTreeV2};

#[derive(Accounts)]
pub struct ResetMerkleTree<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(
        mut,
        constraint = pool_config.merkle_tree == merkle_tree.key() @ PrivacyErrorV2::InvalidMerkleTreePool,
    )]
    pub merkle_tree: Box<Account<'info, MerkleTreeV2>>,
}

pub fn handler(ctx: Context<ResetMerkleTree>) -> Result<()> {
    let merkle = &mut ctx.accounts.merkle_tree;
    
    // Reset to empty tree state
    merkle.next_leaf_index = 0;
    merkle.current_root = merkle.zeros[merkle.depth as usize];
    merkle.filled_subtrees = merkle.zeros[..merkle.depth as usize].to_vec();
    merkle.root_history_index = 0;
    
    // Clear root history
    for i in 0..merkle.root_history.len() {
        merkle.root_history[i] = [0u8; 32];
    }
    
    msg!("Merkle tree reset to empty state");
    Ok(())
}
