const crypto = require('crypto');
const snarkjs = require('snarkjs');

function computeHash(commitments, batchSize) {
  const allBits = [];
  for (let i = 0; i < 16; i++) {
    const isActive = i < batchSize;
    const val = isActive ? BigInt(commitments[i]) : 0n;
    const bits = [];
    let v = val;
    for (let b = 0; b < 256; b++) {
      bits.push(Number(v & 1n));
      v >>= 1n;
    }
    bits.reverse();
    allBits.push(...bits);
  }
  const bytes = [];
  for (let i = 0; i < allBits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | allBits[i + b];
    bytes.push(byte);
  }
  const digest = crypto.createHash("sha256").update(Buffer.from(bytes)).digest();
  let H = BigInt("0x" + digest.toString("hex"));
  // FIX: mod 2^253, not >> 3
  return (H & ((1n << 253n) - 1n)).toString();
}

const commitments = Array(16).fill("0");
const jsHash = computeHash(commitments, 4);
console.log("JS hash:", jsHash);

(async () => {
  const input = {
    oldRoot: "0", newRoot: "0", startIndex: "0",
    batchSize: "4", commitmentsHash: jsHash,
    commitments, pathElements: Array(16).fill(Array(20).fill("0")),
  };
  try {
    await snarkjs.groth16.fullProve(input, 'build/merkle_batch_update/merkle_batch_update_js/merkle_batch_update.wasm', 'build/merkle_batch_update/merkle_batch_update_final.zkey');
    console.log("PASSED line 151!");
  } catch(e) {
    console.log("Failed line:", e.message.match(/line: (\d+)/)?.[1]);
  }
})();
