# Security Review

This document details the findings of the security review, covering the areas requested in the audit prompt.

## 1. Relayer Authentication Model

The current relayer design is **completely open and unauthenticated**, which poses significant operational and denial-of-service risks.

*   **No Signed Requests:** The `/withdraw` endpoint accepts a JSON payload containing proof data and public inputs. This request is not signed. An attacker can submit arbitrary (and likely invalid) proofs, forcing the relayer to perform expensive local proof verification and on-chain nullifier checks.
    *   **File:** `relayer/src/index.ts`
    *   **Function:** `processWithdrawal`
    *   **Vulnerability:** The absence of a signature check on the withdrawal request allows any party to submit requests. This can be abused to drain the relayer's computational resources and RPC credits.

*   **Replay Protection:**
    *   **Mechanism:** The relayer correctly relies on the on-chain nullifier check (`checkNullifierSpent`) to prevent double-spending of a valid note. This is the primary and correct mechanism for replay protection.
    *   **Weakness:** While this protects user funds, it does not protect the relayer. An attacker can repeatedly send the *same valid withdrawal request* to the relayer. Each time, the relayer will perform the expensive `snarkjs.groth16.verify` operation before eventually failing at the on-chain nullifier check (for all but the first request). A simple in-memory cache of recently processed nullifiers could mitigate this specific attack vector.

*   **Recommendation:**
    1.  **Introduce Signed Requests:** The withdrawal request payload should be signed by the recipient's keypair. The relayer would then verify the signature before proceeding with proof verification. This ensures that only the legitimate owner of the funds can request a withdrawal, preventing third-party spam.
    2.  **Implement a Relayer-Side Cache:** Add an in-memory cache (e.g., a `Map` or `Set` with a TTL) to store recently processed nullifier hashes. If a request with a recently seen nullifier is received, it can be rejected immediately without performing the expensive proof verification.

## 2. Access Control

Access control for critical administrative functions is generally well-handled through Anchor's `has_one = authority` constraint, but there are risks associated with the upgrade authority and the VK update process.

*   **Pool Authority:**
    *   **Mechanism:** The `PoolConfigV2` account stores an `authority` field. Most administrative instructions are correctly gated with the `has_one = authority` constraint, ensuring only the designated authority can perform sensitive actions like pausing the pool or updating configurations.
    *   **Example:** `#[account(mut, has_one = authority @ PrivacyErrorV2::Unauthorized)]`
    *   **Assessment:** This is a standard and secure pattern.

*   **Verification Key (VK) Updates:**
    *   **Mechanism:** The `set_verification_key_v2` instruction allows the pool authority to set or update a VK. The `lock_verification_key_v2` instruction allows the authority to make a specific VK immutable.
    *   **Risk:** The ability to *update* a VK before it is locked is a significant, centralized risk. If the pool authority's key is compromised, an attacker could replace a valid VK with a malicious one. This malicious VK could be engineered to accept fraudulent proofs, potentially allowing the attacker to steal funds from the pool by creating proofs that, for example, bypass the nullifier check or allow for the creation of money out of thin air.
    *   **Recommendation:** The operational security of the pool authority key is paramount. For a production deployment, this key should be a multi-sig wallet or held in a hardware security module (HSM). The window between initializing the pool and locking the VKs should be as short as possible.

*   **Upgrade Authority:**
    *   **Risk:** The Solana BPF Upgradeable Loader allows a program's upgrade authority to redeploy the on-chain program at any time. If this key is compromised, an attacker could deploy a malicious version of the pSOL program that siphons funds, bypasses proofs, or introduces other backdoors. The security of the entire protocol and all funds within it ultimately depends on the security of this single key.
    *   **Assessment:** This is an inherent risk in most Solana protocols.
    *   **Recommendation:**
        1.  The upgrade authority should be a robust multi-sig wallet with a high threshold (e.g., 5-of-7).
        2.  Consider using a SPL Governance DAO to control the upgrade authority, requiring a community vote for any program upgrades.
        3.  For maximum trust, the upgrade authority can be permanently burned (set to `11111111111111111111111111111111`), making the program immutable forever. This is a trade-off, as it prevents bug fixes.

## 3. Nullifier Storage Growth and DoS Vectors

The current nullifier design creates a potential for on-chain storage growth that can be exploited for a denial-of-service attack.

*   **Mechanism:** Each withdrawal creates a new `SpentNullifierV2` account, which is a PDA seeded by the pool config and the nullifier hash. This account is created by the relayer, who pays the rent for it.
*   **DoS Vector:** An attacker can generate a vast number of valid-but-distinct nullifier hashes off-chain (by simply using different secrets and leaf indices). They can then create valid withdrawal proofs for these nullifiers. Even if the underlying note doesn't exist in the tree, the proof itself can be valid. The attacker can then spam the relayer with these withdrawal requests.
*   **Attack Flow:**
    1.  Attacker generates 1,000,000 valid proofs for 1,000,000 different nullifiers.
    2.  Attacker sends these proofs to the `/withdraw` endpoint.
    3.  The relayer verifies the proofs locally (which pass) and submits the transactions.
    4.  The on-chain transaction will likely fail because the commitment associated with the proof is not in the Merkle tree. However, the `withdraw_masp` instruction uses `init_if_needed` for the nullifier account. This means that even if the transaction ultimately fails, the nullifier account **may still be created**, and the relayer will have to pay the rent for it.
    5.  This can be used to drain the relayer's SOL balance by forcing it to pay rent for thousands of useless nullifier accounts.
*   **Recommendation:**
    1.  The on-chain `withdraw_masp` instruction should be refactored. The nullifier account should only be created *after* the Merkle proof has been successfully verified. This ensures that rent is only paid for successful withdrawals.
    2.  The relayer should implement stricter rate-limiting, potentially based on the recipient's IP address or other identifying information.

## 4. Token Program Assumptions

The codebase appears to assume it is only interacting with the standard SPL Token program, which could lead to vulnerabilities or incompatibilities with the newer Token-2022 standard.

*   **Evidence:**
    *   The `Cargo.toml` file for the on-chain program likely specifies `spl-token` as a dependency.
    *   The client-side code in `sdk/src/client.ts` imports directly from `@solana/spl-token`.
*   **Risks with Token-2022:** The Token-2022 standard introduces new features called "extensions," such as transfer fees, interest-bearing tokens, and non-transferable tokens.
    *   **Transfer Fees:** If a user registers a Token-2022 mint that has a transfer fee, the `asset_vault` will receive *less* than the expected amount upon deposit. This would cause the internal accounting of the shielded pool to become out of sync with the actual balance held in the token account, leading to a situation where withdrawals could fail due to insufficient funds.
    *   **Non-Transferable Tokens:** Registering a non-transferable token would lock up funds permanently, as the vault would be unable to transfer them back out.
*   **Recommendation:**
    1.  **Explicitly Disallow Token-2022:** The `register_asset` instruction should check the mint's program owner. If the owner is the Token-2022 program, the registration should be rejected unless the protocol is explicitly designed to handle it.
    2.  **Handle Extensions:** To support Token-2022, the deposit and withdraw instructions would need to be modified to account for potential transfer fees by checking the post-transfer balance and adjusting the internal accounting accordingly.

## 5. Privacy Limitations on Solana

While pSOL provides a significant privacy improvement, the public nature of the Solana blockchain still exposes certain metadata that can be used to deanonymize users.

*   **Visible Metadata:**
    *   **Deposit/Withdrawal Amounts:** While the *link* between a deposit and a withdrawal is broken, the amounts themselves are public. An adversary can see that `10.123 SOL` was deposited at one time and `10.123 SOL` was withdrawn at another. If these amounts are unique, they can be easily linked.
    *   **Transaction Timestamps:** The timestamps of deposit and withdrawal transactions are public. If a user deposits and then withdraws within a short time frame, it can be a strong indicator that the two transactions are related.
    *   **IP Address:** The relayer knows the IP address of the user submitting the withdrawal request. A malicious relayer could log this information and link it to the recipient's on-chain address.
    *   **Relayer Fee:** The relayer fee is public and can be used as another data point to link deposits and withdrawals.
    *   **Token Type:** All transactions are for a specific token type. If a user is the only one transacting in a particular altcoin, their privacy is significantly reduced.

*   **Recommendation:**
    1.  **Use Standardized Amounts:** The user interface should encourage users to deposit and withdraw in standardized amounts (e.g., 1, 10, 100 SOL) to make it harder to link transactions by amount.
    2.  **Time Obfuscation:** The UI should advise users to wait a significant amount of time between depositing and withdrawing.
    3.  **TOR/VPN for Relayer:** Privacy-conscious users should be advised to use TOR or a VPN when submitting requests to the relayer to hide their IP address.
    4.  **Batching/Anonymity Set:** The privacy guarantees of the protocol are directly proportional to the number of users and the volume of transactions (the "anonymity set"). The protocol is most effective when there are many deposits and withdrawals happening for the same asset in standardized amounts.
