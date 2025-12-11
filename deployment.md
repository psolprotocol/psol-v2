# pSOL v2 Deployment Checklist & Security Guidelines

## Pre-Deployment Checklist

### 1. Code Review & Audit

- [ ] All merge conflicts resolved
- [ ] No compiler warnings (run `cargo clippy`)
- [ ] All tests passing (`anchor test`)
- [ ] External security audit completed
- [ ] Audit findings addressed
- [ ] Code frozen (no changes after audit)

### 2. Program Keypairs

- [ ] Generate unique keypairs for each environment:
  ```bash
  ./keys/generate-keys.sh
  ```
- [ ] Update `lib.rs` with actual program IDs
- [ ] Backup mainnet keypair to secure storage:
  - [ ] Hardware wallet
  - [ ] Encrypted cloud backup
  - [ ] Paper backup in secure location
- [ ] Add mainnet keypair to `.gitignore`
- [ ] Verify keypairs are NOT committed to git

### 3. Verification Keys (ZK Setup)

- [ ] Trusted setup ceremony completed (MPC with 3+ participants)
- [ ] Powers of tau contribution verified
- [ ] Circuit-specific setup completed for:
  - [ ] Deposit circuit
  - [ ] Withdraw circuit
  - [ ] JoinSplit circuit (if enabled)
  - [ ] Membership circuit (if enabled)
- [ ] VK files generated and verified
- [ ] VK hashes documented

### 4. Configuration Review

#### Cargo.toml
- [ ] `event-debug` feature DISABLED for mainnet
- [ ] `mainnet` feature ENABLED for mainnet build
- [ ] Dependencies pinned to specific versions
- [ ] Overflow checks enabled in release profile

#### Anchor.toml
- [ ] Correct cluster configured
- [ ] Correct program ID for environment
- [ ] Wallet path correct

#### Constants
- [ ] `MIN_WITHDRAWAL_AMOUNT` appropriate for token decimals
- [ ] `MAX_RELAYER_FEE_BPS` set (default 1000 = 10%)
- [ ] Tree depth appropriate (20 = ~1M deposits)
- [ ] Root history size adequate (100+)

### 5. Account Sizing

- [ ] PoolConfigV2 space calculated correctly
- [ ] MerkleTreeV2 space allows for full tree
- [ ] Reserved bytes included for future upgrades
- [ ] All PDAs have correct seed derivations

---

## Deployment Procedure

### Localnet Deployment

```bash
# Build
anchor build

# Start local validator
solana-test-validator

# Deploy
anchor deploy --provider.cluster localnet

# Run tests
anchor test --skip-local-validator
```

### Devnet Deployment

```bash
# 1. Build with devnet feature
anchor build -- --features devnet

# 2. Verify program ID matches
solana-keygen pubkey keys/psol-devnet.json
grep "declare_id" programs/psol-privacy-v2/src/lib.rs

# 3. Fund deployer wallet
solana airdrop 5 --url devnet

# 4. Deploy
anchor deploy \
  --provider.cluster devnet \
  --program-keypair keys/psol-devnet.json

# 5. Verify deployment
solana program show <PROGRAM_ID> --url devnet

# 6. Initialize pool (via script or CLI)
# 7. Set verification keys
# 8. Register initial assets
# 9. Run E2E tests
```

### Mainnet Deployment

```bash
# ⚠️ CRITICAL: Double-check everything before mainnet deployment!

# 1. Final code review
git diff devnet..main

# 2. Build with mainnet feature
anchor build -- --features mainnet

# 3. Verify NO debug features
grep -r "event-debug" Cargo.toml  # Should show: NOT enabled

# 4. Verify program ID
solana-keygen pubkey keys/psol-mainnet.json
grep "declare_id" programs/psol-privacy-v2/src/lib.rs

# 5. Verify wallet has sufficient SOL
solana balance --url mainnet-beta

# 6. Deploy (IRREVERSIBLE!)
anchor deploy \
  --provider.cluster mainnet-beta \
  --program-keypair keys/psol-mainnet.json

# 7. Verify deployment
solana program show <PROGRAM_ID> --url mainnet-beta

# 8. Initialize pool with PAUSED state
# 9. Set and LOCK verification keys
# 10. Register assets
# 11. Comprehensive testing with small amounts
# 12. Unpause pool
```

---

## Post-Deployment Verification

### Immediate Checks

- [ ] Program deployed successfully
- [ ] Program ID matches expected
- [ ] Pool initialized
- [ ] VKs set and locked
- [ ] Assets registered
- [ ] Events emitting correctly

### Functional Tests

- [ ] Deposit works with valid proof
- [ ] Deposit fails with invalid proof
- [ ] Withdrawal works with valid proof
- [ ] Withdrawal fails with spent nullifier
- [ ] Relayer fee calculations correct
- [ ] Events contain expected fields (no sensitive data)

### Security Verification

- [ ] Pool can be paused by authority
- [ ] Unauthorized pause attempts fail
- [ ] VKs cannot be modified after locking
- [ ] Nullifiers properly prevent double-spend
- [ ] Invalid Merkle roots rejected

---

## Security Guidelines

### Key Management

| Key Type | Storage | Access |
|----------|---------|--------|
| Localnet keypair | Git repo | Public |
| Devnet keypair | Git repo | Public |
| Mainnet keypair | Hardware wallet / HSM | Restricted |
| Authority wallet | Hardware wallet | Restricted |

### Operational Security

1. **Multi-sig Authority**: Use Squads or similar for mainnet authority
2. **Timelocks**: Consider timelock for sensitive operations
3. **Monitoring**: Set up alerts for:
   - Pause events
   - Authority transfers
   - Large withdrawals
   - Failed proof verifications

### Emergency Procedures

#### If Vulnerability Discovered

1. **Pause pool immediately**
   ```bash
   # Via CLI or frontend
   psol-cli pause-pool --authority <WALLET>
   ```

2. **Assess impact**
   - Check if exploited
   - Identify affected funds
   - Document timeline

3. **Coordinate disclosure**
   - Contact security researchers
   - Prepare fix
   - Plan upgrade (if upgradeable) or migration

4. **Communicate**
   - Notify users
   - Publish post-mortem

#### If Authority Compromised

1. **Transfer authority** (if 2-step not initiated by attacker)
2. **Pause pool**
3. **Investigate scope**
4. **Plan migration** if necessary

---

## Environment-Specific Configuration

### Localnet

```toml
# Anchor.toml
[programs.localnet]
psol_privacy_v2 = "PSoL1111111111111111111111111111111111111111"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"
```

### Devnet

```toml
# Anchor.toml
[programs.devnet]
psol_privacy_v2 = "<YOUR_DEVNET_PROGRAM_ID>"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/devnet.json"
```

### Mainnet

```toml
# Anchor.toml
[programs.mainnet]
psol_privacy_v2 = "<YOUR_MAINNET_PROGRAM_ID>"

[provider]
cluster = "mainnet-beta"
wallet = "~/.config/solana/mainnet.json"  # Should be hardware wallet
```

---

## Monitoring & Alerts

### Recommended Metrics

1. **Pool Health**
   - Total deposits (count, not amounts - privacy!)
   - Withdrawal success rate
   - Merkle tree fill percentage
   - Active relayers

2. **Security Events**
   - Failed proof verifications
   - Pause/unpause events
   - Authority changes
   - VK modifications

3. **Performance**
   - Transaction confirmation times
   - Proof verification compute units
   - RPC latency

### Alert Thresholds

| Event | Severity | Action |
|-------|----------|--------|
| Pool paused | Critical | Investigate immediately |
| Authority transfer initiated | High | Verify legitimacy |
| >10 failed proofs/hour | Medium | Check for attack |
| Merkle tree >80% full | Low | Plan migration |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | TBD | Initial mainnet release |

---

## Contacts

- **Security Issues**: security@psolprotocol.xyz
- **Technical Support**: dev@psolprotocol.xyz
- **Discord**: https://discord.gg/psol
