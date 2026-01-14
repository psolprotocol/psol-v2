const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");

function derivePoolPdas(authority) {
  const [poolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_v2"), authority.toBuffer()],
    PROGRAM_ID
  );
  const [merkleTree] = PublicKey.findProgramAddressSync(
    [Buffer.from("merkle_tree_v2"), poolConfig.toBuffer()],
    PROGRAM_ID
  );
  const [relayerRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("relayer_registry"), poolConfig.toBuffer()],
    PROGRAM_ID
  );
  const [complianceConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("compliance"), poolConfig.toBuffer()],
    PROGRAM_ID
  );
  return { poolConfig, merkleTree, relayerRegistry, complianceConfig };
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/psol_privacy_v2.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const authority = provider.wallet.publicKey;
  const pdas = derivePoolPdas(authority);

  console.log("Authority:", authority.toString());
  console.log("Pool Config:", pdas.poolConfig.toString());
  console.log("Merkle Tree:", pdas.merkleTree.toString());

  const poolAccount = await provider.connection.getAccountInfo(pdas.poolConfig);
  if (poolAccount) {
    console.log("Pool already exists!");
    return;
  }

  const treeDepth = 20;
  const rootHistorySize = 100;

  const tx = await program.methods
    .initializePoolV2(treeDepth, rootHistorySize)
    .accounts({
      authority,
      poolConfig: pdas.poolConfig,
      merkleTree: pdas.merkleTree,
      relayerRegistry: pdas.relayerRegistry,
      complianceConfig: pdas.complianceConfig,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Pool initialized! Tx:", tx);
  console.log("Pool Config:", pdas.poolConfig.toString());
}

main().catch(console.error);
