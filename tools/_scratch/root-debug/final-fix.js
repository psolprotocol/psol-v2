const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");

// BN254 base field prime (for G1 point negation)
const FIELD_PRIME = BigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");

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
  
  console.log("=== Generating Deposit ===");
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
  
  console.log("Generating ZK proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  // Verify locally
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");
  
  if (!localValid) {
    console.log("Local verification failed! Aborting.");
    return;
  }

  // ============================================================
  // PACK PROOF WITH CORRECT ENCODING - KEY FIX: NEGATE proof_a
  // ============================================================
  
  const proofData = Buffer.alloc(256);
  
  // A (64 bytes): x || NEGATED_y
  // Groth16 verification uses -A, so we negate the y-coordinate
  const aX = BigInt(proof.pi_a[0]);
  const aY = BigInt(proof.pi_a[1]);
  const aY_negated = (FIELD_PRIME - aY) % FIELD_PRIME;  // <-- KEY FIX!
  
  console.log("\n=== Proof A Encoding ===");
  console.log("Original y:", aY.toString());
  console.log("Negated y: ", aY_negated.toString());
  
  bigIntToBytes32(aX).copy(proofData, 0);
  bigIntToBytes32(aY_negated).copy(proofData, 32);  // Use negated y
  
  // B (128 bytes): snarkjs [c0,c1] -> Solana [c1,c0] (swap real/imag)
  // snarkjs: pi_b[0] = [real, imag], pi_b[1] = [real, imag]
  // Solana:  x_imag || x_real || y_imag || y_real
  const bX_real = BigInt(proof.pi_b[0][0]);
  const bX_imag = BigInt(proof.pi_b[0][1]);
  const bY_real = BigInt(proof.pi_b[1][0]);
  const bY_imag = BigInt(proof.pi_b[1][1]);
  
  bigIntToBytes32(bX_imag).copy(proofData, 64);   // x_imag FIRST
  bigIntToBytes32(bX_real).copy(proofData, 96);   // x_real
  bigIntToBytes32(bY_imag).copy(proofData, 128);  // y_imag FIRST
  bigIntToBytes32(bY_real).copy(proofData, 160);  // y_real
  
  // C (64 bytes): x || y (no transformation)
  const cX = BigInt(proof.pi_c[0]);
  const cY = BigInt(proof.pi_c[1]);
  bigIntToBytes32(cX).copy(proofData, 192);
  bigIntToBytes32(cY).copy(proofData, 224);

  // Derive PDAs
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authorityKeypair.publicKey.toBuffer()],
    programId
  );
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
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
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
    console.log("\nView on Solana Explorer:");
    console.log("https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    
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
