const { Connection, PublicKey } = require("@solana/web3.js");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
const POOL_CONFIG = new PublicKey("DPZe7uST1mBxzVkEm215epHjsM7Sa8VCXHr3pv4eLp8X");

const [depositVk] = PublicKey.findProgramAddressSync(
  [Buffer.from("vk_deposit"), POOL_CONFIG.toBuffer()],
  PROGRAM_ID
);

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  console.log("Deposit VK account:", depositVk.toString());
  
  const accountInfo = await connection.getAccountInfo(depositVk);
  if (!accountInfo) {
    console.log("VK account not found!");
    return;
  }
  
  console.log("Account data length:", accountInfo.data.length);
  
  const localVk = JSON.parse(fs.readFileSync("circuits/build/deposit_vk.json", "utf8"));
  
  const data = accountInfo.data;
  // Correct offset: 8 (discriminator) + 32 (pool) + 1 (proof_type) = 41
  let offset = 8 + 32 + 1;
  
  const alphaG1 = data.slice(offset, offset + 64);
  offset += 64;
  
  const betaG2 = data.slice(offset, offset + 128);
  offset += 128;
  
  const gammaG2 = data.slice(offset, offset + 128);
  offset += 128;
  
  const deltaG2 = data.slice(offset, offset + 128);
  offset += 128;
  
  const icLen = data.readUInt8(offset);
  offset += 1;
  
  console.log("\n=== On-chain alpha_g1 (hex) ===");
  console.log("x:", alphaG1.slice(0, 32).toString('hex'));
  console.log("y:", alphaG1.slice(32, 64).toString('hex'));
  
  function fieldToBytes(value) {
    const bn = BigInt(value);
    const hex = bn.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  
  const localAlphaX = fieldToBytes(localVk.vk_alpha_1[0]);
  const localAlphaY = fieldToBytes(localVk.vk_alpha_1[1]);
  
  console.log("\n=== Local alpha_g1 (hex) ===");
  console.log("x:", localAlphaX.toString('hex'));
  console.log("y:", localAlphaY.toString('hex'));
  
  console.log("\n=== Match? ===");
  console.log("alpha.x matches:", alphaG1.slice(0, 32).equals(localAlphaX));
  console.log("alpha.y matches:", alphaG1.slice(32, 64).equals(localAlphaY));
  console.log("IC length on-chain:", icLen);
  console.log("IC length in local VK:", localVk.IC.length);
}

main().catch(console.error);
