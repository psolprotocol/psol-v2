//! Chunked Verification Key Upload for pSOL v2
//!
//! Allows uploading large verification keys in multiple transactions.
//! Flow: initialize_vk -> append_vk_ic (multiple) -> finalize_vk

use anchor_lang::prelude::*;

use crate::error::PrivacyErrorV2;
use crate::events::VerificationKeySetV2;
use crate::state::{PoolConfigV2, VerificationKeyAccountV2};
use crate::ProofType;

/// Initialize VK account with base data (alpha, beta, gamma, delta)
#[derive(Accounts)]
#[instruction(proof_type: ProofType)]
pub struct InitializeVkV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    #[account(
        init_if_needed,
        payer = authority,
        space = VerificationKeyAccountV2::space(VerificationKeyAccountV2::DEFAULT_MAX_IC_POINTS),
        seeds = [proof_type.as_seed(), pool_config.key().as_ref()],
        bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    pub system_program: Program<'info, System>,
}

/// Initialize VK with base curve points (no IC yet)
pub fn initialize_vk_handler(
    ctx: Context<InitializeVkV2>,
    proof_type: ProofType,
    vk_alpha_g1: [u8; 64],
    vk_beta_g2: [u8; 128],
    vk_gamma_g2: [u8; 128],
    vk_delta_g2: [u8; 128],
    expected_ic_count: u8,
) -> Result<()> {
    let pool_config = &ctx.accounts.pool_config;
    let vk_account = &mut ctx.accounts.vk_account;

    // Check VK is not locked
    pool_config.require_vk_unlocked(proof_type)?;
    
    if vk_account.is_initialized {
        require!(!vk_account.is_locked, PrivacyErrorV2::VerificationKeyLocked);
    }

    // Validate expected IC count
    let required_ic = VerificationKeyAccountV2::expected_ic_points(proof_type);
    require!(
        expected_ic_count == required_ic,
        PrivacyErrorV2::VkIcLengthMismatch
    );

    // Initialize account
    vk_account.pool = pool_config.key();
    vk_account.proof_type = proof_type as u8;
    vk_account.vk_alpha_g1 = vk_alpha_g1;
    vk_account.vk_beta_g2 = vk_beta_g2;
    vk_account.vk_gamma_g2 = vk_gamma_g2;
    vk_account.vk_delta_g2 = vk_delta_g2;
    vk_account.vk_ic_len = expected_ic_count;
    vk_account.vk_ic = Vec::with_capacity(expected_ic_count as usize);
    vk_account.is_initialized = false; // Not ready until finalized
    vk_account.is_locked = false;
    vk_account.bump = ctx.bumps.vk_account;

    msg!("Initialized VK for {:?}, expecting {} IC points", proof_type, expected_ic_count);

    Ok(())
}

/// Append IC points to VK account
#[derive(Accounts)]
#[instruction(proof_type: ProofType)]
pub struct AppendVkIcV2<'info> {
    pub authority: Signer<'info>,

    #[account(has_one = authority @ PrivacyErrorV2::Unauthorized)]
    pub pool_config: Account<'info, PoolConfigV2>,

    #[account(
        mut,
        seeds = [proof_type.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,
}

/// Append IC points (call multiple times for large VKs)
pub fn append_vk_ic_handler(
    ctx: Context<AppendVkIcV2>,
    _proof_type: ProofType,
    ic_points: Vec<[u8; 64]>,
) -> Result<()> {
    let vk_account = &mut ctx.accounts.vk_account;

    require!(!vk_account.is_locked, PrivacyErrorV2::VerificationKeyLocked);
    require!(!vk_account.is_initialized, PrivacyErrorV2::VkAlreadyFinalized);

    // Check we won't exceed expected count
    let new_len = vk_account.vk_ic.len() + ic_points.len();
    require!(
        new_len <= vk_account.vk_ic_len as usize,
        PrivacyErrorV2::VkIcLengthMismatch
    );

    // Append IC points
    for ic in ic_points {
        vk_account.vk_ic.push(ic);
    }

    msg!("Appended IC points, now have {}/{}", vk_account.vk_ic.len(), vk_account.vk_ic_len);

    Ok(())
}

/// Finalize VK - marks it as ready for use
#[derive(Accounts)]
#[instruction(proof_type: ProofType)]
pub struct FinalizeVkV2<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    #[account(
        mut,
        seeds = [proof_type.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,
}

/// Finalize VK after all IC points are uploaded
pub fn finalize_vk_handler(
    ctx: Context<FinalizeVkV2>,
    proof_type: ProofType,
) -> Result<()> {
    let pool_config = &mut ctx.accounts.pool_config;
    let vk_account = &mut ctx.accounts.vk_account;

    require!(!vk_account.is_locked, PrivacyErrorV2::VerificationKeyLocked);
    require!(!vk_account.is_initialized, PrivacyErrorV2::VkAlreadyFinalized);

    // Verify all IC points are present
    require!(
        vk_account.vk_ic.len() == vk_account.vk_ic_len as usize,
        PrivacyErrorV2::VkIcLengthMismatch
    );

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Mark as initialized
    vk_account.is_initialized = true;
    vk_account.set_at = timestamp;
    vk_account.vk_hash = vk_account.compute_vk_hash_internal();

    // Update pool config
    pool_config.set_vk_configured(proof_type);

    emit!(VerificationKeySetV2 {
        pool: pool_config.key(),
        proof_type: proof_type as u8,
        ic_length: vk_account.vk_ic_len,
        vk_hash: vk_account.vk_hash,
        authority: ctx.accounts.authority.key(),
        timestamp,
    });

    msg!("Finalized VK for {:?} with {} IC points", proof_type, vk_account.vk_ic_len);

    Ok(())
}
