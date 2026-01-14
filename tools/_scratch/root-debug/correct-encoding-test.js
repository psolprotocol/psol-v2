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

  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }

  // ============================================================
  // CONFIRMED ENCODING from test-encoding.js:
  // snarkjs G2 format: [[x_imag, x_real], [y_imag, y_real]]
  // - [0][0] = IMAGINARY (c1)
  // - [0][1] = REAL (c0)
  // Solana G2 format: | x_imag | x_real | y_imag | y_real |
  // So mapping is: | [0][0] | [0][1] | [1][0] | [1][1] |
  // ============================================================

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
  // PACK PROOF - NO negation (on-chain does it), CORRECT G2 mapping
  // ============================================================
  
  const proofData = Buffer.alloc(256);
  
  // A (64 bytes): x || y - NO NEGATION (on-chain verifier does g1_negate)
  const aX = BigInt(proof.pi_a[0]);
  const aY = BigInt(proof.pi_a[1]);
  bigIntToBytes32(aX).copy(proofData, 0);
  bigIntToBytes32(aY).copy(proofData, 32);
  
  console.log("\n=== Proof Encoding ===");
  console.log("A.x:", aX.toString().slice(0, 20) + "...");
  console.log("A.y:", aY.toString().slice(0, 20) + "... (NOT negated, on-chain does it)");
  
  // B (128 bytes): CORRECT mapping from snarkjs to Solana
  // snarkjs: [[x_imag, x_real], [y_imag, y_real]]
  // Solana:  | x_imag | x_real | y_imag | y_real |
  // Direct mapping: | [0][0] | [0][1] | [1][0] | [1][1] |
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 64);   // x_imag = [0][0]
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 96);   // x_real = [0][1]
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 128);  // y_imag = [1][0]
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 160);  // y_real = [1][1]
  
  console.log("B encoding: [0][0]|[0][1]|[1][0]|[1][1] (imag|real|imag|real)");
  
  // C (64 bytes): x || y
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
    
  } catch (err) {
    console.log("\n❌ Transaction failed:", err.message);
    if (err.logs) {
      console.log("\n=== Program Logs ===");
      err.logs.forEach(log => console.log(log));
    }
  }
}

main().catch(console.error);
