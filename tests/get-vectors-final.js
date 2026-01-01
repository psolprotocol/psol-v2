#!/usr/bin/env node
const { buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    
    function formatBytes(uint8Array, name, comment) {
        const hexBytes = Array.from(uint8Array).map(b => '0x' + b.toString(16).padStart(2, '0'));
        console.log(`// ${comment}`);
        console.log(`const ${name}: [u8; 32] = [`);
        for (let i = 0; i < 32; i += 8) {
            const line = hexBytes.slice(i, i + 8).join(", ");
            console.log(`    ${line}${i < 24 ? ',' : ''}`);
        }
        console.log("];\n");
    }
    
    // Test 1: Poseidon(1, 2)
    formatBytes(poseidon([1n, 2n]), "HASH_1_2", "Poseidon(1, 2)");
    
    // Test 2: Poseidon(100, 200)
    formatBytes(poseidon([100n, 200n]), "HASH_100_200", "Poseidon(100, 200)");
    
    // Test 3: Poseidon(1, 2, 3, 4)
    formatBytes(poseidon([1n, 2n, 3n, 4n]), "HASH_1_2_3_4", "Poseidon(1, 2, 3, 4)");
    
    // Test 4: Commitment
    const secret = 0x1111111111111111n;
    const nullifier = 0x2222222222222222n;
    const amount = 1000n;
    const assetId = 0x3333333333333333n;
    formatBytes(
        poseidon([secret, nullifier, amount, assetId]),
        "COMMITMENT_EXAMPLE",
        `Commitment(secret=0x${secret.toString(16)}, nullifier=0x${nullifier.toString(16)}, amount=${amount}, asset_id=0x${assetId.toString(16)})`
    );
    
    // Test 5: Nullifier hash
    const nf = 0x4444444444444444n;
    const sec = 0x5555555555555555n;
    const leafIndex = 42n;
    const inner = poseidon([nf, sec]);
    formatBytes(
        poseidon([inner, leafIndex]),
        "NULLIFIER_HASH_EXAMPLE",
        `NullifierHash(nullifier=0x${nf.toString(16)}, secret=0x${sec.toString(16)}, leaf_index=${leafIndex})`
    );
}

main().catch(console.error);
