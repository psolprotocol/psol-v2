# pSOL v2 Security Audit & Cross-Component Consistency Report

This report provides a comprehensive analysis of the pSOL v2 codebase, focusing on cross-component inconsistencies, security vulnerabilities, and operational readiness.

## 1. Executive Summary

The audit has identified **three critical "stop-ship" issues** that prevent the protocol from functioning correctly. These issues stem from fundamental inconsistencies between the on-chain program, the TypeScript SDK, and the deployment scripts. Additionally, several significant security vulnerabilities and operational gaps were found that require remediation before a production deployment.

### "Stop-Ship" Issues:

1.  **Inconsistent `asset_id` Derivation:** The SDK and on-chain program use different algorithms to derive an asset's unique identifier, making it impossible to register new assets.
2.  **Inconsistent Public Key Encoding:** The on-chain program fails to correctly map Solana public keys into the finite field required by the zk-SNARK circuits, which will cause all proofs to fail verification.
3.  **Merkle Tree Depth Mismatch:** The circuits are hardcoded for a tree of depth 20, while the deployment script initializes an on-chain tree of depth 4. This incompatibility ensures no withdrawal can ever succeed.

### Key Security Findings:

*   The relayer is unauthenticated, posing a DoS risk.
*   The deployment process is incomplete, failing to provision the necessary verification keys on-chain.
*   The program's upgrade authority and VK management present significant centralization risks.
*   The protocol is not compatible with Token-2022, which could lead to loss of funds.

This report provides detailed evidence for each finding and a minimal patch plan to address the critical issues.

---

## 2. "Stop-Ship" Issues & Patch Plan

These issues must be resolved for the protocol to function end-to-end.

### 2.1. Inconsistent `asset_id` Derivation (SDK Fault)

*   **Problem:** The SDK uses a raw Keccak256 hash, while the on-chain program correctly uses a domain-separated hash to ensure the result is a valid field element.
*   **Impact:** The `register_asset` instruction will always fail.
*   **File-Level Evidence:**
    *   **Correct (On-Chain):** `programs/psol-privacy-v2/src/state/asset_vault.rs` -> `compute_asset_id`
    *   **Incorrect (SDK):** `sdk/src/crypto/keccak.ts` -> `deriveAssetId`
*   **Patch Plan:** The SDK's `deriveAssetId` function must be updated to match the on-chain logic.
    *   **File:** `sdk/src/crypto/keccak.ts`
    *   **Change:**
        ```typescript
        export function deriveAssetId(mint: PublicKey): Uint8Array {
          const hashInput = Buffer.concat([
            Buffer.from("psol:asset_id:v1"),
            mint.toBuffer(),
          ]);
          const digest = keccak_256(hashInput);
          const out = new Uint8Array(32);
          out.set(digest.slice(0, 31), 1);
          return out;
        }
        ```

### 2.2. Inconsistent Public Key Encoding (On-Chain Fault)

*   **Problem:** The on-chain program treats a 256-bit public key as a raw byte array, while the zk-SNARK requires a ~254-bit field element. The SDK/relayer correctly performs a modulo operation to map the key into the field, but the on-chain program does not, causing a mismatch.
*   **Impact:** All proofs will fail on-chain verification.
*   **File-Level Evidence:**
    *   **Correct (SDK/Relayer):** `relayer/src/index.ts` -> `pubkeyToScalar`
    *   **Incorrect (On-Chain):** `programs/psol-privacy-v2/src/crypto/encoding.rs` -> `pubkey_to_be_32`
*   **Patch Plan:** The on-chain `pubkey_to_be32` function must be modified to perform the modulo operation.
    1.  Add `num-bigint` to `programs/psol-privacy-v2/Cargo.toml`.
    2.  Update the function:
        ```rust
        // in programs/psol-privacy-v2/src/crypto/encoding.rs
        pub fn pubkey_to_be32(pubkey: &Pubkey) -> [u8; 32] {
            let modulus = num_bigint::BigUint::from_bytes_be(&BN254_FR_MODULUS);
            let pubkey_as_uint = num_bigint::BigUint::from_bytes_be(&pubkey.to_bytes());
            let result_uint = pubkey_as_uint % modulus;
            let mut result_bytes = result_uint.to_bytes_be();
            let mut out = [0u8; 32];
            out[32-result_bytes.len()..].copy_from_slice(&result_bytes);
            out
        }
        ```

### 2.3. Merkle Tree Depth Mismatch (Circuit/Script Fault)

*   **Problem:** The withdrawal circuit is hardcoded with a depth of 20, while the initialization script creates an on-chain tree of depth 4.
*   **Impact:** All withdrawal proofs will be structurally invalid and fail verification.
*   **File-Level Evidence:**
    *   **Circuit:** `circuits/withdraw/withdraw.circom` -> `component main = Withdraw(20);`
    *   **Script:** `scripts/ts/init-pool.ts` -> `const treeDepth = 4;`
*   **Patch Plan:** The `init-pool.ts` script must be changed to match the circuit's expectation.
    *   **File:** `scripts/ts/init-pool.ts`
    *   **Change:**
        ```typescript
        const treeDepth = 20;
        ```

---

## 3. Operational Readiness Issues

These issues relate to the deployment and operation of the protocol.

### 3.1. Circuit Artifacts Path Mismatches

*   **Problem:** The SDK and Relayer have hardcoded default paths to circuit artifacts (`.wasm`, `.zkey`, `.vkey.json`) that do not match the output paths of the `circuits/build.sh` script.
*   **Impact:** The relayer will fail to start, and the SDK will be unable to generate proofs.
*   **Patch Plan:**
    *   Update the default paths in `relayer/src/index.ts` and `sdk/src/proof/prover.ts` to point to the `circuits/build/` directory and use the correct filenames.

### 3.2. VK Provisioning Process is Incomplete

*   **Problem:** The `README.md` incorrectly states that VKs are embedded. In reality, they must be set via an on-chain transaction. However, the `init-pool.ts` script is missing this crucial step.
*   **Impact:** A newly deployed pool is non-functional as it has no verification keys, and all transactions will be rejected.
*   **Patch Plan:** A new script, `scripts/ts/set-vks.ts`, must be created. This script should:
    1.  Read the `withdraw_vk.json` and `deposit_vk.json` files from the `circuits/build` directory.
    2.  Parse the JSON to extract the VK components.
    3.  Call the `setVerificationKeyV2` instruction on the program for both `Deposit` and `Withdraw` proof types.
    4.  This script must be run immediately after `init-pool.ts`.

---

## 4. Security Vulnerabilities & Recommendations

### 4.1. Relayer is Unauthenticated (DoS Risk)

*   **Vulnerability:** The `/withdraw` endpoint is open, allowing anyone to submit proofs and force the relayer to perform expensive computations.
*   **Recommendation:** Implement signed requests. The user should sign the withdrawal payload, and the relayer should verify the signature before processing.

### 4.2. Access Control & Centralization

*   **Risk:** The program's **upgrade authority** and the pool's **authority** key (which can update VKs) are single points of failure. If compromised, an attacker could steal all funds.
*   **Recommendation:** Both authorities should be controlled by a robust multi-sig wallet or a DAO. The VKs should be locked via the `lockVerificationKeyV2` instruction as soon as they are set.

### 4.3. Nullifier Account Creation (DoS Risk)

*   **Vulnerability:** The `withdraw_masp` instruction creates a nullifier account using `init_if_needed` before the Merkle proof is verified. An attacker could spam the relayer with valid proofs for notes that don't exist, forcing the relayer to pay rent for thousands of useless accounts, draining its SOL.
*   **Recommendation:** Refactor the on-chain instruction to only initialize the nullifier account *after* the Merkle proof has been successfully verified.

### 4.4. Incompatibility with Token-2022

*   **Vulnerability:** The protocol assumes standard SPL tokens. If a Token-2022 mint with a transfer fee is registered, the pool's internal accounting will desync from the actual vault balance, leading to failed withdrawals.
*   **Recommendation:** The `register_asset` instruction should check the mint's owner and reject Token-2022 mints until the protocol is explicitly designed to handle their extensions.

### 4.5. Privacy Limitations

*   **Issue:** Transaction amounts, timestamps, and the relayer's knowledge of the user's IP address can be used to deanonymize users.
*   **Recommendation:** The client-side UI should strongly encourage the use of standardized amounts (e.g., 1, 10, 100) and advise users to wait between depositing and withdrawing. Users should also be advised to use a VPN or Tor when interacting with the relayer.
