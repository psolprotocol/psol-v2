/**
 * Keccak256 Hashing - REAL Implementation (CORRECTED)
 * 
 * Uses @noble/hashes for production-grade keccak256
 * Outputs match Solana program keccak exactly
 * 
 * # CORRECTED: Asset ID Type Consistency
 * 
 * Asset IDs are Uint8Array (32 bytes) to match program's [u8; 32].
 * Previous version returned number (u32) causing type mismatches.
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { PublicKey } from '@solana/web3.js';

/**
 * Compute keccak256 hash of data
 * 
 * This is a REAL implementation, not a placeholder.
 * Output matches Solana's keccak::hash() exactly.
 * 
 * @param data - Input data to hash
 * @returns 32-byte keccak256 hash
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/**
 * Compute keccak256 hash of multiple inputs (concatenated)
 * 
 * @param inputs - Array of inputs to concatenate and hash
 * @returns 32-byte keccak256 hash
 */
export function keccak256Concat(inputs: Uint8Array[]): Uint8Array {
  const combined = Buffer.concat(inputs.map((i) => Buffer.from(i)));
  return keccak_256(combined);
}

/**
 * Derive asset ID from mint address
 * 
 * Returns full 32-byte hash to match program's asset_id type.
 * 
 * # Type Consistency
 * 
 * This MUST return Uint8Array (32 bytes) to match:
 * - AssetVault PDA derivation
 * - Event field types
 * - All program APIs expecting asset_id: [u8; 32]
 * 
 * # CORRECTED
 * Previous version returned number (u32) causing type mismatch.
 * 
 * @param mint - Token mint public key
 * @returns Asset ID as 32-byte Uint8Array
 */
export function deriveAssetId(mint: PublicKey): Uint8Array {
  return keccak256(mint.toBuffer());
}

/**
 * Derive asset ID as u32 (for external systems if needed)
 * 
 * Use this ONLY if you need a 4-byte ID for external systems.
 * For all program operations, use `deriveAssetId()` which returns 32 bytes.
 * 
 * @param mint - Token mint public key
 * @returns Asset ID as u32 (first 4 bytes of hash)
 */
export function deriveAssetIdU32(mint: PublicKey): number {
  const hash = keccak256(mint.toBuffer());
  return new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(0, true);
}

/**
 * Compute verification key hash
 * 
 * @param vkData - Verification key data
 * @returns 32-byte hash
 */
export function hashVerificationKey(vkData: Uint8Array): Uint8Array {
  return keccak256(vkData);
}

/**
 * Compute commitment hash (for deterministic IDs)
 * 
 * Note: This is NOT the cryptographic commitment itself
 * This is just for deterministic lookups
 * 
 * @param commitment - Commitment bytes
 * @returns 32-byte hash
 */
export function hashCommitment(commitment: Uint8Array): Uint8Array {
  return keccak256(commitment);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith('0x')) hex = hex.slice(2);
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Buffer.from(bytes).toString('hex');
}

// ============================================================================
// TESTS (for verification)
// ============================================================================

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe('keccak256', () => {
    it('returns 32 bytes', () => {
      const hash = keccak256(new Uint8Array([1, 2, 3]));
      expect(hash.length).toBe(32);
    });

    it('is deterministic', () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash1 = keccak256(data);
      const hash2 = keccak256(data);
      expect(hash1).toEqual(hash2);
    });

    it('matches known test vector', () => {
      // keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
      const hash = keccak256(new Uint8Array([]));
      const expected = hexToBytes('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
      expect(hash).toEqual(expected);
    });
  });

  describe('deriveAssetId', () => {
    it('returns 32 bytes', () => {
      const mint = PublicKey.unique();
      const assetId = deriveAssetId(mint);
      expect(assetId.length).toBe(32);
    });

    it('is deterministic', () => {
      const mint = PublicKey.unique();
      const id1 = deriveAssetId(mint);
      const id2 = deriveAssetId(mint);
      expect(id1).toEqual(id2);
    });

    it('different mints produce different IDs', () => {
      const mint1 = PublicKey.unique();
      const mint2 = PublicKey.unique();
      const id1 = deriveAssetId(mint1);
      const id2 = deriveAssetId(mint2);
      expect(id1).not.toEqual(id2);
    });
  });

  describe('deriveAssetIdU32', () => {
    it('returns number', () => {
      const mint = PublicKey.unique();
      const id = deriveAssetIdU32(mint);
      expect(typeof id).toBe('number');
    });

    it('matches first 4 bytes of full hash', () => {
      const mint = PublicKey.unique();
      const fullId = deriveAssetId(mint);
      const u32Id = deriveAssetIdU32(mint);
      
      const expected = new DataView(fullId.buffer, fullId.byteOffset).getUint32(0, true);
      expect(u32Id).toBe(expected);
    });
  });
}
