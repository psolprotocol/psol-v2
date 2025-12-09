# pSOL v2 - Multi-Asset Shielded Pool

pSOL v2 is an experimental privacy protocol for Solana that implements confidential transactions over a shared multi-asset pool. It uses Groth16 zero knowledge proofs over BN254, a Merkle tree of commitments, and a relayer so users can withdraw without holding SOL.

Status: Alpha, research only. Do not use with real funds. The cryptography, circuits, and implementation are still under active development.

## Package Layout

psol-v2-complete/
├── programs/ # Solana on-chain program
│ └── psol-privacy-v2/src/
│ ├── crypto/ # Poseidon, Groth16, BN254 helpers
│ ├── instructions/ # Program instruction handlers
│ ├── state/ # Account structures and PDAs
│ └── lib.rs
├── sdk/ # TypeScript SDK
│ └── src/
│ ├── crypto/poseidon.ts # Client-side Poseidon helper
│ ├── note/note.ts # Note and commitment management
│ ├── merkle/tree.ts # Merkle tree utilities
│ ├── proof/prover.ts # ZK proof generation
│ ├── client.ts # Main high-level client
│ └── types.ts
├── circuits/ # Circom ZK circuits
│ ├── deposit/deposit.circom
│ ├── withdraw/withdraw.circom
│ ├── joinsplit/joinsplit.circom
│ └── membership/membership.circom
├── relayer/src/index.ts # Relayer HTTP service
└── scripts/ # Build and ceremony scripts

nginx
Copy code

## Quick Start

These commands assume you are working in a local development environment, not on mainnet, and that you are comfortable with Solana, Anchor, Node, and Circom.

```bash
npm run setup    # Install dependencies for SDK, relayer, circuits
npm run build    # Build program, circuits, SDK, and relayer
anchor test      # Run local tests against a test validator
This is intended for contributors and auditors. It is not a one-line install for production use.

Key Components
On-chain program

Anchor-based Solana program that maintains a multi-asset shielded pool backed by a Merkle tree of commitments.

Stores verification keys, pool configuration, Merkle roots, nullifiers, and asset vaults.

ZK circuits (Circom)

Deposit, withdraw, joinsplit, and membership circuits targeting Groth16 on BN254.

Public inputs are designed to match the on-chain verifier and SDK helpers.

TypeScript SDK

Helpers for note creation, commitment and nullifier computation, Merkle tree interaction, and proof generation.

Intended for dApp integration and relayer clients, not yet stable for external production users.

Relayer service

HTTP service that receives proof data and withdrawal parameters, builds Solana transactions, and submits them on behalf of users.

Designed so users can interact with the pool without managing SOL for fees.

Basic SDK Usage Example
This example is illustrative only. It is not production safe and does not include error handling, local proof verification, or full configuration.

typescript
Copy code
import { initializeSDK, createClient, createNote } from '@psol/sdk';

// One-time SDK initialization (circuits, parameters, etc.)
await initializeSDK();

// Create a note for a given amount and asset
const note = await createNote(BigInt(1_000_000), assetId);

// Create a client instance and build a deposit
const client = await createClient(connection, wallet);
const tx = await client.depositMasp(poolConfig, {
  note,
  recipient: wallet.publicKey,
  assetMint,
  amount: BigInt(1_000_000),
});

// Submit transaction using your preferred Solana flow
await connection.sendTransaction(tx, [wallet.payer]);
Expect API changes while the protocol evolves. Treat this as a starting point for integration experiments, not a locked interface.

Pre-Production Checklist
Before any mainnet or real-funds deployment, at minimum the following must be completed:

Multi-party trusted setup ceremony for all circuits

Final Poseidon implementation wired and tested against reference vectors

Alignment of commitment and nullifier hash formulas across circuits, on-chain code, and SDK

End-to-end tests for deposit and withdraw flows with real proofs

Independent security and cryptographic audit

Deployment of verification keys and policy for how they can be changed or locked

Clear documentation of threat model, limitations, and upgrade governance

License: MIT
