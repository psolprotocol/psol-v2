//! Poseidon Hash - FAIL-CLOSED Implementation
//!
//! SECURITY: This module does NOT implement real Poseidon hashing.
//! 
//! Default build: Returns error (fail-closed)
//! insecure-dev build: Returns placeholder (WITH LOUD WARNINGS)
//!
//! DO NOT USE IN PRODUCTION WITHOUT REAL IMPLEMENTATION

use anchor_lang::prelude::*;
use crate::error::PrivacyErrorV2;

/// Poseidon hash output (BN254 field element)
pub type PoseidonHash = [u8; 32];

/// Compute Poseidon hash of inputs
///
/// SECURITY: This is a PLACEHOLDER implementation
/// 
/// ## Default Build
/// Returns `CryptoNotImplemented` error
///
/// ## insecure-dev Build  
/// Returns deterministic but INSECURE placeholder
///
/// ## Production Requirements
/// Replace with real Poseidon hash over BN254
pub fn poseidon_hash(inputs: &[[u8; 32]]) -> Result<PoseidonHash> {
    #[cfg(not(feature = "insecure-dev"))]
    {
        // FAIL CLOSED: Do not allow placeholder crypto in production
        msg!("❌ Poseidon hash not implemented");
        return Err(PrivacyErrorV2::CryptoNotImplemented.into());
    }
    
    #[cfg(feature = "insecure-dev")]
    {
        // INSECURE PLACEHOLDER for development only
        msg!("⚠️ INSECURE: Using placeholder Poseidon hash");
        msg!("⚠️ DO NOT USE WITH REAL FUNDS");
        
        Ok(placeholder_poseidon_hash(inputs))
    }
}

/// Verify a commitment matches the given inputs
///
/// SECURITY: FAIL-CLOSED by default
pub fn verify_commitment(
    commitment: &[u8; 32],
    _nullifier: &[u8; 32],
    _amount: u64,
    _asset_id: u32,
    _blinding: &[u8; 32],
) -> Result<bool> {
    #[cfg(not(feature = "insecure-dev"))]
    {
        msg!("❌ Commitment verification not implemented");
        return Err(PrivacyErrorV2::CryptoNotImplemented.into());
    }
    
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️ INSECURE: Using placeholder commitment verification");
        
        // In dev mode, just check commitment is non-zero
        // This is INSECURE but allows testing
        Ok(*commitment != [0u8; 32])
    }
}

#[cfg(feature = "insecure-dev")]
fn placeholder_poseidon_hash(inputs: &[[u8; 32]]) -> PoseidonHash {
    // PLACEHOLDER: Simple deterministic hash for testing
    // This is NOT cryptographically secure
    // DO NOT USE IN PRODUCTION
    
    use solana_program::keccak;
    
    // Concatenate all inputs
    let mut combined = Vec::new();
    for input in inputs {
        combined.extend_from_slice(input);
    }
    
    // Use keccak256 as placeholder (not BN254 field arithmetic!)
    let hash = keccak::hash(&combined);
    hash.to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    #[cfg(feature = "insecure-dev")]
    fn test_placeholder_poseidon() {
        let input1 = [1u8; 32];
        let input2 = [2u8; 32];
        
        let hash = poseidon_hash(&[input1, input2]).unwrap();
        
        // Should be deterministic
        let hash2 = poseidon_hash(&[input1, input2]).unwrap();
        assert_eq!(hash, hash2);
        
        // Should be different for different inputs
        let hash3 = poseidon_hash(&[input2, input1]).unwrap();
        assert_ne!(hash, hash3);
    }
    
    #[test]
    #[cfg(not(feature = "insecure-dev"))]
    fn test_fail_closed_poseidon() {
        let input = [1u8; 32];
        let result = poseidon_hash(&[input]);
        
        // Should fail in production build
        assert!(result.is_err());
    }
}
