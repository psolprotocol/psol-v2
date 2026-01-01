#!/usr/bin/env node
/**
 * Generate Poseidon test vectors for Rust unit tests
 * 
 * This script generates test vectors using circomlibjs (same as circuits)
 * to ensure consistency between:
 * - Circom circuits (proof generation)
 * - TypeScript SDK (off-chain)
 * - Rust on-chain (verification)
 * 
 * Usage:
 *   npm install circomlibjs
 *   node tests/generate-poseidon-vectors.js
 * 
 * Output: Rust code snippets to paste into poseidon.rs tests
 */

const { buildPoseidon } = require("circomlibjs");

async function generateVectors() {
    console.log("Generating Poseidon test vectors...\n");
    
    const poseidon = await buildPoseidon();
    
    // Helper to convert BigInt to Rust [u8; 32] array (big-endian)
    function toRustArray(value) {
        const hex = value.toString(16).padStart(64, '0');
        const bytes = [];
        for (let i = 0; i < 64; i += 2) {
            bytes.push('0x' + hex.substring(i, i + 2));
        }
        
        // Format as multiline for readability
        const lines = [];
        for (let i = 0; i < bytes.length; i += 8) {
            lines.push('            ' + bytes.slice(i, i + 8).join(', '));
        }
        return '[\n' + lines.join(',\n') + '\n        ]';
    }
    
    // Helper to format test case
    function formatTest(name, description, inputs, output) {
        return `
    #[test]
    fn ${name}() {
        // ${description}
        ${inputs}
        
        let result = ${output.call}.unwrap();
        let expected: [u8; 32] = ${output.expected};
        assert_eq!(result, expected, "${description} - must match circomlib output");
    }`;
    }
    
    console.log("=" .repeat(80));
    console.log("POSEIDON(2) TEST VECTORS - For hash_two_to_one()");
    console.log("=" .repeat(80));
    
    // Vector 1: hash_two_to_one(1, 2)
    const hash2_v1 = poseidon([1n, 2n]);
    console.log("\nTest Vector 1: Poseidon(1, 2)");
    console.log("Input: [1, 2]");
    console.log("Output (hex):", '0x' + hash2_v1.toString(16).padStart(64, '0'));
    console.log(formatTest(
        "test_hash_two_to_one_vector_circomlib_1",
        "Poseidon(1, 2) - circomlib reference",
        `let left = u64_to_scalar_be(1);\n        let right = u64_to_scalar_be(2);`,
        {
            call: 'hash_two_to_one(&left, &right)',
            expected: toRustArray(hash2_v1)
        }
    ));
    
    // Vector 2: hash_two_to_one(100, 200)
    const hash2_v2 = poseidon([100n, 200n]);
    console.log("\nTest Vector 2: Poseidon(100, 200)");
    console.log("Input: [100, 200]");
    console.log("Output (hex):", '0x' + hash2_v2.toString(16).padStart(64, '0'));
    console.log(formatTest(
        "test_hash_two_to_one_vector_circomlib_2",
        "Poseidon(100, 200) - circomlib reference",
        `let left = u64_to_scalar_be(100);\n        let right = u64_to_scalar_be(200);`,
        {
            call: 'hash_two_to_one(&left, &right)',
            expected: toRustArray(hash2_v2)
        }
    ));
    
    // Vector 3: Merkle tree example
    const hash2_v3 = poseidon([
        BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
        BigInt('0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321')
    ]);
    console.log("\nTest Vector 3: Merkle tree node example");
    console.log("Input: [0x1234...cdef, 0xfedc...4321]");
    console.log("Output (hex):", '0x' + hash2_v3.toString(16).padStart(64, '0'));
    
    console.log("\n" + "=".repeat(80));
    console.log("POSEIDON(4) TEST VECTORS - For poseidon_hash_4() and compute_commitment()");
    console.log("=" .repeat(80));
    
    // Vector 1: Poseidon(1, 2, 3, 4)
    const hash4_v1 = poseidon([1n, 2n, 3n, 4n]);
    console.log("\nTest Vector 1: Poseidon(1, 2, 3, 4)");
    console.log("Input: [1, 2, 3, 4]");
    console.log("Output (hex):", '0x' + hash4_v1.toString(16).padStart(64, '0'));
    console.log(formatTest(
        "test_poseidon_hash_4_vector_circomlib_1",
        "Poseidon(1, 2, 3, 4) - circomlib reference",
        `let i0 = u64_to_scalar_be(1);\n        let i1 = u64_to_scalar_be(2);\n        let i2 = u64_to_scalar_be(3);\n        let i3 = u64_to_scalar_be(4);`,
        {
            call: 'poseidon_hash_4(&i0, &i1, &i2, &i3)',
            expected: toRustArray(hash4_v1)
        }
    ));
    
    // Vector 2: Commitment example
    // commitment = Poseidon(secret, nullifier, amount, asset_id)
    const secret = 0x1111111111111111n;
    const nullifier = 0x2222222222222222n;
    const amount = 1000n;
    const assetId = 0x3333333333333333n;
    const commitment = poseidon([secret, nullifier, amount, assetId]);
    
    console.log("\nTest Vector 2: Commitment Example");
    console.log(`Input: [secret=0x${secret.toString(16)}, nullifier=0x${nullifier.toString(16)}, amount=${amount}, asset_id=0x${assetId.toString(16)}]`);
    console.log("Output (hex):", '0x' + commitment.toString(16).padStart(64, '0'));
    console.log(formatTest(
        "test_compute_commitment_vector_circomlib",
        "Commitment computation - circomlib reference",
        `let secret = u64_to_scalar_be(0x${secret.toString(16)});\n        let nullifier = u64_to_scalar_be(0x${nullifier.toString(16)});\n        let amount = ${amount}u64;\n        let asset_id = u64_to_scalar_be(0x${assetId.toString(16)});`,
        {
            call: 'compute_commitment(&secret, &nullifier, amount, &asset_id)',
            expected: toRustArray(commitment)
        }
    ));
    
    console.log("\n" + "=".repeat(80));
    console.log("NULLIFIER HASH TEST VECTORS");
    console.log("=" .repeat(80));
    
    // Nullifier hash = Poseidon(Poseidon(nullifier, secret), leaf_index)
    const nf = 0x4444444444444444n;
    const sec = 0x5555555555555555n;
    const leafIndex = 42n;
    
    const inner = poseidon([nf, sec]);
    const nullifierHash = poseidon([inner, leafIndex]);
    
    console.log("\nNullifier Hash Example");
    console.log(`Input: nullifier=0x${nf.toString(16)}, secret=0x${sec.toString(16)}, leaf_index=${leafIndex}`);
    console.log("Inner hash (hex):", '0x' + inner.toString(16).padStart(64, '0'));
    console.log("Final nullifier hash (hex):", '0x' + nullifierHash.toString(16).padStart(64, '0'));
    console.log(formatTest(
        "test_compute_nullifier_hash_vector_circomlib",
        "Nullifier hash computation - circomlib reference",
        `let nullifier = u64_to_scalar_be(0x${nf.toString(16)});\n        let secret = u64_to_scalar_be(0x${sec.toString(16)});\n        let leaf_index = ${leafIndex}u32;`,
        {
            call: 'compute_nullifier_hash(&nullifier, &secret, leaf_index)',
            expected: toRustArray(nullifierHash)
        }
    ));
    
    console.log("\n" + "=".repeat(80));
    console.log("\nCopy the test functions above into poseidon.rs #[cfg(test)] mod tests {}");
    console.log("Replace the TODO comments with these concrete test vectors.");
    console.log("=" .repeat(80));
}

generateVectors().catch(console.error);
