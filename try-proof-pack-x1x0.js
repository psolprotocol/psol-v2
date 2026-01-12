// try-proof-pack-x1x0.js
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
} = require("@solana/spl-token");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { keccak256 } = require("js-sha3");
const { buildPoseidon } = require("circomlibjs");

function bigIntToBytes32(bi) {
  const hex = bi.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

async function main() {
  const kpPath = process.env.HOME + "/.config/solana/test-authority.json";
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf-8"))));

  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { commitment: "confirmed" });

  const idl = JSON.parse(fs.readFileSync("./target/idl/psol_privacy_v2.json", "utf-8"));
  const programId = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
  const program = new anchor.Program(idl, programId, provider);

  // assetId
  const mint = NATIVE_MINT;
  const prefix = Buffer.from("psol:asset_id:v1");
  const input = Buffer.concat([prefix, mint.toBuffer()]);
  const hashBytes = new Uint8Array(keccak256.arrayBuffer(input));
  const assetIdBytes = new Uint8Array(32);
  assetIdBytes[0] = 0;
  assetIdBytes.set(hashBytes.slice(0, 31), 1);

  let assetIdBig = 0n;
  for (const b of assetIdBytes) assetIdBig = (assetIdBig << 8n) + BigInt(b);

  // fixed note
  const poseidon = await buildPoseidon();
  const secret = 12345678901234567890123456789012345678901234567890n;
  const nullifier = 98765432109876543210987654321098765432109876543210n;
  const amount = 100000000n;
  const commitment = BigInt(poseidon.F.toObject(poseidon([secret, nullifier, amount, assetIdBig])));

  const commitmentBytes = Buffer.from(commitment.toString(16).padStart(64, "0"), "hex");

  // proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      amount: amount.toString(),
      asset_id: assetIdBig.toString(),
      commitment: commitment.toString(),
    },
    "./circuits/build/deposit_js/deposit.wasm",
    "./circuits/build/deposit.zkey"
  );

  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  const ok = await snarkjs.groth16.verify(vkJson, publicSignals, proof);
  console.log("Local verification:", ok ? "✅ PASSED" : "❌ FAILED");
  if (!ok) throw new Error("local verify failed, stop");

  // pack proof: A ok, C ok, B = x1|x0|y1|y0
  const proofData = Buffer.alloc(256);
  bigIntToBytes32(BigInt(proof.pi_a[0])).copy(proofData, 0);
  bigIntToBytes32(BigInt(proof.pi_a[1])).copy(proofData, 32);

  // IMPORTANT: snarkjs pi_b = [[x0, x1], [y0, y1], ...]
  bigIntToBytes32(BigInt(proof.pi_b[0][1])).copy(proofData, 64);   // x1 (imag)
  bigIntToBytes32(BigInt(proof.pi_b[0][0])).copy(proofData, 96);   // x0 (real)
  bigIntToBytes32(BigInt(proof.pi_b[1][1])).copy(proofData, 128);  // y1 (imag)
  bigIntToBytes32(BigInt(proof.pi_b[1][0])).copy(proofData, 160);  // y0 (real)

  bigIntToBytes32(BigInt(proof.pi_c[0])).copy(proofData, 192);
  bigIntToBytes32(BigInt(proof.pi_c[1])).copy(proofData, 224);

  // PDAs
  const [poolConfig] = PublicKey.findProgramAddressSync([Buffer.from("pool_v2"), authority.publicKey.toBuffer()], programId);
  const [merkleTree] = PublicKey.findProgramAddressSync([Buffer.from("merkle_tree_v2"), poolConfig.toBuffer()], programId);
  const [assetVault] = PublicKey.findProgramAddressSync([Buffer.from("vault_v2"), poolConfig.toBuffer(), Buffer.from(assetIdBytes)], programId);
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from("vault_token"), assetVault.toBuffer()], programId);
  const [depositVk] = PublicKey.findProgramAddressSync([Buffer.from("vk_deposit"), poolConfig.toBuffer()], programId);

  const userTokenAccount = getAssociatedTokenAddressSync(mint, authority.publicKey, false, TOKEN_PROGRAM_ID);

  const pre = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })];

  if (!(await connection.getAccountInfo(userTokenAccount))) {
    pre.push(createAssociatedTokenAccountInstruction(authority.publicKey, userTokenAccount, authority.publicKey, mint));
  }

  pre.push(
    SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: userTokenAccount, lamports: Number(amount) + 10_000 }),
    createSyncNativeInstruction(userTokenAccount)
  );

  console.log("Submitting deposit with B packed as x1|x0|y1|y0...");
  try {
    const tx = await program.methods
      .depositMasp(new anchor.BN(amount.toString()), Array.from(commitmentBytes), Array.from(assetIdBytes), proofData, null)
      .accounts({
        depositor: authority.publicKey,
        poolConfig,
        authority: authority.publicKey,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        userTokenAccount,
        mint,
        depositVk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(pre)
      .signers([authority])
      .rpc();

    console.log("SUCCESS TX:", tx);
  } catch (e) {
    console.log("FAILED:", e.message);
    if (e.logs) e.logs.forEach((l) => console.log(l));
    process.exit(1);
  }
}

main().catch(console.error);
