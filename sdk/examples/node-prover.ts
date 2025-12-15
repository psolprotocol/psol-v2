/**
 * Node.js Prover Example
 *
 * This example demonstrates how to configure and use the Prover
 * in a Node.js environment with file system paths.
 *
 * Usage:
 *   npx ts-node examples/node-prover.ts
 *
 * Or with environment variables:
 *   PSOL_CIRCUIT_PATH=/path/to/circuits npx ts-node examples/node-prover.ts
 */

import * as crypto from 'crypto';
import {
  Prover,
  ProofType,
  createNodeCircuitProvider,
  createEnvCircuitProvider,
  DepositProofInputs,
} from '../src';

/**
 * Generate a random bigint for secrets/nullifiers
 */
function randomBigInt(): bigint {
  const bytes = crypto.randomBytes(31); // 31 bytes to stay under field modulus
  return BigInt('0x' + bytes.toString('hex'));
}

/**
 * Example 1: Using file path configuration
 */
async function exampleWithFilePaths(): Promise<void> {
  console.log('=== Example 1: File Path Configuration ===\n');

  // Configure circuit provider with base path
  // The provider will look for circuits at:
  //   circuits/deposit/deposit_js/deposit.wasm
  //   circuits/deposit/deposit_final.zkey
  //   etc.
  const circuitsPath = process.cwd() + '/circuits';
  console.log(`Circuit base path: ${circuitsPath}`);

  const provider = createNodeCircuitProvider(circuitsPath);
  const prover = new Prover(provider);

  // Prepare deposit inputs
  const inputs: DepositProofInputs = {
    commitment: randomBigInt(),
    amount: BigInt(1_000_000), // 1 token with 6 decimals
    assetId: BigInt(1),
    secret: randomBigInt(),
    nullifier: randomBigInt(),
  };

  console.log('Deposit inputs:');
  console.log(`  commitment: ${inputs.commitment.toString().slice(0, 20)}...`);
  console.log(`  amount: ${inputs.amount}`);
  console.log(`  assetId: ${inputs.assetId}`);

  try {
    console.log('\nGenerating deposit proof...');
    const proof = await prover.generateDepositProof(inputs);

    console.log('Proof generated successfully!');
    console.log(`  proofData length: ${proof.proofData.length} bytes`);
    console.log(`  publicInputs count: ${proof.publicInputs.length}`);
  } catch (error) {
    console.log('Note: Proof generation requires compiled circuits.');
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Example 2: Using environment variables
 */
async function exampleWithEnvVars(): Promise<void> {
  console.log('\n=== Example 2: Environment Variable Configuration ===\n');

  // Check if PSOL_CIRCUIT_PATH is set
  if (!process.env.PSOL_CIRCUIT_PATH) {
    console.log('PSOL_CIRCUIT_PATH not set. Skipping this example.');
    console.log('Set it with: export PSOL_CIRCUIT_PATH=/path/to/circuits');
    return;
  }

  console.log(`PSOL_CIRCUIT_PATH: ${process.env.PSOL_CIRCUIT_PATH}`);

  try {
    const provider = createEnvCircuitProvider();
    const prover = new Prover(provider);

    console.log('Prover created successfully from environment variables!');

    // You could generate proofs here...
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Example 3: Using custom path templates
 */
async function exampleWithCustomPaths(): Promise<void> {
  console.log('\n=== Example 3: Custom Path Templates ===\n');

  // If your circuits are organized differently, customize the paths
  const provider = createNodeCircuitProvider('/path/to/custom/circuits', {
    pathTemplate: {
      // Custom WASM location
      wasm: '{basePath}/wasm/{proofType}.wasm',
      // Custom zkey location
      zkey: '{basePath}/keys/{proofType}_proving.zkey',
    },
  });

  // This would look for:
  //   /path/to/custom/circuits/wasm/deposit.wasm
  //   /path/to/custom/circuits/keys/deposit_proving.zkey
  // etc.

  console.log('Custom provider configured with templates:');
  console.log("  wasm: '{basePath}/wasm/{proofType}.wasm'");
  console.log("  zkey: '{basePath}/keys/{proofType}_proving.zkey'");

  // Note: This will fail if the files don't exist at these paths
  const prover = new Prover(provider);
  console.log('Prover created with custom paths!');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('pSOL v2 SDK - Node.js Prover Examples\n');
  console.log('These examples demonstrate different ways to configure');
  console.log('circuit artifact locations in a Node.js environment.\n');

  await exampleWithFilePaths();
  await exampleWithEnvVars();
  await exampleWithCustomPaths();

  console.log('\n=== Done ===');
}

main().catch(console.error);
