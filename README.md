# pSOL v2 - Multi-Asset Shielded Pool

Production-ready privacy protocol for Solana implementing confidential transactions using Groth16 ZK proofs on BN254.

## 📦 Package Contents

```
psol-v2-complete/
├── programs/                    # Solana on-chain program
│   └── psol-privacy-v2/src/
│       ├── crypto/              # Poseidon, Groth16, BN254
│       ├── instructions/        # All program instructions
│       ├── state/               # Account structures
│       └── lib.rs
├── sdk/                         # TypeScript SDK
│   └── src/
│       ├── crypto/poseidon.ts   # Client-side Poseidon
│       ├── note/note.ts         # Note management
│       ├── merkle/tree.ts       # Merkle tree
│       ├── proof/prover.ts      # ZK proof generation
│       ├── client.ts            # Main client
│       └── types.ts
├── circuits/                    # Circom ZK circuits
│   ├── deposit/deposit.circom
│   ├── withdraw/withdraw.circom
│   ├── joinsplit/joinsplit.circom
│   └── membership/membership.circom
├── relayer/src/index.ts         # Relayer HTTP service
└── scripts/                     # Build & ceremony scripts
```

## 🚀 Quick Start

```bash
npm run setup    # Install all dependencies
npm run build    # Build program, circuits, SDK, relayer
anchor test      # Run tests
```

## 🔐 Key Features

- **Real Poseidon**: Circomlib-compatible (t=3, t=5)
- **4 Proof Types**: Deposit, Withdraw, JoinSplit, Membership
- **Multi-Asset**: Shared anonymity set across all tokens
- **Relayer Service**: HTTP API for private withdrawals
- **Production SDK**: Note encryption, Merkle proofs, proof generation

## 📋 SDK Usage

```typescript
import { initializeSDK, createClient, createNote } from '@psol/sdk';

await initializeSDK();
const note = await createNote(BigInt(1_000_000), assetId);
const result = await client.depositMasp(poolConfig, { ... });
```

## ⚠️ Production Checklist

- [ ] Multi-party trusted setup ceremony
- [ ] Security audit
- [ ] Full Poseidon constants (535 total)
- [ ] Deploy & lock verification keys

MIT License
