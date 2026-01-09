const snarkjs = require("snarkjs");
const fs = require("fs");
const { Connection, PublicKey } = require("@solana/web3.js");

function fieldToBytes(value) {
  const bn = BigInt(value);
  const hex = bn.toString(16).padStart(64, '0');
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function formatProofForChain(proof) {
  const proofBytes = Buffer.alloc(256);
  
  // pi_a (G1)
  fieldToBytes(proof.pi_a[0]).copy(proofBytes, 0);
  fieldToBytes(proof.pi_a[1]).copy(proofBytes, 32);
  
  // pi_b (G2) - matching VK provision: [0][1], [0][0], [1][1], [1][0]
  fieldToBytes(proof.pi_b[0][1]).copy(proofBytes, 64);
  fieldToBytes(proof.pi_b[0][0]).copy(proofBytes, 96);
  fieldToBytes(proof.pi_b[1][1]).copy(proofBytes, 128);
  fieldToBytes(proof.pi_b[1][0]).copy(proofBytes, 160);
  
  // pi_c (G1)
  fieldToBytes(proof.pi_c[0]).copy(proofBytes, 192);
  fieldToBytes(proof.pi_c[1]).copy(proofBytes, 224);
  
  return proofBytes;
}

async function test() {
  // Generate proof
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
  
  console.log("\nPublic signals:", publicSignals);
  
  // Local verify
  const vk = JSON.parse(fs.readFileSync("build/deposit_vk.json"));
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("\nLocal verification:", valid ? "VALID ✅" : "INVALID ❌");
  
  // Format for chain
  const proofBytes = formatProofForChain(proof);
  console.log("\nProof bytes (hex):");
  console.log("  A.x:", proofBytes.slice(0, 32).toString('hex'));
  console.log("  A.y:", proofBytes.slice(32, 64).toString('hex'));
  console.log("  B.x_re:", proofBytes.slice(64, 96).toString('hex'));
  console.log("  B.x_im:", proofBytes.slice(96, 128).toString('hex'));
  console.log("  B.y_re:", proofBytes.slice(128, 160).toString('hex'));
  console.log("  B.y_im:", proofBytes.slice(160, 192).toString('hex'));
  console.log("  C.x:", proofBytes.slice(192, 224).toString('hex'));
  console.log("  C.y:", proofBytes.slice(224, 256).toString('hex'));
  
  // Check against on-chain VK format
  console.log("\nComparing with on-chain VK...");
  const PROGRAM_ID = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
  const POOL_CONFIG = new PublicKey("DPZe7uST1mBxzVkEm215epHjsM7Sa8VCXHr3pv4eLp8X");
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), POOL_CONFIG.toBuffer()],
    PROGRAM_ID
  );
  
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const accountInfo = await connection.getAccountInfo(depositVk);
  const data = accountInfo.data;
  
  // Parse on-chain VK
  let offset = 8 + 32 + 1; // discriminator + pool + proof_type
  const alphaG1 = data.slice(offset, offset + 64);
  offset += 64;
  const betaG2 = data.slice(offset, offset + 128);
  
  console.log("\nOn-chain VK beta_g2 (first 32 bytes - x_re):");
  console.log("  ", betaG2.slice(0, 32).toString('hex'));
  
  console.log("\nLocal VK beta_2 conversion:");
  console.log("  x[1] (x_re):", fieldToBytes(vk.vk_beta_2[0][1]).toString('hex'));
  console.log("  x[0] (x_im):", fieldToBytes(vk.vk_beta_2[0][0]).toString('hex'));
  
  // Save proof for manual testing
  fs.writeFileSync("build/test_proof_bytes.json", JSON.stringify({
    proofHex: proofBytes.toString('hex'),
    publicSignals,
    pi_a: proof.pi_a,
    pi_b: proof.pi_b,
    pi_c: proof.pi_c,
  }, null, 2));
  
  console.log("\nSaved to build/test_proof_bytes.json");
}

test().catch(console.error);
