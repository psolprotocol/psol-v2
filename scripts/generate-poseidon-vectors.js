#!/usr/bin/env node
/**
 * Generate Poseidon test vectors for pSOL v2
 * 
 * Usage: node generate-poseidon-vectors.js
 * 
 * This script generates test vectors using circomlibjs to verify
 * that on-chain Poseidon implementation matches off-chain circuits.
 * 
 * Prerequisites:
 *   npm install circomlibjs
 */

const { buildPoseidon } = require('circomlibjs');

async function main() {
    console.log("Generating Poseidon test vectors for pSOL v2...\n");
    
    const poseidon = await buildPoseidon();
    
    // Helper: Convert poseidon output to hex string (big-endian)
    function hashToHex(hash) {
        const value = poseidon.F.toObject(hash);
        return '0x' + value.toString(16).padStart(64, '0');
    }
    
    // Helper: Convert to byte array format for Rust
    function hexToRustBytes(hex) {
        const bytes = hex.slice(2).match(/.{2}/g);
        let result = '[\n    ';
        for (let i = 0; i < bytes.length; i++) {
            result += '0x' + bytes[i];
            if (i < bytes.length - 1) result += ', ';
            if ((i + 1) % 8 === 0 && i < bytes.length - 1) result += '\n    ';
        }
        result += '\n]';
        return result;
    }
    
    console.log("// ==================================================");
    console.log("// POSEIDON HASH TEST VECTORS");
    console.log("// Generated with circomlibjs");
    console.log("// ==================================================\n");
    
    // Vector 1: Poseidon(0, 1)
    {
        const hash = poseidon([0n, 1n]);
        const hex = hashToHex(hash);
        console.log("// Poseidon(0, 1)");
        console.log("// Inputs: [0, 1]");
        console.log("// Hash:", hex);
        console.log("// Rust bytes:", hexToRustBytes(hex));
        console.log();
    }
    
    // Vector 2: Poseidon(1, 2, 3, 4)
    {
        const hash = poseidon([1n, 2n, 3n, 4n]);
        const hex = hashToHex(hash);
        console.log("// Poseidon(1, 2, 3, 4)");
        console.log("// Inputs: [1, 2, 3, 4]");
        console.log("// Hash:", hex);
        console.log("// Rust bytes:", hexToRustBytes(hex));
        console.log();
    }
    
    // Vector 3: Commitment example
    {
        const secret = 0x1234n;
        const nullifier = 0x5678n;
        const amount = 1000n;
        const assetId = 0xABCDn;
        const hash = poseidon([secret, nullifier, amount, assetId]);
        const hex = hashToHex(hash);
        console.log("// Commitment: Poseidon(secret, nullifier, amount, asset_id)");
        console.log("// Inputs: [0x1234, 0x5678, 1000, 0xABCD]");
        console.log("// Hash:", hex);
        console.log("// Rust bytes:", hexToRustBytes(hex));
        console.log();
    }
    
    // Vector 4: Nullifier hash example
    {
        const nullifier = 0x1111n;
        const secret = 0x2222n;
        const leafIndex = 42n;
        const inner = poseidon([nullifier, secret]);
        const hash = poseidon([poseidon.F.toObject(inner), leafIndex]);
        const hex = hashToHex(hash);
        console.log("// Nullifier Hash: Poseidon(Poseidon(nullifier, secret), leaf_index)");
        console.log("// Inputs: nullifier=0x1111, secret=0x2222, leaf_index=42");
        console.log("// Inner hash:", hashToHex(inner));
        console.log("// Final hash:", hex);
        console.log("// Rust bytes:", hexToRustBytes(hex));
        console.log();
    }
    
    console.log("// ==================================================");
    console.log("// END TEST VECTORS");
    console.log("// ==================================================");
}

main().catch(console.error);
