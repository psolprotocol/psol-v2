# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Poseidon hash commitments in a Merkle tree, and a relayer architecture for gasless withdrawals.

## Devnet Deployment

| Component | Address |
|-----------|---------|
| Program | `BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb` |
| Pool Config | `HiStZaTziXH3u742d3vDGgzU478LKZZZr9mkRPo37R9v` |
| Authority | `6GxzJ2P9fEdSNyq1tEuFV4DSpYExpGWA6UBZ5p7tmjZD` |

Explorer: https://explorer.solana.com/address/BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb?cluster=devnet

### Pool Configuration
- **Tree Depth**: 20 (capacity: ~1M notes)
- **VKs Configured**: All 4 (Deposit, Withdraw, JoinSplit, Membership)
- **Status**: Ready for testing

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
│   ├── joinsplit/               # Private transfer circuit (2-in-2-out)
│   ├── membership/              # Membership proof circuit
│   └── build/                   # Compiled circuits and proving keys
├── sdk/                         # TypeScript client library
├── relayer/                     # HTTP relayer service
└── scripts/                     # Deployment and utility scripts
```

## Cryptographic Implementation

The Poseidon hash implementation is fully compatible with circomlibjs, verified against 72 test vectors across t=2,3,4. This ensures proofs generated client-side with snarkjs will verify correctly on-chain.

### Encoding Compatibility (Audit Fixes Applied)
- **Asset ID**: `0x00 || keccak256("psol:asset_id:v1" || mint)[0..31]`
- **Pubkey Scalar**: `0x00 || pubkey[0..31]` (ensures fit in BN254 field)

Circuits use the standard circomlib Poseidon implementation with BN254 curve. Proving keys are generated from Hermez Phase 1 Powers of Tau ceremony (2^16 constraints).

## Zero-Knowledge Circuits

| Circuit | Constraints | IC Points | Status |
|---------|-------------|-----------|--------|
| deposit | 368 | 4 | ✅ Compiled, VK provisioned |
| withdraw | 5,819 | 9 | ✅ Compiled, VK provisioned |
| joinsplit | 12,293 | 10 | ✅ Compiled, VK provisioned |
| membership | 5,572 | 5 | ✅ Compiled, VK provisioned |

All circuits compile successfully with circom 2.1.6 and generate valid Groth16 proofs.

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

# Initialize pool (depth 20)
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
npx ts-node scripts/ts/init-pool.ts

# Provision verification keys
npx ts-node scripts/ts/provision-vks.ts

# Optionally lock VKs for production
npx ts-node scripts/ts/provision-vks.ts --lock
```

## SDK
```bash
cd sdk
npm install
npm run build
npm test  # Run encoding compatibility tests
```

## Relayer
```bash
cd relayer
npm install
npm run build
cp .env.example .env  # Configure your settings
npm run dev
```

## Testing
```bash
# Run Rust unit tests (86 tests including Poseidon vectors)
cargo test -p psol-privacy-v2

# Run SDK encoding tests
cd sdk && npm test

# Test circuit proof generation
cd circuits
node build/deposit_js/generate_witness.js build/deposit_js/deposit.wasm build/deposit_input.json build/deposit_witness.wtns
snarkjs groth16 prove build/deposit.zkey build/deposit_witness.wtns proof.json public.json
snarkjs groth16 verify build/deposit_vk.json public.json proof.json
```

## Usage
```typescript
import { createPsolClient } from '@psol/sdk';

const client = await createPsolClient(connection, wallet);

// Deposit into shielded pool
const { note, commitment } = await client.createNote(amount, assetId);
await client.deposit(poolConfig, mint, amount, commitment, proofData);

// Private transfer (JoinSplit)
await client.privateTransfer(inputNotes, outputNotes, proofData);

// Withdraw via relayer
await client.withdraw(poolConfig, mint, recipient, amount, merkleRoot, nullifierHash, proofData);
```

## Development Status

### Completed ✅
- Poseidon hash (circomlibjs compatible, 72 test vectors passing)
- ZK circuits (deposit, withdraw, joinsplit, membership)
- Chunked VK upload for large verification keys
- Merkle tree with precomputed zero values (depth 20)
- Pool initialization on devnet with all VKs provisioned
- Relayer registry with fee management
- SDK with encoding compatibility (audit fixes applied)
- Relayer service (basic implementation)

### In Progress 🔄
- Web frontend with wallet integration
- End-to-end deposit and withdrawal flow testing
- Relayer service production hardening

### Pending ⏳
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

This is experimental software. Known limitations:

- Circuits have not undergone formal audit
- Trusted setup uses Hermez ceremony (production deployment requires dedicated ceremony)
- No protection against timing attacks or network analysis

A comprehensive security audit is required before mainnet deployment.

## License

MIT
