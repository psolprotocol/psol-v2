const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");

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

  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  // ============================================================
  // CORRECT G2 ENCODING FUNCTION
  // snarkjs: [[x0_real, x1_imag], [y0_real, y1_imag]]
  // Solana:  x_imag | x_real | y_imag | y_real
  // So:      [0][1] | [0][0] | [1][1] | [1][0]
  // ============================================================
  function g2PointToBytes(point) {
    const x0 = BigInt(point[0][0]); // x_real
    const x1 = BigInt(point[0][1]); // x_imag
    const y0 = BigInt(point[1][0]); // y_real
    const y1 = BigInt(point[1][1]); // y_imag
    return Buffer.concat([
      bigIntToBytes32(x1), // x_imag FIRST
      bigIntToBytes32(x0), // x_real
      bigIntToBytes32(y1), // y_imag FIRST
      bigIntToBytes32(y0), // y_real
    ]);
  }
  
  function g1PointToBytes(point) {
    return Buffer.concat([
      bigIntToBytes32(BigInt(point[0])),
      bigIntToBytes32(BigInt(point[1]))
    ]);
  }

  // ============================================================
  // STEP 1: RE-UPLOAD VK WITH CORRECT G2 ENCODING
  // ============================================================
  console.log("=== Step 1: Re-uploading VK with CORRECT G2 encoding ===\n");
  
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
  const betaG2 = g2PointToBytes(vkJson.vk_beta_2);
  const gammaG2 = g2PointToBytes(vkJson.vk_gamma_2);
  const deltaG2 = g2PointToBytes(vkJson.vk_delta_2);
  const ic = vkJson.IC.map(p => g1PointToBytes(p));

  console.log("VK G2 encoding order: [0][1] | [0][0] | [1][1] | [1][0] (x1|x0|y1|y0)");
  console.log("Beta G2 first 32 bytes:", betaG2.slice(0, 32).toString('hex').slice(0, 40) + "...");

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
  
  console.log("✅ VK re-uploaded:", vkTx);

  // ============================================================
  // STEP 2: GENERATE NOTE AND PROOF
  // ============================================================
  console.log("\n=== Step 2: Generating proof ===\n");

  // Compute asset ID
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

  // Create note
  const poseidon = await buildPoseidon();
  const secret = BigInt("12345678901234567890123456789012345678901234567890");
  const nullifier = BigInt("98765432109876543210987654321098765432109876543210");
  const amount = BigInt(100000000);
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  const commitmentHex = commitment.toString(16).padStart(64, '0');
  const commitmentBytes = Buffer.from(commitmentHex, 'hex');

  // Generate proof
  const proofInput = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    asset_id: assetIdBigInt.toString(),
    commitment: commitment.toString(),
  };
  
  console.log("Generating ZK proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  // Verify locally
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");

  // Print correct labels
  console.log("\n=== Raw proof.pi_b (CORRECT LABELS) ===");
  console.log("pi_b[0][0] (x0 real):", proof.pi_b[0][0]);
  console.log("pi_b[0][1] (x1 imag):", proof.pi_b[0][1]);
  console.log("pi_b[1][0] (y0 real):", proof.pi_b[1][0]);
  console.log("pi_b[1][1] (y1 imag):", proof.pi_b[1][1]);

  // ============================================================
  // STEP 3: PACK PROOF WITH CORRECT B ENCODING
  // ============================================================
  const proofData = Buffer.alloc(256);
  
  // A: x || y (64 bytes)
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);
  
  // B: x_imag | x_real | y_imag | y_real (128 bytes)
  // CORRECT ORDER: [0][1] | [0][0] | [1][1] | [1][0]
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 64);   // x1 = x_imag
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 96);   // x0 = x_real
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 128);  // y1 = y_imag
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 160);  // y0 = y_real
  
  // C: x || y (64 bytes)
  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);

  console.log("\n=== Proof B packing order: [0][1] | [0][0] | [1][1] | [1][0] ===");
  console.log("B bytes (64-191):", proofData.slice(64, 192).toString('hex'));

  // VERIFICATION: Decode and compare
  console.log("\n=== Verification: decode packed B and compare ===");
  const packedX1 = BigInt('0x' + proofData.slice(64, 96).toString('hex'));
  const packedX0 = BigInt('0x' + proofData.slice(96, 128).toString('hex'));
  const packedY1 = BigInt('0x' + proofData.slice(128, 160).toString('hex'));
  const packedY0 = BigInt('0x' + proofData.slice(160, 192).toString('hex'));
  
  console.log("Packed x_imag matches pi_b[0][1]:", packedX1 === BigInt(proof.pi_b[0][1]) ? "✅" : "❌");
  console.log("Packed x_real matches pi_b[0][0]:", packedX0 === BigInt(proof.pi_b[0][0]) ? "✅" : "❌");
  console.log("Packed y_imag matches pi_b[1][1]:", packedY1 === BigInt(proof.pi_b[1][1]) ? "✅" : "❌");
  console.log("Packed y_real matches pi_b[1][0]:", packedY0 === BigInt(proof.pi_b[1][0]) ? "✅" : "❌");

  // ============================================================
  // STEP 4: SUBMIT DEPOSIT
  // ============================================================
  console.log("\n=== Step 4: Submitting deposit ===\n");

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

    console.log("\n🎉🎉🎉 SUCCESS! Deposit TX:", tx);
    console.log("https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    
    const treeAccount = await program.account.merkleTreeV2.fetch(merkleTree);
    console.log("Merkle tree next leaf index:", treeAccount.nextLeafIndex);
    
  } catch (err) {
    console.log("\n❌ Failed:", err.message);
    if (err.logs) {
      const cuLog = err.logs.find(l => l.includes("consumed"));
      if (cuLog) console.log("CU:", cuLog);
    }
  }
}

main().catch(console.error);
