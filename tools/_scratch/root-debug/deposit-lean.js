/**
 * pSOL v2 Groth16 Deposit - LEAN VERSION
 * 
 * Prerequisites: Run setup-wsol.js first to create ATA and wrap SOL
 * This script only does: Groth16 verify + transfer + merkle insert
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  console.log("=".repeat(70));
  console.log("pSOL v2 Groth16 Deposit - LEAN (no ATA setup)");
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
const POOL_AUTHORITY = new PublicKey("8p3kSuCyDcRYJcgVkhZbKpshNpyeSs6Eu8dYeZnbvecL");
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
  
  // EIP-197 G2 encoding: | x_real | x_imag | y_real | y_imag |
  function g2PointToBytes_EIP197(point) {
    const x_imag = BigInt(point[0][0]);
    const x_real = BigInt(point[0][1]);
    const y_imag = BigInt(point[1][0]);
    const y_real = BigInt(point[1][1]);
    
    return Buffer.concat([
      bigIntToBytes32(x_real),
      bigIntToBytes32(x_imag),
      bigIntToBytes32(y_real),
      bigIntToBytes32(y_imag),
    ]);
  }

  // Compute asset ID for wSOL
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

  // Generate proof
  console.log("\n[1] Generating ZK proof...");
  const poseidon = await buildPoseidon();
  const secret = BigInt("12345678901234567890123456789012345678901234567890");
  const nullifier = BigInt("98765432109876543210987654321098765432109876543210");
  const amount = BigInt(100000000); // 0.1 SOL
  
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount, assetIdBigInt])
  );
  
  const commitmentHex = commitment.toString(16).padStart(64, '0');
  const commitmentBytes = Buffer.from(commitmentHex, 'hex');

  const proofInput = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    asset_id: assetIdBigInt.toString(),
    commitment: commitment.toString(),
  };
  
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    proofInput,
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );
  
  const localValid = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("   Local verification:", localValid ? "✅ PASSED" : "❌ FAILED");

  // Pack proof with EIP-197 G2 encoding
  console.log("\n[2] Packing proof (EIP-197 format)...");
  const proofData = Buffer.alloc(256);
  
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);
  
  // B: EIP-197 format: [0][1] || [0][0] || [1][1] || [1][0]
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 64);
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 96);
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 128);
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 160);
  
  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);

  // Derive PDAs
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), POOL_AUTHORITY.toBuffer()],
    programId
  );
const [pendingBuffer] = PublicKey.findProgramAddressSync(
  [Buffer.from("pending_deposits"), poolConfig.toBuffer()],
  programId
);
  const [depositVk] = PublicKey.findProgramAddressSync(
    [Buffer.from("vk_deposit"), poolConfig.toBuffer()],
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
  
  const userTokenAccount = getAssociatedTokenAddressSync(
    wsolMint,
    authorityKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // Check wSOL balance
  const balance = await connection.getTokenAccountBalance(userTokenAccount);
  console.log("   wSOL balance:", balance.value.uiAmount);
  if (balance.value.uiAmount < 0.1) {
    console.log("❌ Insufficient wSOL balance. Run: node setup-wsol.js");
    return;
  }

  // Submit deposit - ONLY compute budget, no ATA creation
  console.log("\n[3] Submitting deposit...");
console.log("DEBUG_PENDING_BUFFER poolConfig =", poolConfig?.toBase58?.() || poolConfig);
console.log("DEBUG_PENDING_BUFFER pendingBuffer =", pendingBuffer?.toBase58?.() || pendingBuffer);
try {
  const ai = await connection.getAccountInfo(pendingBuffer, "confirmed");
  console.log("DEBUG_PENDING_BUFFER exists =", !!ai, "owner =", ai?.owner?.toBase58?.(), "len =", ai?.data?.length);
  if (ai) console.log("DEBUG_PENDING_BUFFER disc =", Buffer.from(ai.data.subarray(0,8)).toString("hex"));
} catch (e) { console.log("DEBUG_PENDING_BUFFER getAccountInfo failed:", e?.message || e); }
console.log("DEBUG_PENDING_BUFFER expected =", "DPxeTsLkZaWdenw6gqgU7M6arWhKbo99GDVf2gPtM4NH");
const DEBUG_PENDING_BUFFER = true;
  
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
        authority: POOL_AUTHORITY,
      pendingBuffer: pendingBuffer,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        userTokenAccount,
        mint: wsolMint,
        depositVk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
        ])
      .signers([authorityKeypair])
      .rpc();

    console.log("=".repeat(70));
    console.log("🎉🎉🎉 SUCCESS! DEPOSIT COMPLETED! 🎉🎉🎉");
    console.log("=".repeat(70));
    console.log("\nTransaction:", tx);
    console.log("Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
    
  } catch (err) {
    console.log("=".repeat(70));
    console.log("❌ DEPOSIT FAILED");
    console.log("=".repeat(70));
    console.log("\nError:", err.message);
    
    if (err.logs) {
      console.log("\n--- Last 20 Program Logs ---");
      err.logs.slice(-20).forEach((log, i) => {
        console.log(`${i}: ${log}`);
      });
    }
  }
}

main().catch(console.error);
