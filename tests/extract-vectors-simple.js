#!/usr/bin/env node
const { buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    
    function toHexBytes(bigint) {
        const hex = bigint.toString(16).padStart(64, '0');
        const bytes = [];
        for (let i = 0; i < 64; i += 2) {
            bytes.push('0x' + hex.substring(i, i + 2));
        }
        return bytes;
    }
    
    // Test 1: Poseidon(1, 2)
    const h1 = poseidon([1n, 2n]);
    console.log("// Poseidon(1, 2)");
    console.log("const HASH_1_2: [u8; 32] = [");
    const b1 = toHexBytes(h1);
    for (let i = 0; i < 32; i += 8) {
        console.log("    " + b1.slice(i, i+8).join(", ") + (i < 24 ? "," : ""));
    }
    console.log("];\n");
    
    // Test 2: Poseidon(100, 200)
    const h2 = poseidon([100n, 200n]);
    console.log("// Poseidon(100, 200)");
    console.log("const HASH_100_200: [u8; 32] = [");
    const b2 = toHexBytes(h2);
    for (let i = 0; i < 32; i += 8) {
        console.log("    " + b2.slice(i, i+8).join(", ") + (i < 24 ? "," : ""));
    }
    console.log("];\n");
    
    // Test 3: Poseidon(1, 2, 3, 4)
    const h3 = poseidon([1n, 2n, 3n, 4n]);
    console.log("// Poseidon(1, 2, 3, 4)");
    console.log("const HASH_1_2_3_4: [u8; 32] = [");
    const b3 = toHexBytes(h3);
    for (let i = 0; i < 32; i += 8) {
        console.log("    " + b3.slice(i, i+8).join(", ") + (i < 24 ? "," : ""));
    }
    console.log("];\n");
    
    // Test 4: Commitment
    const secret = 0x1111111111111111n;
    const nullifier = 0x2222222222222222n;
    const amount = 1000n;
    const assetId = 0x3333333333333333n;
    const h4 = poseidon([secret, nullifier, amount, assetId]);
    console.log("// Commitment(0x1111111111111111, 0x2222222222222222, 1000, 0x3333333333333333)");
    console.log("const COMMITMENT_EXAMPLE: [u8; 32] = [");
    const b4 = toHexBytes(h4);
    for (let i = 0; i < 32; i += 8) {
        console.log("    " + b4.slice(i, i+8).join(", ") + (i < 24 ? "," : ""));
    }
    console.log("];\n");
    
    // Test 5: Nullifier hash
    const nf = 0x4444444444444444n;
    const sec = 0x5555555555555555n;
    const leafIndex = 42n;
    const inner = poseidon([nf, sec]);
    const h5 = poseidon([inner, leafIndex]);
    console.log("// NullifierHash(0x4444444444444444, 0x5555555555555555, 42)");
    console.log("const NULLIFIER_HASH_EXAMPLE: [u8; 32] = [");
    const b5 = toHexBytes(h5);
    for (let i = 0; i < 32; i += 8) {
        console.log("    " + b5.slice(i, i+8).join(", ") + (i < 24 ? "," : ""));
    }
    console.log("];\n");
}

main().catch(console.error);
