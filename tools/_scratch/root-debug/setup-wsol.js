// setup-wsol.js - One-time wSOL ATA setup (run before deposit)
const anchor = require("@coral-xyz/anchor");
const { Keypair, SystemProgram } = require("@solana/web3.js");
const { NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const fs = require("fs");

(async () => {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/test-authority.json", "utf8"))));
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const userTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, kp.publicKey, false, TOKEN_PROGRAM_ID);

  const ix = [];
  const info = await connection.getAccountInfo(userTokenAccount);
  if (!info) {
    console.log("Creating wSOL ATA...");
    ix.push(createAssociatedTokenAccountInstruction(kp.publicKey, userTokenAccount, kp.publicKey, NATIVE_MINT));
  } else {
    console.log("wSOL ATA already exists");
  }

  // Wrap 0.2 SOL for multiple tests
  const lamports = 200_000_000;
  console.log("Wrapping 0.2 SOL...");
  ix.push(
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: userTokenAccount, lamports }),
    createSyncNativeInstruction(userTokenAccount)
  );

  const tx = new anchor.web3.Transaction().add(...ix);
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(kp);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ setup-wsol tx:", sig);
  console.log("   wSOL ATA:", userTokenAccount.toBase58());
  
  // Check balance
  const balance = await connection.getTokenAccountBalance(userTokenAccount);
  console.log("   Balance:", balance.value.uiAmount, "wSOL");
})();
