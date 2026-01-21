import { PublicKey, Connection } from "@solana/web3.js";
const PROGRAM_ID = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
const POOL_CONFIG = new PublicKey("73MzPg5UFz869CA5XWaEFUYDoS8ezzmjtvARJDMkNSgw");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const [merkleTree] = PublicKey.findProgramAddressSync(
    [Buffer.from("merkle_tree"), POOL_CONFIG.toBuffer()], PROGRAM_ID
  );
  
  const mt = await connection.getAccountInfo(merkleTree);
  if (mt) {
    const leafCount = mt.data.readUInt32LE(41);
    console.log("Merkle Tree:", merkleTree.toBase58());
    console.log("Leaf count:", leafCount);
    
    // Read current root (after depth byte and leaf_count)
    // Layout: 8 disc + 32 pool + 1 depth + 4 leaf_count + 32 root
    const rootStart = 8 + 32 + 1 + 4;
    const root = mt.data.slice(rootStart, rootStart + 32);
    console.log("Current root:", Buffer.from(root).toString('hex').slice(0, 32) + "...");
  }
}
main().catch(console.error);
