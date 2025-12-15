# Circuit Configuration Guide

The pSOL v2 SDK Prover requires circuit artifacts (WASM and zkey files) to generate ZK proofs. This guide explains how to configure circuit locations in different environments.

## Overview

Circuit artifacts include:
- **WASM files**: WebAssembly binaries for witness calculation
- **zkey files**: Groth16 proving keys generated from trusted setup

The SDK provides flexible configuration options to work with:
- Node.js applications (file system paths)
- Browser applications (URLs/CDN)
- Bundlers like Webpack, Vite, Rollup (pre-loaded buffers)
- Environment variables (deployment configuration)

## Quick Start

### Node.js with File Paths

```typescript
import { Prover, createNodeCircuitProvider } from '@psol/sdk';

// Point to your circuits directory
const provider = createNodeCircuitProvider('/path/to/circuits');
const prover = new Prover(provider);

// Generate proofs
const proof = await prover.generateDepositProof({
  commitment: 123n,
  amount: 1000000n,
  assetId: 1n,
  secret: randomSecret,
  nullifier: randomNullifier,
});
```

### Browser with URLs

```typescript
import { Prover, createBrowserCircuitProvider } from '@psol/sdk';

// Point to your CDN or server hosting circuits
const provider = createBrowserCircuitProvider('https://cdn.example.com/circuits');
const prover = new Prover(provider);
```

### Environment Variables (Node.js)

```bash
# Set base path for all circuits
export PSOL_CIRCUIT_PATH=/app/circuits

# Or override specific circuits
export PSOL_DEPOSIT_WASM=/custom/deposit.wasm
export PSOL_DEPOSIT_ZKEY=/custom/deposit.zkey
```

```typescript
import { Prover, createEnvCircuitProvider } from '@psol/sdk';

const provider = createEnvCircuitProvider();
const prover = new Prover(provider);
```

## Detailed Configuration

### Directory Structure

The SDK expects circuit artifacts in a standard directory structure:

```
circuits/
├── deposit/
│   ├── deposit_js/
│   │   └── deposit.wasm
│   └── deposit_final.zkey
├── withdraw/
│   ├── withdraw_js/
│   │   └── withdraw.wasm
│   └── withdraw_final.zkey
├── joinsplit/
│   ├── joinsplit_js/
│   │   └── joinsplit.wasm
│   └── joinsplit_final.zkey
└── membership/
    ├── membership_js/
    │   └── membership.wasm
    └── membership_final.zkey
```

### Custom Path Templates

If your artifacts are organized differently, you can customize the path templates:

```typescript
import { createNodeCircuitProvider } from '@psol/sdk';

const provider = createNodeCircuitProvider('/path/to/circuits', {
  pathTemplate: {
    wasm: '{basePath}/{proofType}.wasm',
    zkey: '{basePath}/{proofType}.zkey',
  },
});
```

Available placeholders:
- `{basePath}`: The base path provided to the factory
- `{proofType}`: The proof type name (deposit, withdraw, joinsplit, membership)

### Pre-loaded Buffers (Bundlers)

For bundlers that transform imports (Webpack, Vite, Rollup), you can pre-load artifacts.

**Note:** Circuit artifacts must be provided as `string` (path/URL) or `Uint8Array`.
If you have an `ArrayBuffer`, convert it with `new Uint8Array(buffer)`.

```typescript
import { Prover, createBufferCircuitProvider, ProofType } from '@psol/sdk';

// Import as binary (configure your bundler accordingly)
import depositWasmBuffer from './circuits/deposit.wasm?arraybuffer';
import depositZkeyBuffer from './circuits/deposit.zkey?arraybuffer';

const provider = createBufferCircuitProvider({
  [ProofType.Deposit]: {
    wasm: new Uint8Array(depositWasmBuffer),
    zkey: new Uint8Array(depositZkeyBuffer),
  },
});

const prover = new Prover(provider);
```

### Manual Configuration

For full control, create a custom provider:

```typescript
import { 
  Prover, 
  CircuitArtifactProvider, 
  CircuitArtifacts, 
  ProofType 
} from '@psol/sdk';

// Implement the CircuitArtifactProvider interface
const customProvider: CircuitArtifactProvider = {
  getArtifacts(proofType: ProofType): CircuitArtifacts {
    switch (proofType) {
      case ProofType.Deposit:
        return {
          wasm: '/my/custom/path/deposit.wasm',
          zkey: '/my/custom/path/deposit.zkey',
        };
      case ProofType.Withdraw:
        return {
          wasm: '/my/custom/path/withdraw.wasm',
          zkey: '/my/custom/path/withdraw.zkey',
        };
      // ... other proof types
      default:
        throw new Error(`Unknown proof type: ${proofType}`);
    }
  },
};

const prover = new Prover(customProvider);
```

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `PSOL_CIRCUIT_PATH` | Base path for all circuit artifacts |
| `PSOL_DEPOSIT_WASM` | Override deposit WASM path |
| `PSOL_DEPOSIT_ZKEY` | Override deposit zkey path |
| `PSOL_WITHDRAW_WASM` | Override withdraw WASM path |
| `PSOL_WITHDRAW_ZKEY` | Override withdraw zkey path |
| `PSOL_JOINSPLIT_WASM` | Override joinsplit WASM path |
| `PSOL_JOINSPLIT_ZKEY` | Override joinsplit zkey path |
| `PSOL_MEMBERSHIP_WASM` | Override membership WASM path |
| `PSOL_MEMBERSHIP_ZKEY` | Override membership zkey path |

Individual paths take precedence over the base path.

## Bundler-Specific Configuration

### Webpack

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.(wasm|zkey)$/,
        type: 'asset/resource',
      },
    ],
  },
};
```

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wasm', '**/*.zkey'],
});
```

### Next.js

```javascript
// next.config.js
module.exports = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(wasm|zkey)$/,
      type: 'asset/resource',
    });
    return config;
  },
};
```

## Browser Considerations

When loading circuits in the browser:

1. **CORS**: Ensure your CDN/server has proper CORS headers
2. **Size**: Circuit artifacts can be large (10-100MB). Consider:
   - Lazy loading only required proof types
   - Using a CDN with good caching
   - Showing progress indicators during loading
3. **Web Workers**: For better UX, generate proofs in a Web Worker

### Example: Lazy Loading in Browser

```typescript
import { Prover, createBufferCircuitProvider, ProofType } from '@psol/sdk';

async function loadProverForDeposit(): Promise<Prover> {
  const [wasmResponse, zkeyResponse] = await Promise.all([
    fetch('/circuits/deposit/deposit.wasm'),
    fetch('/circuits/deposit/deposit.zkey'),
  ]);

  const [wasmBuffer, zkeyBuffer] = await Promise.all([
    wasmResponse.arrayBuffer(),
    zkeyResponse.arrayBuffer(),
  ]);

  // Convert ArrayBuffer to Uint8Array (required by snarkjs)
  const provider = createBufferCircuitProvider({
    [ProofType.Deposit]: {
      wasm: new Uint8Array(wasmBuffer),
      zkey: new Uint8Array(zkeyBuffer),
    },
  });

  return new Prover(provider);
}
```

## Troubleshooting

### "No circuit artifacts configured for proof type"

This error means you're trying to generate a proof type that wasn't configured. Ensure your provider includes artifacts for all proof types you'll use.

### "Circuit provider is required"

The Prover no longer has default paths. You must explicitly configure a circuit provider using one of the factory functions.

### Large file loading issues

For very large circuit files:
- Use streaming fetch APIs
- Consider chunked loading
- Implement progress indicators

### Path resolution issues

- Use absolute paths when possible
- Check file permissions
- Verify the file structure matches expected templates
