//! State accounts for pSOL Privacy Pool v2
//!
//! This module defines all on-chain account structures for the MASP protocol.
//!
//! # Account Hierarchy
//!
//! ```text
//! PoolConfigV2 (root PDA)
//! ├── MerkleTreeV2 (shared across all assets)
//! ├── AssetVault[N] (per-asset token vaults)
//! ├── RelayerRegistry
//! │   └── RelayerNode[N] (per-relayer)
//! ├── VerificationKeyAccountV2[4] (per proof type)
//! ├── ComplianceConfig (optional)
//! └── SpentNullifierV2[N] (per spent nullifier)
//! ```
//!
//! # PDA Seeds
//!
//! | Account | Seeds |
//! |---------|-------|
//! | PoolConfigV2 | `[b"pool_config_v2", authority]` |
//! | MerkleTreeV2 | `[b"merkle_tree_v2", pool]` |
//! | AssetVault | `[b"asset_vault", pool, asset_id]` |
//! | VerificationKeyAccountV2 | `[proof_type.as_seed(), pool]` |
//! | SpentNullifierV2 | `[b"nullifier_v2", pool, nullifier_hash]` |
//! | RelayerRegistry | `[b"relayer_registry", pool]` |
//! | RelayerNode | `[b"relayer_node", registry, operator]` |

pub mod asset_vault;
pub mod compliance;
pub mod merkle_tree;
pub mod pool_config;
pub mod relayer;
pub mod spent_nullifier;
pub mod verification_key;

// Re-export all account types
pub use asset_vault::AssetVault;
pub use compliance::ComplianceConfig;
pub use merkle_tree::MerkleTreeV2;
pub use pool_config::PoolConfigV2;
pub use relayer::{RelayerNode, RelayerRegistry};
pub use spent_nullifier::{SpendType, SpentNullifierV2};
pub use verification_key::{VerificationKeyAccountV2, VerificationKeyV2};

// Re-export constants
pub use merkle_tree::{
    DEFAULT_ROOT_HISTORY_SIZE, MAX_TREE_DEPTH, MIN_ROOT_HISTORY_SIZE, MIN_TREE_DEPTH,
};
