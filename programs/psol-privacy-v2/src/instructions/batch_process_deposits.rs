use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::BatchProcessedEvent;
use crate::state::{BatcherRole, MerkleTreeV2, PendingDepositsBuffer, PoolConfigV2};

/// Maximum deposits to process in a single batch
pub const MAX_BATCH_SIZE: u16 = 50;

/// Accounts for batch processing deposits - ROBUST VERSION
#[derive(Accounts)]
pub struct BatchProcessDeposits<'info> {
    /// Batcher (must be pool authority OR have enabled BatcherRole PDA)
    #[account(mut)]
    pub batcher: Signer<'info>,

    /// Pool configuration
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree @ PrivacyErrorV2::InvalidMerkleTreePool,
    )]
    pub pool_config: Box<Account<'info, PoolConfigV2>>,

    /// Merkle tree account
    #[account(mut)]
    pub merkle_tree: Box<Account<'info, MerkleTreeV2>>,

    /// Pending deposits buffer
    #[account(
        mut,
        seeds = [
            PendingDepositsBuffer::SEED_PREFIX,
            pool_config.key().as_ref(),
        ],
        bump = pending_buffer.bump,
        constraint = pending_buffer.pool == pool_config.key() @ PrivacyErrorV2::InvalidPoolReference,
    )]
    pub pending_buffer: Box<Account<'info, PendingDepositsBuffer>>,

    /// Batcher role PDA (optional - required if not pool authority)
    ///
    /// # ROBUST PDA ENFORCEMENT
    ///
    /// We do NOT use Anchor seeds/bump constraints here because:
    /// 1. Option<Account> + bump constraint is fragile across Anchor versions
    /// 2. Manual PDA check is more explicit and robust
    ///
    /// Instead, we:
    /// 1. Accept optional account (no constraints)
    /// 2. Manually derive expected PDA in handler
    /// 3. Manually compare addresses
    /// 4. Reject if mismatch
    ///
    /// This is Anchor-version-proof.
    pub batcher_role: Option<Account<'info, BatcherRole>>,
}

/// Handler for batch_process_deposits instruction - ROBUST VERSION
///
/// # Arguments
/// * `max_to_process` - Maximum number of deposits to process (1-50)
///
/// # Authorization (Manual PDA Check)
///
/// If batcher is pool authority → Always authorized
/// Else:
///   1. Require batcher_role account provided
///   2. Derive expected PDA: find_program_address([b"batcher", pool, batcher])
///   3. Require batcher_role.key() == expected_pda
///   4. Require is_enabled == true
///
/// This manual check is robust and Anchor-version-proof.
pub fn handler(ctx: Context<BatchProcessDeposits>, max_to_process: u16) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;
    let merkle_tree = &mut ctx.accounts.merkle_tree;
    let pending_buffer = &mut ctx.accounts.pending_buffer;
    let batcher = ctx.accounts.batcher.key();

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // =========================================================================
    // 1. AUTHORIZATION CHECK (MANUAL PDA VERIFICATION)
    // =========================================================================

    let is_authority = batcher == pool_config.authority;

    if !is_authority {
        // Not authority - require valid BatcherRole PDA

        // Step 1: Require account provided
        let batcher_role = ctx
            .accounts
            .batcher_role
            .as_ref()
            .ok_or(PrivacyErrorV2::Unauthorized)?;

        // Step 2: Derive expected PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[
                BatcherRole::SEED_PREFIX,
                pool_config.key().as_ref(),
                batcher.as_ref(),
            ],
            ctx.program_id,
        );

        // Step 3: Compare addresses (CRITICAL SECURITY CHECK)
        require_keys_eq!(
            batcher_role.key(),
            expected_pda,
            PrivacyErrorV2::Unauthorized
        );

        // Step 4: Check is_enabled flag
        require!(batcher_role.is_enabled, PrivacyErrorV2::Unauthorized);

        msg!("Authorized via BatcherRole PDA: {}", batcher_role.key());
    } else {
        msg!("Authorized as pool authority: {}", batcher);
    }

    // =========================================================================
    // 2. VALIDATE BATCH PARAMETERS
    // =========================================================================

    require!(
        !pending_buffer.is_empty(),
        PrivacyErrorV2::NoPendingDeposits
    );

    require!(
        max_to_process > 0 && max_to_process <= MAX_BATCH_SIZE,
        PrivacyErrorV2::InvalidBatchSize
    );

    // Check timing constraints
    if pending_buffer.is_full() {
        require!(
            pending_buffer.should_batch(timestamp),
            PrivacyErrorV2::BatchNotReady
        );
    }

    // =========================================================================
    // 3. VALIDATE MERKLE TREE CAPACITY
    // =========================================================================

    let to_process = std::cmp::min(max_to_process as usize, pending_buffer.size());

    let tree_capacity = merkle_tree.capacity();
    let tree_used = merkle_tree.next_leaf_index as usize;

    require!(
        tree_used + to_process <= tree_capacity as usize,
        PrivacyErrorV2::MerkleTreeFull
    );

    // =========================================================================
    // 4. PROCESS DEPOSITS
    // =========================================================================

    let deposits_to_process = pending_buffer.prepare_batch(max_to_process);
    let actual_count = deposits_to_process.len();

    require!(actual_count > 0, PrivacyErrorV2::NoPendingDeposits);

    let start_leaf_index = merkle_tree.next_leaf_index;

    // Insert each commitment into Merkle tree
    for deposit in deposits_to_process {
        require!(
            !deposit.commitment.iter().all(|&b| b == 0),
            PrivacyErrorV2::InvalidCommitment
        );

        merkle_tree.insert_leaf(deposit.commitment, deposit.timestamp)?;
    }

    let end_leaf_index = merkle_tree.next_leaf_index - 1;
    let final_merkle_root = merkle_tree.get_current_root();

    // =========================================================================
    // 5. UPDATE BUFFER
    // =========================================================================

    pending_buffer.clear_processed(actual_count as u32, timestamp)?;

    // =========================================================================
    // 6. UPDATE POOL STATISTICS
    // =========================================================================

    pool_config.record_batch(actual_count as u32, timestamp)?;

    // =========================================================================
    // 7. UPDATE BATCHER STATISTICS (if using BatcherRole)
    // =========================================================================

    if let Some(batcher_role) = ctx.accounts.batcher_role.as_mut() {
        batcher_role.record_batch(actual_count as u32, timestamp)?;
    }

    // =========================================================================
    // 8. EMIT BATCH EVENT
    // =========================================================================

    emit!(BatchProcessedEvent {
        pool: ctx.accounts.pool_config.key(),
        deposits_processed: actual_count as u16,
        first_leaf_index: start_leaf_index,
        last_leaf_index: end_leaf_index,
        new_merkle_root: final_merkle_root,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Batch processed: {} deposits (indices {}-{})",
        actual_count,
        start_leaf_index,
        end_leaf_index
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_batch_size_compute_budget() {
        const CU_PER_INSERTION: u32 = 20_000;
        const SOLANA_CU_LIMIT: u32 = 1_400_000;
        const OVERHEAD_CU: u32 = 400_000;

        let batch_cu = MAX_BATCH_SIZE as u32 * CU_PER_INSERTION;
        assert!(batch_cu + OVERHEAD_CU <= SOLANA_CU_LIMIT);
    }

    #[test]
    fn test_pda_seeds_documented() {
        // Seeds for manual PDA derivation
        assert_eq!(BatcherRole::SEED_PREFIX, b"batcher");
    }
}
