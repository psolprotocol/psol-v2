const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const snarkjs = require("snarkjs");

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

  // Fetch on-chain VK
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  console.log("=== Verifying ALL VK Components ===\n");
  
  // Check Alpha G1 (64 bytes)
  const expectedAlpha = Buffer.concat([
    bigIntToBytes32(BigInt(vkJson.vk_alpha_1[0])),
    bigIntToBytes32(BigInt(vkJson.vk_alpha_1[1]))
  ]);
  const storedAlpha = Buffer.from(vkAccount.vkAlphaG1);
  console.log("Alpha G1:");
  console.log("  Expected:", expectedAlpha.toString('hex').slice(0, 40) + "...");
  console.log("  Stored:  ", storedAlpha.toString('hex').slice(0, 40) + "...");
  console.log("  Match:", expectedAlpha.equals(storedAlpha) ? "✅" : "❌");
  
  // Check all IC points
  console.log("\nIC Points (G1):");
  for (let i = 0; i < vkJson.IC.length; i++) {
    const expectedIC = Buffer.concat([
      bigIntToBytes32(BigInt(vkJson.IC[i][0])),
      bigIntToBytes32(BigInt(vkJson.IC[i][1]))
    ]);
    const storedIC = Buffer.from(vkAccount.vkIc[i]);
    const match = expectedIC.equals(storedIC);
    console.log(`  IC[${i}]: ${match ? "✅" : "❌"} ${match ? "" : "MISMATCH!"}`);
    if (!match) {
      console.log(`    Expected: ${expectedIC.toString('hex')}`);
      console.log(`    Stored:   ${storedIC.toString('hex')}`);
    }
  }
  
  // Check Beta G2 - using CORRECT encoding: [0][0]=imag, [0][1]=real
  const expectedBeta = Buffer.concat([
    bigIntToBytes32(BigInt(vkJson.vk_beta_2[0][0])), // x_imag
    bigIntToBytes32(BigInt(vkJson.vk_beta_2[0][1])), // x_real
    bigIntToBytes32(BigInt(vkJson.vk_beta_2[1][0])), // y_imag
    bigIntToBytes32(BigInt(vkJson.vk_beta_2[1][1]))  // y_real
  ]);
  const storedBeta = Buffer.from(vkAccount.vkBetaG2);
  console.log("\nBeta G2:");
  console.log("  Expected:", expectedBeta.toString('hex').slice(0, 40) + "...");
  console.log("  Stored:  ", storedBeta.toString('hex').slice(0, 40) + "...");
  console.log("  Match:", expectedBeta.equals(storedBeta) ? "✅" : "❌");
  
  // Check Delta G2
  const expectedDelta = Buffer.concat([
    bigIntToBytes32(BigInt(vkJson.vk_delta_2[0][0])),
    bigIntToBytes32(BigInt(vkJson.vk_delta_2[0][1])),
    bigIntToBytes32(BigInt(vkJson.vk_delta_2[1][0])),
    bigIntToBytes32(BigInt(vkJson.vk_delta_2[1][1]))
  ]);
  const storedDelta = Buffer.from(vkAccount.vkDeltaG2);
  console.log("\nDelta G2:");
  console.log("  Expected:", expectedDelta.toString('hex').slice(0, 40) + "...");
  console.log("  Stored:  ", storedDelta.toString('hex').slice(0, 40) + "...");
  console.log("  Match:", expectedDelta.equals(storedDelta) ? "✅" : "❌");
  
  // Also verify the BN254 Fr modulus and check public inputs would be valid
  const FR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  
  console.log("\n=== Field Element Validation ===");
  console.log("BN254 Fr modulus:", FR_MODULUS.toString());
  
  // Example commitment and asset_id from tests
  const testCommitment = BigInt("6744836422242051186374956961429873393890174598255136972825210943990583022701");
  const testAmount = BigInt("100000000");
  const testAssetId = BigInt("421521653144930500967200431270257997403337399394150674665029563160526671898");
  
  console.log("\nPublic inputs validation:");
  console.log("  Commitment < Fr:", testCommitment < FR_MODULUS ? "✅" : "❌");
  console.log("  Amount < Fr:", testAmount < FR_MODULUS ? "✅" : "❌");
  console.log("  AssetId < Fr:", testAssetId < FR_MODULUS ? "✅" : "❌");
  
  // Now check what the on-chain code would see
  console.log("\n=== On-Chain Scalar Format ===");
  console.log("Commitment as 32-byte BE:", bigIntToBytes32(testCommitment).toString('hex'));
  console.log("Amount as 32-byte BE:    ", bigIntToBytes32(testAmount).toString('hex'));
  console.log("AssetId as 32-byte BE:   ", bigIntToBytes32(testAssetId).toString('hex'));
}

main().catch(console.error);
