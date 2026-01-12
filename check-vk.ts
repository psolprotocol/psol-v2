import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PsolPrivacyV2 } from "./target/types/psol_privacy_v2";
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import { findPoolConfigPda, findVerificationKeyPda } from "./sdk/src";
import { ProofType } from "./sdk/src/types";

async function main() {
  const authorityKeypairPath = process.env.HOME + "/.config/solana/test-authority.json";
  const authorityKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeypairPath, "utf-8")))
  );
  
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(authorityKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = anchor.workspace.PsolPrivacyV2 as Program<PsolPrivacyV2>;
  
  const [poolConfig] = findPoolConfigPda(program.programId, authorityKeypair.publicKey);
  const [depositVk] = findVerificationKeyPda(program.programId, poolConfig, ProofType.Deposit);
  
  console.log("Deposit VK PDA:", depositVk.toString());
  
  const vkAccount = await program.account.verificationKeyAccountV2.fetch(depositVk);
  
  console.log("\n=== VK Account State ===");
  console.log("Pool:", vkAccount.pool.toString());
  console.log("Proof Type:", vkAccount.proofType);
  console.log("Is Initialized:", vkAccount.isInitialized);
  console.log("Is Locked:", vkAccount.isLocked);
  console.log("IC Length:", vkAccount.vkIcLen);
  console.log("Set At:", new Date(vkAccount.setAt.toNumber() * 1000).toISOString());
  
  // Show first few bytes of VK components
  console.log("\nAlpha G1 (first 16 bytes):", Buffer.from(vkAccount.vkAlphaG1).slice(0, 16).toString('hex'));
  console.log("Beta G2 (first 16 bytes):", Buffer.from(vkAccount.vkBetaG2).slice(0, 16).toString('hex'));
}

main().catch(console.error);
