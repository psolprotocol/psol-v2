# pSOL v2 Protocol Audit Report - Investor Demo Readiness

**Date:** 2026-01-09
**Scope:** ZK Proof Verification, SDK Integration, Security, Demo Flow
**Status:** AUDIT ONLY - No changes made

---

## Executive Summary

This audit identifies critical issues preventing successful investor demos of the pSOL v2 Multi-Asset Shielded Pool (MASP) protocol. The primary blocker causing CryptographyError (6009/0x1779) is the SDK using SHA256 instead of Keccak256 for asset ID computation.

| Severity | Count | Demo Impact |
|----------|-------|-------------|
| CRITICAL | 3 | Blocks demo |
| HIGH | 5 | Should fix |
| MEDIUM | 6 | Nice to have |
| LOW | 5 | Future work |

---

## CRITICAL ISSUES (Demo Blockers)

### C-1: SDK Asset ID Uses SHA256 Instead of Keccak256

**Location:** `sdk/src/pda.ts:240-250`
**Impact:** Asset ID mismatch causes ALL proof verifications to fail

```typescript
// CURRENT (BROKEN):
const hash = crypto.createHash('sha256').update(input).digest();

// REQUIRED:
import { keccak_256 } from '@noble/hashes/sha3';
return keccak_256(input);
```

**Why This Breaks:**
- Client computes: `asset_id = SHA256(mint_address)`
- On-chain expects: `asset_id = Keccak256(mint_address)`
- Proof public inputs contain wrong asset_id
- Groth16 verification fails with error 6009

### C-2: Relayer pubkeyToScalar Mismatch

**Location:** `relayer/src/index.ts:838-845`
**Impact:** Relayer proof verification fails for ALL withdrawals

```typescript
// RELAYER (WRONG):
function pubkeyToScalar(pubkey: PublicKey): bigint {
  const bytes = pubkey.toBytes();
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result % BN254_FIELD_ORDER;  // Uses all 32 bytes + modulo
}

// SDK & ON-CHAIN (CORRECT):
function pubkeyToScalar(pubkey: PublicKey): bigint {
  const bytes = pubkey.toBytes();
  const scalarBytes = new Uint8Array(32);
  scalarBytes.set(bytes.slice(0, 31), 1);  // 0x00 || first 31 bytes
  // ...convert to bigint
}
```

### C-3: Website Code Not Available for Audit

**Location:** N/A (expected at `/Users/nazifaseyidbeyli/Downloads/pSol-website.zip`)
**Impact:** Cannot verify client-side proof generation, G2 encoding, or UX flows

---

## HIGH PRIORITY ISSUES

### H-1: SDK Deposit Returns Hardcoded leafIndex

**Location:** `sdk/src/client.ts:268-270`
**Impact:** Applications cannot track note positions for withdrawals

```typescript
return {
  signature: tx,
  leafIndex: 0, // TODO: Parse from logs  <-- HARDCODED!
};
```

### H-2: Misleading G2 Comment in mod.rs

**Location:** `programs/psol-privacy-v2/src/crypto/mod.rs:14-15`
**Finding:** Comment says `(x_c0 || x_c1 || y_c0 || y_c1)` but actual format is opposite

### H-3: Relayer Program Never Initialized

**Location:** `relayer/src/index.ts:192`
**Finding:** `this.program = null as any` and never actually initialized in start()

### H-4: Missing Compute Budget in SDK

**Location:** `sdk/src/client.ts`
**Finding:** No ComputeBudgetProgram instructions added; Groth16 needs ~350,000 CU

### H-5: Weak Random Field Element Generation

**Location:** `sdk/src/crypto/poseidon.ts:136-144`
**Finding:** Clears top 3 bits instead of proper rejection sampling

---

## MEDIUM PRIORITY ISSUES

| ID | Location | Issue |
|----|----------|-------|
| M-1 | Multiple files | `any` types for circomlibjs/snarkjs |
| M-2 | `Anchor.toml:8-15` | Same program ID for all clusters |
| M-3 | `sdk/src/pda.ts:250-254` | Unhelpful error messages |
| M-4 | `scripts/ts/provision-vks.ts:12` | Hardcoded program ID |
| M-5 | `relayer/src/index.ts:556-558` | No asset ID derivation validation |
| M-6 | `sdk/src/note/note.ts:300-370` | NoteStore has no persistence |

---

## LOW PRIORITY ISSUES

| ID | Location | Issue |
|----|----------|-------|
| L-1 | `sdk/src/types.ts:239` | No URL validation for metadata URIs |
| L-2 | `relayer/src/index.ts:505-510` | Logs sensitive public signals |
| L-3 | `sdk/src/client.ts` | Missing error boundaries |
| L-4 | Multiple files | Console.log without log-level control |
| L-5 | `sdk/src/types.ts:660-665` | Dead code: NATIVE_SOL_ASSET_ID |

---

## ZK PROOF VERIFICATION ANALYSIS

### G2 Byte Encoding Analysis

**snarkjs convention:**
- `pi_b[0]` = x coordinate (Fp2 element)
- `pi_b[1]` = y coordinate (Fp2 element)
- For Fp2: `[c0, c1]` where element = `c0 + c1*u` (c0=real, c1=imaginary)

**VK Provisioning (`provision-vks.ts`):**
```javascript
return [...bigIntToBytes32(x1), ...bigIntToBytes32(x0),
        ...bigIntToBytes32(y1), ...bigIntToBytes32(y0)];
// Result: [x_imag, x_real, y_imag, y_real] ✅
```

**SDK Proof Formatting (`sdk/src/proof/prover.ts`):**
```javascript
const bx0 = BigInt(proof.pi_b[0][1]);  // x_imag at offset 64
const bx1 = BigInt(proof.pi_b[0][0]);  // x_real at offset 96
// Result: [x_imag, x_real, y_imag, y_real] ✅
```

**On-Chain G2 Decoding (`alt_bn128.rs`):**
```rust
let x_c1 = bytes_to_fq(bytes[0..32])?;   // x imaginary
let x_c0 = bytes_to_fq(bytes[32..64])?;  // x real
// Expects: [x_imag, x_real, y_imag, y_real] ✅
```

**VERDICT:** G2 encoding is consistent across all components.

### Public Input Analysis

**Deposit Circuit (`deposit.circom:78`):**
```
signal input commitment;  // public
signal input amount;      // public
signal input asset_id;    // public
// 3 public inputs
```

**VK IC Points (`verification_key.rs:47`):**
```rust
ProofType::Deposit => 4,  // 3 inputs + 1 = 4 IC points ✅
```

**On-Chain Public Inputs (`public_inputs.rs:89-94`):**
```rust
vec![
  self.commitment,             // 32-byte field element
  u64_to_scalar(self.amount),  // u64 → 32-byte BE padded
  self.asset_id,               // 32-byte field element
]
```

### Root Cause of CryptographyError 6009

The proof fails because asset_id computed by SDK differs from on-chain expectation:

1. **SDK computes:** `asset_id = SHA256(mint.toBuffer())`
2. **On-chain computes:** `asset_id = Keccak256(mint.to_bytes())`
3. **Result:** Public inputs mismatch → Proof invalid

---

## Recommended Fix Order

1. **Fix C-1:** Install `@noble/hashes` and implement proper keccak256
2. **Fix C-2:** Update relayer pubkeyToScalar to match SDK
3. **Fix H-1:** Parse leafIndex from DepositMaspEvent logs
4. **Fix H-3:** Initialize Anchor program properly in relayer
5. **Fix H-4:** Add ComputeBudgetProgram to transactions

---

## Files Analyzed

### On-Chain Program
- `programs/psol-privacy-v2/src/crypto/groth16.rs`
- `programs/psol-privacy-v2/src/crypto/groth16_verifier.rs`
- `programs/psol-privacy-v2/src/crypto/alt_bn128.rs`
- `programs/psol-privacy-v2/src/crypto/public_inputs.rs`
- `programs/psol-privacy-v2/src/crypto/mod.rs`
- `programs/psol-privacy-v2/src/instructions/deposit_masp.rs`
- `programs/psol-privacy-v2/src/state/verification_key.rs`
- `programs/psol-privacy-v2/src/error.rs`

### TypeScript SDK
- `sdk/src/client.ts`
- `sdk/src/proof/prover.ts`
- `sdk/src/note/note.ts`
- `sdk/src/pda.ts`
- `sdk/src/types.ts`
- `sdk/src/crypto/poseidon.ts`

### Relayer
- `relayer/src/index.ts`

### Scripts
- `scripts/ts/provision-vks.ts`

### Circuits
- `circuits/deposit/deposit.circom`

### Configuration
- `Anchor.toml`

---

## Conclusion

The pSOL v2 protocol has a well-structured codebase with proper G2 encoding. The critical blocker is the SDK using SHA256 instead of Keccak256 for asset ID computation. Fixing this single issue should resolve the CryptographyError 6009 for direct deposits. The relayer pubkeyToScalar mismatch must also be fixed for relayed withdrawals to work.

**Estimated fix time:** 1-2 hours for critical issues, 4-6 hours for all high priority items.
