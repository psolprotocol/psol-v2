#!/usr/bin/env node
/**
 * Verify vectors.json against circomlibjs
 * 
 * Usage: node verify_vectors.mjs
 * 
 * This script verifies that vectors.json matches circomlibjs output.
 * Use this to detect drift between generated vectors and ground truth.
 */

import { buildPoseidon } from 'circomlibjs';
import { readFileSync } from 'fs';

function bigIntToBe32Hex(x) {
  let hex = x.toString(16);
  if (hex.length > 64) throw new Error("Value does not fit in 32 bytes");
  return "0x" + hex.padStart(64, "0");
}

async function main() {
  console.log('Loading vectors.json...');
  const vectors = JSON.parse(readFileSync('vectors.json', 'utf8'));
  
  console.log('Building Poseidon from circomlibjs...');
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  function toBigInt(fe) {
    if (typeof F.toObject === "function") return F.toObject(fe);
    if (typeof F.toString === "function") return BigInt(F.toString(fe));
    return BigInt(fe.toString());
  }
  
  function hashToHex(inputs) {
    const inputsBig = inputs.map(h => BigInt(h));
    const out = poseidon(inputsBig);
    return bigIntToBe32Hex(toBigInt(out));
  }
  
  let passed = 0;
  let failed = 0;
  
  // Verify poseidon2
  console.log(`\nVerifying ${vectors.poseidon2.length} poseidon2 vectors...`);
  for (let i = 0; i < vectors.poseidon2.length; i++) {
    const v = vectors.poseidon2[i];
    const expected = hashToHex(v.in);
    if (expected !== v.out) {
      console.error(`  [${i}] MISMATCH`);
      console.error(`    inputs: ${v.in.join(', ')}`);
      console.error(`    expected: ${expected}`);
      console.error(`    got:      ${v.out}`);
      failed++;
    } else {
      passed++;
    }
  }
  
  // Verify poseidon3
  console.log(`Verifying ${vectors.poseidon3.length} poseidon3 vectors...`);
  for (let i = 0; i < vectors.poseidon3.length; i++) {
    const v = vectors.poseidon3[i];
    const expected = hashToHex(v.in);
    if (expected !== v.out) {
      console.error(`  [${i}] MISMATCH`);
      console.error(`    inputs: ${v.in.join(', ')}`);
      console.error(`    expected: ${expected}`);
      console.error(`    got:      ${v.out}`);
      failed++;
    } else {
      passed++;
    }
  }
  
  // Verify poseidon4
  console.log(`Verifying ${vectors.poseidon4.length} poseidon4 vectors...`);
  for (let i = 0; i < vectors.poseidon4.length; i++) {
    const v = vectors.poseidon4[i];
    const expected = hashToHex(v.in);
    if (expected !== v.out) {
      console.error(`  [${i}] MISMATCH`);
      console.error(`    inputs: ${v.in.join(', ')}`);
      console.error(`    expected: ${expected}`);
      console.error(`    got:      ${v.out}`);
      failed++;
    } else {
      passed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  if (failed === 0) {
    console.log(`✓ All ${passed} vectors verified successfully`);
    process.exit(0);
  } else {
    console.error(`✗ ${failed} vectors failed, ${passed} passed`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
