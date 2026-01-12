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

  // Create note with proper random generation
  const poseidon = await buildPoseidon();
  const secretBytes = crypto.randomBytes(31);
  const nullifierBytes = crypto.randomBytes(31);
  const secret = BigInt('0x' + secretBytes.toString('hex'));
  const nullifier = BigInt('0x' + nullifierBytes.toString('hex'));
  const amount = BigInt(100000000); // 0.1 SOL
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  console.log("=== Note Details ===");
  console.log("Secret:", secret.toString().slice(0, 40) + "...");
  console.log("Nullifier:", nullifier.toString().slice(0, 40) + "...");
  console.log("Amount:", amount.toString());
  console.log("Asset ID:", assetIdBigInt.toString());
  console.log("Commitment:", commitment.toString());
  
  // Convert commitment to bytes
  const commitmentHex = commitment.toString(16).padStart(64, '0');
  const commitmentBytes = Buffer.from(commitmentHex, 'hex');
  console.log("\nCommitment bytes:", commitmentBytes.toString('hex'));

  // Generate proof
  const proofInput = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    asset_id: assetIdBigInt.toString(),
    commitment: commitment.toString(),
  };
  
  console.log("\n=== Generating Proof ===");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  console.log("Public signals:", publicSignals);
  
  // Verify locally first
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");
  
  if (!localValid) {
    console.log("Local verification failed! Aborting.");
    return;
  }

  // Pack proof for on-chain (256 bytes)
  console.log("\n=== Proof Encoding ===");
  console.log("pi_a:", proof.pi_a);
  console.log("pi_b:", proof.pi_b);
  console.log("pi_c:", proof.pi_c);
  
  function bigIntToBytes32(bi) {
    const hex = bi.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  const proofData = Buffer.alloc(256);
  
  // A (64 bytes): x || y
  const aX = BigInt(proof.pi_a[0]);
  const aY = BigInt(proof.pi_a[1]);
  bigIntToBytes32(aX).copy(proofData, 0);
  bigIntToBytes32(aY).copy(proofData, 32);
  
  // B (128 bytes): x_imag || x_real || y_imag || y_real
  // pi_b = [[x0, x1], [y0, y1], [1, 0]]
  // x0 = real, x1 = imaginary
  const bX0 = BigInt(proof.pi_b[0][0]); // x real
  const bX1 = BigInt(proof.pi_b[0][1]); // x imaginary
  const bY0 = BigInt(proof.pi_b[1][0]); // y real
  const bY1 = BigInt(proof.pi_b[1][1]); // y imaginary
  
  bigIntToBytes32(bX1).copy(proofData, 64);  // x_imag first
  bigIntToBytes32(bX0).copy(proofData, 96);  // x_real
  bigIntToBytes32(bY1).copy(proofData, 128); // y_imag first
  bigIntToBytes32(bY0).copy(proofData, 160); // y_real
  
  // C (64 bytes): x || y
  const cX = BigInt(proof.pi_c[0]);
  const cY = BigInt(proof.pi_c[1]);
  bigIntToBytes32(cX).copy(proofData, 192);
  bigIntToBytes32(cY).copy(proofData, 224);
  
  console.log("\nPacked proof (256 bytes):");
  console.log("A:", proofData.slice(0, 64).toString('hex'));
  console.log("B:", proofData.slice(64, 192).toString('hex'));
  console.log("C:", proofData.slice(192, 256).toString('hex'));

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

  console.log("\n=== Accounts ===");
  console.log("Pool:", poolConfig.toString());
  console.log("Merkle Tree:", merkleTree.toString());
  console.log("Asset Vault:", assetVault.toString());
  console.log("Deposit VK:", depositVk.toString());
  console.log("User Token:", userTokenAccount.toString());
  console.log("Vault Token:", vaultTokenAccount.toString());

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

  console.log("\n=== Submitting Transaction ===");
  
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

    console.log("✅ Deposit TX:", tx);
  } catch (err) {
    console.log("❌ Transaction failed:", err.message);
    
    // Try to get simulation logs
    if (err.logs) {
      console.log("\n=== Program Logs ===");
      err.logs.forEach(log => console.log(log));
    }
  }
}

main().catch(console.error);
