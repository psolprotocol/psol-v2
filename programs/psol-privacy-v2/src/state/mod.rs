//! State accounts for pSOL v2
//!
//! # Account Hierarchy
//! ```text
//! PoolConfigV2 (PDA: ["pool_v2", authority])
//!     ├── MerkleTreeV2 (PDA: ["merkle_tree_v2", pool])
//!     ├── AssetVault[N] (PDA: ["vault_v2", pool, asset_id])
//!     ├── RelayerRegistry (PDA: ["relayer_registry", pool])
//!     │   └── RelayerNode[N] (PDA: ["relayer", registry, operator])
//!     ├── VerificationKeyAccountV2[4] (PDA: ["vk_*", pool])
//!     ├── ComplianceConfig (PDA: ["compliance", pool])
//!     └── SpentNullifierV2[N] (PDA: ["nullifier_v2", pool, hash])
//! ```

pub mod pool_config;
pub mod merkle_tree;
pub mod asset_vault;
pub mod verification_key;
pub mod spent_nullifier;
pub mod relayer;
pub mod compliance;

pub use pool_config::*;
pub use merkle_tree::*;
pub use asset_vault::*;
pub use verification_key::*;
pub use spent_nullifier::*;
pub use relayer::*;
pub use compliance::*;
