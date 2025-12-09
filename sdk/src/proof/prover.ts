/**
 * pSOL v2 SDK - Proof Generation
 * 
 * Generates ZK proofs for deposits, withdrawals, and transfers.
 * Uses snarkjs for Groth16 proof generation.
 * 
 * @module proof/prover
 */

import * as snarkjs from 'snarkjs';
import { Note, NoteWithNullifier, computeNoteNullifier } from '../note/note';
import { MerkleProof, MerkleTree } from '../merkle/tree';
import { bigIntToBytes, initPoseidon, computeCommitment } from '../crypto/poseidon';
import { PublicKey } from '@solana/web3.js';

/**
 * Proof type enumeration
 */
export enum ProofType {
  Deposit = 0,
  Withdraw = 1,
  JoinSplit = 2,
  Membership = 3,
}

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
 * Circuit files paths
 */
export interface CircuitPaths {
  wasmPath: string;
  zkeyPath: string;
}

/**
 * Default circuit paths (relative to project root)
 */
export const DEFAULT_CIRCUIT_PATHS: Record<ProofType, CircuitPaths> = {
  [ProofType.Deposit]: {
    wasmPath: 'circuits/deposit/deposit_js/deposit.wasm',
    zkeyPath: 'circuits/deposit/deposit_final.zkey',
  },
  [ProofType.Withdraw]: {
    wasmPath: 'circuits/withdraw/withdraw_js/withdraw.wasm',
    zkeyPath: 'circuits/withdraw/withdraw_final.zkey',
  },
  [ProofType.JoinSplit]: {
    wasmPath: 'circuits/joinsplit/joinsplit_js/joinsplit.wasm',
    zkeyPath: 'circuits/joinsplit/joinsplit_final.zkey',
  },
  [ProofType.Membership]: {
    wasmPath: 'circuits/membership/membership_js/membership.wasm',
    zkeyPath: 'circuits/membership/membership_final.zkey',
  },
};

/**
 * Prover class for generating ZK proofs
 */
export class Prover {
  private circuitPaths: Record<ProofType, CircuitPaths>;
  
  constructor(circuitPaths?: Partial<Record<ProofType, CircuitPaths>>) {
    this.circuitPaths = {
      ...DEFAULT_CIRCUIT_PATHS,
      ...circuitPaths,
    };
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
    
    const paths = this.circuitPaths[ProofType.Deposit];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    
    return this.serializeProof(proof, publicSignals);
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
      merkle_path: inputs.merkleProof.pathElements.map(e => e.toString()),
      merkle_path_indices: inputs.merkleProof.pathIndices.map(i => i.toString()),
    };
    
    const paths = this.circuitPaths[ProofType.Withdraw];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    
    return this.serializeProof(proof, publicSignals);
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
      input_nullifiers: inputs.inputNotes.map(n => n.nullifierHash.toString()),
      output_commitments: inputs.outputNotes.map(n => n.commitment.toString()),
      public_amount: inputs.publicAmount.toString(),
      relayer: pubkeyToScalar(inputs.relayer).toString(),
      relayer_fee: inputs.relayerFee.toString(),
      // Private inputs
      input_secrets: inputs.inputNotes.map(n => n.secret.toString()),
      input_nullifier_preimages: inputs.inputNotes.map(n => n.nullifier.toString()),
      input_amounts: inputs.inputNotes.map(n => n.amount.toString()),
      input_leaf_indices: inputs.inputNotes.map(n => n.leafIndex!.toString()),
      input_merkle_paths: inputs.inputMerkleProofs.map(p => 
        p.pathElements.map(e => e.toString())
      ),
      input_path_indices: inputs.inputMerkleProofs.map(p =>
        p.pathIndices.map(i => i.toString())
      ),
      output_secrets: inputs.outputNotes.map(n => n.secret.toString()),
      output_nullifier_preimages: inputs.outputNotes.map(n => n.nullifier.toString()),
      output_amounts: inputs.outputNotes.map(n => n.amount.toString()),
    };
    
    const paths = this.circuitPaths[ProofType.JoinSplit];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    
    return this.serializeProof(proof, publicSignals);
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
