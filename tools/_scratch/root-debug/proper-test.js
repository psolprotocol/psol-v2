const snarkjs = require("snarkjs");
const fs = require("fs");
const { buildPoseidon } = require("circomlibjs");
const { Connection, PublicKey } = require("@solana/web3.js");
const { keccak256 } = require("js-sha3");

// Replicate SDK's computeAssetId
function computeAssetId(mint) {
  const prefix = new TextEncoder().encode("psol:asset_id:v1");
  const mintBytes = mint.toBuffer();
  const combined = new Uint8Array(prefix.length + mintBytes.length);
  combined.set(prefix, 0);
  combined.set(mintBytes, prefix.length);
  const hash = Buffer.from(keccak256.arrayBuffer(combined));
  const out = new Uint8Array(32);
  out[0] = 0;
  out.set(hash.slice(0, 31), 1);
  return out;
}

function bytesToBigInt(bytes) {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) + BigInt(bytes[i]);
  }
  return result;
}

function fieldToBytes32BE(value) {
  const bn = BigInt(value);
  const hex = bn.toString(16).padStart(64, '0');
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function test() {
  // Build Poseidon (same as SDK)
  console.log("Initializing Poseidon...");
  const poseidon = await buildPoseidon();
  
  const WRAPPED_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  
  // Compute real asset_id
  const assetIdBytes = computeAssetId(WRAPPED_SOL_MINT);
  const assetId = bytesToBigInt(assetIdBytes);
  
  console.log("Asset ID:", assetId.toString().slice(0, 40) + "...");
  
  // Test values (like SDK would generate)
  const secret = BigInt("12345678901234567890");
  const nullifier = BigInt("98765432109876543210");
  const amount = BigInt("100000000"); // 0.1 SOL
  
  // Compute commitment using Poseidon (EXACTLY like SDK does)
  const hash = poseidon([secret, nullifier, amount, assetId]);
  const commitment = poseidon.F.toObject(hash);
  
  console.log("\n=== Note Values ===");
  console.log("secret:", secret.toString());
  console.log("nullifier:", nullifier.toString());
  console.log("amount:", amount.toString());
  console.log("assetId:", assetId.toString().slice(0, 40) + "...");
  console.log("commitment:", commitment.toString().slice(0, 40) + "...");
  
  // Now generate proof with REAL commitment
  const input = {
    commitment: commitment.toString(),
    amount: amount.toString(),
    asset_id: assetId.toString(),
    secret: secret.toString(),
    nullifier: nullifier.toString(),
  };
  
  console.log("\n=== Generating Proof ===");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "build/deposit_js/deposit.wasm",
    "build/deposit.zkey"
  );
  
  console.log("Public signals:", publicSignals.map(s => s.slice(0, 30) + "..."));
  console.log("Proof generated!");
  
  // Verify locally
  const vk = JSON.parse(fs.readFileSync("build/deposit_vk.json"));
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("Local verification:", valid ? "VALID ✅" : "INVALID ❌");
  
  // Format proof for chain
  function formatProofForChain(proof) {
    const proofBytes = Buffer.alloc(256);
    fieldToBytes32BE(proof.pi_a[0]).copy(proofBytes, 0);
    fieldToBytes32BE(proof.pi_a[1]).copy(proofBytes, 32);
    fieldToBytes32BE(proof.pi_b[0][1]).copy(proofBytes, 64);
    fieldToBytes32BE(proof.pi_b[0][0]).copy(proofBytes, 96);
    fieldToBytes32BE(proof.pi_b[1][1]).copy(proofBytes, 128);
    fieldToBytes32BE(proof.pi_b[1][0]).copy(proofBytes, 160);
    fieldToBytes32BE(proof.pi_c[0]).copy(proofBytes, 192);
    fieldToBytes32BE(proof.pi_c[1]).copy(proofBytes, 224);
    return proofBytes;
  }
  
  const proofBytes = formatProofForChain(proof);
  console.log("\nProof bytes length:", proofBytes.length);
  
  // Save for reference
  fs.writeFileSync("build/real_test.json", JSON.stringify({
    note: {
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      amount: amount.toString(),
      assetId: assetId.toString(),
      commitment: commitment.toString(),
    },
    publicSignals,
    proofHex: proofBytes.toString('hex'),
  }, null, 2));
  
  console.log("\nSaved to build/real_test.json");
}

test().catch(console.error);
