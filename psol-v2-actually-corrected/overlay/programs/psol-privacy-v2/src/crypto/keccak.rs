//! Keccak256 Hashing - REAL Implementation (CORRECTED)
//!
//! This module provides REAL keccak256 hashing using Solana's built-in utilities.
//! This is NOT a placeholder - it's production-ready.
//!
//! # CORRECTED: Asset ID Type Consistency
//!
//! Asset IDs are [u8; 32] throughout the system to match:
//! - PDA seeds (asset_id.as_ref())
//! - Event fields (asset_id: [u8; 32])
//! - AssetVault lookups
//!
//! Previous version returned u32, causing type mismatches.

use anchor_lang::prelude::*;
use solana_program::keccak;

/// Compute keccak256 hash of data
///
/// This is a REAL implementation using Solana's keccak syscall.
/// Output matches standard keccak256 exactly.
///
/// ## Cross-Language Compatibility
/// This produces the same output as:
/// - SDK: `keccak256` from `@noble/hashes/sha3`
/// - Ethereum: `keccak256` from `ethers.js`
/// - Python: `keccak.new(data, digest_bits=256).digest()`
pub fn keccak256(data: &[u8]) -> [u8; 32] {
    keccak::hash(data).to_bytes()
}

/// Compute keccak256 hash of multiple inputs (concatenated)
pub fn keccak256_concat(inputs: &[&[u8]]) -> [u8; 32] {
    keccak::hashv(inputs).to_bytes()
}

/// Derive asset ID from mint address
///
/// Returns full 32-byte hash to match program's asset_id type.
///
/// # Type Consistency
///
/// This MUST return [u8; 32] to match:
/// - AssetVault PDA seeds: `[b"asset_vault", pool, asset_id.as_ref()]`
/// - Event fields: `asset_id: [u8; 32]`
/// - All program APIs expecting `asset_id: [u8; 32]`
///
/// # CORRECTED
/// Previous version returned u32 causing type mismatch.
pub fn derive_asset_id(mint: &Pubkey) -> [u8; 32] {
    keccak256(mint.as_ref())
}

/// Derive asset ID as u32 (for external systems if needed)
///
/// Use this ONLY if you need a 4-byte ID for external systems.
/// For all program operations, use `derive_asset_id()` which returns [u8; 32].
pub fn derive_asset_id_u32(mint: &Pubkey) -> u32 {
    let hash = keccak256(mint.as_ref());
    u32::from_le_bytes([hash[0], hash[1], hash[2], hash[3]])
}

/// Compute verification key hash
///
/// Used to create compact VK identifiers
pub fn hash_verification_key(vk_data: &[u8]) -> [u8; 32] {
    keccak256(vk_data)
}

/// Compute commitment hash (deterministic identifier)
///
/// Note: This is NOT the cryptographic commitment itself
/// (that requires Poseidon over BN254)
/// This is just for deterministic IDs/lookups
pub fn hash_commitment(commitment: &[u8; 32]) -> [u8; 32] {
    keccak256(commitment)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_keccak256_deterministic() {
        let data = b"hello world";
        let hash1 = keccak256(data);
        let hash2 = keccak256(data);
        
        assert_eq!(hash1, hash2, "Should be deterministic");
    }
    
    #[test]
    fn test_keccak256_different_inputs() {
        let hash1 = keccak256(b"hello");
        let hash2 = keccak256(b"world");
        
        assert_ne!(hash1, hash2, "Different inputs should produce different hashes");
    }
    
    #[test]
    fn test_keccak256_concat() {
        let data1 = b"hello";
        let data2 = b"world";
        
        let hash1 = keccak256_concat(&[data1, data2]);
        
        let mut combined = Vec::new();
        combined.extend_from_slice(data1);
        combined.extend_from_slice(data2);
        let hash2 = keccak256(&combined);
        
        assert_eq!(hash1, hash2);
    }
    
    #[test]
    fn test_derive_asset_id_returns_32_bytes() {
        let mint = Pubkey::new_unique();
        let asset_id = derive_asset_id(&mint);
        
        // CRITICAL: Must be 32 bytes to match program's asset_id type
        assert_eq!(asset_id.len(), 32);
    }
    
    #[test]
    fn test_derive_asset_id_deterministic() {
        let mint = Pubkey::new_unique();
        let id1 = derive_asset_id(&mint);
        let id2 = derive_asset_id(&mint);
        
        assert_eq!(id1, id2, "Asset ID should be deterministic");
    }
    
    #[test]
    fn test_derive_asset_id_different_mints() {
        let mint1 = Pubkey::new_unique();
        let mint2 = Pubkey::new_unique();
        
        let id1 = derive_asset_id(&mint1);
        let id2 = derive_asset_id(&mint2);
        
        assert_ne!(id1, id2, "Different mints should produce different IDs");
    }
    
    #[test]
    fn test_derive_asset_id_u32_variant() {
        let mint = Pubkey::new_unique();
        let id32 = derive_asset_id(&mint);
        let id_u32 = derive_asset_id_u32(&mint);
        
        // u32 variant should use first 4 bytes
        assert_eq!(
            id_u32,
            u32::from_le_bytes([id32[0], id32[1], id32[2], id32[3]])
        );
    }
    
    #[test]
    fn test_hash_verification_key() {
        let vk_data = vec![1u8; 100];
        let hash = hash_verification_key(&vk_data);
        
        assert_ne!(hash, [0u8; 32], "Hash should not be zero");
        assert_eq!(hash.len(), 32, "Hash should be 32 bytes");
    }
    
    // Test vector for cross-language compatibility
    #[test]
    fn test_keccak256_known_vector() {
        // Known test vector (empty string)
        let hash = keccak256(b"");
        
        // keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
        let expected = [
            0xc5, 0xd2, 0x46, 0x01, 0x86, 0xf7, 0x23, 0x3c,
            0x92, 0x7e, 0x7d, 0xb2, 0xdc, 0xc7, 0x03, 0xc0,
            0xe5, 0x00, 0xb6, 0x53, 0xca, 0x82, 0x27, 0x3b,
            0x7b, 0xfa, 0xd8, 0x04, 0x5d, 0x85, 0xa4, 0x70,
        ];
        
        assert_eq!(hash, expected, "Should match known keccak256 test vector");
    }
}
