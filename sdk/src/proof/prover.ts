/**
 * pSOL v2 SDK - Proof Generation
 *
 * Generates ZK proofs for deposits, withdrawals, and transfers.
 * Uses snarkjs for Groth16 proof generation.
 *
 * ## Circuit Configuration
 *
 * The Prover requires circuit artifacts (WASM and zkey files) to be configured.
 * This can be done in several ways depending on your environment:
 *
 * ### Node.js with file paths
 * ```typescript
 * import { Prover, createNodeCircuitProvider } from '@psol/sdk';
 *
 * const provider = createNodeCircuitProvider('/path/to/circuits');
 * const prover = new Prover(provider);
 * ```
 *
 * ### Browser with URLs
 * ```typescript
 * import { Prover, createBrowserCircuitProvider } from '@psol/sdk';
 *
 * const provider = createBrowserCircuitProvider('https://cdn.example.com/circuits');
 * const prover = new Prover(provider);
 * ```
 *
 * ### Environment variables (Node.js)
 * ```typescript
 * // Set PSOL_CIRCUIT_PATH=/path/to/circuits
 * import { Prover, createEnvCircuitProvider } from '@psol/sdk';
 *
 * const provider = createEnvCircuitProvider();
 * const prover = new Prover(provider);
 * ```
 *
 * ### Pre-loaded buffers (bundlers)
 * ```typescript
 * import { Prover, createBufferCircuitProvider, ProofType } from '@psol/sdk';
 * import depositWasm from './circuits/deposit.wasm';
 * import depositZkey from './circuits/deposit.zkey';
 *
 * const provider = createBufferCircuitProvider({
 *   [ProofType.Deposit]: { wasm: depositWasm, zkey: depositZkey },
 * });
 * const prover = new Prover(provider);
 * ```
 *
 * @module proof/prover
 */

import * as snarkjs from 'snarkjs';
import { Note, NoteWithNullifier } from '../note/note';
import { MerkleProof } from '../merkle/tree';
import { PublicKey } from '@solana/web3.js';
import { ProofType } from '../types';
import {
  CircuitArtifactProvider,
  CircuitArtifacts,
  createNodeCircuitProvider,
  createBrowserCircuitProvider,
  createBufferCircuitProvider,
  createEnvCircuitProvider,
} from './circuit-provider';

// Re-export ProofType for convenience
export { ProofType };

/**
 * Groth16 proof structure
 */
export interface Groth16Proof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

/**
 * Proof with public signals
 */
export interface ProofWithSignals {
  proof: Groth16Proof;
  publicSignals: string[];
}

/**
 * Serialized proof for on-chain submission (256 bytes)
 */
export interface SerializedProof {
  proofData: Uint8Array;
  publicInputs: bigint[];
}

/**
 * Deposit proof inputs
 */
export interface DepositProofInputs {
  commitment: bigint;
  amount: bigint;
  assetId: bigint;
  secret: bigint;
  nullifier: bigint;
}

/**
 * Withdraw proof inputs
 */
export interface WithdrawProofInputs {
  merkleRoot: bigint;
  nullifierHash: bigint;
  assetId: bigint;
  recipient: PublicKey;
  amount: bigint;
  relayer: PublicKey;
  relayerFee: bigint;
  publicDataHash: bigint;
  // Private inputs
  secret: bigint;
  nullifier: bigint;
  leafIndex: number;
  merkleProof: MerkleProof;
}

/**
 * JoinSplit proof inputs
 */
export interface JoinSplitProofInputs {
  merkleRoot: bigint;
  assetId: bigint;
  inputNotes: NoteWithNullifier[];
  outputNotes: Note[];
  publicAmount: bigint;
  relayer: PublicKey;
  relayerFee: bigint;
  // Private inputs
  inputMerkleProofs: MerkleProof[];
}

/**
 * @deprecated Use CircuitArtifacts from './circuit-provider' instead.
 * This interface is kept for backward compatibility.
 */
export interface CircuitPaths {
  wasmPath: string;
  zkeyPath: string;
}

/**
 * Options for creating a Prover instance
 */
export interface ProverOptions {
  /**
   * Circuit artifact provider for loading WASM and zkey files.
   * Use one of the factory functions to create a provider:
   * - createNodeCircuitProvider() for Node.js file paths
   * - createBrowserCircuitProvider() for browser URLs
   * - createBufferCircuitProvider() for pre-loaded buffers
   * - createEnvCircuitProvider() for environment variables
   */
  circuitProvider: CircuitArtifactProvider;
}

/**
 * Prover class for generating ZK proofs.
 *
 * @example
 * ```typescript
 * import { Prover, createNodeCircuitProvider } from '@psol/sdk';
 *
 * const provider = createNodeCircuitProvider('./circuits');
 * const prover = new Prover(provider);
 *
 * const proof = await prover.generateDepositProof({
 *   commitment: 123n,
 *   amount: 1000000n,
 *   assetId: 1n,
 *   secret: randomBigInt(),
 *   nullifier: randomBigInt(),
 * });
 * ```
 */
export class Prover {
  private readonly circuitProvider: CircuitArtifactProvider;

  /**
   * Create a new Prover instance.
   *
   * @param providerOrOptions - Circuit artifact provider or options object.
   *   For backward compatibility, accepts a CircuitArtifactProvider directly,
   *   or a ProverOptions object with the provider.
   *
   * @throws Error if no circuit provider is configured
   *
   * @example
   * ```typescript
   * // Recommended: Using a circuit provider
   * const provider = createNodeCircuitProvider('./circuits');
   * const prover = new Prover(provider);
   *
   * // Alternative: Using options object
   * const prover = new Prover({ circuitProvider: provider });
   * ```
   */
  constructor(providerOrOptions: CircuitArtifactProvider | ProverOptions) {
    if (!providerOrOptions) {
      throw new Error(
        'Circuit provider is required. Use createNodeCircuitProvider(), ' +
          'createBrowserCircuitProvider(), createBufferCircuitProvider(), ' +
          'or createEnvCircuitProvider() to create a provider.'
      );
    }

    // Check if it's an options object or a provider directly
    if ('circuitProvider' in providerOrOptions) {
      this.circuitProvider = providerOrOptions.circuitProvider;
    } else if ('getArtifacts' in providerOrOptions) {
      this.circuitProvider = providerOrOptions;
    } else {
      throw new Error(
        'Invalid argument: expected CircuitArtifactProvider or ProverOptions. ' +
          'Use createNodeCircuitProvider(), createBrowserCircuitProvider(), ' +
          'createBufferCircuitProvider(), or createEnvCircuitProvider() to create a provider.'
      );
    }
  }

  /**
   * Get circuit artifacts for a proof type.
   * Resolves the provider's artifacts (which may be async).
   */
  private async getArtifacts(proofType: ProofType): Promise<CircuitArtifacts> {
    const artifacts = await this.circuitProvider.getArtifacts(proofType);
    return artifacts;
  }
  
  /**
   * Generate deposit proof
   */
  async generateDepositProof(inputs: DepositProofInputs): Promise<SerializedProof> {
    const circuitInputs = {
      commitment: inputs.commitment.toString(),
      amount: inputs.amount.toString(),
      asset_id: inputs.assetId.toString(),
      secret: inputs.secret.toString(),
      nullifier: inputs.nullifier.toString(),
    };

    const artifacts = await this.getArtifacts(ProofType.Deposit);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      artifacts.wasm,
      artifacts.zkey
    );

    return this.serializeProof(proof as unknown as Groth16Proof, publicSignals);
  }
  
  /**
   * Generate withdrawal proof
   */
  async generateWithdrawProof(inputs: WithdrawProofInputs): Promise<SerializedProof> {
    const circuitInputs = {
      // Public inputs
      merkle_root: inputs.merkleRoot.toString(),
      nullifier_hash: inputs.nullifierHash.toString(),
      asset_id: inputs.assetId.toString(),
      recipient: pubkeyToScalar(inputs.recipient).toString(),
      amount: inputs.amount.toString(),
      relayer: pubkeyToScalar(inputs.relayer).toString(),
      relayer_fee: inputs.relayerFee.toString(),
      public_data_hash: inputs.publicDataHash.toString(),
      // Private inputs
      secret: inputs.secret.toString(),
      nullifier: inputs.nullifier.toString(),
      leaf_index: inputs.leafIndex.toString(),
      merkle_path: inputs.merkleProof.pathElements.map((e) => e.toString()),
      merkle_path_indices: inputs.merkleProof.pathIndices.map((i) => i.toString()),
    };

    const artifacts = await this.getArtifacts(ProofType.Withdraw);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      artifacts.wasm,
      artifacts.zkey
    );

    return this.serializeProof(proof as unknown as Groth16Proof, publicSignals);
  }

  /**
   * Generate JoinSplit proof
   */
  async generateJoinSplitProof(inputs: JoinSplitProofInputs): Promise<SerializedProof> {
    if (inputs.inputNotes.length !== 2 || inputs.outputNotes.length !== 2) {
      throw new Error('JoinSplit requires exactly 2 inputs and 2 outputs');
    }

    const circuitInputs = {
      merkle_root: inputs.merkleRoot.toString(),
      asset_id: inputs.assetId.toString(),
      input_nullifiers: inputs.inputNotes.map((n) => n.nullifierHash.toString()),
      output_commitments: inputs.outputNotes.map((n) => n.commitment.toString()),
      public_amount: inputs.publicAmount.toString(),
      relayer: pubkeyToScalar(inputs.relayer).toString(),
      relayer_fee: inputs.relayerFee.toString(),
      // Private inputs
      input_secrets: inputs.inputNotes.map((n) => n.secret.toString()),
      input_nullifier_preimages: inputs.inputNotes.map((n) => n.nullifier.toString()),
      input_amounts: inputs.inputNotes.map((n) => n.amount.toString()),
      input_leaf_indices: inputs.inputNotes.map((n) => n.leafIndex!.toString()),
      input_merkle_paths: inputs.inputMerkleProofs.map((p) =>
        p.pathElements.map((e) => e.toString())
      ),
      input_path_indices: inputs.inputMerkleProofs.map((p) =>
        p.pathIndices.map((i) => i.toString())
      ),
      output_secrets: inputs.outputNotes.map((n) => n.secret.toString()),
      output_nullifier_preimages: inputs.outputNotes.map((n) => n.nullifier.toString()),
      output_amounts: inputs.outputNotes.map((n) => n.amount.toString()),
    };

    const artifacts = await this.getArtifacts(ProofType.JoinSplit);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      artifacts.wasm,
      artifacts.zkey
    );

    return this.serializeProof(proof as unknown as Groth16Proof, publicSignals);
  }

  /**
   * Serialize Groth16 proof to 256 bytes for on-chain verification
   */
  private serializeProof(proof: Groth16Proof, publicSignals: string[]): SerializedProof {
    // Convert proof to bytes
    // Format: A (64 bytes) || B (128 bytes) || C (64 bytes) = 256 bytes
    const proofData = new Uint8Array(256);
    
    // A point (G1): x, y each 32 bytes
    const ax = hexToBytes32(bigIntToHex(BigInt(proof.pi_a[0])));
    const ay = hexToBytes32(bigIntToHex(BigInt(proof.pi_a[1])));
    proofData.set(ax, 0);
    proofData.set(ay, 32);
    
    // B point (G2): x = (x0, x1), y = (y0, y1) each 32 bytes
    const bx0 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[0][1])));
    const bx1 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[0][0])));
    const by0 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[1][1])));
    const by1 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[1][0])));
    proofData.set(bx0, 64);
    proofData.set(bx1, 96);
    proofData.set(by0, 128);
    proofData.set(by1, 160);
    
    // C point (G1): x, y each 32 bytes
    const cx = hexToBytes32(bigIntToHex(BigInt(proof.pi_c[0])));
    const cy = hexToBytes32(bigIntToHex(BigInt(proof.pi_c[1])));
    proofData.set(cx, 192);
    proofData.set(cy, 224);
    
    // Public inputs
    const publicInputs = publicSignals.map(s => BigInt(s));
    
    return { proofData, publicInputs };
  }
}

/**
 * Convert Solana PublicKey to scalar field element
 */
export function pubkeyToScalar(pubkey: PublicKey): bigint {
  const bytes = pubkey.toBytes();
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  // Reduce modulo BN254 scalar field
  const FIELD_MODULUS = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
  );
  return result % FIELD_MODULUS;
}

/**
 * Convert bigint to hex string
 */
function bigIntToHex(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

/**
 * Convert hex string to 32-byte array
 */
function hexToBytes32(hex: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Verify proof locally (for testing)
 */
export async function verifyProofLocally(
  proofType: ProofType,
  proof: Groth16Proof,
  publicSignals: string[],
  vkeyPath: string
): Promise<boolean> {
  const vkey = await fetch(vkeyPath).then(r => r.json());
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Export verification key from zkey file
 */
export async function exportVerificationKey(zkeyPath: string): Promise<any> {
  return snarkjs.zKey.exportVerificationKey(zkeyPath);
}

// Re-export circuit provider types and factories
export {
  CircuitArtifactProvider,
  CircuitArtifacts,
  CircuitArtifactConfig,
  StaticCircuitProvider,
  PathCircuitProvider,
  PathProviderOptions,
  CIRCUIT_ENV_VARS,
  createNodeCircuitProvider,
  createBrowserCircuitProvider,
  createBufferCircuitProvider,
  createEnvCircuitProvider,
} from './circuit-provider';
