const snarkjs = require("snarkjs");
const fs = require("fs");
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

// On-chain u64_to_scalar
function u64ToScalarOnChain(v) {
  const s = Buffer.alloc(32);
  const vBuf = Buffer.alloc(8);
  vBuf.writeBigUInt64BE(BigInt(v));
  vBuf.copy(s, 24);
  return s;
}

async function test() {
  const WRAPPED_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  
  // Compute real asset_id
  const assetIdBytes = computeAssetId(WRAPPED_SOL_MINT);
  const assetIdBigInt = bytesToBigInt(assetIdBytes);
  
  console.log("=== Asset ID ===");
  console.log("Bytes (hex):", Buffer.from(assetIdBytes).toString('hex'));
  console.log("BigInt:", assetIdBigInt.toString());
  console.log("BigInt (first 40 chars):", assetIdBigInt.toString().slice(0, 40) + "...");
  
  // Test with real asset_id
  const testSecret = BigInt("12345");
  const testNullifier = BigInt("67890");
  const testAmount = BigInt("100000000"); // 0.1 SOL
  
  // Generate proof with real asset_id
  const input = {
    commitment: "0", // placeholder - we need to compute it
    amount: testAmount.toString(),
    asset_id: assetIdBigInt.toString(),
    secret: testSecret.toString(),
    nullifier: testNullifier.toString(),
  };
  
  console.log("\n=== Circuit Inputs ===");
  console.log("amount:", input.amount);
  console.log("asset_id (first 40 chars):", input.asset_id.slice(0, 40) + "...");
  
  // First, we need to compute the correct commitment
  // The circuit will compute: commitment = Poseidon(secret, nullifier, amount, asset_id)
  // But we need to know what that is to pass as public input
  
  // Let's generate a witness first to see what commitment the circuit computes
  const wasmPath = "build/deposit_js/deposit.wasm";
  const zkeyPath = "build/deposit.zkey";
  
  console.log("\n=== Generating proof (will fail if commitment doesn't match) ===");
  
  try {
    // The circuit SHOULD compute commitment internally and compare
    // Let's see what happens with commitment = 0
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );
    
    console.log("Public signals:", publicSignals);
    console.log("Proof generated successfully!");
    
    // Verify locally
    const vk = JSON.parse(fs.readFileSync("build/deposit_vk.json"));
    const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
    console.log("Local verification:", valid ? "VALID ✅" : "INVALID ❌");
    
    // Compare representations
    console.log("\n=== Comparing Public Input Representations ===");
    
    // Public signal 0: commitment (computed by circuit)
    const commitmentFromCircuit = publicSignals[0];
    console.log("Commitment from circuit:", commitmentFromCircuit.slice(0, 40) + "...");
    
    // Public signal 1: amount
    const amountFromCircuit = publicSignals[1];
    const amountOnChain = u64ToScalarOnChain(testAmount);
    const amountFromCircuitBytes = fieldToBytes32BE(amountFromCircuit);
    console.log("\nAmount comparison:");
    console.log("  Circuit (decimal):", amountFromCircuit);
    console.log("  Circuit (bytes):", amountFromCircuitBytes.toString('hex'));
    console.log("  OnChain (bytes):", amountOnChain.toString('hex'));
    console.log("  Match:", amountFromCircuitBytes.equals(amountOnChain));
    
    // Public signal 2: asset_id  
    const assetIdFromCircuit = publicSignals[2];
    const assetIdFromCircuitBytes = fieldToBytes32BE(assetIdFromCircuit);
    console.log("\nAsset ID comparison:");
    console.log("  Circuit (decimal, first 40):", assetIdFromCircuit.slice(0, 40) + "...");
    console.log("  Circuit (bytes):", assetIdFromCircuitBytes.toString('hex'));
    console.log("  Original (bytes):", Buffer.from(assetIdBytes).toString('hex'));
    console.log("  Match:", assetIdFromCircuitBytes.equals(Buffer.from(assetIdBytes)));
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test().catch(console.error);
