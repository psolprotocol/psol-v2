//! Initialize Pool V2 Instruction
//!
//! Creates a new MASP pool with associated Merkle tree, relayer registry,
//! and compliance configuration accounts.

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::PoolInitializedV2;
use crate::state::{MAX_TREE_DEPTH, MIN_TREE_DEPTH, MIN_ROOT_HISTORY_SIZE};
use crate::InitializePoolV2;

/// Handler for initialize_pool_v2 instruction
pub fn handler(
    ctx: Context<InitializePoolV2>,
    tree_depth: u8,
    root_history_size: u16,
) -> Result<()> {
    // Validate tree depth
    require!(
        tree_depth >= MIN_TREE_DEPTH && tree_depth <= MAX_TREE_DEPTH,
        PrivacyErrorV2::InvalidTreeDepth
    );

    // Validate root history size
    require!(
        root_history_size >= MIN_ROOT_HISTORY_SIZE,
        PrivacyErrorV2::InvalidRootHistorySize
    );

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Get bumps from context
    let pool_bump = ctx.bumps.pool_config;
    let _merkle_bump = ctx.bumps.merkle_tree;
    let registry_bump = ctx.bumps.relayer_registry;
    let compliance_bump = ctx.bumps.compliance_config;

    // Initialize pool config
    ctx.accounts.pool_config.initialize(
        ctx.accounts.authority.key(),
        ctx.accounts.merkle_tree.key(),
        ctx.accounts.relayer_registry.key(),
        ctx.accounts.compliance_config.key(),
        tree_depth,
        pool_bump,
        timestamp,
    );

    // Initialize Merkle tree
    ctx.accounts.merkle_tree.initialize(
        ctx.accounts.pool_config.key(),
        tree_depth,
        root_history_size,
    )?;

    // Initialize relayer registry
    ctx.accounts.relayer_registry.initialize(
        ctx.accounts.pool_config.key(),
        registry_bump,
        timestamp,
    );

    // Initialize compliance config
    ctx.accounts.compliance_config.initialize(
        ctx.accounts.pool_config.key(),
        compliance_bump,
        timestamp,
    );

    // Emit initialization event
    emit!(PoolInitializedV2 {
        pool: ctx.accounts.pool_config.key(),
        authority: ctx.accounts.authority.key(),
        merkle_tree: ctx.accounts.merkle_tree.key(),
        relayer_registry: ctx.accounts.relayer_registry.key(),
        tree_depth,
        root_history_size,
        timestamp,
    });

    msg!(
        "Initialized pSOL v2 pool: depth={}, history_size={}",
        tree_depth,
        root_history_size
    );

    Ok(())
}
