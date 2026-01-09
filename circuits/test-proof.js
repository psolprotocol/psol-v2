const snarkjs = require("snarkjs");
const fs = require("fs");

async function testProof() {
  // Test inputs (must satisfy commitment = Poseidon(secret, nullifier, amount, asset_id))
  const input = {
    commitment: "9274179873757484722790972680913611378235381165247299255712930975037833306539",
    amount: "1000000000",
    asset_id: "0",
    secret: "12345",
    nullifier: "67890"
  };
  
  console.log("Generating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "build/deposit_js/deposit.wasm",
    "build/deposit.zkey"
  );
  
  console.log("Public signals:", publicSignals);
  console.log("Proof:", JSON.stringify(proof, null, 2));
  
  // Verify locally
  const vk = JSON.parse(fs.readFileSync("build/deposit_vk.json"));
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("Local verification:", valid ? "VALID ✅" : "INVALID ❌");
  
  // Save proof for reference
  fs.writeFileSync("build/test_proof.json", JSON.stringify({ proof, publicSignals }, null, 2));
}

testProof().catch(console.error);
