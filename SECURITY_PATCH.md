# pSOL v2 Security Patch Notes

## Critical Vulnerability: Nullifier DoS Attack

### The Problem
In `withdraw_masp.rs` (lines 124-135), the `spent_nullifier` account uses Anchor's `init` constraint:

```rust
#[account(
    init,
    payer = relayer,
    ...
)]
pub spent_nullifier: Account<'info, SpentNullifierV2>,
```

**Attack vector**: Anchor creates the account BEFORE the handler runs. An attacker can:
1. Submit an invalid proof with any nullifier
2. Account gets created (init runs first)
3. Proof verification fails
4. Account already exists → legitimate withdrawal with that nullifier is permanently blocked

### The Fix (Manual Patch Required)

This requires changing `spent_nullifier` from `Account<SpentNullifierV2>` to `UncheckedAccount`, then creating the account via CPI AFTER proof verification passes.

**Files to modify:**
- `programs/psol-privacy-v2/src/instructions/withdraw_masp.rs`

**Key changes:**
1. Change account type to `UncheckedAccount`
2. Add manual PDA validation
3. Create account via system_program CPI after proof verification
4. Initialize account data manually with Anchor discriminator

This is a significant code change. Contact the development team for the complete patch.

### Additional Security Improvements (Lower Priority)

1. **Recipient Binding**: Add constraint `recipient_token_account.owner == recipient`
2. **Denomination Enforcement**: Requires pool_config changes (breaking)
3. **Granular Pause Controls**: Requires pool_config changes (breaking)

### Encoding Verification (For Production)

Before mainnet, you MUST verify that:
- Poseidon hash outputs match between circomlibjs and on-chain
- G2 point encoding uses correct c0/c1 order for Solana syscalls
- All byte encodings are big-endian

Run `tests/encoding-verification.ts` with real circuit artifacts to verify.
