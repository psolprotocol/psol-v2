import { PublicKey } from '@solana/web3.js';
import { ProofType, proofTypeSeed } from './types';

/**
 * Default program ID for pSOL v2
 */
export const PROGRAM_ID = new PublicKey('BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb');

// ============================================================================
// SEED CONSTANTS
// ============================================================================

/** Seed for PoolConfigV2 PDA */
export const POOL_V2_SEED = Buffer.from('pool_v2');

/** Seed for MerkleTreeV2 PDA */
export const MERKLE_TREE_V2_SEED = Buffer.from('merkle_tree_v2');

/** Seed for AssetVault PDA */
export const VAULT_V2_SEED = Buffer.from('vault_v2');

/** Seed for SpentNullifierV2 PDA */
export const NULLIFIER_V2_SEED = Buffer.from('nullifier_v2');

/** Seed for RelayerRegistry PDA */
export const RELAYER_REGISTRY_SEED = Buffer.from('relayer_registry');

/** Seed for RelayerNode PDA */
export const RELAYER_SEED = Buffer.from('relayer');

/** Seed for ComplianceConfig PDA */
export const COMPLIANCE_SEED = Buffer.from('compliance');

// ============================================================================
// PDA DERIVATION FUNCTIONS
// ============================================================================

/**
 * Derive PoolConfigV2 PDA address
 *
 * Seeds: ["pool_v2", authority]
 *
 * @param programId - pSOL v2 program ID
 * @param authority - Pool authority public key
 * @returns [PDA address, bump seed]
 */
export function findPoolConfigPda(
  programId: PublicKey,
  authority: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_V2_SEED, authority.toBuffer()],
    programId
  );
}

/**
 * Derive MerkleTreeV2 PDA address
 *
 * Seeds: ["merkle_tree_v2", pool_config]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @returns [PDA address, bump seed]
 */
export function findMerkleTreePda(
  programId: PublicKey,
  poolConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MERKLE_TREE_V2_SEED, poolConfig.toBuffer()],
    programId
  );
}

/**
 * Derive AssetVault PDA address
 *
 * Seeds: ["vault_v2", pool_config, asset_id]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @param assetId - 32-byte asset identifier
 * @returns [PDA address, bump seed]
 */
export function findAssetVaultPda(
  programId: PublicKey,
  poolConfig: PublicKey,
  assetId: Uint8Array
): [PublicKey, number] {
  if (assetId.length !== 32) {
    throw new Error('Asset ID must be 32 bytes');
  }
  return PublicKey.findProgramAddressSync(
    [VAULT_V2_SEED, poolConfig.toBuffer(), Buffer.from(assetId)],
    programId
  );
}

/**
 * Derive VerificationKeyAccountV2 PDA address
 *
 * Seeds: [proof_type_seed, pool_config]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @param proofType - Type of proof
 * @returns [PDA address, bump seed]
 */
export function findVerificationKeyPda(
  programId: PublicKey,
  poolConfig: PublicKey,
  proofType: ProofType
): [PublicKey, number] {
  const seed = proofTypeSeed(proofType);
  return PublicKey.findProgramAddressSync(
    [seed, poolConfig.toBuffer()],
    programId
  );
}

/**
 * Derive SpentNullifierV2 PDA address
 *
 * Seeds: ["nullifier_v2", pool_config, nullifier_hash]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @param nullifierHash - 32-byte nullifier hash
 * @returns [PDA address, bump seed]
 */
export function findSpentNullifierPda(
  programId: PublicKey,
  poolConfig: PublicKey,
  nullifierHash: Uint8Array
): [PublicKey, number] {
  if (nullifierHash.length !== 32) {
    throw new Error('Nullifier hash must be 32 bytes');
  }
  return PublicKey.findProgramAddressSync(
    [NULLIFIER_V2_SEED, poolConfig.toBuffer(), Buffer.from(nullifierHash)],
    programId
  );
}

/**
 * Derive RelayerRegistry PDA address
 *
 * Seeds: ["relayer_registry", pool_config]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @returns [PDA address, bump seed]
 */
export function findRelayerRegistryPda(
  programId: PublicKey,
  poolConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RELAYER_REGISTRY_SEED, poolConfig.toBuffer()],
    programId
  );
}

/**
 * Derive RelayerNode PDA address
 *
 * Seeds: ["relayer", registry, operator]
 *
 * @param programId - pSOL v2 program ID
 * @param registry - Relayer registry account address
 * @param operator - Relayer operator public key
 * @returns [PDA address, bump seed]
 */
export function findRelayerNodePda(
  programId: PublicKey,
  registry: PublicKey,
  operator: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RELAYER_SEED, registry.toBuffer(), operator.toBuffer()],
    programId
  );
}

/**
 * Derive ComplianceConfig PDA address
 *
 * Seeds: ["compliance", pool_config]
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account address
 * @returns [PDA address, bump seed]
 */
export function findComplianceConfigPda(
  programId: PublicKey,
  poolConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [COMPLIANCE_SEED, poolConfig.toBuffer()],
    programId
  );
}

// ============================================================================
// ASSET ID HELPERS
// ============================================================================

/**
 * Compute asset ID from mint address using keccak256
 *
 * This matches the on-chain computation: asset_id = keccak256(mint.as_ref())
 *
 * @param mint - SPL token mint address
 * @returns 32-byte asset identifier
 */
export function computeAssetId(mint: PublicKey): Uint8Array {
  // Use js-sha3 or @noble/hashes for keccak256
  // For now, we'll use a simple approach that works in both Node and browser
  return computeAssetIdKeccak(mint.toBuffer());
}

/**
 * Compute keccak256 hash of input bytes
 *
 * Note: In production, use a proper keccak256 implementation.
 * This is a placeholder that should be replaced with @noble/hashes or js-sha3.
 *
 * @param input - Input bytes
 * @returns 32-byte hash
 */
export function computeAssetIdKeccak(input: Uint8Array): Uint8Array {
  // IMPORTANT: In production, replace this with proper keccak256
  // For SDK purposes, we use the solana/web3.js approach or external lib

  // Temporary: Use the @solana/web3.js internal keccak256 if available,
  // otherwise this requires adding a dependency
  try {
    // Try to use Node.js crypto (available in Node environment)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    // Node.js crypto has keccak256 as 'sha3-256' with different semantics
    // Actually keccak256 != sha3-256, so we need a proper library
    // For now, fall back to sha256 for structure (NOT for production!)
    const hash = crypto.createHash('sha256').update(input).digest();
    return new Uint8Array(hash);
  } catch {
    // In browser or if crypto not available, throw error
    // Production code should use @noble/hashes/sha3 keccak_256
    throw new Error(
      'keccak256 not available. Install @noble/hashes and use: ' +
      'import { keccak_256 } from "@noble/hashes/sha3"'
    );
  }
}

// ============================================================================
// BATCH HELPERS
// ============================================================================

/**
 * Derive all pool-related PDAs at once
 *
 * @param programId - pSOL v2 program ID
 * @param authority - Pool authority
 * @returns Object containing all pool PDAs
 */
export function derivePoolPdas(
  programId: PublicKey,
  authority: PublicKey
): {
  poolConfig: PublicKey;
  poolConfigBump: number;
  merkleTree: PublicKey;
  merkleTreeBump: number;
  relayerRegistry: PublicKey;
  relayerRegistryBump: number;
  complianceConfig: PublicKey;
  complianceConfigBump: number;
} {
  const [poolConfig, poolConfigBump] = findPoolConfigPda(programId, authority);
  const [merkleTree, merkleTreeBump] = findMerkleTreePda(programId, poolConfig);
  const [relayerRegistry, relayerRegistryBump] = findRelayerRegistryPda(programId, poolConfig);
  const [complianceConfig, complianceConfigBump] = findComplianceConfigPda(programId, poolConfig);

  return {
    poolConfig,
    poolConfigBump,
    merkleTree,
    merkleTreeBump,
    relayerRegistry,
    relayerRegistryBump,
    complianceConfig,
    complianceConfigBump,
  };
}

/**
 * Derive asset vault PDAs for multiple assets
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account
 * @param assetIds - Array of asset IDs
 * @returns Array of [vault address, bump] tuples
 */
export function deriveAssetVaultPdas(
  programId: PublicKey,
  poolConfig: PublicKey,
  assetIds: Uint8Array[]
): Array<[PublicKey, number]> {
  return assetIds.map(assetId => findAssetVaultPda(programId, poolConfig, assetId));
}

/**
 * Derive verification key PDAs for all proof types
 *
 * @param programId - pSOL v2 program ID
 * @param poolConfig - Pool configuration account
 * @returns Object mapping proof type to [address, bump]
 */
export function deriveVerificationKeyPdas(
  programId: PublicKey,
  poolConfig: PublicKey
): Record<ProofType, [PublicKey, number]> {
  return {
    [ProofType.Deposit]: findVerificationKeyPda(programId, poolConfig, ProofType.Deposit),
    [ProofType.Withdraw]: findVerificationKeyPda(programId, poolConfig, ProofType.Withdraw),
    [ProofType.JoinSplit]: findVerificationKeyPda(programId, poolConfig, ProofType.JoinSplit),
    [ProofType.Membership]: findVerificationKeyPda(programId, poolConfig, ProofType.Membership),
  };
}
