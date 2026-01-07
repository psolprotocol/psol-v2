#!/usr/bin/env node
/**
 * Generate exact Poseidon test vectors for Rust tests
 *
 * Usage: node generate_test_vector.mjs
 *
 * This generates the canonical test vectors from circomlibjs that must
 * match the on-chain Poseidon implementation exactly.
 */

import { buildPoseidon } from 'circomlibjs';

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  console.log('=== Poseidon Test Vectors (circomlibjs) ===\n');

  // Poseidon(1, 2) - canonical test vector
  const hash12 = F.toObject(poseidon([1n, 2n]));
  const hex12 = hash12.toString(16).padStart(64, '0');

  console.log('Poseidon(1, 2):');
  console.log('  Decimal:', hash12.toString());
  console.log('  Hex: 0x' + hex12);
  console.log('\n  Rust constant POSEIDON_1_2_CIRCOMLIB:');
  console.log('  pub const POSEIDON_1_2_CIRCOMLIB: [u8; 32] = [');
  for (let i = 0; i < 32; i += 8) {
    const bytes = [];
    for (let j = 0; j < 8; j++) {
      bytes.push('0x' + hex12.slice((i + j) * 2, (i + j) * 2 + 2));
    }
    console.log('      ' + bytes.join(', ') + ',');
  }
  console.log('  ];');

  // Poseidon(0, 0) - zero hash for Merkle tree
  const hash00 = F.toObject(poseidon([0n, 0n]));
  const hex00 = hash00.toString(16).padStart(64, '0');

  console.log('\nPoseidon(0, 0):');
  console.log('  Decimal:', hash00.toString());
  console.log('  Hex: 0x' + hex00);
  console.log('\n  Rust constant POSEIDON_0_0_CIRCOMLIB:');
  console.log('  pub const POSEIDON_0_0_CIRCOMLIB: [u8; 32] = [');
  for (let i = 0; i < 32; i += 8) {
    const bytes = [];
    for (let j = 0; j < 8; j++) {
      bytes.push('0x' + hex00.slice((i + j) * 2, (i + j) * 2 + 2));
    }
    console.log('      ' + bytes.join(', ') + ',');
  }
  console.log('  ];');

  // Sample commitment: Poseidon(66, 1, 1000000, 1)
  const hashCommit = F.toObject(poseidon([66n, 1n, 1000000n, 1n]));
  const hexCommit = hashCommit.toString(16).padStart(64, '0');

  console.log('\nPoseidon(66, 1, 1000000, 1) [sample commitment]:');
  console.log('  Decimal:', hashCommit.toString());
  console.log('  Hex: 0x' + hexCommit);

  console.log('\n=== Copy the Rust constants above into encoding.rs ===');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
