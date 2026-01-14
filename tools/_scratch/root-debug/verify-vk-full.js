const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  const authorityKeypairPath = process.env.HOME + "/.config/solana/test-authority.json";
  const authorityKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeypairPath, "utf-8")))
  );
  
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(authorityKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/psol_privacy_v2.json", "utf-8"));
  const programId = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
  const program = new anchor.Program(idl, provider);

  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
    programId
  );
  
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  console.log("=== Verifying ALL VK Components ===\n");
  
  // Helper to convert snarkjs G1 point to bytes
  function g1ToBytes(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    return Buffer.concat([
      Buffer.from(x.toString(16).padStart(64, '0'), 'hex'),
      Buffer.from(y.toString(16).padStart(64, '0'), 'hex')
    ]);
  }
  
  // Helper to convert snarkjs G2 point to bytes (imaginary first!)
  function g2ToBytes(point) {
    const x0 = BigInt(point[0][0]); // real
    const x1 = BigInt(point[0][1]); // imaginary
    const y0 = BigInt(point[1][0]); // real  
    const y1 = BigInt(point[1][1]); // imaginary
    return Buffer.concat([
      Buffer.from(x1.toString(16).padStart(64, '0'), 'hex'), // x_imag FIRST
      Buffer.from(x0.toString(16).padStart(64, '0'), 'hex'), // x_real
      Buffer.from(y1.toString(16).padStart(64, '0'), 'hex'), // y_imag FIRST
      Buffer.from(y0.toString(16).padStart(64, '0'), 'hex'), // y_real
    ]);
  }
  
  // Check Alpha G1
  const expectedAlpha = g1ToBytes(vkJson.vk_alpha_1);
  const storedAlpha = Buffer.from(vkAccount.vkAlphaG1);
  console.log("Alpha G1:", storedAlpha.equals(expectedAlpha) ? "✅ MATCH" : "❌ MISMATCH");
  
  // Check Beta G2
  const expectedBeta = g2ToBytes(vkJson.vk_beta_2);
  const storedBeta = Buffer.from(vkAccount.vkBetaG2);
  console.log("Beta G2:", storedBeta.equals(expectedBeta) ? "✅ MATCH" : "❌ MISMATCH");
  
  // Check Gamma G2
  const expectedGamma = g2ToBytes(vkJson.vk_gamma_2);
  const storedGamma = Buffer.from(vkAccount.vkGammaG2);
  console.log("Gamma G2:", storedGamma.equals(expectedGamma) ? "✅ MATCH" : "❌ MISMATCH");
  
  // Check Delta G2
  const expectedDelta = g2ToBytes(vkJson.vk_delta_2);
  const storedDelta = Buffer.from(vkAccount.vkDeltaG2);
  console.log("Delta G2:", storedDelta.equals(expectedDelta) ? "✅ MATCH" : "❌ MISMATCH");
  
  // Check all IC points
  console.log("\n=== IC Points (", vkAccount.vkIc.length, "total) ===");
  let allIcMatch = true;
  
  for (let i = 0; i < vkJson.IC.length; i++) {
    const expectedIc = g1ToBytes(vkJson.IC[i]);
    const storedIc = Buffer.from(vkAccount.vkIc[i]);
    const match = storedIc.equals(expectedIc);
    
    if (!match) {
      allIcMatch = false;
      console.log(`IC[${i}]: ❌ MISMATCH`);
      console.log(`  Expected: ${expectedIc.toString('hex')}`);
      console.log(`  Stored:   ${storedIc.toString('hex')}`);
    } else {
      console.log(`IC[${i}]: ✅ MATCH`);
    }
  }
  
  console.log("\n=== Summary ===");
  console.log("All components match:", allIcMatch ? "✅ YES" : "❌ NO");
  
  // Also check public inputs are valid Fr elements
  console.log("\n=== Field Element Validation ===");
  const FR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  
  const commitment = BigInt("15898824820761406179931713139930061838639209692081490687832166619467214596242");
  const amount = BigInt("100000000");
  const assetId = BigInt("421521653144930500967200431270257997403337399394150674665029563160526671898");
  
  console.log("Commitment < Fr:", commitment < FR_MODULUS ? "✅ YES" : "❌ NO");
  console.log("Amount < Fr:", amount < FR_MODULUS ? "✅ YES" : "❌ NO");
  console.log("AssetId < Fr:", assetId < FR_MODULUS ? "✅ YES" : "❌ NO");
}

main().catch(console.error);
