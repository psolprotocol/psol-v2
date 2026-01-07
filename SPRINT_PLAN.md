# pSOL v2 - 3 Week Sprint

## Week 1: Foundation (Jan 6-12)
- [ ] Merkle tree batching design
- [ ] PendingDeposits implementation
- [ ] Relayer registry completion
- [ ] Relayer CLI tool

## Week 2: Infrastructure (Jan 13-19)
- [ ] Multi-relayer support
- [ ] Redis nullifier cache
- [ ] Retry/backoff logic
- [ ] Audit logging
- [ ] Input validation

## Week 3: Testing & Launch Prep (Jan 20-26)
- [ ] E2E tests
- [ ] SDK path fixes
- [ ] Deployment checklist
- [ ] Security review

## Deferred (Post-Launch)
- Fixed denomination pools
- View-key model


# All tests (86 tests)
cargo test -p psol-privacy-v2

# Poseidon-specific tests 
cargo test -p psol-privacy-v2 --test poseidon_vectors_test -- --nocapture

# internal Poseidon unit tests
cargo test -p psol-privacy-v2 poseidon -- --nocapture

anchor build