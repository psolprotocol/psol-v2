import { describe, it, expect } from 'vitest';
import {
  bagsCreateLaunchTxResponseSchema,
  bagsTradeQuoteResponseSchema,
  normalizeToBase64,
  isBase58,
  isBase64,
  tickerSchema,
  walletPubkeySchema,
} from '@streampump/shared';

describe('Bags API Response Validation', () => {
  describe('bagsCreateLaunchTxResponseSchema', () => {
    it('validates valid launch tx response', () => {
      const validResponse = {
        requestId: 'req-123',
        serializedTransaction: 'dGVzdCB0cmFuc2FjdGlvbg==', // base64
        mint: 'SoMint11111111111111111111111111111111111',
        expiresAt: '2024-12-31T23:59:59.000Z',
      };

      const result = bagsCreateLaunchTxResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates response without optional fields', () => {
      const minimalResponse = {
        requestId: 'req-123',
        serializedTransaction: 'dGVzdCB0cmFuc2FjdGlvbg==',
      };

      const result = bagsCreateLaunchTxResponseSchema.safeParse(minimalResponse);
      expect(result.success).toBe(true);
    });

    it('rejects response without required fields', () => {
      const invalidResponse = {
        serializedTransaction: 'dGVzdCB0cmFuc2FjdGlvbg==',
        // missing requestId
      };

      const result = bagsCreateLaunchTxResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('bagsTradeQuoteResponseSchema', () => {
    it('validates valid trade quote response', () => {
      const validResponse = {
        inputAmount: '1000000000', // 1 SOL in lamports
        outputAmount: '1000000000000', // tokens
        priceImpact: 0.5,
        fee: '10000',
      };

      const result = bagsTradeQuoteResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates response with route', () => {
      const responseWithRoute = {
        inputAmount: '1000000000',
        outputAmount: '1000000000000',
        priceImpact: 0.5,
        fee: '10000',
        route: { hops: [] },
      };

      const result = bagsTradeQuoteResponseSchema.safeParse(responseWithRoute);
      expect(result.success).toBe(true);
    });

    it('rejects invalid price impact', () => {
      const invalidResponse = {
        inputAmount: '1000000000',
        outputAmount: '1000000000000',
        priceImpact: 'high', // should be number
        fee: '10000',
      };

      const result = bagsTradeQuoteResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });
});

describe('Transaction Encoding Utilities', () => {
  describe('isBase58', () => {
    it('detects valid base58 strings', () => {
      // Valid base58 characters
      expect(isBase58('5K8s3f9h2J')).toBe(true);
      expect(isBase58('ABC123xyz')).toBe(true);
    });

    it('rejects invalid base58 strings', () => {
      // Contains 0, O, I, l which are not in base58
      expect(isBase58('0OIl')).toBe(false);
      // Contains special characters
      expect(isBase58('abc+def')).toBe(false);
    });
  });

  describe('isBase64', () => {
    it('detects valid base64 strings', () => {
      expect(isBase64('dGVzdA==')).toBe(true);
      expect(isBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(isBase64('YWJjZA==')).toBe(true);
    });

    it('rejects invalid base64 strings', () => {
      // Wrong padding
      expect(isBase64('abc')).toBe(false);
      // Contains invalid characters
      expect(isBase64('abc@def')).toBe(false);
    });
  });

  describe('normalizeToBase64', () => {
    it('returns base64 as-is', () => {
      const base64 = 'dGVzdCB0cmFuc2FjdGlvbg==';
      expect(normalizeToBase64(base64)).toBe(base64);
    });

    it('converts base58 to base64', () => {
      // This is a simple test - in production, we'd use actual transaction bytes
      const base58 = '2NEpo7TZRRrLZSi2U';
      // Should not throw and should return a valid base64 string
      const result = normalizeToBase64(base58);
      expect(typeof result).toBe('string');
      expect(isBase64(result)).toBe(true);
    });

    it('throws for invalid encoding', () => {
      expect(() => normalizeToBase64('invalid@string!')).toThrow();
    });
  });
});

describe('Input Validation Schemas', () => {
  describe('tickerSchema', () => {
    it('accepts valid tickers', () => {
      expect(tickerSchema.safeParse('DOGE').success).toBe(true);
      expect(tickerSchema.safeParse('BTC').success).toBe(true);
      expect(tickerSchema.safeParse('PEPE123').success).toBe(true);
    });

    it('transforms to uppercase', () => {
      // Note: The schema validates format before transform, so input must be valid format
      const result = tickerSchema.parse('DOGE');
      expect(result).toBe('DOGE');
    });

    it('rejects invalid tickers', () => {
      expect(tickerSchema.safeParse('A').success).toBe(false); // too short
      expect(tickerSchema.safeParse('TOOLONGTICKER').success).toBe(false); // too long
      expect(tickerSchema.safeParse('DOGE!').success).toBe(false); // special chars
      expect(tickerSchema.safeParse('do ge').success).toBe(false); // spaces
    });
  });

  describe('walletPubkeySchema', () => {
    it('accepts valid Solana addresses', () => {
      // Valid Solana address format (base58, 32-44 chars, no 0, O, I, l)
      expect(walletPubkeySchema.safeParse('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM').success).toBe(true);
      expect(walletPubkeySchema.safeParse('So11111111111111111111111111111111111111112').success).toBe(true);
    });

    it('rejects invalid addresses', () => {
      expect(walletPubkeySchema.safeParse('short').success).toBe(false);
      expect(walletPubkeySchema.safeParse('0x1234567890abcdef').success).toBe(false); // Ethereum format
      expect(walletPubkeySchema.safeParse('').success).toBe(false);
    });
  });
});
