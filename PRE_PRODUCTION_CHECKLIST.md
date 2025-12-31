# pSOL v2 Pre-Production Checklist

## ⚠️ DO NOT DEPLOY TO MAINNET UNTIL ALL ITEMS ARE CHECKED ⚠️

---

## 1. Build Configuration

- [ ] **Anchor version matches**: Your project uses `anchor-lang = "0.30.1"` 
      (DO NOT copy Cargo.toml from fixes, just add the optional deps)
      
- [ ] **Production crypto enabled**: Build with `--features production-crypto`
      ```bash
      anchor build -- --features production-crypto
      ```
      
- [ ] **insecure-dev blocked**: Verify release build fails with `insecure-dev`
      ```bash
      anchor build --release -- --features insecure-dev
      # Should fail with compile_error!
      ```

- [ ] **Binary size acceptable**: Check program is < 200KB for BPF
      ```bash
      ls -la target/deploy/psol_privacy_v2.so
      ```

---

## 2. Encoding Verification (CRITICAL)

### 2.1 Poseidon Hash Verification

- [ ] **Run encoding verification test**:
      ```bash
      cd tests
      npm install circomlibjs snarkjs
      npx ts-node encoding-verification.ts
      ```

- [ ] **Verify Poseidon(1, 2)**: 
      - circomlibjs output: `________________` (fill in)
      - on-chain output: `________________` (fill in)
      - **MUST MATCH**

- [ ] **Verify commitment computation**:
      - Off-chain: `H(secret, nullifier, amount, asset_id) = ________________`
      - On-chain: same inputs produces `________________`
      - **MUST MATCH**

### 2.2 Merkle Tree Verification

- [ ] **Verify Merkle 2-to-1 hash**:
      - Off-chain: `H(left, right) = ________________`
      - On-chain: same inputs produces `________________`
      - **MUST MATCH**

- [ ] **Verify Merkle root**:
      - Build tree off-chain with test leaves
      - Compute root on-chain with same leaves
      - **MUST MATCH**

### 2.3 Proof Encoding

- [ ] **G1 point encoding**: Verify 64 bytes = x (32 BE) || y (32 BE)

- [ ] **G2 point encoding**: Verify 128 bytes = x_c1 || x_c0 || y_c1 || y_c0
      - ⚠️ Note: snarkjs outputs c0 before c1, must swap!

- [ ] **Proof layout**: Verify 256 bytes = A (64) || B (128) || C (64)

---

## 3. End-to-End Proof Verification

### 3.1 Generate Test Artifacts

```bash
# 1. Compile your circuit
circom withdraw.circom --r1cs --wasm --sym

# 2. Generate trusted setup (use real ceremony for mainnet!)
snarkjs groth16 setup withdraw.r1cs pot12_final.ptau withdraw_0000.zkey

# 3. Export verification key
snarkjs zkey export verificationkey withdraw_0000.zkey verification_key.json

# 4. Generate a test proof
snarkjs groth16 prove withdraw_0000.zkey witness.wtns proof.json public.json

# 5. Verify off-chain (should pass)
snarkjs groth16 verify verification_key.json public.json proof.json
```

### 3.2 On-Chain Verification Tests

- [ ] **Valid proof passes**:
      ```typescript
      const tx = await program.methods.withdrawMasp(
        proofBytes,  // from snarkjs, properly encoded
        merkleRoot,
        nullifierHash,
        recipient,
        amount,
        assetId,
        relayerFee
      ).accounts({...}).rpc();
      // Should succeed
      ```

- [ ] **Tampered proof fails**:
      ```typescript
      const tamperedProof = [...proofBytes];
      tamperedProof[0] ^= 0x01;  // Flip one bit
      // Should fail with InvalidProof
      ```

- [ ] **Wrong public inputs fail**:
      ```typescript
      const wrongAmount = amount + 1n;
      // Should fail with InvalidProof
      ```

- [ ] **Replay attack fails**:
      ```typescript
      // Submit same nullifier twice
      // Second should fail with NullifierAlreadySpent
      ```

- [ ] **Invalid nullifier PDA fails**:
      ```typescript
      // Submit with wrong nullifier PDA
      // Should fail with InvalidNullifierPda
      ```

---

## 4. Security Fixes Verification

### 4.1 Nullifier DoS Fix

- [ ] **Attack vector blocked**:
      ```typescript
      // Submit invalid proof with valid nullifier
      // Transaction should FAIL
      // Nullifier PDA should NOT exist after failure
      const info = await connection.getAccountInfo(nullifierPda);
      assert(info === null);  // Account must not exist
      ```

### 4.2 Recipient Binding

- [ ] **Mismatch rejected**:
      ```typescript
      // Create proof with recipient = Alice
      // But provide recipientTokenAccount owned by Bob
      // Should fail with RecipientMismatch
      ```

### 4.3 Denomination Enforcement

- [ ] **Invalid denomination rejected** (when enabled):
      ```typescript
      await program.methods.setDefaultDenominations().accounts({...}).rpc();
      
      // Try to withdraw 1.5 SOL (not a valid denomination)
      // Should fail with InvalidDenomination
      ```

- [ ] **Valid denomination passes**:
      ```typescript
      // Withdraw exactly 1 SOL (valid denomination)
      // Should succeed
      ```

### 4.4 Granular Pause

- [ ] **Deposits paused, withdrawals work**:
      ```typescript
      await program.methods.pauseDeposits().accounts({...}).rpc();
      
      // Deposit should fail with DepositsPaused
      // Withdrawal should succeed
      ```

- [ ] **Withdrawals paused, deposits work**:
      ```typescript
      await program.methods.pauseWithdrawals().accounts({...}).rpc();
      
      // Withdrawal should fail with WithdrawalsPaused
      // Deposit should succeed
      ```

---

## 5. Compute Budget

- [ ] **Profile CU usage**:
      ```typescript
      const tx = await program.methods.withdrawMasp(...)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
        ])
        .accounts({...})
        .rpc();
      
      // Check actual CU used in explorer
      // Must be < 400,000 for reliable landing
      ```

- [ ] **Document CU requirements**:
      - Deposit: ~_______ CU
      - Withdraw: ~_______ CU
      - JoinSplit: ~_______ CU

---

## 6. Trusted Setup

- [ ] **Not using dev setup**: Powers of Tau from real ceremony
      - [ ] Hermez ceremony
      - [ ] Perpetual Powers of Tau
      - [ ] Custom MPC ceremony

- [ ] **Circuit-specific setup**: Phase 2 contribution done
      - [ ] Multiple contributors
      - [ ] Contribution verification published

---

## 7. Code Audit

- [ ] **Third-party audit scheduled/complete**
      - Auditor: _________________
      - Date: _________________
      - Findings addressed: Yes / No

- [ ] **Internal review complete**
      - Reviewed by: _________________
      - Date: _________________

---

## 8. Deployment

- [ ] **Devnet testing complete**
      - All tests passing
      - Manual testing done
      - Bug bounty period (optional)

- [ ] **Mainnet deployment checklist**
      - [ ] Program deployed with production-crypto
      - [ ] VK accounts initialized and LOCKED
      - [ ] Pool initialized
      - [ ] Test deposit/withdraw works
      - [ ] Monitoring set up

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Lead Developer | | | |
| Security Reviewer | | | |
| Project Lead | | | |

---

## Red Flags - STOP IF ANY ARE TRUE

❌ Poseidon output doesn't match circomlib  
❌ Valid snarkjs proof fails on-chain  
❌ Invalid proof creates nullifier PDA  
❌ Using insecure-dev in production  
❌ Using dev trusted setup on mainnet  
❌ No third-party audit  
❌ Binary size > 200KB  
❌ CU usage > 400K  

---

## Notes

_Add any project-specific notes here_
