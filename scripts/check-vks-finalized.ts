import * as anchor from "@coral-xyz/anchor";
import fs from "fs";

const POOL_CONFIG = new anchor.web3.PublicKey("J92qBrNomkSQ6tjmjbh7rVk2T8R6e6yxkGbB7jQirRRX");

const VKS = [
  { name: "deposit",      addr: new anchor.web3.PublicKey("HJ9SNjUxSdq3zgdkQN6Uv1MchSyagbTpyXy4XpL8tvPF"), expectedIc: 4 },
  { name: "withdraw",     addr: new anchor.web3.PublicKey("9YsvL8ZZBg82mu1eFjWXJUUsRwy12woBKAaZ2HTcM8p4"), expectedIc: 9 },
  { name: "merkle_batch", addr: new anchor.web3.PublicKey("7wb5gBid6Xyb1MJ8gLRiYN3faFAWj9ocsHQbWLq99bdN"), expectedIc: 6 },
];

(async () => {
  const idl = JSON.parse(fs.readFileSync("target/idl/psol_privacy_v2.json", "utf8"));
  const coder = new anchor.BorshAccountsCoder(idl);

  const connection = new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL!, "confirmed");

  for (const vk of VKS) {
    const info = await connection.getAccountInfo(vk.addr, "confirmed");
    if (!info?.data) throw new Error(`${vk.name}: missing account ${vk.addr.toBase58()}`);

    const acc: any = coder.decode("VerificationKeyAccountV2", info.data);

    const pool = acc.pool?.toBase58?.() ?? String(acc.pool);
    const icLen = Number(acc.vk_ic_len);
    const icVecLen = Array.isArray(acc.vk_ic) ? acc.vk_ic.length : -1;

    const okPool = pool === POOL_CONFIG.toBase58();
    const okIc = icLen === vk.expectedIc && icVecLen === vk.expectedIc;

    console.log(
      vk.name,
      vk.addr.toBase58(),
      "poolOK=",
      okPool,
      "initialized=",
      acc.is_initialized,
      "locked=",
      acc.is_locked,
      "vk_ic_len=",
      icLen,
      "vk_ic_vec_len=",
      icVecLen,
      "IC_OK=",
      okIc
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
