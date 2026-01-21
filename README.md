# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Poseidon-hash commitments in a Merkle tree, and an off-chain batch sequencer for scalable settlement.

## Devnet Deployment

### Program

- Program ID: `BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb`

### Investor Demo Pool (Active)

This is the pool you should point the frontend + 24/7 relayer/sequencer to.

| Component       | Address |
|----------------|---------|
| Pool Config     | `uUhux7yXzGuA1rCNBQyaTrWuEW6yYUUTSAFnDVaefqw` |
| Merkle Tree     | `Bq7iXcDo61quCH1AYccA5WM6x5iXJdZyXkgkbiomKtbq` |
| Pending Buffer  | `7NHFbLugnaS1BzGmu1pQFy32QScsZLtAm6TXX31AsBea` |
| Pool Authority  | `BN4XFeCHfFut8ouDysMm4MrS8ppfXxtphVMqL2gnFkFm` |

Relayer + Sequencer (24/7, Replit):
- Base URL: `https://sequencerp-sol.replit.app`
- API base: `https://sequencerp-sol.replit.app/api`

Frontend config:
- `VITE_RELAYER_API_URL=https://sequencerp-sol.replit.app/api`

### Previous Devnet Pool (Archived)

This pool is retained for historical reference only. Do not use it for investor demo.

| Component      | Address |
|--------------|---------|
| Pool Config   | `GZiRVMV7FjrGxjE379HiEyHyVCisHkFnjMJen95kEVEQ` |
| Merkle Tree   | `GCG4QojHbjs15ucxHfW9G1bFzYyYZGzsvWRNEAj6pckk` |
| Pending Buffer| `6xMy76sHFVCvFewzL6FaSDts4fd1K86QwXVNy6RyhhL2` |

## Architecture

The protocol uses a two-phase commit for deposits:

1. Deposit phase: user deposits tokens with a ZK proof; commitment is queued to the pending buffer
2. Settlement phase: off-chain sequencer batches commitments, generates a Merkle update proof, settles on-chain

This architecture solves Solana’s compute-unit limitation. On-chain Poseidon hashing for Merkle insertion is too expensive per deposit. Batch settlement with off-chain proof verification amortizes cost and keeps on-chain verification bounded.

```
User Deposit --> Pending Buffer (on-chain)
                      |
              Sequencer (off-chain)
                      |
                      v
            Generate batch ZK proof
                      |
                      v
         settle_deposits_batch (on-chain)
                      |
                      v
              Merkle Tree Updated
```

## 24/7 Relayer + Sequencer (Replit)

You run a single long-lived service that provides:
- lightweight API for the frontend (commitment/proof helpers, pool state, note polling)
- sequencer loop to settle pending deposits into the merkle tree

Relayer/Sequencer health:
- `GET /api/health`
- `GET /api/pool-state`

Note polling:
- `GET /api/note/:commitment`

## Yield Enforcement (Devnet)

Yield enforcement is implemented as feature flags + a per-pool YieldRegistry.

### Yield-enabled Pool (Known Good)

These addresses were verified earlier for yield enforcement:

- Pool Config: `73MzPg5UFz869CA5XWaEFUYDoS8ezzmjtvARJDMkNSgw`
- Yield Registry: `C4zuVKDvxQbuYmrbteRPHNpJC4gfQBJLoUqEP6VMWRmq`
- Authority: `J6HiqxWjWfcpPssVZHyb97rR5wFRFZmLaZYe1YrC1cSb`

Configuration status:
- `FEATURE_YIELD_ENFORCEMENT` enabled (flag = 32)
- Yield mints registered:
  - JitoSOL mint: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`
  - mSOL mint: `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So`

### Notes on IDL / client integration

If you are validating yield instructions via scripts/tests, make sure:
- the built IDL you load matches the deployed program build (clean build + correct `target/idl` JSON)
- the `withdraw_v2` accounts list includes `yield_registry` if enforcement is enabled for that pool
- `withdraw_yield_v2` is present in the IDL if you expect it in tests

## Running (Developer)

### Environment

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/<POOL_AUTHORITY_KEYPAIR>.json"
```

### Testing

```bash
cargo test -p psol-privacy-v2
```

## Requirements

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.30+
- Node.js 18+
- circom 2.1+
- snarkjs 0.7+

## Security

Experimental software.
- Circuits not formally audited
- Trusted setup not protocol-dedicated
- Mainnet requires audit + ceremony + threat modeling

## License

MIT
