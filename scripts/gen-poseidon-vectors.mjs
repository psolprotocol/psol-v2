/**
 * Generate Poseidon (circomlibjs) golden vectors for on-chain Rust tests.
 *
 * Run (from repo root):
 *   cd sdk
 *   npm install --workspaces=false
 *   node ../scripts/gen-poseidon-vectors.mjs
 *
 * Notes:
 * - This uses `circomlibjs` Poseidon (BN254 Fr), which matches typical circom circuits.
 * - All inputs are interpreted as **field elements** (bigints) and must be canonical (< Fr modulus).
 */

import { buildPoseidon } from "circomlibjs";

function toBytesBE32(x) {
  let v = BigInt(x);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("overflow: value does not fit in 32 bytes");
  return out;
}

function fmt(bytes) {
  return `[${Array.from(bytes).join(", ")}]`;
}

const poseidon = await buildPoseidon();
const F = poseidon.F;

function poseidonHash(inputs) {
  return F.toObject(poseidon(inputs));
}

const v2 = poseidonHash([1n, 2n]);
console.log("poseidon2(1,2) =", v2.toString());
console.log("bytesBE32 =", fmt(toBytesBE32(v2)));
console.log("");

const v4 = poseidonHash([1n, 2n, 3n, 4n]);
console.log("poseidon4(1,2,3,4) =", v4.toString());
console.log("bytesBE32 =", fmt(toBytesBE32(v4)));
console.log("");

const inner = poseidonHash([2n, 1n]);
const nh = poseidonHash([inner, 7n]);
console.log("nullifier_hash(nullifier=2, secret=1, leaf_index=7) =", nh.toString());
console.log("bytesBE32 =", fmt(toBytesBE32(nh)));

