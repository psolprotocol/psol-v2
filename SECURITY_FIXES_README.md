# pSOL v2 Security Fixes

Critical security fixes for the pSOL v2 privacy protocol.

## Summary of Fixes

| Issue | Severity | Status |
|-------|----------|--------|
| Nullifier DoS Vector | 🔴 Critical | ✅ Fixed |
| Recipient Binding | 🔴 Critical | ✅ Fixed |
| Denomination Enforcement | 🟡 High | ✅ Added |
| Granular Pause Controls | 🟡 High | ✅ Added |

---

## 1. Nullifier DoS Fix (CRITICAL)

### The Problem

The original code used Anchor's `init` constraint for `spent_nullifier`:

```rust
// VULNERABLE - Account created BEFORE proof verification
#[account(
    init,  // ⚠️ Executes during account validation, not in handler!
    payer = relayer,
    space = SpentNullifierV2::LEN,
    seeds = [b"nullifier_v2", pool.as_ref(), nullifier_hash.as_ref()],
    bump,
)]
pub spent_nullifier: Account<'info, SpentNullifierV2>,
```

**Attack Vector:**
1. Attacker submits withdraw with valid `nullifier_hash` but invalid proof
2. Anchor creates the PDA (attacker pays rent)
3. Proof verification fails, transaction reverts... BUT
4. The PDA still exists! (account creation succeeded)
5. Legitimate user can never withdraw with that nullifier

**Result:** Permanent DoS for any nullifier the attacker chooses.

### The Fix

Changed to manual account creation AFTER proof verification:

```rust
// FIXED - UncheckedAccount, created only after proof passes
#[account(mut)]
pub spent_nullifier: UncheckedAccount<'info>,

// In handler, AFTER verify_proof_bytes() succeeds:
create_account(
    CpiContext::new_with_signer(...),
    nullifier_lamports,
    nullifier_space,
    ctx.program_id,
)?;
```

### File: `withdraw_masp.rs`

Replace entire file.

---

## 2. Recipient Binding Fix (CRITICAL)

### The Problem

The `recipient` pubkey was bound in the ZK proof, but there was no constraint ensuring the `recipient_token_account.owner` matched:

```rust
// VULNERABLE - No owner check!
#[account(
    mut,
    constraint = recipient_token_account.mint == asset_vault.mint,
    // Missing: constraint = recipient_token_account.owner == recipient
)]
pub recipient_token_account: Box<Account<'info, TokenAccount>>,
```

**Attack Vector:**
- Relayer submits valid proof with `recipient = Alice`
- But provides `recipient_token_account` owned by Mallory
- Funds go to Mallory, not Alice

### The Fix

Added owner constraint:

```rust
// FIXED - Owner must match recipient in proof
#[account(
    mut,
    constraint = recipient_token_account.mint == asset_vault.mint @ PrivacyErrorV2::InvalidMint,
    constraint = recipient_token_account.owner == recipient @ PrivacyErrorV2::RecipientMismatch,
)]
pub recipient_token_account: Box<Account<'info, TokenAccount>>,
```

### File: `withdraw_masp.rs`

Already included in the fix above.

---

## 3. Denomination Enforcement (Privacy Enhancement)

### The Problem

Variable withdrawal amounts enable correlation attacks:

```
Deposit:  1.234567 SOL at T=0
Withdraw: 1.234567 SOL at T=1
Result:   Obviously the same user!
```

### The Fix

Added configurable denominations to `PoolConfigV2`:

```rust
pub enforce_denominations: bool,
pub denominations: [u64; 8],  // e.g., [0.1, 0.5, 1, 5, 10, 50, 100, 500] SOL

// Validation in withdraw:
if pool_config.enforce_denominations {
    require!(
        pool_config.is_valid_denomination(amount),
        PrivacyErrorV2::InvalidDenomination
    );
}
```

**Privacy Improvement:**
```
Deposit:  1.234567 SOL
Withdraw: 1 SOL (anonymity set: all 1 SOL withdrawals)
Withdraw: 0.1 SOL (anonymity set: all 0.1 SOL withdrawals)
Withdraw: 0.1 SOL (anonymity set: all 0.1 SOL withdrawals)
Remaining: 0.034567 SOL (dust, withdraw later or leave)
```

### Files:
- `pool_config.rs` - Added denomination fields and methods
- `admin/configure_denominations.rs` - New admin instruction

---

## 4. Granular Pause Controls (Safety)

### The Problem

Only global `is_paused` flag - can't pause deposits while allowing withdrawals (emergency exit).

### The Fix

Added separate pause flags:

```rust
pub is_paused: bool,           // Global pause (both)
pub deposits_paused: bool,     // Pause only deposits
pub withdrawals_paused: bool,  // Pause only withdrawals
```

**Use Cases:**
- Security incident: Pause deposits, let users withdraw
- Upgrade migration: Pause withdrawals, let deposits continue to new contract
- Full emergency: Global pause

### Files:
- `pool_config.rs` - Added fields and methods
- `admin/granular_pause.rs` - New admin instructions

---

## Installation

### Step 1: Backup

```bash
cd programs/psol-privacy-v2/src

# Backup existing files
cp instructions/withdraw_masp.rs instructions/withdraw_masp.rs.backup
cp state/pool_config.rs state/pool_config.rs.backup
cp state/spent_nullifier.rs state/spent_nullifier.rs.backup
cp error.rs error.rs.backup
```

### Step 2: Copy Fixed Files

```bash
# From psol-v2-fixes directory:
cp withdraw_masp.rs programs/psol-privacy-v2/src/instructions/
cp deposit_masp.rs programs/psol-privacy-v2/src/instructions/
cp pool_config.rs programs/psol-privacy-v2/src/state/
cp spent_nullifier.rs programs/psol-privacy-v2/src/state/
cp error.rs programs/psol-privacy-v2/src/

# New admin instructions
mkdir -p programs/psol-privacy-v2/src/instructions/admin
cp admin/granular_pause.rs programs/psol-privacy-v2/src/instructions/admin/
cp admin/configure_denominations.rs programs/psol-privacy-v2/src/instructions/admin/
```

### Step 3: Update Module Exports

Add to `instructions/admin/mod.rs`:
```rust
pub mod granular_pause;
pub mod configure_denominations;

pub use granular_pause::*;
pub use configure_denominations::*;
```

Add to `events.rs` (append the contents of `events_additions.rs`):
```rust
// ... existing events ...

// Granular pause events
#[event]
pub struct DepositsPausedV2 { ... }
// etc.
```

### Step 4: Update lib.rs

Add new instructions:
```rust
// In declare_id! program module:

pub fn pause_deposits(ctx: Context<PauseDepositsV2>) -> Result<()> {
    admin::granular_pause::handler_pause_deposits(ctx)
}

pub fn unpause_deposits(ctx: Context<UnpauseDepositsV2>) -> Result<()> {
    admin::granular_pause::handler_unpause_deposits(ctx)
}

pub fn pause_withdrawals(ctx: Context<PauseWithdrawalsV2>) -> Result<()> {
    admin::granular_pause::handler_pause_withdrawals(ctx)
}

pub fn unpause_withdrawals(ctx: Context<UnpauseWithdrawalsV2>) -> Result<()> {
    admin::granular_pause::handler_unpause_withdrawals(ctx)
}

pub fn configure_denominations(
    ctx: Context<ConfigureDenominationsV2>,
    denominations: [u64; 8],
    enforce: bool,
) -> Result<()> {
    admin::configure_denominations::handler_configure_denominations(ctx, denominations, enforce)
}

pub fn set_default_denominations(ctx: Context<ConfigureDenominationsV2>) -> Result<()> {
    admin::configure_denominations::handler_set_default_denominations(ctx)
}
```

### Step 5: Build and Test

```bash
# Build
anchor build

# Test
anchor test
```

---

## Breaking Changes

### PoolConfigV2 Size Changed

The account size increased due to new fields. Existing pools need migration:
- New fields: `deposits_paused`, `withdrawals_paused`, `enforce_denominations`, `denominations[8]`, `denomination_count`

### Withdraw Instruction Accounts

The `spent_nullifier` account changed from `Account<SpentNullifierV2>` to `UncheckedAccount`:
- SDK needs to derive the PDA but not pre-create it
- Relayer pays rent for nullifier account creation

---

## Testing Checklist

- [ ] Valid withdrawal succeeds (proof passes, nullifier created)
- [ ] Invalid withdrawal fails (proof fails, no nullifier created)
- [ ] Replay attack fails (same nullifier rejected)
- [ ] Recipient mismatch fails (wrong token account owner)
- [ ] Invalid denomination fails (when enforced)
- [ ] Granular pause works (deposits paused, withdrawals allowed)
- [ ] Global pause works (both paused)

---

## Security Notes

### Anchor Discriminator

The nullifier account uses Anchor's built-in `Discriminator` trait for the account discriminator. This is automatically implemented for `#[account]` structs and accessed via:

```rust
use anchor_lang::Discriminator;
let disc = SpentNullifierV2::DISCRIMINATOR;
```

This ensures compatibility across Anchor versions.

### Denomination Recommendations

For SOL pools:
```rust
// Good privacy defaults (in lamports)
[
    100_000_000,      // 0.1 SOL
    500_000_000,      // 0.5 SOL
    1_000_000_000,    // 1 SOL
    5_000_000_000,    // 5 SOL
    10_000_000_000,   // 10 SOL
    50_000_000_000,   // 50 SOL
    100_000_000_000,  // 100 SOL
    500_000_000_000,  // 500 SOL
]
```

For stablecoins (6 decimals):
```rust
// USDC denominations
[
    100_000_000,      // $100
    500_000_000,      // $500
    1_000_000_000,    // $1,000
    5_000_000_000,    // $5,000
    10_000_000_000,   // $10,000
    50_000_000_000,   // $50,000
    100_000_000_000,  // $100,000
    0,                // unused
]
```

---

## What's NOT Fixed (Future Work)

1. **Bitmap Nullifier Set** - Current per-nullifier PDA pattern has rent costs. Consider bitmap accumulator for scale.

2. **Timelock on Admin Actions** - VK changes and pause actions are instant. Consider adding timelock.

3. **Timing Privacy** - Withdrawals are immediate. Consider optional delay windows.

4. **VK Versioning** - No explicit version migration path for circuits.

---

## ⚠️ CRITICAL: Encoding Verification

Your friend is absolutely right - **encoding mismatches are the #1 cause of ZK integration failures**.

### New Files for Encoding

| File | Purpose |
|------|---------|
| `encoding.rs` | Rust encoding helpers with documentation |
| `poseidon_real.rs` | Updated Poseidon with explicit encoding docs |
| `tests/encoding-verification.ts` | TypeScript test suite to verify encoding matches |
| `PRE_PRODUCTION_CHECKLIST.md` | Comprehensive checklist before mainnet |

### Before Production, You MUST:

1. **Run the encoding verification tests**:
   ```bash
   cd tests
   npm install circomlibjs snarkjs bn.js
   npx ts-node encoding-verification.ts
   ```

2. **Verify Poseidon outputs match**:
   - `Poseidon(1, 2)` from circomlibjs MUST equal on-chain output
   - If they don't match, your proofs will NEVER verify

3. **Test with real snarkjs proof**:
   - Generate proof with your actual circuit
   - Submit to on-chain program
   - If it fails, check G2 c0/c1 order and endianness

4. **Complete the checklist**: `PRE_PRODUCTION_CHECKLIST.md`

### Common Encoding Pitfalls

| Issue | Symptom | Fix |
|-------|---------|-----|
| G2 c0/c1 swapped | All proofs fail | Swap c0/c1 in conversion |
| Little-endian vs big-endian | All proofs fail | Use big-endian everywhere |
| Bytes vs field elements | Merkle roots don't match | Ensure same interpretation |
| Input >= modulus | Silent corruption | Validate inputs < r |

---

## Questions?

Open an issue or reach out to the pSOL team.
