/**
 * pSOL v2 SDK - Circuit Artifact Provider
 *
 * Flexible abstraction for loading circuit artifacts (WASM and zkey files)
 * in different environments: Node.js, browser, bundlers, etc.
 *
 * @module proof/circuit-provider
 */

import { ProofType } from '../types';

/**
 * Circuit artifacts required for proof generation.
 * Compatible with snarkjs ZKArtifact type (string | Uint8Array).
 */
export interface CircuitArtifacts {
  /**
   * WebAssembly binary for the circuit witness calculator.
   * Can be:
   * - A file path (Node.js with fs)
   * - A URL string (browser fetch)
   * - A Uint8Array (pre-loaded binary)
   */
  wasm: string | Uint8Array;

  /**
   * zkey file for the Groth16 proving key.
   * Can be:
   * - A file path (Node.js with fs)
   * - A URL string (browser fetch)
   * - A Uint8Array (pre-loaded binary)
   */
  zkey: string | Uint8Array;
}

/**
 * Provider interface for loading circuit artifacts.
 * Implement this interface to support custom loading mechanisms.
 */
export interface CircuitArtifactProvider {
  /**
   * Get circuit artifacts for a specific proof type.
   * @param proofType - The type of proof (Deposit, Withdraw, JoinSplit, Membership)
   * @returns Circuit artifacts (WASM and zkey)
   */
  getArtifacts(proofType: ProofType): CircuitArtifacts | Promise<CircuitArtifacts>;
}

/**
 * Configuration for static circuit artifact provider.
 * Maps proof types to their artifact locations.
 */
export type CircuitArtifactConfig = {
  [K in ProofType]?: CircuitArtifacts;
};

/**
 * Static circuit artifact provider.
 * Uses pre-configured artifact locations for each proof type.
 */
export class StaticCircuitProvider implements CircuitArtifactProvider {
  private readonly config: CircuitArtifactConfig;

  constructor(config: CircuitArtifactConfig) {
    this.config = config;
  }

  getArtifacts(proofType: ProofType): CircuitArtifacts {
    const artifacts = this.config[proofType];
    if (!artifacts) {
      throw new Error(
        `No circuit artifacts configured for proof type: ${ProofType[proofType]}. ` +
          `Configure artifacts using the CircuitArtifactConfig.`
      );
    }
    return artifacts;
  }
}

/**
 * Options for creating a path-based circuit provider.
 */
export interface PathProviderOptions {
  /**
   * Base directory containing circuit artifacts.
   * @example '/app/circuits' or 'https://cdn.example.com/circuits'
   */
  basePath: string;

  /**
   * Optional custom path template for each proof type.
   * Uses {basePath}, {proofType}, and {ext} placeholders.
   * @default '{basePath}/{proofType}/{proofType}_js/{proofType}.wasm' for wasm
   * @default '{basePath}/{proofType}/{proofType}_final.zkey' for zkey
   */
  pathTemplate?: {
    wasm?: string;
    zkey?: string;
  };
}

/**
 * Proof type to circuit directory name mapping
 */
const PROOF_TYPE_NAMES: Record<ProofType, string> = {
  [ProofType.Deposit]: 'deposit',
  [ProofType.Withdraw]: 'withdraw',
  [ProofType.JoinSplit]: 'joinsplit',
  [ProofType.Membership]: 'membership',
};

/**
 * Path-based circuit artifact provider.
 * Generates artifact paths from a base path and optional templates.
 * Suitable for Node.js (file paths) or browser (URL paths).
 */
export class PathCircuitProvider implements CircuitArtifactProvider {
  private readonly basePath: string;
  private readonly wasmTemplate: string;
  private readonly zkeyTemplate: string;

  constructor(options: PathProviderOptions) {
    this.basePath = options.basePath.replace(/\/$/, ''); // Remove trailing slash

    this.wasmTemplate =
      options.pathTemplate?.wasm ?? '{basePath}/{proofType}/{proofType}_js/{proofType}.wasm';

    this.zkeyTemplate =
      options.pathTemplate?.zkey ?? '{basePath}/{proofType}/{proofType}_final.zkey';
  }

  getArtifacts(proofType: ProofType): CircuitArtifacts {
    const proofTypeName = PROOF_TYPE_NAMES[proofType];

    const wasm = this.wasmTemplate
      .replace('{basePath}', this.basePath)
      .replace(/{proofType}/g, proofTypeName);

    const zkey = this.zkeyTemplate
      .replace('{basePath}', this.basePath)
      .replace(/{proofType}/g, proofTypeName);

    return { wasm, zkey };
  }
}

/**
 * Create a circuit provider from file paths (Node.js).
 *
 * @example
 * ```typescript
 * // Using a base directory
 * const provider = createNodeCircuitProvider('/path/to/circuits');
 *
 * // The provider will look for:
 * // - /path/to/circuits/deposit/deposit_js/deposit.wasm
 * // - /path/to/circuits/deposit/deposit_final.zkey
 * // etc.
 * ```
 *
 * @param basePath - Base directory containing circuit artifacts
 * @param options - Optional path templates
 */
export function createNodeCircuitProvider(
  basePath: string,
  options?: Omit<PathProviderOptions, 'basePath'>
): PathCircuitProvider {
  return new PathCircuitProvider({ basePath, ...options });
}

/**
 * Create a circuit provider from URLs (browser/CDN).
 *
 * @example
 * ```typescript
 * // Using a CDN base URL
 * const provider = createBrowserCircuitProvider('https://cdn.example.com/circuits');
 *
 * // The provider will construct URLs:
 * // - https://cdn.example.com/circuits/deposit/deposit_js/deposit.wasm
 * // - https://cdn.example.com/circuits/deposit/deposit_final.zkey
 * // etc.
 * ```
 *
 * @param baseUrl - Base URL for circuit artifacts
 * @param options - Optional path templates
 */
export function createBrowserCircuitProvider(
  baseUrl: string,
  options?: Omit<PathProviderOptions, 'basePath'>
): PathCircuitProvider {
  return new PathCircuitProvider({ basePath: baseUrl, ...options });
}

/**
 * Create a circuit provider from pre-loaded buffers.
 *
 * @example
 * ```typescript
 * // Pre-load artifacts (e.g., from a bundler or fetch)
 * const depositWasm = await fetch('/circuits/deposit.wasm').then(r => r.arrayBuffer());
 * const depositZkey = await fetch('/circuits/deposit.zkey').then(r => r.arrayBuffer());
 *
 * const provider = createBufferCircuitProvider({
 *   [ProofType.Deposit]: {
 *     wasm: new Uint8Array(depositWasm),
 *     zkey: new Uint8Array(depositZkey),
 *   },
 * });
 * ```
 *
 * @param artifacts - Map of proof types to pre-loaded artifacts
 */
export function createBufferCircuitProvider(
  artifacts: CircuitArtifactConfig
): StaticCircuitProvider {
  return new StaticCircuitProvider(artifacts);
}

/**
 * Environment variables for circuit paths.
 * These can be used to configure circuit locations without code changes.
 */
export const CIRCUIT_ENV_VARS = {
  /** Base path for all circuits */
  basePath: 'PSOL_CIRCUIT_PATH',
  /** Individual circuit paths (override base path) */
  deposit: {
    wasm: 'PSOL_DEPOSIT_WASM',
    zkey: 'PSOL_DEPOSIT_ZKEY',
  },
  withdraw: {
    wasm: 'PSOL_WITHDRAW_WASM',
    zkey: 'PSOL_WITHDRAW_ZKEY',
  },
  joinsplit: {
    wasm: 'PSOL_JOINSPLIT_WASM',
    zkey: 'PSOL_JOINSPLIT_ZKEY',
  },
  membership: {
    wasm: 'PSOL_MEMBERSHIP_WASM',
    zkey: 'PSOL_MEMBERSHIP_ZKEY',
  },
} as const;

/**
 * Create a circuit provider from environment variables (Node.js).
 *
 * Reads circuit paths from environment variables:
 * - PSOL_CIRCUIT_PATH: Base path for all circuits
 * - PSOL_{PROOFTYPE}_WASM: Override WASM path for specific proof type
 * - PSOL_{PROOFTYPE}_ZKEY: Override zkey path for specific proof type
 *
 * @example
 * ```bash
 * # Set environment variable
 * export PSOL_CIRCUIT_PATH=/app/circuits
 *
 * # Or override specific circuits
 * export PSOL_DEPOSIT_WASM=/custom/path/deposit.wasm
 * export PSOL_DEPOSIT_ZKEY=/custom/path/deposit.zkey
 * ```
 *
 * @example
 * ```typescript
 * const provider = createEnvCircuitProvider();
 * const prover = new Prover(provider);
 * ```
 *
 * @throws Error if PSOL_CIRCUIT_PATH is not set and no individual paths are configured
 */
export function createEnvCircuitProvider(): CircuitArtifactProvider {
  // Check for Node.js environment
  if (typeof process === 'undefined' || !process.env) {
    throw new Error(
      'createEnvCircuitProvider is only available in Node.js. ' +
        'For browser environments, use createBrowserCircuitProvider or createBufferCircuitProvider.'
    );
  }

  const basePath = process.env[CIRCUIT_ENV_VARS.basePath];

  const config: CircuitArtifactConfig = {};

  // Helper to get artifact paths for a proof type
  const getArtifactPaths = (
    proofType: ProofType,
    envKey: keyof typeof CIRCUIT_ENV_VARS
  ): CircuitArtifacts | undefined => {
    const envConfig = CIRCUIT_ENV_VARS[envKey] as { wasm: string; zkey: string };
    const wasmPath = process.env[envConfig.wasm];
    const zkeyPath = process.env[envConfig.zkey];

    // If individual paths are set, use them
    if (wasmPath && zkeyPath) {
      return { wasm: wasmPath, zkey: zkeyPath };
    }

    // Otherwise, fall back to base path
    if (basePath) {
      const proofTypeName = PROOF_TYPE_NAMES[proofType];
      return {
        wasm: `${basePath}/${proofTypeName}/${proofTypeName}_js/${proofTypeName}.wasm`,
        zkey: `${basePath}/${proofTypeName}/${proofTypeName}_final.zkey`,
      };
    }

    return undefined;
  };

  // Configure each proof type
  const depositArtifacts = getArtifactPaths(ProofType.Deposit, 'deposit');
  if (depositArtifacts) config[ProofType.Deposit] = depositArtifacts;

  const withdrawArtifacts = getArtifactPaths(ProofType.Withdraw, 'withdraw');
  if (withdrawArtifacts) config[ProofType.Withdraw] = withdrawArtifacts;

  const joinsplitArtifacts = getArtifactPaths(ProofType.JoinSplit, 'joinsplit');
  if (joinsplitArtifacts) config[ProofType.JoinSplit] = joinsplitArtifacts;

  const membershipArtifacts = getArtifactPaths(ProofType.Membership, 'membership');
  if (membershipArtifacts) config[ProofType.Membership] = membershipArtifacts;

  // Validate at least one path is configured
  if (Object.keys(config).length === 0) {
    throw new Error(
      `No circuit paths configured. Set ${CIRCUIT_ENV_VARS.basePath} environment variable ` +
        `or individual circuit paths (e.g., ${CIRCUIT_ENV_VARS.deposit.wasm}).`
    );
  }

  return new StaticCircuitProvider(config);
}
