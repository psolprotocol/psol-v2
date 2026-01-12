const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
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
  
  console.log("Pool Config:", poolConfig.toString());
  console.log("Deposit VK:", depositVk.toString());
  
  // Load VK from circuit build
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  // G1 point encoding: x || y (64 bytes)
  function pointToBytes(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    return Buffer.concat([
      Buffer.from(x.toString(16).padStart(64, '0'), 'hex'),
      Buffer.from(y.toString(16).padStart(64, '0'), 'hex')
    ]);
  }
  
  // G2 point encoding: x_imag || x_real || y_imag || y_real (128 bytes)
  // snarkjs format: point[0] = [x0_real, x1_imag], point[1] = [y0_real, y1_imag]
  function g2PointToBytes(point) {
    const x0 = BigInt(point[0][0]); // x real
    const x1 = BigInt(point[0][1]); // x imaginary
    const y0 = BigInt(point[1][0]); // y real
    const y1 = BigInt(point[1][1]); // y imaginary
    
    // Order: x_imag, x_real, y_imag, y_real
    return Buffer.concat([
      Buffer.from(x1.toString(16).padStart(64, '0'), 'hex'), // x imaginary FIRST
      Buffer.from(x0.toString(16).padStart(64, '0'), 'hex'), // x real
      Buffer.from(y1.toString(16).padStart(64, '0'), 'hex'), // y imaginary FIRST
      Buffer.from(y0.toString(16).padStart(64, '0'), 'hex'), // y real
    ]);
  }
  
  const alphaG1 = pointToBytes(vkJson.vk_alpha_1);
  const betaG2 = g2PointToBytes(vkJson.vk_beta_2);
  const gammaG2 = g2PointToBytes(vkJson.vk_gamma_2);
  const deltaG2 = g2PointToBytes(vkJson.vk_delta_2);
  
  const ic = vkJson.IC.map(p => pointToBytes(p));
  
  console.log("\n=== VK Encoding ===");
  console.log("Alpha G1 (64 bytes):", alphaG1.toString('hex').slice(0, 32) + "...");
  console.log("Beta G2 (128 bytes):", betaG2.toString('hex').slice(0, 32) + "...");
  console.log("Gamma G2 (128 bytes):", gammaG2.toString('hex').slice(0, 32) + "...");
  console.log("Delta G2 (128 bytes):", deltaG2.toString('hex').slice(0, 32) + "...");
  console.log("IC count:", ic.length);
  
  console.log("\nRe-uploading VK...");
  
  const tx = await program.methods
    .setVerificationKeyV2(
      { deposit: {} },
      alphaG1,
      betaG2,
      gammaG2,
      deltaG2,
      ic
    )
    .accounts({
      authority: authorityKeypair.publicKey,
      poolConfig,
      vkAccount: depositVk,
      systemProgram: SystemProgram.programId,
    })
    .signers([authorityKeypair])
    .rpc();
  
  console.log("✅ VK re-uploaded:", tx);
  
  // Verify the new encoding
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  const storedBeta = Buffer.from(vkAccount.vkBetaG2);
  console.log("\nVerifying...");
  console.log("Expected Beta G2:", betaG2.toString('hex').slice(0, 64));
  console.log("Stored Beta G2:  ", storedBeta.toString('hex').slice(0, 64));
  console.log("Match:", storedBeta.slice(0, 64).equals(betaG2.slice(0, 64)) ? "✅ YES" : "❌ NO");
}

main().catch(console.error);
