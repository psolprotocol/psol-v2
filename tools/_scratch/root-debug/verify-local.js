const snarkjs = require("snarkjs");
const fs = require("fs");

async function main() {
  // Load verification key
  const vk = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  const { keccak256 } = require("js-sha3");
  const { buildPoseidon } = require("circomlibjs");
  
  const poseidon = await buildPoseidon();
  
  // Recreate note with random values (matches SDK createNote)
  const secret = BigInt("12345678901234567890123456789012345678901234567890");
  const nullifier = BigInt("98765432109876543210987654321098765432109876543210");
  const amount = BigInt("100000000"); // 0.1 SOL
  
  // Compute asset_id for wSOL (So11111111111111111111111111111111111111112)
  const wsolMint = Buffer.from([
    6, 155, 136, 87, 254, 171, 129, 132, 251, 104, 127, 99, 70, 24, 192, 53,
    218, 196, 57, 220, 26, 235, 59, 85, 152, 160, 240, 0, 0, 0, 0, 1
  ]);
  const prefix = Buffer.from('psol:asset_id:v1');
  const input = Buffer.concat([prefix, wsolMint]);
  const hash = keccak256.arrayBuffer(input);
  const hashBytes = new Uint8Array(hash);
  const assetIdBytes = new Uint8Array(32);
  assetIdBytes[0] = 0;
  assetIdBytes.set(hashBytes.slice(0, 31), 1);
  
  let assetIdBigInt = BigInt(0);
  for (const b of assetIdBytes) {
    assetIdBigInt = (assetIdBigInt << BigInt(8)) + BigInt(b);
  }
  
  console.log("Asset ID:", assetIdBigInt.toString());
  
  // Compute commitment: Poseidon(secret, nullifier, amount, asset_id)
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  console.log("Commitment:", commitment.toString());
  
  const proofInput = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    asset_id: assetIdBigInt.toString(),
    commitment: commitment.toString(),
  };
  
  console.log("\nProof input:", proofInput);
  
  // Generate proof
  console.log("\nGenerating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  console.log("\nPublic signals:", publicSignals);
  
  // Verify locally
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("\n✅ Local verification:", valid ? "PASSED" : "FAILED");
  
  if (valid) {
    console.log("\n=== Proof Details ===");
    console.log("pi_a:", JSON.stringify(proof.pi_a));
    console.log("pi_b:", JSON.stringify(proof.pi_b));
    console.log("pi_c:", JSON.stringify(proof.pi_c));
    
    // Show VK structure
    console.log("\n=== VK Structure ===");
    console.log("IC length:", vk.IC.length);
    console.log("Expected public inputs:", vk.IC.length - 1);
  }
}

main().catch(console.error);
