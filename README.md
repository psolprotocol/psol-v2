# pSOL v2

pSOL v2 is a privacy protocol for Solana that enables confidential transfers of SPL tokens through a shared, multi-asset shielded pool. It combines zero-knowledge proofs with an on-chain commitment tree and an off-chain batching flow to keep on-chain verification bounded while supporting practical throughput.

This repository contains the Solana programs, Circom circuits, a relayer and sequencer service, a TypeScript SDK, and operational scripts.

## Status

- Network: Solana Devnet
- Release maturity: experimental and under active development

## Key capabilities

- Shielded pool supporting multiple SPL token mints
- Groth16 proofs over BN254
- Poseidon-based commitments and Merkle tree membership
- Batched settlement of pending deposits via an off-chain sequencer
- Optional yield enforcement for selected assets via per-pool configuration

## Repository layout

- `programs/`  
  On-chain Solana programs for pool state, deposit settlement, and withdrawal flows.

- `circuits/`  
  Circom circuits and artifacts used to generate and verify ZK proofs.

- `relayer/`  
  Service responsible for coordinating off-chain batching, proof generation, and providing lightweight integration endpoints for clients.

- `sdk/`  
  TypeScript SDK for building transactions, notes, and proofs, plus convenience helpers for integrations.

- `scripts/`  
  Operational tooling for deployment, pool initialization, registry management, and verification key publishing.

- `tools/`  
  Supporting utilities (for example, Poseidon test vectors and cryptography tooling).

## Devnet deployment

### Program

- Program ID: `BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb`

### Primary Devnet pool (active)

This is the recommended pool for Devnet testing and integrations.

| Component      | Address |
|---------------|---------|
| Pool Config    | `uUhux7yXzGuA1rCNBQyaTrWuEW6yYUUTSAFnDVaefqw` |
| Merkle Tree    | `Bq7iXcDo61quCH1AYccA5WM6x5iXJdZyXkgkbiomKtbq` |
| Pending Buffer | `7NHFbLugnaS1BzGmu1pQFy32QScsZLtAm6TXX31AsBea` |
| Pool Authority | `BN4XFeCHfFut8ouDysMm4MrS8ppfXxtphVMqL2gnFkFm` |

### Archived Devnet pool (historical)

Retained for reference only.

| Component      | Address |
|---------------|---------|
| Pool Config    | `GZiRVMV7FjrGxjE379HiEyHyVCisHkFnjMJen95kEVEQ` |
| Merkle Tree    | `GCG4QojHbjs15ucxHfW9G1bFzYyYZGzsvWRNEAj6pckk` |
| Pending Buffer | `6xMy76sHFVCvFewzL6FaSDts4fd1K86QwXVNy6RyhhL2` |

## How the protocol works

pSOL v2 uses a two-phase deposit flow designed for Solana’s compute constraints.

1. Deposit phase (on-chain)  
   A user submits a deposit instruction along with a ZK proof. The resulting commitment is appended to an on-chain pending buffer.

2. Settlement phase (off-chain + on-chain)  
   A sequencer batches pending commitments, constructs the Merkle update off-chain, generates a batch proof, and submits a single on-chain settlement instruction to update the Merkle tree.

This amortizes the cost of Merkle insertion and keeps on-chain verification bounded.

User deposit -> Pending buffer (on-chain)
|
Sequencer (off-chain)
|
Batch proof generation
|
v
settle_deposits_batch (on-chain)
|
v
Merkle tree updated


## Relayer and sequencer

The relayer and sequencer are designed to be operated as a single long-lived service:

- Provides lightweight integration endpoints for clients (pool state, note status, and helper utilities)
- Continuously batches pending deposits and submits settlement transactions
- Publishes or consumes verification key material as required by the proving pipeline

Common endpoints exposed by the service include:
- `GET /api/health`
- `GET /api/pool-state`
- `GET /api/note/:commitment`

Exact runtime configuration is controlled via environment variables within the `relayer/` package.

## Yield enforcement (optional, Devnet)

Yield enforcement is implemented as feature flags plus a per-pool `YieldRegistry`. When enabled for a pool, withdrawal flows must satisfy the enforcement rules defined by the registry.

### Yield-enabled pool (Devnet)

- Pool Config: `73MzPg5UFz869CA5XWaEFUYDoS8ezzmjtvARJDMkNSgw`
- Yield Registry: `C4zuVKDvxQbuYmrbteRPHNpJC4gfQBJLoUqEP6VMWRmq`
- Authority: `J6HiqxWjWfcpPssVZHyb97rR5wFRFZmLaZYe1YrC1cSb`

Registered yield mints:
- JitoSOL: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`
- mSOL: `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So`

Integration note: when enforcement is enabled for a pool, withdrawal instructions must include the expected registry accounts and use an IDL that matches the deployed program build.

## Development

### Requirements

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.30+
- Node.js 18+
- circom 2.1+
- snarkjs 0.7+

### Environment

For Anchor-based workflows on Devnet:

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
Tests
cargo test -p psol-privacy-v2
Security
Experimental software.

Circuits are not formally audited

Trusted setup is not protocol-dedicated

Mainnet readiness requires an audit, a protocol-specific ceremony, and a complete threat model

License
MIT