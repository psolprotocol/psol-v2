const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { keccak256 } = require("js-sha3");
const fs = require("fs");

const POOL_CONFIG = new PublicKey("DPZe7uST1mBxzVkEm215epHjsM7Sa8VCXHr3pv4eLp8X");
const WRAPPED_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const PROGRAM_ID = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");

function computeAssetId(mint) {
  const prefix = Buffer.from("psol:asset_id:v1");
  const combined = Buffer.concat([prefix, mint.toBuffer()]);
  const hash = Buffer.from(keccak256.arrayBuffer(combined));
  const out = Buffer.alloc(32);
  out[0] = 0x00;
  hash.copy(out, 1, 0, 31);
  return out;
}

const assetId = computeAssetId(WRAPPED_SOL_MINT);
console.log("Asset ID:", assetId.toString('hex'));

const [assetVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_v2"), POOL_CONFIG.toBuffer(), assetId],
  PROGRAM_ID
);
const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_token"), assetVault.toBuffer()],
  PROGRAM_ID
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/psol_privacy_v2.json", "utf8"));
  const program = new anchor.Program(idl, provider);
  
  console.log("Authority:", provider.wallet.publicKey.toString());
  console.log("Pool Config:", POOL_CONFIG.toString());
  console.log("Asset Vault:", assetVault.toString());
  
  const tx = await program.methods
    .registerAsset(Array.from(assetId))
    .accounts({
      authority: provider.wallet.publicKey,
      poolConfig: POOL_CONFIG,
      assetVault,
      mint: WRAPPED_SOL_MINT,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  
  console.log("✅ Wrapped SOL registered! Tx:", tx);
}

main().catch(console.error);
