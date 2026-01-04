#!/usr/bin/env node
/**
 * Generate Poseidon constants from circomlibjs
 * 
 * Usage: node generate_constants.mjs
 * Output: poseidon_bn254_constants.in.rs
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const constants = require('./node_modules/circomlibjs/src/poseidon_constants_opt.js').default 
  || require('./node_modules/circomlibjs/src/poseidon_constants_opt.js');

function hexToBe32Bytes(hex) {
  const clean = hex.replace(/^0x/, '').padStart(64, '0');
  const bytes = [];
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function formatBytes(bytes) {
  return '[' + bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ') + ']';
}

function main() {
  console.log('Extracting constants from circomlibjs...');
  
  const lines = [];
  lines.push('// AUTO-GENERATED from circomlibjs poseidon_constants_opt.js');
  lines.push('// BN254 scalar field, circomlib PoseidonEx-compatible constants');
  lines.push('// DO NOT EDIT - regenerate with: node generate_constants.mjs');
  lines.push('');
  lines.push('pub const N_ROUNDS_F: usize = 8;');
  lines.push('pub const N_ROUNDS_P_T3: usize = 57;');
  lines.push('pub const N_ROUNDS_P_T4: usize = 56;');
  lines.push('pub const N_ROUNDS_P_T5: usize = 60;');
  lines.push('');
  
  // t=3 is index 1, t=4 is index 2, t=5 is index 3 in the arrays
  // (index 0 is for t=2 which we don't use)
  const tToIndex = { 3: 1, 4: 2, 5: 3 };
  
  for (const t of [3, 4, 5]) {
    const idx = tToIndex[t];
    console.log(`Processing t=${t} (index=${idx})...`);
    
    const C = constants.C[idx];
    const M = constants.M[idx];
    const P = constants.P[idx];
    const S = constants.S[idx];
    
    // C constants (round constants)
    lines.push(`pub static C_T${t}: [[u8; 32]; ${C.length}] = [`);
    for (const c of C) {
      const bytes = hexToBe32Bytes(c);
      lines.push(`  ${formatBytes(bytes)},`);
    }
    lines.push('];');
    lines.push('');
    
    // M matrix (MDS matrix)
    lines.push(`pub static M_T${t}: [[[u8; 32]; ${t}]; ${t}] = [`);
    for (const row of M) {
      lines.push('  [');
      for (const val of row) {
        const bytes = hexToBe32Bytes(val);
        lines.push(`    ${formatBytes(bytes)},`);
      }
      lines.push('  ],');
    }
    lines.push('];');
    lines.push('');
    
    // P matrix
    lines.push(`pub static P_T${t}: [[[u8; 32]; ${t}]; ${t}] = [`);
    for (const row of P) {
      lines.push('  [');
      for (const val of row) {
        const bytes = hexToBe32Bytes(val);
        lines.push(`    ${formatBytes(bytes)},`);
      }
      lines.push('  ],');
    }
    lines.push('];');
    lines.push('');
    
    // S vector
    lines.push(`pub static S_T${t}: [[u8; 32]; ${S.length}] = [`);
    for (const s of S) {
      const bytes = hexToBe32Bytes(s);
      lines.push(`  ${formatBytes(bytes)},`);
    }
    lines.push('];');
    lines.push('');
  }
  
  const output = lines.join('\n');
  writeFileSync('poseidon_bn254_constants.in.rs', output);
  console.log('✓ Generated poseidon_bn254_constants.in.rs');
  console.log(`  C_T3: ${constants.C[1].length} constants`);
  console.log(`  C_T4: ${constants.C[2].length} constants`);
  console.log(`  C_T5: ${constants.C[3].length} constants`);
}

main();