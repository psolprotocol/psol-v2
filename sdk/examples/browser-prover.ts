/**
 * Browser Prover Example
 *
 * This example demonstrates how to configure and use the Prover
 * in a browser environment with URL-based or pre-loaded artifacts.
 *
 * This file is meant to be bundled with your frontend application.
 */

import {
  Prover,
  ProofType,
  createBrowserCircuitProvider,
  createBufferCircuitProvider,
  CircuitArtifactProvider,
  CircuitArtifacts,
  DepositProofInputs,
} from '../src';

/**
 * Generate a random bigint using Web Crypto API
 */
function randomBigInt(): bigint {
  const bytes = new Uint8Array(31); // 31 bytes to stay under field modulus
  crypto.getRandomValues(bytes);
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
}

/**
 * Example 1: URL-based configuration (CDN/Server)
 *
 * Best for: Static hosting, CDN delivery
 */
export function createCdnProver(cdnBaseUrl: string): Prover {
  // Configure with CDN base URL
  // Circuits will be loaded from:
  //   https://cdn.example.com/circuits/deposit/deposit_js/deposit.wasm
  //   https://cdn.example.com/circuits/deposit/deposit_final.zkey
  //   etc.
  const provider = createBrowserCircuitProvider(cdnBaseUrl);
  return new Prover(provider);
}

/**
 * Example 2: Pre-loaded buffers (Bundler imports)
 *
 * Best for: Bundlers that support binary imports (Webpack, Vite)
 *
 * Bundler configuration required to import binary files.
 */
export async function createBundledProver(): Promise<Prover> {
  // In a real app, these would be bundler imports:
  // import depositWasm from './circuits/deposit.wasm';
  // import depositZkey from './circuits/deposit.zkey';

  // For this example, we'll fetch them manually
  const [depositWasmBuffer, depositZkeyBuffer] = await Promise.all([
    fetch('/circuits/deposit/deposit.wasm').then((r) => r.arrayBuffer()),
    fetch('/circuits/deposit/deposit.zkey').then((r) => r.arrayBuffer()),
  ]);

  const provider = createBufferCircuitProvider({
    [ProofType.Deposit]: {
      wasm: new Uint8Array(depositWasmBuffer),
      zkey: new Uint8Array(depositZkeyBuffer),
    },
  });

  return new Prover(provider);
}

/**
 * Example 3: Lazy-loading provider with progress callback
 *
 * Best for: Large circuits, better UX with loading indicators
 */
export class LazyLoadingCircuitProvider implements CircuitArtifactProvider {
  private readonly baseUrl: string;
  private readonly cache: Map<ProofType, CircuitArtifacts> = new Map();
  private readonly onProgress?: (proofType: ProofType, loaded: number, total: number) => void;

  constructor(
    baseUrl: string,
    onProgress?: (proofType: ProofType, loaded: number, total: number) => void
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.onProgress = onProgress;
  }

  async getArtifacts(proofType: ProofType): Promise<CircuitArtifacts> {
    // Return cached artifacts if available
    const cached = this.cache.get(proofType);
    if (cached) {
      return cached;
    }

    const proofTypeName = this.getProofTypeName(proofType);
    const wasmUrl = `${this.baseUrl}/${proofTypeName}/${proofTypeName}_js/${proofTypeName}.wasm`;
    const zkeyUrl = `${this.baseUrl}/${proofTypeName}/${proofTypeName}_final.zkey`;

    // Fetch with progress tracking
    const [wasm, zkey] = await Promise.all([
      this.fetchWithProgress(wasmUrl, proofType),
      this.fetchWithProgress(zkeyUrl, proofType),
    ]);

    const artifacts: CircuitArtifacts = {
      wasm: new Uint8Array(wasm),
      zkey: new Uint8Array(zkey),
    };

    // Cache for future use
    this.cache.set(proofType, artifacts);

    return artifacts;
  }

  private getProofTypeName(proofType: ProofType): string {
    const names: Record<ProofType, string> = {
      [ProofType.Deposit]: 'deposit',
      [ProofType.Withdraw]: 'withdraw',
      [ProofType.JoinSplit]: 'joinsplit',
      [ProofType.Membership]: 'membership',
    };
    return names[proofType];
  }

  private async fetchWithProgress(url: string, proofType: ProofType): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || !this.onProgress || total === 0) {
      return response.arrayBuffer();
    }

    // Stream with progress
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;
      this.onProgress(proofType, loaded, total);
    }

    // Combine chunks
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  /**
   * Preload specific proof types
   */
  async preload(proofTypes: ProofType[]): Promise<void> {
    await Promise.all(proofTypes.map(pt => this.getArtifacts(pt)));
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Example 4: Web Worker integration
 *
 * Best for: Non-blocking proof generation, better UX
 *
 * Note: This is a conceptual example. In production, you'd create
 * a separate worker file.
 */
export interface ProverWorkerMessage {
  type: 'generateProof';
  proofType: ProofType;
  inputs: Record<string, unknown>;
}

export interface ProverWorkerResponse {
  type: 'proofGenerated' | 'error';
  proof?: { proofData: Uint8Array; publicInputs: bigint[] };
  error?: string;
}

// In worker.ts:
// self.onmessage = async (event: MessageEvent<ProverWorkerMessage>) => {
//   const { type, proofType, inputs } = event.data;
//   
//   if (type === 'generateProof') {
//     try {
//       const provider = createBrowserCircuitProvider('/circuits');
//       const prover = new Prover(provider);
//       
//       let proof;
//       switch (proofType) {
//         case ProofType.Deposit:
//           proof = await prover.generateDepositProof(inputs as DepositProofInputs);
//           break;
//         // ... other proof types
//       }
//       
//       self.postMessage({ type: 'proofGenerated', proof });
//     } catch (error) {
//       self.postMessage({ type: 'error', error: error.message });
//     }
//   }
// };

/**
 * Demo: Generate a deposit proof
 */
export async function demo(): Promise<void> {
  console.log('pSOL v2 SDK - Browser Prover Demo');

  // Create prover with CDN configuration
  const provider = new LazyLoadingCircuitProvider(
    'https://your-cdn.example.com/circuits',
    (proofType, loaded, total) => {
      const percent = Math.round((loaded / total) * 100);
      console.log(`Loading ${ProofType[proofType]}: ${percent}%`);
    }
  );

  const prover = new Prover(provider);

  // Prepare inputs
  const inputs: DepositProofInputs = {
    commitment: randomBigInt(),
    amount: BigInt(1_000_000),
    assetId: BigInt(1),
    secret: randomBigInt(),
    nullifier: randomBigInt(),
  };

  console.log('Generating deposit proof...');

  try {
    const proof = await prover.generateDepositProof(inputs);
    console.log('Proof generated!');
    console.log(`  proofData: ${proof.proofData.length} bytes`);
    console.log(`  publicInputs: ${proof.publicInputs.length} items`);
  } catch (error) {
    console.error('Error generating proof:', error);
  }
}

// Auto-run demo if this is the main module (browser environment check)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => demo());
  } else {
    demo();
  }
}
