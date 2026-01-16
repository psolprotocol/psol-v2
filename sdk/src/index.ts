/**
 * pSOL v2 SDK
 * 
 * Complete TypeScript SDK for the pSOL v2 Multi-Asset Shielded Pool.
 * 
 * @packageDocumentation
 */

// Re-export crypto module
export * from './crypto/poseidon';

// Re-export note module
export * from './note/note';

// Re-export merkle module
export * from './merkle/tree';

// Re-export proof module (excluding ProofType to avoid duplicate)
export { 
  Prover, 
  DEFAULT_CIRCUIT_PATHS,
  type Groth16Proof,
  type ProofWithSignals,
  type SerializedProof,
  type DepositProofInputs,
  type WithdrawProofInputs,
  type JoinSplitProofInputs,
  type CircuitPaths,
  pubkeyToScalar,
  verifyProofLocally,
  exportVerificationKey
} from './proof/prover';

// Re-export types (source of truth for request/result types)
export * from './types';

// Re-export PDA helpers
export * from './pda';

// Re-export client (only the client class and factory, not duplicate types)
export { 
  PsolV2Client, 
  createPsolClient,
  type PsolV2ClientOptions 
} from './client';

/**
 * Initialize the SDK (must be called before using crypto functions)
 */
export async function initializeSDK(): Promise<void> {
  const { initPoseidon } = await import('./crypto/poseidon');
  await initPoseidon();
}

/**
 * SDK version
 */
export const SDK_VERSION = '2.0.0';

/**
 * Check if SDK is production ready
 */
export const IS_PRODUCTION_READY = false;
export const SDK_STATUS = "alpha";

// Yield Mode
export * from './yield';
export { SUPPORTED_LST_MINTS } from './client';
