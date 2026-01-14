/**
 * pSOL v2 Groth16 Deposit - CORRECT ENCODING
 * 
 * Key insight from audit:
 * - On-chain expects G2: | x_imag | x_real | y_imag | y_real |
 * - snarkjs uses: [[imag, real], [imag, real]] = [[c1, c0], [c1, c0]]
 * - Therefore: [0][0]=imag, [0][1]=real
 * - Correct packing: [0][0] || [0][1] || [1][0] || [1][1]
 * 
 * Previous error: We swapped to [0][1] || [0][0] based on wrong advice
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
  console.log("pSOL v2 Groth16 Deposit - CORRECT G2 ENCODING FIX");
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

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  /**
   * CORRECT G1 encoding: x || y (64 bytes)
   * snarkjs: [x, y, "1"]
   */
  function g1PointToBytes(point) {
    return Buffer.concat([
      bigIntToBytes32(BigInt(point[0])),  // x
      bigIntToBytes32(BigInt(point[1]))   // y
    ]);
  }
  
  /**
   * CORRECT G2 encoding for on-chain verification
   * 
   * On-chain expects: | x_imag | x_real | y_imag | y_real | (128 bytes)
   * snarkjs format:   [[x_imag, x_real], [y_imag, y_real], ["1", "0"]]
   * 
   * Therefore: [0][0] || [0][1] || [1][0] || [1][1]
   */
  function g2PointToBytes(point) {
    const x_imag = BigInt(point[0][0]);  // [0][0] = x_imag (c1)
    const x_real = BigInt(point[0][1]);  // [0][1] = x_real (c0)
    const y_imag = BigInt(point[1][0]);  // [1][0] = y_imag (c1)
    const y_real = BigInt(point[1][1]);  // [1][1] = y_real (c0)
    
    return Buffer.concat([
      bigIntToBytes32(x_imag),  // bytes 0-31:   x_imag
      bigIntToBytes32(x_real),  // bytes 32-63:  x_real
      bigIntToBytes32(y_imag),  // bytes 64-95:  y_imag
      bigIntToBytes32(y_real),  // bytes 96-127: y_real
    ]);
  }

  // ============================================================
  // STEP 1: RE-UPLOAD VK WITH CORRECT G2 ENCODING
  // ============================================================
  
  console.log("\n[STEP 1] Re-uploading VK with CORRECT G2 encoding...\n");
  console.log("G2 encoding: [0][0] || [0][1] || [1][0] || [1][1]");
  console.log("             x_imag || x_real || y_imag || y_real\n");
  
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
    programId
  );

  // Encode VK components
  const alphaG1 = g1PointToBytes(vkJson.vk_alpha_1);
  const betaG2 = g2PointToBytes(vkJson.vk_beta_2);
  const gammaG2 = g2PointToBytes(vkJson.vk_gamma_2);
  const deltaG2 = g2PointToBytes(vkJson.vk_delta_2);
  const ic = vkJson.IC.map(p => g1PointToBytes(p));

  // Verify encoding with known G2 generator (gamma_g2 should be generator)
  console.log("Verification - gamma_g2 encoding:");
  console.log("  snarkjs [0][0] (should be x_imag):", vkJson.vk_gamma_2[0][0].slice(0, 20) + "...");
  console.log("  snarkjs [0][1] (should be x_real):", vkJson.vk_gamma_2[0][1].slice(0, 20) + "...");
  console.log("  Known G2 gen x_imag starts with: 10857046999023057135...");
  console.log("  Known G2 gen x_real starts with: 11559732032986387107...");
  
  const gammaStartsCorrect = vkJson.vk_gamma_2[0][0].startsWith("10857") && 
                              vkJson.vk_gamma_2[0][1].startsWith("11559");
  console.log("  Encoding matches known generator:", gammaStartsCorrect ? "✅ YES" : "❌ NO");

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
    
    console.log("\n✅ VK uploaded successfully!");
    console.log("   TX:", vkTx);
  } catch (err) {
    console.log("⚠️  VK upload error (may already be set):", err.message);
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
  const amount = BigInt(100000000); // 0.1 SOL
  
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
  
  // Local verification
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("\nLocal snarkjs verification:", localValid ? "✅ PASSED" : "❌ FAILED");
  
  if (!localValid) {
    console.log("ERROR: Local verification failed. Check circuit/proof generation.");
    return;
  }

  // ============================================================
  // STEP 4: PACK PROOF WITH CORRECT ENCODING
  // ============================================================
  
  console.log("\n[STEP 4] Packing proof with CORRECT encoding...\n");
  
  const proofData = Buffer.alloc(256);
  
  // A: G1 point (64 bytes) - x || y, NO negation (on-chain does it)
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);   // A.x
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);  // A.y
  
  // B: G2 point (128 bytes) - CORRECT: [0][0] || [0][1] || [1][0] || [1][1]
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 64);   // B.x_imag
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 96);   // B.x_real
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 128);  // B.y_imag
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 160);  // B.y_real
  
  // C: G1 point (64 bytes) - x || y
  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);  // C.x
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);  // C.y

  console.log("Proof encoding:");
  console.log("  A (bytes 0-63):   x || y");
  console.log("  B (bytes 64-191): [0][0] || [0][1] || [1][0] || [1][1]");
  console.log("  C (bytes 192-255): x || y");
  
  // Verification: decode and compare
  console.log("\nVerification - decode packed B and compare to source:");
  const packedB_0_0 = BigInt('0x' + proofData.slice(64, 96).toString('hex'));
  const packedB_0_1 = BigInt('0x' + proofData.slice(96, 128).toString('hex'));
  const packedB_1_0 = BigInt('0x' + proofData.slice(128, 160).toString('hex'));
  const packedB_1_1 = BigInt('0x' + proofData.slice(160, 192).toString('hex'));
  
  console.log("  [0][0] match:", packedB_0_0 === BigInt(proof.pi_b[0][0]) ? "✅" : "❌");
  console.log("  [0][1] match:", packedB_0_1 === BigInt(proof.pi_b[0][1]) ? "✅" : "❌");
  console.log("  [1][0] match:", packedB_1_0 === BigInt(proof.pi_b[1][0]) ? "✅" : "❌");
  console.log("  [1][1] match:", packedB_1_1 === BigInt(proof.pi_b[1][1]) ? "✅" : "❌");

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

  // Pre-instructions: compute budget + fund wSOL
  const preInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
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
    
    // Verify merkle tree state
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
      
      // Extract our program's CU
      const cuLog = err.logs.find(l => 
        l.includes("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb") && 
        l.includes("consumed")
      );
      if (cuLog) {
        console.log("\n>>> Main program CU:", cuLog);
      }
    }
  }
}

main().catch(console.error);
