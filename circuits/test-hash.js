const snarkjs = require('snarkjs');
const crypto = require('crypto');

const wasm = 'build/merkle_batch_update/merkle_batch_update_js/merkle_batch_update.wasm';
const zkey = 'build/merkle_batch_update/merkle_batch_update_final.zkey';

// Test: what hash does circuit expect for 4 zeros?
const commitments = Array(16).fill("0");
const batchSize = 4;

// Our JS implementation
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
  let result = BigInt("0x" + digest.toString("hex"));
  return (result >> 3n).toString();
}

const jsHash = computeHash(commitments, batchSize);
console.log("JS hash:", jsHash);

// Try with this hash
(async () => {
  const input = {
    oldRoot: "0", newRoot: "0", startIndex: "0",
    batchSize: batchSize.toString(),
    commitmentsHash: jsHash,
    commitments,
    pathElements: Array(16).fill(Array(20).fill("0")),
  };
  try {
    await snarkjs.groth16.fullProve(input, wasm, zkey);
    console.log("PASSED line 151!");
  } catch(e) {
    const line = e.message.match(/line: (\d+)/)?.[1];
    console.log("Failed line:", line);
    if (line === "151") console.log("Hash still wrong");
  }
})();
