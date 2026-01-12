const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
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

  // Create note with FIXED values for reproducibility
  const poseidon = await buildPoseidon();
  const secret = BigInt("12345678901234567890123456789012345678901234567890");
  const nullifier = BigInt("98765432109876543210987654321098765432109876543210");
  const amount = BigInt(100000000);
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  console.log("=== Fixed Test Values ===");
  console.log("Secret:", secret.toString());
  console.log("Nullifier:", nullifier.toString());
  console.log("Amount:", amount.toString());
  console.log("AssetId:", assetIdBigInt.toString());
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
  
  console.log("\nGenerating ZK proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  console.log("Public signals:", publicSignals);
  
  // Verify locally
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");

  // Now let's examine the EXACT proof values
  console.log("\n=== RAW PROOF VALUES FROM SNARKJS ===");
  console.log("pi_a[0]:", proof.pi_a[0]);
  console.log("pi_a[1]:", proof.pi_a[1]);
  console.log("pi_a[2]:", proof.pi_a[2], "(should be '1')");
  console.log("\npi_b[0][0]:", proof.pi_b[0][0], "(this is IMAG based on test)");
  console.log("pi_b[0][1]:", proof.pi_b[0][1], "(this is REAL based on test)");
  console.log("pi_b[1][0]:", proof.pi_b[1][0], "(this is IMAG)");
  console.log("pi_b[1][1]:", proof.pi_b[1][1], "(this is REAL)");
  console.log("pi_b[2]:", proof.pi_b[2], "(should be ['1', '0'])");
  console.log("\npi_c[0]:", proof.pi_c[0]);
  console.log("pi_c[1]:", proof.pi_c[1]);

  // Pack proof - VERSION 1: No negation, snarkjs [0][0]=imag format
  const proofData = Buffer.alloc(256);
  
  // A: x || y (no negation - on-chain does it)
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);
  
  // B: snarkjs confirmed [0][0]=imag, [0][1]=real
  // Solana wants: x_imag | x_real | y_imag | y_real
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 64);   // x_imag
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 96);   // x_real
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 128);  // y_imag
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 160);  // y_real
  
  // C: x || y
  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);

  console.log("\n=== ENCODED PROOF (256 bytes) ===");
  console.log("A (0-63):", proofData.slice(0, 64).toString('hex'));
  console.log("B (64-191):", proofData.slice(64, 192).toString('hex'));
  console.log("C (192-255):", proofData.slice(192, 256).toString('hex'));
  console.log("Total length:", proofData.length);

  // Check what the IDL expects for the proof parameter
  console.log("\n=== IDL Check ===");
  const depositIx = idl.instructions.find(ix => ix.name === 'depositMasp');
  if (depositIx) {
    const proofArg = depositIx.args.find(a => a.name === 'proof');
    console.log("Proof argument type:", JSON.stringify(proofArg));
  }

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

  // Build transaction with extra compute budget for debugging
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

  console.log("\n=== Submitting Deposit ===");
  
  try {
    const tx = await program.methods
      .depositMasp(
        new anchor.BN(amount.toString()),
        Array.from(commitmentBytes),
        Array.from(assetIdBytes),
        proofData,  // Pass as Buffer directly
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

    console.log("\n🎉 SUCCESS! TX:", tx);
    
  } catch (err) {
    console.log("\n❌ Failed:", err.message);
    
    // Try to get more details
    if (err.logs) {
      console.log("\n=== Full Logs ===");
      err.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
    
    // Also try simulating to get more info
    console.log("\n=== Attempting simulation for more details ===");
  }
}

main().catch(console.error);
