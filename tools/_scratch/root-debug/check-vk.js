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
  anchor.setProvider(provider);

  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/psol_privacy_v2.json", "utf-8"));
  const programId = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
  const program = new anchor.Program(idl, provider);
  
  // Derive PDAs
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
  
  // Deposit VK PDA - seeds are [proof_type_seed, pool]
  // ProofType::Deposit.as_seed() = b"vk_deposit"
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
    programId
  );
  
  console.log("Deposit VK PDA:", depositVk.toString());
  
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  
  console.log("\n=== VK Account State ===");
  console.log("Pool:", vkAccount.pool.toString());
  console.log("Proof Type:", vkAccount.proofType);
  console.log("Is Initialized:", vkAccount.isInitialized);
  console.log("Is Locked:", vkAccount.isLocked);
  console.log("IC Length:", vkAccount.vkIcLen);
  console.log("Set At:", new Date(vkAccount.setAt.toNumber() * 1000).toISOString());
  
  // Show first bytes of VK components
  console.log("\nAlpha G1 (hex):", Buffer.from(vkAccount.vkAlphaG1).toString('hex').slice(0, 64) + "...");
  console.log("Beta G2 (first 64 bytes hex):", Buffer.from(vkAccount.vkBetaG2).slice(0, 64).toString('hex'));
  
  // Load original VK and compare
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  // Convert expected alpha_g1
  const x = BigInt(vkJson.vk_alpha_1[0]);
  const y = BigInt(vkJson.vk_alpha_1[1]);
  const expectedAlpha = Buffer.concat([
    Buffer.from(x.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(y.toString(16).padStart(64, '0'), 'hex')
  ]);
  console.log("\nExpected Alpha G1:", expectedAlpha.toString('hex').slice(0, 64) + "...");
  
  const storedAlpha = Buffer.from(vkAccount.vkAlphaG1);
  console.log("Match Alpha G1:", storedAlpha.equals(expectedAlpha) ? "✅ YES" : "❌ NO");
  
  // Check Beta G2 encoding - this is where the bug likely is
  console.log("\n=== Beta G2 Analysis ===");
  const b = vkJson.vk_beta_2;
  console.log("snarkjs vk_beta_2[0] (x):", b[0]);
  console.log("snarkjs vk_beta_2[1] (y):", b[1]);
  
  // Our current encoding: x1 || x0 || y1 || y0 (imaginary first)
  const x0 = BigInt(b[0][0]);
  const x1 = BigInt(b[0][1]);
  const y0 = BigInt(b[1][0]);
  const y1 = BigInt(b[1][1]);
  
  const expectedBeta = Buffer.concat([
    Buffer.from(x1.toString(16).padStart(64, '0'), 'hex'),  // x_imag
    Buffer.from(x0.toString(16).padStart(64, '0'), 'hex'),  // x_real
    Buffer.from(y1.toString(16).padStart(64, '0'), 'hex'),  // y_imag
    Buffer.from(y0.toString(16).padStart(64, '0'), 'hex'),  // y_real
  ]);
  
  const storedBeta = Buffer.from(vkAccount.vkBetaG2);
  console.log("\nExpected Beta G2 (x1,x0,y1,y0):", expectedBeta.toString('hex').slice(0, 64) + "...");
  console.log("Stored Beta G2:", storedBeta.toString('hex').slice(0, 64) + "...");
  console.log("Match Beta G2:", storedBeta.equals(expectedBeta) ? "✅ YES" : "❌ NO");
  
  if (!storedBeta.equals(expectedBeta)) {
    console.log("\n❌ VK encoding mismatch detected! Need to re-upload VK.");
  }
}

main().catch(console.error);
