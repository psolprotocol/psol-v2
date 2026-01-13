# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Poseidon hash commitments in a Merkle tree, and an off-chain batch sequencer for scalable settlement.

## Devnet Deployment

|Component     |Address                                       |
|--------------|----------------------------------------------|
|Program       |`BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb`|
|Pool Config   |`DPZe7uST1mBxzVkEm215epHjsM7Sa8VCXHr3pv4eLp8X`|
|Merkle Tree   |`3NPUEWkbkyv7XDjVg98CWmkUz1XFNZ6ogqi18AiTnqgm`|
|Pending Buffer|`DPxeTsLkZaWdenw6gqgU7M6arWhKbo99GDVf2gPtM4NH`|
|Batch VK      |`GrhXXDsauwTJiXGbywJPykWPcbb8AKcndMPioGuResp2`|
|Authority     |`8p3kSuCyDcRYJcgVkhZbKpshNpyeSs6Eu8dYeZnbvecL`|

Explorer: https://explorer.solana.com/address/BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb?cluster=devnet

### Verified Transactions

- Batch Settlement: [4zTPJKYd8YjT…](https://explorer.solana.com/tx/4zTPJKYd8YjTooyvUZbV3YgnZb99Xu7TqLvHD12vSpwbARaUPiEPn8Fy27hfgCrS15KQLwrSrtSV9zmr1uLJuAjs?cluster=devnet)
- Deposit: [QXB83MCMWENt…](https://explorer.solana.com/tx/QXB83MCMWENtrLXM97Qf99FynB1pk4bA3HDu8vHKiksGSUN5tMdA7KF8gbTCxdRFoU9AAxmNDDJnXXmKwvhdRXN?cluster=devnet)

## Pool Configuration

- Tree Depth: 20 (capacity: ~1M notes)
- Batch Size: 1-16 deposits per settlement
- VKs Configured: Deposit, Withdraw, JoinSplit, Membership, MerkleBatchUpdate
- Status: Active on devnet

## Architecture

The protocol uses a two-phase commit for deposits:

1. **Deposit Phase**: User deposits tokens with ZK proof, commitment queued to pending buffer
1. **Settlement Phase**: Off-chain sequencer batches commitments, generates Merkle update proof, settles on-chain

This architecture solves Solana’s compute unit limitation. On-chain Poseidon hashing for Merkle insertion would require 1.4M CU per deposit (exceeds limit). Batch settlement with off-chain proof verification uses ~300k CU regardless of batch size.

```
User Deposit --> Pending Buffer (on-chain)
                      |
              Sequencer (off-chain)
                      |
                      v
            Generate batch ZK proof
                      |
                      v
         settle_deposits_batch (on-chain, ~300k CU)
                      |
                      v
              Merkle Tree Updated
```

### Directory Structure

```
psol-v2/
├── programs/psol-privacy-v2/    # Solana program (Anchor)
│   ├── src/crypto/              # Poseidon hash, Groth16 verifier
│   ├── src/instructions/        # Transaction handlers
│   │   ├── deposit_masp.rs      # Queue deposit to pending buffer
│   │   ├── settle_deposits_batch.rs  # Batch settlement with ZK proof
│   │   └── withdraw_v2.rs       # Withdrawal with membership proof
│   └── src/state/               # Account structures
├── circuits/                    # Circom circuits
│   ├── deposit/                 # Deposit commitment circuit
│   ├── withdraw/                # Withdrawal circuit
│   ├── merkle_batch_update/     # Batch Merkle insertion circuit
│   └── build/                   # Compiled circuits, proving keys
├── sdk/                         # TypeScript client library
├── scripts/                     # Deployment, sequencer, utilities
│   ├── sequencer.ts             # Batch settlement service
│   ├── upload-merkle-batch-vk.ts
│   └── check-state.ts
└── tests/                       # Integration tests
```

## Zero-Knowledge Circuits

|Circuit            |Constraints|Public Inputs|Purpose                         |
|-------------------|-----------|-------------|--------------------------------|
|deposit            |368        |4            |Prove knowledge of note preimage|
|withdraw           |5,819      |9            |Prove membership + nullifier    |
|joinsplit          |12,293     |10           |Private transfer (2-in-2-out)   |
|membership         |5,572      |5            |Prove note exists in tree       |
|merkle_batch_update|~464,000   |5            |Batch Merkle tree insertion     |

The batch circuit uses SHA256 commitment binding for variable batch sizes (1-16 deposits). This allows the sequencer to process any number of pending deposits in a single proof.

## Cryptographic Implementation

Poseidon hash is fully compatible with circomlibjs, verified against 72 test vectors across t=2,3,4. Proofs generated client-side with snarkjs verify correctly on-chain.

**Encoding (Audit Fixes Applied):**

- Asset ID: `0x00 || keccak256("psol:asset_id:v1" || mint)[0..31]`
- Pubkey Scalar: `0x00 || pubkey[0..31]` (ensures fit in BN254 field)

Proving keys generated from Hermez Phase 1 Powers of Tau ceremony.

## Building

```bash
npm install

# Build circuits
cd circuits && ./build.sh

# Build program
anchor build

# Deploy
anchor deploy --provider.cluster devnet
```

## Running the Sequencer

The sequencer monitors the pending deposits buffer and settles batches automatically:

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/pool-authority-v3.json

npx ts-node --transpile-only scripts/sequencer.ts
```

## SDK Usage

```typescript
import { PsolV2Client, initializeSDK, createNote } from '@psol/sdk';

await initializeSDK();

const client = new PsolV2Client({ provider, programId });

// Deposit (queues to pending buffer)
const note = createNote(amount, assetId, recipientPubkey);
await client.deposit(poolConfig, mint, amount, commitment, proof, null);

// Withdrawal (after batch settlement)
await client.withdraw(poolConfig, mint, recipient, amount, merkleProof, nullifier, proof);
```

## Testing

```bash
# Rust unit tests
cargo test -p psol-privacy-v2

# Circuit proof test
npx ts-node --transpile-only scripts/test-circuit.ts

# Check on-chain state
npx ts-node --transpile-only scripts/check-state.ts
```

## Development Status

**Completed:**

- Poseidon hash (circomlibjs compatible)
- All ZK circuits compiled with VKs on devnet
- Batch settlement system (sequencer + on-chain verification)
- Pending deposits buffer for scalable queuing
- SDK with wallet integration
- Live deposits working on devnet

**In Progress:**

- Sequencer state persistence (event indexing)
- Web frontend integration
- End-to-end withdrawal testing

**Pending:**

- Relayer service for gasless withdrawals
- Multi-party trusted setup ceremony
- Security audit
- Mainnet deployment

## Requirements

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.30+
- Node.js 18+
- circom 2.1+
- snarkjs 0.7+

## Security

Experimental software. Known limitations:

- Circuits not formally audited
- Trusted setup uses Hermez ceremony (production needs dedicated ceremony)
- No timing attack protection

Security audit required before mainnet.

## License

MIT