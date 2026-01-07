# Devnet Readiness Checklist (Revised)

This checklist has been updated based on the findings of the security audit. Following these steps in order is critical for a functional deployment.

## Pre-Deployment: Code Fixes

1.  **[ ] Apply Patches:**
    *   **[ ] SDK:** Fix `asset_id` derivation in `sdk/src/crypto/keccak.ts`.
    *   **[ ] On-Chain Program:** Fix public key encoding in `programs/psol-privacy-v2/src/crypto/encoding.rs` and add `num-bigint` dependency.
    *   **[ ] Scripts:** Update Merkle tree depth in `scripts/ts/init-pool.ts` to `20`.
    *   **[ ] SDK/Relayer:** Correct the default paths to circuit artifacts in `sdk/src/proof/prover.ts` and `relayer/src/index.ts`.

2.  **[ ] Create `set-vks.ts` Script:**
    *   Create a new script `scripts/ts/set-vks.ts`.
    *   This script must read `deposit_vk.json` and `withdraw_vk.json` from the `circuits/build` directory.
    *   It must then call the `setVerificationKeyV2` instruction for both `Deposit` and `Withdraw` proof types.

## Deployment Steps

1.  **[ ] Build Circuits:**
    *   `cd circuits && ./build.sh`
    *   Verify that `circuits/build/` contains the `.wasm`, `.zkey`, and `_vk.json` files.

2.  **[ ] Build and Deploy On-Chain Program:**
    *   `anchor build`
    *   `anchor deploy --provider.cluster devnet`
    *   Note the deployed Program ID.

3.  **[ ] Configure Environment:**
    *   Set `ANCHOR_PROVIDER_URL` to the desired devnet RPC.
    *   Set `ANCHOR_WALLET` to the path of the pool authority keypair.

4.  **[ ] Initialize Pool:**
    *   `npx ts-node scripts/ts/init-pool.ts`
    *   Record the `poolConfig` address from the output.

5.  **[ ] Set Verification Keys (CRITICAL):**
    *   Update the `set-vks.ts` script with the correct `poolConfig` address.
    *   `npx ts-node scripts/ts/set-vks.ts`
    *   This step is **mandatory** for the pool to be functional.

6.  **[ ] Lock Verification Keys (Recommended):**
    *   Create a script to call the `lockVerificationKeyV2` instruction for both `Deposit` and `Withdraw` types.
    *   Run the script to make the VKs immutable, enhancing security.

## Post-Deployment: End-to-End Test

1.  **[ ] Register an Asset:**
    *   Run a script to call `registerAsset` for a devnet SPL token (e.g., wSOL or a dummy token).

2.  **[ ] Perform a Shielded Deposit:**
    *   Use the SDK to create a note.
    *   Generate a deposit proof.
    *   Call the `depositMasp` instruction.
    *   Verify the transaction succeeds.

3.  **[ ] Perform a Shielded Withdrawal:**
    *   Start the relayer, ensuring it's configured with the correct program ID, pool config, and VK path.
    *   Use the SDK to generate a withdrawal proof.
    *   Call the `withdrawMasp` instruction via the relayer.
    *   Verify the transaction succeeds and the funds are received in the recipient's account.
