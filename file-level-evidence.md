# File-Level Evidence

## Issue #1: Inconsistent `asset_id` Derivation

*   **On-chain Program (Correct Implementation):**
    *   **File:** `programs/psol-privacy-v2/src/state/asset_vault.rs`
    *   **Function:** `compute_asset_id`
    *   **Logic:** `asset_id = 0x00 || Keccak256("psol:asset_id:v1" || mint)[0..31]`. This includes a domain separator and ensures the result is a valid field element.

*   **SDK (Incorrect Implementation):**
    *   **File:** `sdk/src/crypto/keccak.ts`
    *   **Function:** `deriveAssetId`
    *   **Mismatch:** `return keccak256(mint.toBuffer());`. This is a raw Keccak256 hash without the domain separator or the zero-padding, which will cause it to be rejected by the on-chain program.

## Issue #2: Inconsistent Public Key to Field Element Encoding

*   **SDK/Relayer (Correct Implementation):**
    *   **File:** `relayer/src/index.ts`
    *   **Function:** `pubkeyToScalar`
    *   **Logic:** `return BigInt(bytes) % BN254_FIELD_ORDER;`. This correctly converts the 256-bit public key into a valid ~254-bit field element using a modulo operation.

*   **On-chain Program (Incorrect Implementation):**
    *   **File:** `programs/psol-privacy-v2/src/crypto/encoding.rs`
    *   **Function:** `pubkey_to_be32`
    *   **Mismatch:** `pubkey.to_bytes()`. This is a direct, raw byte copy. It does **not** perform the required modulo operation to ensure the public key is a valid scalar field element. This will cause on-chain proof verification to fail for any public key value that is larger than the field modulus.
