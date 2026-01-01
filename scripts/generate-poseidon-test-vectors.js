#!/usr/bin/env node
/**
 * Generate Poseidon test vectors for on-chain verification
 * 
 * This script generates test vectors using circomlibjs that match
 * the on-chain Poseidon implementation.
 * 
 * Usage: node scripts/generate-poseidon-test-vectors.js
 */

const { buildPoseidon } = require('circomlibjs');

async function generateTestVectors() {
    console.log('Generating Poseidon test vectors...\n');
    
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    
    // Test vector 1: Poseidon(1, 2) with t=2
    console.log('Test Vector 1: Poseidon(1, 2)');
    const hash1 = poseidon([1n, 2n]);
    const hash1BigInt = F.toObject(hash1);
    const hash1Bytes = bigIntToBytesBE(hash1BigInt);
    console.log('  Input: [1n, 2n]');
    console.log('  Output (bigint):', hash1BigInt.toString());
    console.log('  Output (hex):', bytesToHex(hash1Bytes));
    console.log('  Output (Rust array):', bytesToRustArray(hash1Bytes));
    console.log('');
    
    // Test vector 2: Poseidon(secret, nullifier, amount, asset_id) with t=4
    console.log('Test Vector 2: Poseidon(secret, nullifier, amount, asset_id)');
    const secret = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    const nullifier = BigInt('0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321');
    const amount = 1000n;
    const assetId = 1n;
    
    const hash2 = poseidon([secret, nullifier, amount, assetId]);
    const hash2BigInt = F.toObject(hash2);
    const hash2Bytes = bigIntToBytesBE(hash2BigInt);
    console.log('  Input: [secret, nullifier, amount=1000, asset_id=1]');
    console.log('  Output (bigint):', hash2BigInt.toString());
    console.log('  Output (hex):', bytesToHex(hash2Bytes));
    console.log('  Output (Rust array):', bytesToRustArray(hash2Bytes));
    console.log('');
    
    // Test vector 3: Poseidon(nullifier, secret) with t=2 (for nullifier hash)
    console.log('Test Vector 3: Poseidon(nullifier, secret)');
    const hash3 = poseidon([nullifier, secret]);
    const hash3BigInt = F.toObject(hash3);
    const hash3Bytes = bigIntToBytesBE(hash3BigInt);
    console.log('  Input: [nullifier, secret]');
    console.log('  Output (bigint):', hash3BigInt.toString());
    console.log('  Output (hex):', bytesToHex(hash3Bytes));
    console.log('  Output (Rust array):', bytesToRustArray(hash3Bytes));
    console.log('');
    
    console.log('✅ Test vectors generated successfully!');
    console.log('\n⚠️  IMPORTANT: Copy these values into poseidon.rs test vectors');
    console.log('⚠️  Ensure the on-chain implementation matches circomlib output');
}

function bigIntToBytesBE(value) {
    const bytes = new Uint8Array(32);
    let temp = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(temp & BigInt(0xff));
        temp = temp >> BigInt(8);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function bytesToRustArray(bytes) {
    return '[' + Array.from(bytes)
        .map(b => `0x${b.toString(16).padStart(2, '0')}`)
        .join(', ') + ']';
}

generateTestVectors().catch(err => {
    console.error('Error generating test vectors:', err);
    process.exit(1);
});
