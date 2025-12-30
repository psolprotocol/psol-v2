//! Cryptographic Operations - FAIL-CLOSED by Default
//!
//! SECURITY: This module implements a fail-closed design for cryptographic operations.
//!
//! ## Default Build (Production-Safe)
//! - All cryptographic operations return `CryptoNotImplemented` error
//! - Proof verification FAILS by default (does not accept invalid proofs)
//! - Commitment generation is DISABLED
//! - No funds can be moved without real cryptography
//!
//! ## Insecure Dev Mode (`--features insecure-dev`)
//! - Enables placeholder implementations for DEVELOPMENT ONLY
//! - Emits loud warnings in logs
//! - DO NOT USE WITH REAL FUNDS
//! - FOR LOCAL TESTING ONLY
//!
//! ## Production Requirements
//! To use this protocol in production, you MUST:
//! 1. Implement real Poseidon hash (BN254 field)
//! 2. Implement real Groth16 verification
//! 3. Complete trusted setup ceremony
//! 4. Security audit
//! 5. Remove insecure-dev feature entirely

pub mod poseidon;
pub mod groth16;
pub mod keccak;

pub use poseidon::*;
pub use groth16::*;
pub use keccak::*;

use anchor_lang::prelude::*;

/// Crypto availability status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptoStatus {
    /// Real cryptography implemented (production-ready)
    Real,
    /// Placeholder mode (INSECURE, dev only)
    Placeholder,
    /// Not implemented (fail-closed)
    NotImplemented,
}

/// Get current crypto status
pub fn crypto_status() -> CryptoStatus {
    #[cfg(feature = "insecure-dev")]
    {
        msg!("⚠️⚠️⚠️ INSECURE DEV MODE: Placeholder crypto enabled ⚠️⚠️⚠️");
        msg!("⚠️⚠️⚠️ DO NOT USE WITH REAL FUNDS ⚠️⚠️⚠️");
        CryptoStatus::Placeholder
    }
    
    #[cfg(not(feature = "insecure-dev"))]
    {
        // In production build, crypto is not implemented
        // This is SAFE - we fail closed rather than accept bad proofs
        CryptoStatus::NotImplemented
    }
}

/// Check if crypto is available for use
/// 
/// Returns error if crypto is not properly implemented
pub fn require_crypto_available() -> Result<()> {
    match crypto_status() {
        CryptoStatus::Real => {
            // Production-ready cryptography available
            Ok(())
        }
        CryptoStatus::Placeholder => {
            // Insecure dev mode - warn but allow
            msg!("⚠️ PLACEHOLDER CRYPTO IN USE - DEV ONLY ⚠️");
            Ok(())
        }
        CryptoStatus::NotImplemented => {
            // FAIL CLOSED - this is the safe default
            msg!("❌ Cryptography not implemented");
            msg!("❌ Cannot process transactions without real crypto");
            msg!("❌ Build with --features insecure-dev for local testing only");
            Err(error!(crate::error::PrivacyErrorV2::CryptoNotImplemented))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_crypto_status() {
        let status = crypto_status();
        
        #[cfg(feature = "insecure-dev")]
        assert_eq!(status, CryptoStatus::Placeholder);
        
        #[cfg(not(feature = "insecure-dev"))]
        assert_eq!(status, CryptoStatus::NotImplemented);
    }
    
    #[test]
    fn test_require_crypto() {
        let result = require_crypto_available();
        
        #[cfg(feature = "insecure-dev")]
        assert!(result.is_ok(), "Should allow placeholder in dev mode");
        
        #[cfg(not(feature = "insecure-dev"))]
        assert!(result.is_err(), "Should fail closed in production");
    }
}
