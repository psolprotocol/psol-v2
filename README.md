# pSOL v2

Privacy protocol for Solana implementing confidential transactions using zero-knowledge proofs.

## Overview

pSOL v2 enables private transfers of SPL tokens through a shared multi-asset shielded pool. The protocol uses Groth16 proofs over BN254, Merkle tree commitments, and a relayer architecture for gasless withdrawals.

**Status:** Alpha. Under active development. Do not use with real funds.

## Architecture
```
psol-v2/
├── programs/psol-privacy-v2/    # Solana on-chain program (Anchor)
│   ├── src/crypto/              # Cryptographic primitives
│   ├── src/instructions/        # Transaction handlers
│   ├── src/state/               # Account structures
│   └── src/utils/               # Validation and helpers
├── sdk/                         # TypeScript client library
├── circuits/                    # Circom zero-knowledge circuits
├── relayer/                     # HTTP relayer service
└── tests/                       # Integration tests
```

## Core Components

**On-chain Program**
- Multi-asset shielded pool with Merkle tree of commitments
- Groth16 verification for deposits, withdrawals, and transfers
- Relayer registry with fee management and operator tracking
- Support for compliance metadata and selective disclosure

**Zero-Knowledge Circuits**
- Deposit: Prove commitment to new note without revealing amount
- Withdraw: Prove ownership and nullifier without revealing source
- JoinSplit: Atomic split/merge of private notes
- Membership: Prove inclusion in anonymity set

**Relayer Service**
- Accepts proof data and builds Solana transactions
- Submits transactions on behalf of users
- Enables interaction without holding SOL for fees
- Configurable fee structure with on-chain enforcement

**TypeScript SDK**
- Note creation and commitment generation
- Merkle proof construction
- Zero-knowledge proof generation
- Transaction building helpers

## Installation
```bash
# Install dependencies
npm install

# Build circuits and generate proving keys
npm run circuits:build

# Build on-chain program
anchor build

# Build SDK and relayer
npm run build
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

Refer to `sdk/examples/` for complete integration examples.

## Development Roadmap

### Completed
- Relayer registry with PDA validation
- Input validation and sanitization
- Fee management and bounds enforcement
- Basic deposit and withdrawal flows

### In Progress (3-week sprint)
- Merkle tree batching for efficient deposits
- Redis-backed nullifier cache
- Multi-relayer support with automatic selection
- End-to-end testing with real proofs

### Pending
- Multi-party trusted setup ceremony
- Production Poseidon hash implementation
- Security audit
- Mainnet deployment procedures

## Security Considerations

This is experimental software under active development. Known limitations:

- Circuits have not undergone formal audit
- Trusted setup ceremony not yet performed
- Cryptographic hash functions use placeholder implementations
- Relayer architecture assumes honest majority
- No protection against timing attacks or network analysis

A comprehensive security audit is required before mainnet deployment.

## Testing
```bash
# Run unit tests
anchor test

# Run SDK tests
npm run test

# Run integration tests
npm run test:integration
```

## Requirements

- Rust 1.75+
- Solana 1.18+
- Anchor 0.32.1
- Node.js 18+
- Circom 2.1+

## Contributing

This project is in active development. Contributions are welcome but the API is unstable and will change frequently.

## License

MIT

## Disclaimer

This software is provided "as is" without warranty. Use at your own risk. The protocol is experimental and should not be used with real funds until a full security audit is completed and the trusted setup ceremony is performed.
