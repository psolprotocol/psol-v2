const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");

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

  // ============================================================
  // STEP 1: RE-UPLOAD VK WITH CORRECT ENCODING
  // ============================================================
  
  console.log("=== Step 1: Re-uploading VK with CORRECT G2 encoding ===\n");
  
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  // G1 point: x || y
  function g1ToBytes(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    return Buffer.concat([bigIntToBytes32(x), bigIntToBytes32(y)]);
  }
  
  // G2 point - CORRECTED ENCODING!
  // snarkjs: point[0] = [imag, real], point[1] = [imag, real]
  // Solana: | x_imag | x_real | y_imag | y_real |
  // So we need: | [0][0] | [0][1] | [1][0] | [1][1] |
  function g2ToBytes(point) {
    const x_imag = BigInt(point[0][0]); // [0][0] is imaginary!
    const x_real = BigInt(point[0][1]); // [0][1] is real!
    const y_imag = BigInt(point[1][0]); // [1][0] is imaginary!
    const y_real = BigInt(point[1][1]); // [1][1] is real!
    
    return Buffer.concat([
      bigIntToBytes32(x_imag), // x_imag FIRST
      bigIntToBytes32(x_real), // x_real
      bigIntToBytes32(y_imag), // y_imag FIRST
      bigIntToBytes32(y_real), // y_real
    ]);
  }
  
  const alphaG1 = g1ToBytes(vkJson.vk_alpha_1);
  const betaG2 = g2ToBytes(vkJson.vk_beta_2);
  const gammaG2 = g2ToBytes(vkJson.vk_gamma_2);
  const deltaG2 = g2ToBytes(vkJson.vk_delta_2);
  const ic = vkJson.IC.map(p => g1ToBytes(p));

  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
    programId
  );

  console.log("Re-uploading VK with CORRECTED G2 encoding...");
  
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
  
  // Verify gamma_g2 matches known generator
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  const storedGamma = Buffer.from(vkAccount.vkGammaG2);
  
  // Known G2 generator: x_imag first
  const knownGammaG2 = Buffer.concat([
    bigIntToBytes32(BigInt("10857046999023057135944570762232829481370756359578518086990519993285655852781")), // x_imag
    bigIntToBytes32(BigInt("11559732032986387107991004021392285783925812861821192530917403151452391805634")), // x_real
    bigIntToBytes32(BigInt("8495653923123431417604973247489272438418190587263600148770280649306958101930")),  // y_imag
    bigIntToBytes32(BigInt("4082367875863433681332203403145435568316851327593401208105741076214120093531")),  // y_real
  ]);
  
  console.log("\nVerifying gamma_g2 matches known G2 generator...");
  console.log("Stored gamma_g2:", storedGamma.slice(0, 32).toString('hex'));
  console.log("Known  gamma_g2:", knownGammaG2.slice(0, 32).toString('hex'));
  console.log("Match:", storedGamma.equals(knownGammaG2) ? "✅ YES" : "❌ NO");
  
  if (!storedGamma.equals(knownGammaG2)) {
    console.log("\n❌ VK gamma_g2 mismatch! Aborting.");
    return;
  }

  // ============================================================
  // STEP 2: GENERATE PROOF AND TEST DEPOSIT
  // ============================================================
  
  console.log("\n=== Step 2: Testing Deposit with CORRECT proof encoding ===\n");

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
  const secretBytes = crypto.randomBytes(31);
  const nullifierBytes = crypto.randomBytes(31);
  const secret = BigInt('0x' + secretBytes.toString('hex'));
  const nullifier = BigInt('0x' + nullifierBytes.toString('hex'));
  const amount = BigInt(100000000); // 0.1 SOL
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  console.log("Commitment:", commitment.toString());
  
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
  
  console.log("Generating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  // Verify locally
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");
  
  if (!localValid) {
    console.log("Local verification failed! Aborting.");
    return;
  }

  // Pack proof with CORRECTED G2 encoding
  const proofData = Buffer.alloc(256);
  
  // A (64 bytes): x || y - G1, no change needed
  const aX = BigInt(proof.pi_a[0]);
  const aY = BigInt(proof.pi_a[1]);
  bigIntToBytes32(aX).copy(proofData, 0);
  bigIntToBytes32(aY).copy(proofData, 32);
  
  // B (128 bytes): CORRECTED! 
  // snarkjs pi_b[0] = [imag, real], pi_b[1] = [imag, real]
  // Solana wants: | x_imag | x_real | y_imag | y_real |
  // So: | [0][0] | [0][1] | [1][0] | [1][1] |
  const bX_imag = BigInt(proof.pi_b[0][0]); // [0][0] is imaginary
  const bX_real = BigInt(proof.pi_b[0][1]); // [0][1] is real
  const bY_imag = BigInt(proof.pi_b[1][0]); // [1][0] is imaginary
  const bY_real = BigInt(proof.pi_b[1][1]); // [1][1] is real
  
  bigIntToBytes32(bX_imag).copy(proofData, 64);  // x_imag
  bigIntToBytes32(bX_real).copy(proofData, 96);  // x_real
  bigIntToBytes32(bY_imag).copy(proofData, 128); // y_imag
  bigIntToBytes32(bY_real).copy(proofData, 160); // y_real
  
  // C (64 bytes): x || y - G1, no change needed
  const cX = BigInt(proof.pi_c[0]);
  const cY = BigInt(proof.pi_c[1]);
  bigIntToBytes32(cX).copy(proofData, 192);
  bigIntToBytes32(cY).copy(proofData, 224);

  console.log("\nProof B encoding (first 64 bytes):", proofData.slice(64, 128).toString('hex'));

  // Derive remaining PDAs
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

  // Build transaction
  const preInstructions = [];
  
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

  console.log("\n=== Submitting Deposit Transaction ===");
  
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
    console.log("View on Solana Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    
    // Verify merkle tree updated
    const treeAccount = await program.account.merkleTreeV2.fetch(merkleTree);
    console.log("\nMerkle tree next leaf index:", treeAccount.nextLeafIndex);
    
  } catch (err) {
    console.log("\n❌ Transaction failed:", err.message);
    if (err.logs) {
      console.log("\n=== Program Logs ===");
      err.logs.forEach(log => console.log(log));
    }
  }
}

main().catch(console.error);
