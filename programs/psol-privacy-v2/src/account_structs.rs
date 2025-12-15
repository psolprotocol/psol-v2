//! Account Structures for pSOL Privacy Pool v2
//!
//! All instruction account structures are defined here at the crate root
//! to work with Anchor 0.30's CPI module generation requirements.
//!
//! # Why this structure?
//!
//! Anchor's `#[program]` macro generates CPI types that expect account structs
//! to be accessible at `crate::StructName`. When account structs are defined
//! in nested modules (e.g., `crate::instructions::deposit_masp::DepositMasp`),
//! the generated CPI code fails to compile because the internal `__client_accounts_*`
//! types are not re-exported with `pub use`.
//!
//! By defining all account structs in this flat module at the crate root,
//! we ensure proper visibility for CPI generation.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::PrivacyErrorV2;
use crate::state::{
    AssetVault, AuditMetadata, ComplianceConfig, MerkleTreeV2, PoolConfigV2,
    RelayerNode, RelayerRegistry, SpentNullifierV2, VerificationKeyAccountV2,
};
use crate::types::{ProofType, ShieldedActionType};

// ============================================================================
// POOL INITIALIZATION
// ============================================================================

/// Accounts for initializing a new MASP pool
#[derive(Accounts)]
#[instruction(tree_depth: u8, root_history_size: u16)]
pub struct InitializePoolV2<'info> {
    /// Pool authority (admin)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool configuration account (PDA)
    #[account(
        init,
        payer = authority,
        space = PoolConfigV2::LEN,
        seeds = [PoolConfigV2::SEED_PREFIX, authority.key().as_ref()],
        bump,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account (PDA)
    #[account(
        init,
        payer = authority,
        space = MerkleTreeV2::space(tree_depth, root_history_size),
        seeds = [MerkleTreeV2::SEED_PREFIX, pool_config.key().as_ref()],
        bump,
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Relayer registry account (PDA)
    #[account(
        init,
        payer = authority,
        space = RelayerRegistry::LEN,
        seeds = [RelayerRegistry::SEED_PREFIX, pool_config.key().as_ref()],
        bump,
    )]
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Compliance configuration account (PDA)
    #[account(
        init,
        payer = authority,
        space = ComplianceConfig::LEN,
        seeds = [ComplianceConfig::SEED_PREFIX, pool_config.key().as_ref()],
        bump,
    )]
    pub compliance_config: Account<'info, ComplianceConfig>,

    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// ASSET REGISTRATION
// ============================================================================

/// Accounts for registering a new asset with the pool
#[derive(Accounts)]
#[instruction(asset_id: [u8; 32])]
pub struct RegisterAsset<'info> {
    /// Pool authority (must be signer)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Token mint for the asset being registered
    pub mint: Account<'info, Mint>,

    /// Asset vault account (PDA)
    #[account(
        init,
        payer = authority,
        space = AssetVault::DEFAULT_SPACE,
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Token account for the vault (PDA)
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = asset_vault,
        seeds = [
            b"vault_token",
            asset_vault.key().as_ref(),
        ],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// VERIFICATION KEYS
// ============================================================================

/// Accounts for setting a verification key
#[derive(Accounts)]
#[instruction(proof_type: ProofType)]
pub struct SetVerificationKeyV2<'info> {
    /// Pool authority (must be signer)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Verification key account (PDA based on proof type)
    #[account(
        init_if_needed,
        payer = authority,
        space = VerificationKeyAccountV2::space(VerificationKeyAccountV2::DEFAULT_MAX_IC_POINTS),
        seeds = [proof_type.as_seed(), pool_config.key().as_ref()],
        bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for locking a verification key
#[derive(Accounts)]
#[instruction(proof_type: ProofType)]
pub struct LockVerificationKeyV2<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Verification key account
    #[account(
        mut,
        seeds = [proof_type.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
        constraint = vk_account.is_initialized @ PrivacyErrorV2::VerificationKeyNotSet,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/// Accounts for pausing the pool
#[derive(Accounts)]
pub struct PausePoolV2<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

/// Accounts for unpausing the pool
#[derive(Accounts)]
pub struct UnpausePoolV2<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        constraint = pool_config.is_paused @ PrivacyErrorV2::PoolNotPaused,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

/// Accounts for initiating authority transfer
#[derive(Accounts)]
pub struct InitiateAuthorityTransferV2<'info> {
    /// Current pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

/// Accounts for accepting authority transfer
#[derive(Accounts)]
pub struct AcceptAuthorityTransferV2<'info> {
    /// New authority accepting the transfer (must be signer)
    pub new_authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = pool_config.pending_authority == new_authority.key() @ PrivacyErrorV2::Unauthorized,
        constraint = pool_config.has_pending_transfer() @ PrivacyErrorV2::NoPendingAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

/// Accounts for cancelling authority transfer
#[derive(Accounts)]
pub struct CancelAuthorityTransferV2<'info> {
    /// Current pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        constraint = pool_config.has_pending_transfer() @ PrivacyErrorV2::NoPendingAuthority,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,
}

// ============================================================================
// MASP CORE OPERATIONS
// ============================================================================

/// Accounts required for a MASP deposit.
#[derive(Accounts)]
#[instruction(
    amount: u64,
    commitment: [u8; 32],
    asset_id: [u8; 32],
    proof_data: Vec<u8>,
)]
pub struct DepositMasp<'info> {
    /// User funding the deposit and paying tx fees
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Global pool configuration
    #[account(
        mut,
        has_one = authority,
        has_one = merkle_tree,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Pool authority (validated via has_one constraint)
    /// CHECK: Validated by has_one constraint on pool_config
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
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump = asset_vault.bump,
        constraint = asset_vault.pool == pool_config.key() @ PrivacyErrorV2::InvalidVaultPool,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
        constraint = asset_vault.deposits_enabled @ PrivacyErrorV2::DepositsDisabled,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault token account that receives deposited tokens
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account
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
        seeds = [ProofType::Deposit.as_seed(), pool_config.key().as_ref()],
        bump = deposit_vk.bump,
        constraint = deposit_vk.pool == pool_config.key()
            @ PrivacyErrorV2::InvalidVerificationKeyPool,
        constraint = deposit_vk.proof_type == ProofType::Deposit as u8
            @ PrivacyErrorV2::InvalidVerificationKeyType,
        constraint = deposit_vk.is_initialized
            @ PrivacyErrorV2::VerificationKeyNotSet,
    )]
    pub deposit_vk: Account<'info, VerificationKeyAccountV2>,

    /// SPL token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for withdrawing from the MASP
#[derive(Accounts)]
#[instruction(
    proof_data: Vec<u8>,
    merkle_root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    asset_id: [u8; 32],
    relayer_fee: u64,
)]
pub struct WithdrawMasp<'info> {
    /// Relayer submitting the transaction (pays gas, receives fee)
    #[account(mut)]
    pub relayer: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(
        constraint = merkle_tree.is_known_root(&merkle_root) @ PrivacyErrorV2::InvalidMerkleRoot,
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Verification key for withdraw proofs
    #[account(
        seeds = [ProofType::Withdraw.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
        constraint = vk_account.is_initialized @ PrivacyErrorV2::VerificationKeyNotSet,
        constraint = vk_account.proof_type == ProofType::Withdraw as u8
            @ PrivacyErrorV2::InvalidVerificationKeyType,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    /// Asset vault account
    #[account(
        mut,
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump = asset_vault.bump,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
        constraint = asset_vault.withdrawals_enabled @ PrivacyErrorV2::WithdrawalsDisabled,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault's token account (source)
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account 
            @ PrivacyErrorV2::InvalidVaultTokenAccount,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Recipient's token account (destination)
    /// CHECK: We verify the mint matches, recipient can be any valid token account
    #[account(
        mut,
        constraint = recipient_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Relayer's token account for fee (if relayer_fee > 0)
    #[account(
        mut,
        constraint = relayer_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    )]
    pub relayer_token_account: Account<'info, TokenAccount>,

    /// Spent nullifier account (PDA, created on first use)
    #[account(
        init,
        payer = relayer,
        space = SpentNullifierV2::LEN,
        seeds = [
            SpentNullifierV2::SEED_PREFIX,
            pool_config.key().as_ref(),
            nullifier_hash.as_ref(),
        ],
        bump,
    )]
    pub spent_nullifier: Account<'info, SpentNullifierV2>,

    /// Relayer registry
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Relayer node (optional, for registered relayers)
    pub relayer_node: Option<Account<'info, RelayerNode>>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for private transfer (join-split)
#[derive(Accounts)]
#[instruction(
    proof_data: Vec<u8>,
    merkle_root: [u8; 32],
    input_nullifiers: Vec<[u8; 32]>,
    output_commitments: Vec<[u8; 32]>,
    public_amount: i64,
    asset_id: [u8; 32],
    relayer_fee: u64,
)]
pub struct PrivateTransferJoinSplit<'info> {
    /// Relayer submitting the transaction
    #[account(mut)]
    pub relayer: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(
        mut,
        constraint = merkle_tree.is_known_root(&merkle_root) @ PrivacyErrorV2::InvalidMerkleRoot,
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Verification key for join-split proofs
    #[account(
        seeds = [ProofType::JoinSplit.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    /// Asset vault account (needed for public flows)
    #[account(
        mut,
        seeds = [
            AssetVault::SEED_PREFIX,
            pool_config.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump = asset_vault.bump,
        constraint = asset_vault.is_active @ PrivacyErrorV2::AssetNotActive,
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Vault token account
    #[account(
        mut,
        constraint = vault_token_account.key() == asset_vault.token_account @ PrivacyErrorV2::InvalidOwner,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Relayer's token account for fee
    #[account(
        mut,
        constraint = relayer_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    )]
    pub relayer_token_account: Account<'info, TokenAccount>,

    /// Relayer registry
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for proving pool membership
#[derive(Accounts)]
#[instruction(
    proof_data: Vec<u8>,
    merkle_root: [u8; 32],
    threshold: u64,
    asset_id: [u8; 32],
)]
pub struct ProveMembership<'info> {
    /// Prover (anyone can submit)
    pub prover: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(
        constraint = merkle_tree.is_known_root(&merkle_root) @ PrivacyErrorV2::InvalidMerkleRoot,
    )]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Verification key for membership proofs
    #[account(
        seeds = [ProofType::Membership.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,
}

// ============================================================================
// RELAYER OPERATIONS
// ============================================================================

/// Accounts for configuring the relayer registry
#[derive(Accounts)]
pub struct ConfigureRelayerRegistry<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Relayer registry account
    #[account(mut)]
    pub relayer_registry: Account<'info, RelayerRegistry>,
}

/// Accounts for registering a new relayer
#[derive(Accounts)]
pub struct RegisterRelayer<'info> {
    /// Relayer operator (owner of the relayer node)
    #[account(mut)]
    pub operator: Signer<'info>,

    /// Pool configuration account
    #[account(
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Relayer registry account
    #[account(mut)]
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Relayer node account (PDA)
    #[account(
        init,
        payer = operator,
        space = RelayerNode::DEFAULT_SPACE,
        seeds = [
            RelayerNode::SEED_PREFIX,
            relayer_registry.key().as_ref(),
            operator.key().as_ref(),
        ],
        bump,
    )]
    pub relayer_node: Account<'info, RelayerNode>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for updating a relayer
#[derive(Accounts)]
pub struct UpdateRelayer<'info> {
    /// Relayer operator (must be signer)
    pub operator: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Relayer registry account
    #[account(mut)]
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Relayer node account
    #[account(
        mut,
        has_one = operator @ PrivacyErrorV2::Unauthorized,
        has_one = registry @ PrivacyErrorV2::Unauthorized,
        seeds = [
            RelayerNode::SEED_PREFIX,
            relayer_registry.key().as_ref(),
            operator.key().as_ref(),
        ],
        bump = relayer_node.bump,
    )]
    pub relayer_node: Account<'info, RelayerNode>,

    /// The registry this relayer belongs to
    /// CHECK: Validated via has_one constraint
    pub registry: UncheckedAccount<'info>,
}

/// Accounts for deactivating a relayer
#[derive(Accounts)]
pub struct DeactivateRelayer<'info> {
    /// Relayer operator (must be signer)
    pub operator: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = relayer_registry,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Relayer registry account
    #[account(mut)]
    pub relayer_registry: Account<'info, RelayerRegistry>,

    /// Relayer node account
    #[account(
        mut,
        has_one = operator @ PrivacyErrorV2::Unauthorized,
        constraint = relayer_node.is_active @ PrivacyErrorV2::RelayerNotActive,
        seeds = [
            RelayerNode::SEED_PREFIX,
            relayer_registry.key().as_ref(),
            operator.key().as_ref(),
        ],
        bump = relayer_node.bump,
    )]
    pub relayer_node: Account<'info, RelayerNode>,
}

// ============================================================================
// COMPLIANCE OPERATIONS
// ============================================================================

/// Accounts for configuring compliance settings
#[derive(Accounts)]
pub struct ConfigureCompliance<'info> {
    /// Pool authority (must be signer)
    pub authority: Signer<'info>,

    /// Pool configuration account
    #[account(
        has_one = authority @ PrivacyErrorV2::Unauthorized,
        has_one = compliance_config,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Compliance configuration account
    #[account(mut)]
    pub compliance_config: Account<'info, ComplianceConfig>,
}

/// Accounts for attaching audit metadata
#[derive(Accounts)]
#[instruction(commitment: [u8; 32], encrypted_metadata: Vec<u8>)]
pub struct AttachAuditMetadata<'info> {
    /// Payer for the metadata account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Pool configuration account
    #[account(
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = compliance_config,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Compliance configuration account
    #[account(
        mut,
        constraint = compliance_config.audit_enabled @ PrivacyErrorV2::FeatureDisabled,
    )]
    pub compliance_config: Account<'info, ComplianceConfig>,

    /// Audit metadata account (PDA)
    #[account(
        init,
        payer = payer,
        space = AuditMetadata::space(encrypted_metadata.len()),
        seeds = [
            AuditMetadata::SEED_PREFIX,
            pool_config.key().as_ref(),
            commitment.as_ref(),
        ],
        bump,
    )]
    pub audit_metadata: Account<'info, AuditMetadata>,

    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// SHIELDED CPI
// ============================================================================

/// Accounts for executing a shielded action
#[derive(Accounts)]
#[instruction(
    action_type: ShieldedActionType,
    proof_data: Vec<u8>,
    action_data: Vec<u8>,
)]
pub struct ExecuteShieldedAction<'info> {
    /// Relayer executing the action
    #[account(mut)]
    pub relayer: Signer<'info>,

    /// Pool configuration account
    #[account(
        mut,
        constraint = !pool_config.is_paused @ PrivacyErrorV2::PoolPaused,
        has_one = merkle_tree,
    )]
    pub pool_config: Account<'info, PoolConfigV2>,

    /// Merkle tree account
    #[account(mut)]
    pub merkle_tree: Account<'info, MerkleTreeV2>,

    /// Verification key for the action proof
    /// Note: Shielded CPI uses JoinSplit VK for now
    #[account(
        seeds = [ProofType::JoinSplit.as_seed(), pool_config.key().as_ref()],
        bump = vk_account.bump,
        constraint = vk_account.is_initialized @ PrivacyErrorV2::VerificationKeyNotSet,
    )]
    pub vk_account: Account<'info, VerificationKeyAccountV2>,

    /// Target program for CPI
    /// CHECK: Validated based on action_type
    pub target_program: UncheckedAccount<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}
