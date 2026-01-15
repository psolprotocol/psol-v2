# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Poseidon hash commitments in a Merkle tree, and an off-chain batch sequencer for scalable settlement.

## Devnet Deployment

| Component      | Address                                        |
|--------------|-------------------------------------------------|
| Program       | `BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb` |
| Pool Config   | `GZiRVMV7FjrGxjE379HiEyHyVCisHkFnjMJen95kEVEQ` |
| Merkle Tree   | `GCG4QojHbjs15ucxHfW9G1bFzYyYZGzsvWRNEAj6pckk` |
| Pending Buffer| `6xMy76sHFVCvFewzL6FaSDts4fd1K86QwXVNy6RyhhL2` |
| Batch VK      | `GrhXXDsauwTJiXGbywJPykWPcbb8AKcndMPioGuResp2` |
| Authority     | `8p3kSuCyDcRYJcgVkhZbKpshNpyeSs6Eu8dYeZnbvecL` |

Explorer:
https://explorer.solana.com/address/BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb?cluster=devnet

### Verified Transactions

- Batch Settlement: https://explorer.solana.com/tx/4zTPJKYd8YjTooyvUZbV3YgnZb99Xu7TqLvHD12vSpwbARaUPiEPn8Fy27hfgCrS15KQLwrSrtSV9zmr1uLJuAjs?cluster=devnet
- Deposit: https://explorer.solana.com/tx/QXB83MCMWENtrLXM97Qf99FynB1pk4bA3HDu8vHKiksGSUN5tMdA7KF8gbTCxdRFoU9AAxmNDDJnXXmKwvhdRXN?cluster=devnet

## Pool Configuration

- Tree Depth: 20 (capacity: ~1M notes)
- Batch Size: 1–16 deposits per settlement
- VKs Configured: Deposit, Withdraw, JoinSplit, Membership, MerkleBatchUpdate
- Status: Active on devnet

## Architecture

The protocol uses a two-phase commit for deposits:

1. Deposit Phase: user deposits tokens with a ZK proof; commitment is queued to the pending buffer
2. Settlement Phase: off-chain sequencer batches commitments, generates a Merkle update proof, settles on-chain

This architecture solves Solana’s compute unit limitation. On-chain Poseidon hashing for Merkle insertion is too expensive per deposit. Batch settlement with off-chain proof verification amortizes cost and keeps on-chain verification bounded.

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

shell
Copy code

## Directory Structure

psol-v2/
├── programs/psol-privacy-v2/ # Solana program (Anchor)
│ ├── src/crypto/ # Poseidon hash, Groth16 verifier
│ ├── src/instructions/ # Transaction handlers
│ │ ├── deposit_masp.rs # Queue deposit to pending buffer
│ │ ├── settle_deposits_batch.rs # Batch settlement with ZK proof
│ │ └── withdraw_masp.rs # Withdrawal with membership proof
│ └── src/state/ # Account structures
├── circuits/ # Circom circuits
│ ├── deposit/ # Deposit commitment circuit
│ ├── withdraw/ # Withdrawal circuit
│ ├── merkle_batch_update/ # Batch Merkle insertion circuit
│ └── build/ # Compiled circuits, proving keys
├── sdk/ # TypeScript client library
├── scripts/ # Deployment, sequencer, utilities
│ ├── sequencer-production.ts # Batch settlement service (devnet)
│ └── upload-merkle-batch-vk.ts
└── tests/ # Integration tests

ruby
Copy code

## Zero-Knowledge Circuits

| Circuit             | Constraints | Public Inputs | Purpose                          |
|--------------------|------------:|--------------:|----------------------------------|
| deposit             |       368   |             4 | Prove knowledge of note preimage |
| withdraw            |     5,819   |             8 | Prove membership + nullifier     |
| joinsplit           |    12,293   |            10 | Private transfer (2-in-2-out)    |
| membership          |     5,572   |             5 | Prove note exists in tree        |
| merkle_batch_update |   ~464,000  |             5 | Batch Merkle tree insertion      |

The batch circuit uses a commitment binding approach for variable batch sizes (1–16), enabling a single settlement path to handle any number of pending deposits.

## Cryptographic Implementation

Poseidon hash is compatible with circomlibjs and verified against test vectors. Proofs generated client-side with snarkjs verify on-chain via Solana alt_bn128 syscalls.

Encoding (audit fixes applied):

- Asset ID: `0x00 || keccak256("psol:asset_id:v1" || mint)[0..31]`
- Pubkey Scalar: `0x00 || pubkey[0..31]` (ensures fit in BN254 field)

Proving keys generated from a Powers of Tau ceremony.

## Build

```bash
npm install

# Build circuits
cd circuits && ./build.sh

# Build program
anchor build

# Deploy
anchor deploy --provider.cluster devnet
Running the Sequencer (Devnet)
The sequencer monitors the pending deposits buffer and settles batches automatically:

bash
Copy code
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/pool-authority-v3.json"

npx ts-node scripts/sequencer-production.ts
SDK Usage
ts
Copy code
import { PsolV2Client, initializeSDK, createNote } from "@psol/sdk";

await initializeSDK();

const client = new PsolV2Client({ provider, programId });

// Deposit (queues to pending buffer)
const note = createNote(amount, assetId, recipientPubkey);
await client.deposit(poolConfig, mint, amount, commitment, proof, null);

// Withdrawal (after batch settlement)
await client.withdraw(poolConfig, mint, recipient, amount, merkleProof, nullifier, proof);
Testing
bash
Copy code
# Rust unit tests
cargo test -p psol-privacy-v2

# Stage A E2E withdraw test
npx ts-node tests/test-withdraw-e2e-fixed.ts

# Check recipient balance after withdraw
npx ts-node scripts/check-withdraw-balance.ts
Withdraw Public Inputs
Withdraw verifies a Groth16 proof with 8 public inputs assembled on-chain in withdraw_masp.rs:

merkle_root [u8; 32]

nullifier_hash [u8; 32]

asset_id Pubkey

recipient Pubkey

amount u64

relayer Pubkey

relayer_fee u64

public_data_hash [u8; 32] hardcoded to zero (reserved)

Critical: public_data_hash Hardcoding
On-chain verifier always sets public_data_hash to [0u8; 32] (reserved for future use). Off-chain proof generation must set:

publicDataHash = 0n

If you compute a non-zero publicDataHash off-chain, verification will fail with an InvalidProof-style error.

Development Status
Completed (Stage A):

Deposit: proof + queue into pending buffer (devnet)

Sequencer: batch settlement (devnet)

Withdraw: proof verification + spend nullifier + token release (devnet)

SDK fixes: proof serialization, ATA creation, wSOL sync, authority resolution

Regression guardrail: scripts/verify-all-fixes.sh

Next (Stage B focus):

Partial withdrawals and multi-withdraw per note (split 1 SOL into multiple withdrawals until exhausted)

Separate withdrawal pricing/fee model (relayer fee policy, dynamic fees)

Multi-wallet withdrawal UX (multiple recipient wallets, controlled disclosure)

Production-grade relayer service and hardening

Requirements
Rust 1.75+

Solana CLI 1.18+

Anchor 0.30+

Node.js 18+

circom 2.1+

snarkjs 0.7+

Security
Experimental software.

Circuits not formally audited

Trusted setup is not protocol-dedicated

Mainnet requires audit + ceremony + threat modeling

License
MIT