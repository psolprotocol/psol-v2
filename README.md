# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Poseidon hash commitments in a Merkle tree, and a relayer architecture for gasless withdrawals.

## Devnet Deployment

| Component | Address |
|-----------|---------|
| Program | `BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb` |
| Pool Config | `3bbQyYkVGjnGonvcVCmdLhRr63PsZeNApVSWqDtn6LfM` |

Explorer: https://explorer.solana.com/address/BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb?cluster=devnet

## Architecture
```
psol-v2/
├── programs/psol-privacy-v2/    # Solana on-chain program (Anchor)
│   ├── src/crypto/              # Poseidon hash, Groth16 verifier, precomputed zeros
│   ├── src/instructions/        # Transaction handlers
│   ├── src/state/               # Account structures, Merkle tree
│   └── src/utils/               # Validation helpers
├── circuits/                    # Circom zero-knowledge circuits
│   ├── deposit/                 # Deposit circuit
│   ├── withdraw/                # Withdrawal circuit
│   ├── membership/              # Membership proof circuit
│   └── build/                   # Compiled circuits and proving keys
├── sdk/                         # TypeScript client library
├── relayer/                     # HTTP relayer service
└── scripts/                     # Deployment and utility scripts
```

## Cryptographic Implementation

The Poseidon hash implementation is fully compatible with circomlibjs, verified against 72 test vectors across t=2,3,4. This ensures proofs generated client-side with snarkjs will verify correctly on-chain.

Circuits use the standard circomlib Poseidon implementation with BN254 curve. Proving keys are generated from Hermez Phase 1 Powers of Tau ceremony (2^16 constraints).

## Zero-Knowledge Circuits

| Circuit | Constraints | Status |
|---------|-------------|--------|
| deposit | 368 | Compiled, tested |
| withdraw | 5,819 | Compiled, tested |
| membership | 5,572 | Compiled, tested |

All circuits compile successfully with circom 2.2.3 and generate valid Groth16 proofs.

## Building
```bash
# Install dependencies
npm install

# Build circuits and generate proving keys
cd circuits && ./build.sh

# Build on-chain program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Initialize pool
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
npx ts-node scripts/ts/init-pool.ts
```

## Testing
```bash
# Run Rust unit tests (86 tests including Poseidon vectors)
cargo test -p psol-privacy-v2

# Test circuit proof generation
cd circuits
node build/deposit_js/generate_witness.js build/deposit_js/deposit.wasm build/deposit_input.json build/deposit_witness.wtns
snarkjs groth16 prove build/deposit.zkey build/deposit_witness.wtns proof.json public.json
snarkjs groth16 verify build/deposit_vk.json public.json proof.json
```

## Usage
```typescript
import { PsolClient } from '@psol/sdk';

const client = new PsolClient(connection, wallet);

// Deposit into shielded pool
const note = await client.createNote(amount, assetId);
await client.deposit(poolAddress, note);

// Private transfer
await client.transfer(fromNote, toRecipient, amount);

// Withdraw via relayer
await client.withdraw(note, recipientAddress, relayerEndpoint);
```

## Development Status

Completed:
- Poseidon hash (circomlibjs compatible, 72 test vectors passing)
- ZK circuits (deposit, withdraw, membership)
- Groth16 verification keys embedded in program
- Merkle tree with precomputed zero values
- Pool initialization on devnet
- Relayer registry with fee management

In progress:
- Web frontend with wallet integration
- End-to-end deposit and withdrawal flow
- Relayer service implementation

Pending:
- Multi-party trusted setup ceremony
- Security audit
- Mainnet deployment

## Requirements

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.32.1
- Node.js 18+
- circom 2.2+
- snarkjs 0.7+

## Security

This is experimental software. Known limitations:

- Circuits have not undergone formal audit
- Trusted setup uses Hermez ceremony (production deployment requires dedicated ceremony)
- No protection against timing attacks or network analysis
- Tree depth currently limited to 4 (16 notes) for devnet testing

A comprehensive security audit is required before mainnet deployment.

## License

MIT
