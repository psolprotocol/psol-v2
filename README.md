pSol v2

Shielded multi-asset transfers and privacy infrastructure on Solana

pSol v2 is a zero-knowledge privacy protocol that enables confidential deposits, transfers, and withdrawals for any supported SPL asset. It combines Groth16 proofs, a shared multi-asset Merkle tree, and a decentralized relayer network to provide strong privacy guarantees while maintaining auditability and operational control where required.

The protocol is designed around three core ideas:

Privacy first: commitments, nullifiers, and zero-knowledge proofs protect user identities and transaction amounts.

Multi-asset support: any SPL token can be registered and used inside the shielded pool.

Modular infrastructure: relayers, batching, audit logging, and compliance controls are first-class components that can evolve independently.

Key Features
Shielded Deposits

Users deposit assets into the pool by generating a Groth16 zero-knowledge proof asserting:

The deposit value and asset type are valid.

The resulting commitment is correctly formed.

The on-chain program verifies the proof, inserts the commitment into the shared Merkle tree, and emits a minimal privacy-preserving event.
Amounts, identities, and other linkable metadata never appear in production events.

Shielded Withdrawals

Withdrawals consume previously created commitments using Groth16 proofs that:

Check the nullifier has not been spent.

Validate the Merkle path and public inputs.

Protect the recipient and amount using encrypted note data routed through a relayer.

The protocol enforces that all withdrawals go through registered relayers, strengthening censorship resistance and operational safety.

Multi-Asset Architecture

pSol supports many token types inside a single pool, each identified by a hashed asset_id.

Features include:

Asset registration with authority controls.

Compliance flags for enabling or disabling individual assets.

Unified Merkle tree for all assets, enabling stronger anonymity sets.

Batching and Merkle Tree Scalability

To minimize contention on Solana and increase throughput, pSol introduces a batching layer:

Deposits are first written into a PendingDeposits buffer account.

A batching instruction periodically inserts commitments into the canonical Merkle tree.

Roots and root history remain consistent with circuit constraints.

This architecture supports significantly higher transaction volume than single-write Merkle updates.

Decentralized Relayer Network

Relayers provide private message routing for shielded withdrawals.
The system includes:

An on-chain RelayerRegistry, storing active relayers and fees.

Strict validation that every withdrawal references a registered relayer.

SDK support for discovering and selecting relayers.

An optional command-line tool for relayers to register/update their configuration.

Relayers never learn user identity or internal note information.

Local Proof Verification in the Relayer

Before submitting any withdrawal to chain, the relayer performs local ZK proof validation:

Prevents invalid requests from hitting Solana RPC.

Reduces wasted fees and error propagation.

Protects relayers against malformed or malicious traffic.

Audit Logging (Off-Chain)

The relayer maintains structured JSON audit logs:

Timestamps, pool, asset type, and action status.

No secrets or sensitive data.

Useful for troubleshooting, observability, and optional external compliance reporting.

This creates a “gray box” model, allowing operators to track behavior while preserving user privacy.

Asset Whitelisting and Compliance Controls

Each registered asset has a compliance flag that determines whether deposits and withdrawals are allowed.

Pool authority may enable or disable an asset.

Deposit/withdraw instructions enforce this flag.

Provides operational safety and reduces unwanted asset exposure.

SDK

The TypeScript SDK offers:

Proof generation and verification flows.

Merkle path helpers with hardened validation.

Configurable prover resource paths (no hardcoding).

Automatic relayer discovery and selection.

Helpers for constructing deposit and withdrawal transactions.

The SDK mirrors the on-chain IDL for full compatibility.

Full End-to-End Testing

The repository includes an E2E test that validates the entire flow:

Register asset

Deposit with Groth16 proof

Merkle batching step

Withdrawal using a real proof

This test guarantees that protocol-level changes remain consistent with circuit and SDK behavior.

Repository Structure
programs/
  psol-privacy-v2/
    src/
      instructions/
      state/
      crypto/
      events.rs
      lib.rs
    Anchor.toml

sdk/
  src/
    client.ts
    prover.ts
    merkle.ts
    types.ts
    idl/

relayer/
  src/
    index.ts
    prover.ts
    auditLogger.ts
    cache/
    cli.ts

Roadmap Items (Already Under Development)

View-key–based selective disclosure model

Multiple relayer selection strategies in the SDK

Fixed-denomination pools for stronger privacy

Concurrent tree research and future compression integration
