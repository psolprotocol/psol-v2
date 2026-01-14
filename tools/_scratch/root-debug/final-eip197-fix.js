/**
 * pSOL v2 Groth16 Deposit - EIP-197 G2 FORMAT
 * 
 * Key discovery: Solana alt_bn128 pairing follows EIP-197 which expects:
 *   G2 = | x_real | x_imag | y_real | y_imag |
 * 
 * snarkjs uses: [[imag, real], [imag, real]]
 *   [0][0] = x_imag, [0][1] = x_real
 * 
 * So for EIP-197: [0][1] || [0][0] || [1][1] || [1][0]
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  console.log("=".repeat(70));
  console.log("pSOL v2 Groth16 Deposit - EIP-197 G2 FORMAT FIX");
  console.log("=".repeat(70));
  
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

  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  function g1PointToBytes(point) {
    return Buffer.concat([
      bigIntToBytes32(BigInt(point[0])),
      bigIntToBytes32(BigInt(point[1]))
    ]);
  }
  
  /**
   * EIP-197 G2 encoding (for Solana alt_bn128 pairing syscall)
   * 
   * EIP-197 expects: | x_real | x_imag | y_real | y_imag | (128 bytes)
   * snarkjs format:  [[x_imag, x_real], [y_imag, y_real], ...]
   * 
   * Therefore: [0][1] || [0][0] || [1][1] || [1][0]
   */
  function g2PointToBytes_EIP197(point) {
    const x_imag = BigInt(point[0][0]);  // snarkjs [0][0] = x_imag
    const x_real = BigInt(point[0][1]);  // snarkjs [0][1] = x_real
    const y_imag = BigInt(point[1][0]);  // snarkjs [1][0] = y_imag
    const y_real = BigInt(point[1][1]);  // snarkjs [1][1] = y_real
    
    // EIP-197: real || imag || real || imag
    return Buffer.concat([
      bigIntToBytes32(x_real),  // bytes 0-31:   x_real (c0)
      bigIntToBytes32(x_imag),  // bytes 32-63:  x_imag (c1)
      bigIntToBytes32(y_real),  // bytes 64-95:  y_real (c0)
      bigIntToBytes32(y_imag),  // bytes 96-127: y_imag (c1)
    ]);
  }

  // ============================================================
  // STEP 1: RE-UPLOAD VK WITH EIP-197 G2 ENCODING
  // ============================================================
  
  console.log("\n[STEP 1] Re-uploading VK with EIP-197 G2 encoding...\n");
  console.log("EIP-197 G2 format: | x_real | x_imag | y_real | y_imag |");
  console.log("Packing order:     [0][1] || [0][0] || [1][1] || [1][0]\n");
  
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
    programId
  );

  const alphaG1 = g1PointToBytes(vkJson.vk_alpha_1);
  const betaG2 = g2PointToBytes_EIP197(vkJson.vk_beta_2);
  const gammaG2 = g2PointToBytes_EIP197(vkJson.vk_gamma_2);
  const deltaG2 = g2PointToBytes_EIP197(vkJson.vk_delta_2);
  const ic = vkJson.IC.map(p => g1PointToBytes(p));

  console.log("VK gamma_g2 check:");
  console.log("  snarkjs [0][0] (imag):", vkJson.vk_gamma_2[0][0].slice(0, 20) + "...");
  console.log("  snarkjs [0][1] (real):", vkJson.vk_gamma_2[0][1].slice(0, 20) + "...");
  console.log("  Packed first 32 bytes (should be REAL):", gammaG2.slice(0, 32).toString('hex').slice(0, 40) + "...");

  try {
    const vkTx = await program.methods
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
    
    console.log("\n✅ VK uploaded with EIP-197 format!");
    console.log("   TX:", vkTx);
  } catch (err) {
    console.log("⚠️  VK upload error:", err.message);
  }

  // ============================================================
  // STEP 2: COMPUTE ASSET ID
  // ============================================================
  
  console.log("\n[STEP 2] Computing asset ID for wSOL...\n");
  
  const wsolMint = NATIVE_MINT;
  const prefix = Buffer.from('psol:asset_id:v1');
  const mintBytes = wsolMint.toBuffer();
  const input = Buffer.concat([prefix, mintBytes]);
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

  // ============================================================
  // STEP 3: CREATE NOTE AND GENERATE PROOF
  // ============================================================
  
  console.log("\n[STEP 3] Generating ZK proof...\n");
  
  const poseidon = await buildPoseidon();
  const secret = BigInt("12345678901234567890123456789012345678901234567890");
  const nullifier = BigInt("98765432109876543210987654321098765432109876543210");
  const amount = BigInt(100000000);
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  console.log("Note parameters:");
  console.log("  Amount:", amount.toString(), "(0.1 SOL)");
  console.log("  Commitment:", commitment.toString().slice(0, 30) + "...");
  
  const commitmentHex = commitment.toString(16).padStart(64, '0');
  const commitmentBytes = Buffer.from(commitmentHex, 'hex');

  const proofInput = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    asset_id: assetIdBigInt.toString(),
    commitment: commitment.toString(),
  };
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("\nLocal snarkjs verification:", localValid ? "✅ PASSED" : "❌ FAILED");

  // ============================================================
  // STEP 4: PACK PROOF WITH EIP-197 G2 ENCODING
  // ============================================================
  
  console.log("\n[STEP 4] Packing proof with EIP-197 G2 encoding...\n");
  
  const proofData = Buffer.alloc(256);
  
  // A: G1 point (64 bytes) - x || y
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);
  
  // B: G2 point (128 bytes) - EIP-197: [0][1] || [0][0] || [1][1] || [1][0]
  console.log("Proof B (G2) packing - EIP-197 format:");
  console.log("  [0][1] (x_real) -> bytes 64-95");
  console.log("  [0][0] (x_imag) -> bytes 96-127");
  console.log("  [1][1] (y_real) -> bytes 128-159");
  console.log("  [1][0] (y_imag) -> bytes 160-191");
  
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 64);   // x_real
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 96);   // x_imag
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 128);  // y_real
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 160);  // y_imag
  
  // C: G1 point (64 bytes) - x || y
  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);

  // ============================================================
  // STEP 5: DERIVE PDAs AND PREPARE ACCOUNTS
  // ============================================================
  
  console.log("\n[STEP 5] Preparing accounts...\n");
  
  const [merkleTree] = PublicKey.findProgramAddressSync(
    [Buffer.from("merkle_tree_v2"), poolConfig.toBuffer()],
    programId
  );
  const [assetVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_v2"), poolConfig.toBuffer(), assetIdBytes],
    programId
  );
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_token"), assetVault.toBuffer()],
    programId
  );
  
  const userTokenAccount = getAssociatedTokenAddressSync(
    wsolMint,
    authorityKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const preInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
  ];
  
  const userAtaInfo = await connection.getAccountInfo(userTokenAccount);
  if (!userAtaInfo) {
    preInstructions.push(
      createAssociatedTokenAccountInstruction(
        authorityKeypair.publicKey,
        userTokenAccount,
        authorityKeypair.publicKey,
        wsolMint
      )
    );
  }
  
  preInstructions.push(
    SystemProgram.transfer({
      fromPubkey: authorityKeypair.publicKey,
      toPubkey: userTokenAccount,
      lamports: Number(amount) + 10000,
    }),
    createSyncNativeInstruction(userTokenAccount)
  );

  // ============================================================
  // STEP 6: SUBMIT DEPOSIT
  // ============================================================
  
  console.log("[STEP 6] Submitting deposit transaction...\n");
  
  try {
    const tx = await program.methods
      .depositMasp(
        new anchor.BN(amount.toString()),
        Array.from(commitmentBytes),
        Array.from(assetIdBytes),
        proofData,
        null
      )
      .accounts({
        depositor: authorityKeypair.publicKey,
        poolConfig,
        authority: authorityKeypair.publicKey,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        userTokenAccount,
        mint: wsolMint,
        depositVk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .signers([authorityKeypair])
      .rpc();

    console.log("=".repeat(70));
    console.log("🎉🎉🎉 SUCCESS! DEPOSIT COMPLETED! 🎉🎉🎉");
    console.log("=".repeat(70));
    console.log("\nTransaction:", tx);
    console.log("Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    
    const treeAccount = await program.account.merkleTreeV2.fetch(merkleTree);
    console.log("\nMerkle tree next leaf index:", treeAccount.nextLeafIndex);
    
  } catch (err) {
    console.log("=".repeat(70));
    console.log("❌ DEPOSIT FAILED");
    console.log("=".repeat(70));
    console.log("\nError:", err.message);
    
    if (err.logs) {
      console.log("\n--- Program Logs ---");
      err.logs.forEach((log, i) => {
        console.log(`${i}: ${log}`);
      });
    }
  }
}

main().catch(console.error);
