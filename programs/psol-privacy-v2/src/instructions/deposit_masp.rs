use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

use crate::error::PrivacyErrorV2;

// Adjust these imports if your modules are nested differently.
// If you do not re-export types in `state/mod.rs`, change to
// `crate::state::pool_config::PoolConfigV2` etc.
use crate::state::{
    PoolConfigV2,
    MerkleTreeV2,
    AssetVault,
    VerificationKeyAccountV2,
    ProofTypeV2,
};

use crate::crypto::public_inputs::DepositPublicInputs;
use crate::crypto::groth16_verifier::verify_proof_bytes;

// If your events module has a different path or names, adjust this import
use crate::events::DepositMaspEvent;

/// Accounts required for a MASP deposit.
#[derive(Accounts)]
pub struct DepositMasp<'info> {
    /// User funding the deposit and paying tx fees
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Global pool configuration
    #[account(
        mut,
        has_one = authority,
        constraint = pool_config.is_active @ PrivacyErrorV2::PoolInactive
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Pool authority (PDA) that owns vaults / merkle tree
    pub authority: UncheckedAccount<'info>,

    /// Merkle tree for commitments belonging to this pool
    #[account(
        mut,
        constraint = merkle_tree.pool == pool_config.key() @ PrivacyErrorV2::InvalidMerkleTreePool
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Asset vault configuration for this asset
    #[account(
        mut,
        constraint = asset_vault.pool == pool_config.key() @ PrivacyErrorV2::InvalidVaultPool,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault token account that receives deposited tokens
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.vault_token_account
            @ PrivacyErrorV2::InvalidVaultTokenAccount
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// User token account providing funds
    #[account(
        mut,
        constraint = user_token_account.mint == asset_vault.mint
            @ PrivacyErrorV2::InvalidMint,
        constraint = user_token_account.owner == depositor.key()
            @ PrivacyErrorV2::InvalidTokenOwner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Mint for this asset
    #[account(
        constraint = mint.key() == asset_vault.mint
            @ PrivacyErrorV2::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    /// Verification key account for the deposit circuit
    #[account(
        constraint = deposit_vk.pool == pool_config.key()
            @ PrivacyErrorV2::InvalidVerificationKeyPool,
        constraint = deposit_vk.proof_type == ProofTypeV2::Deposit
            @ PrivacyErrorV2::InvalidVerificationKeyType
    )]
    pub deposit_vk: Account<'info, VerificationKeyAccountV2>,

    /// SPL token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Arguments for a MASP deposit.
///
/// The client (SDK) must:
/// 1. Generate a commitment = Poseidon(secret, nullifier, amount, asset_id)
/// 2. Generate a Groth16 proof for the deposit circuit
/// 3. Send commitment, amount, asset_id, and proof_data here
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DepositMaspArgs {
    /// Commitment leaf to insert in the MASP Merkle tree
    pub commitment: [u8; 32],

    /// Amount of tokens to deposit
    pub amount: u64,

    /// Asset identifier (Keccak256(mint)[0..32])
    pub asset_id: [u8; 32],

    /// Groth16 proof data (serialized)
    pub proof_data: Vec<u8>,
}

/// Main deposit handler with full ZK verification.
///
/// Flow:
/// - Check basic args and asset binding
/// - Transfer tokens from user to vault
/// - Build deposit public inputs
/// - Verify Groth16 proof against deposit VK
/// - Insert commitment into Merkle tree
/// - Emit deposit event
pub fn deposit_masp(ctx: Context<DepositMasp>, args: DepositMaspArgs) -> Result<()> {
    let pool_config = &ctx.accounts.pool_config;
    let merkle_tree = &mut ctx.accounts.merkle_tree;
    let asset_vault = &ctx.accounts.asset_vault;

    // ----------------------------------------------------------------------
    // 1. Sanity checks
    // ----------------------------------------------------------------------
    require!(args.amount > 0, PrivacyErrorV2::InvalidAmount);

    // Enforce that the provided asset_id matches the vault's configured asset_id
    // (assuming AssetVault stores asset_id)
    require!(
        asset_vault.asset_id == args.asset_id,
        PrivacyErrorV2::InvalidAssetId
    );

    // ----------------------------------------------------------------------
    // 2. Transfer tokens from user to vault
    // ----------------------------------------------------------------------
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

    token::transfer(cpi_ctx, args.amount)?;

    // ----------------------------------------------------------------------
    // 3. Build deposit public inputs (must match deposit.circom order)
    // ----------------------------------------------------------------------
    let public_inputs = DepositPublicInputs::new(
        args.commitment,
        args.amount,
        args.asset_id,
    );
    let public_inputs_fields = public_inputs.to_field_elements();

    // ----------------------------------------------------------------------
    // 4. Verify Groth16 proof using deposit verification key
    // ----------------------------------------------------------------------
    let vk = &ctx.accounts.deposit_vk;

    let is_valid = verify_proof_bytes(
        vk,
        &args.proof_data,
        &public_inputs_fields,
    )?;

    require!(is_valid, PrivacyErrorV2::InvalidProof);

    // ----------------------------------------------------------------------
    // 5. Insert commitment into Merkle tree
    // ----------------------------------------------------------------------
    // MerkleTreeV2 must expose an insert API that takes a leaf.
    // Adjust the method name/signature if yours differs.
    merkle_tree.insert(args.commitment)?;

    // ----------------------------------------------------------------------
    // 6. Emit deposit event (no address-level privacy leak here)
    // ----------------------------------------------------------------------
    emit!(DepositMaspEvent {
        pool: pool_config.key(),
        commitment: args.commitment,
        amount: args.amount,
        asset_id: args.asset_id,
        depositor: ctx.accounts.depositor.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
