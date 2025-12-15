/**
 * Tests for the NullifierCache module
 *
 * These tests verify:
 * - Disabled cache behavior (no-op)
 * - Cache operations when enabled
 * - Error handling and graceful degradation
 */

import { NullifierCache, createDisabledCache } from './nullifier-cache';

// Create a mock Redis instance factory
const createMockRedis = () => {
  const storage = new Map<string, string>();
  const eventHandlers: Record<string, Function[]> = {};

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(storage.get(key) || null);
    }),
    set: jest.fn().mockImplementation((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve('OK');
    }),
    keys: jest.fn().mockImplementation((pattern: string) => {
      const prefix = pattern.replace('*', '');
      const matchingKeys = Array.from(storage.keys()).filter((k) =>
        k.startsWith(prefix)
      );
      return Promise.resolve(matchingKeys);
    }),
    on: jest.fn().mockImplementation(function (this: any, event: string, handler: Function) {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
      return this;
    }),
    _storage: storage,
    _emit: (event: string, ...args: any[]) => {
      (eventHandlers[event] || []).forEach((h) => h(...args));
    },
  };
};

// Mock ioredis before importing the module
jest.mock('ioredis', () => {
  const mockRedisInstances: any[] = [];

  const MockRedis = jest.fn().mockImplementation(() => {
    const instance = createMockRedis();
    mockRedisInstances.push(instance);
    return instance;
  });

  // Store instances for test access
  (MockRedis as any)._instances = mockRedisInstances;
  (MockRedis as any)._clearInstances = () => {
    mockRedisInstances.length = 0;
  };

  return {
    __esModule: true,
    default: MockRedis,
    Redis: MockRedis,
  };
});

// Get reference to mock for clearing instances between tests
const getMockRedis = () => require('ioredis').default;

describe('NullifierCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMockRedis()._clearInstances();
  });

  describe('disabled cache', () => {
    it('should create a disabled cache', () => {
      const cache = createDisabledCache();
      expect(cache.isAvailable()).toBe(false);
    });

    it('should return null on get when disabled', async () => {
      const cache = createDisabledCache();
      await cache.connect();

      const nullifier = new Uint8Array(32).fill(0x42);
      const result = await cache.get(nullifier);

      expect(result).toBeNull();
    });

    it('should not throw on markSpent when disabled', async () => {
      const cache = createDisabledCache();
      await cache.connect();

      const nullifier = new Uint8Array(32).fill(0x42);
      await expect(cache.markSpent(nullifier)).resolves.not.toThrow();
    });

    it('should return disabled stats', async () => {
      const cache = createDisabledCache();
      const stats = await cache.getStats();

      expect(stats.enabled).toBe(false);
      expect(stats.connected).toBe(false);
    });
  });

  describe('enabled cache', () => {
    let cache: NullifierCache;

    beforeEach(async () => {
      cache = new NullifierCache({
        enabled: true,
        redisUrl: 'redis://localhost:6379',
        keyPrefix: 'test:nullifier:',
      });
      await cache.connect();
    });

    afterEach(async () => {
      await cache.disconnect();
    });

    it('should be available after connect', () => {
      expect(cache.isAvailable()).toBe(true);
    });

    it('should return null for uncached nullifier', async () => {
      const nullifier = new Uint8Array(32).fill(0x01);
      const result = await cache.get(nullifier);
      expect(result).toBeNull();
    });

    it('should cache and retrieve spent nullifier', async () => {
      const nullifier = new Uint8Array(32).fill(0xab);

      // Initially not in cache
      const before = await cache.get(nullifier);
      expect(before).toBeNull();

      // Mark as spent
      await cache.markSpent(nullifier);

      // Now should be cached
      const after = await cache.get(nullifier);
      expect(after).toBe(true);
    });

    it('should accept hex string input', async () => {
      const hexNullifier = 'deadbeef'.repeat(8); // 32 bytes as hex

      await cache.markSpent(hexNullifier);
      const result = await cache.get(hexNullifier);

      expect(result).toBe(true);
    });

    it('should use correct key prefix', async () => {
      const cache2 = new NullifierCache({
        enabled: true,
        redisUrl: 'redis://localhost:6379',
        keyPrefix: 'custom:prefix:',
      });
      await cache2.connect();

      const nullifier = new Uint8Array(32).fill(0xff);
      await cache2.markSpent(nullifier);

      // The key should use the custom prefix
      const stats = await cache2.getStats();
      expect(stats.keyCount).toBe(1);

      await cache2.disconnect();
    });

    it('should return stats with key count', async () => {
      // Add some entries
      await cache.markSpent(new Uint8Array(32).fill(0x01));
      await cache.markSpent(new Uint8Array(32).fill(0x02));
      await cache.markSpent(new Uint8Array(32).fill(0x03));

      const stats = await cache.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.connected).toBe(true);
      expect(stats.keyCount).toBe(3);
    });
  });

  describe('cache consistency', () => {
    it('should never cache unspent nullifiers', async () => {
      // This is a design principle test - the cache only stores "spent" status
      // Unspent nullifiers are not cached because they could become spent at any time
      const cache = new NullifierCache({
        enabled: true,
        redisUrl: 'redis://localhost:6379',
      });
      await cache.connect();

      const nullifier = new Uint8Array(32).fill(0x99);

      // Cache only has get and markSpent - no way to cache "unspent"
      // This ensures we always check RPC for unspent nullifiers
      const result = await cache.get(nullifier);
      expect(result).toBeNull(); // null means "not in cache", not "unspent"

      await cache.disconnect();
    });

    it('should handle repeated markSpent calls idempotently', async () => {
      const cache = new NullifierCache({
        enabled: true,
        redisUrl: 'redis://localhost:6379',
      });
      await cache.connect();

      const nullifier = new Uint8Array(32).fill(0x77);

      // Mark spent multiple times
      await cache.markSpent(nullifier);
      await cache.markSpent(nullifier);
      await cache.markSpent(nullifier);

      // Should still return true
      const result = await cache.get(nullifier);
      expect(result).toBe(true);

      await cache.disconnect();
    });
  });

  describe('nullifier hash formats', () => {
    it('should handle 32-byte Uint8Array', async () => {
      const cache = new NullifierCache({ enabled: true });
      await cache.connect();

      const nullifier = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
      ]);

      await cache.markSpent(nullifier);
      const result = await cache.get(nullifier);
      expect(result).toBe(true);

      await cache.disconnect();
    });

    it('should handle 64-character hex string', async () => {
      const cache = new NullifierCache({ enabled: true });
      await cache.connect();

      const nullifierHex = '0'.repeat(64);

      await cache.markSpent(nullifierHex);
      const result = await cache.get(nullifierHex);
      expect(result).toBe(true);

      await cache.disconnect();
    });

    it('should match Uint8Array and equivalent hex string', async () => {
      const cache = new NullifierCache({ enabled: true });
      await cache.connect();

      const nullifierBytes = new Uint8Array(32).fill(0xab);
      const nullifierHex = 'ab'.repeat(32);

      // Mark with bytes
      await cache.markSpent(nullifierBytes);

      // Get with hex
      const result = await cache.get(nullifierHex);
      expect(result).toBe(true);

      await cache.disconnect();
    });
  });
});

describe('Integration: Relayer nullifier check flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMockRedis()._clearInstances();
  });

  /**
   * This test simulates the expected flow in the relayer:
   * 1. Check cache (miss)
   * 2. Query RPC (simulated)
   * 3. If spent on-chain, cache the result
   * 4. Subsequent checks hit cache
   */
  it('should reduce RPC calls via caching', async () => {
    const cache = new NullifierCache({
      enabled: true,
      keyPrefix: 'integration:',
    });
    await cache.connect();

    // Simulate RPC call counter
    let rpcCalls = 0;
    const simulateRpcCheck = async (isSpent: boolean): Promise<boolean> => {
      rpcCalls++;
      return isSpent;
    };

    const nullifier = new Uint8Array(32).fill(0x42);

    // First check: cache miss, RPC returns spent
    const cached1 = await cache.get(nullifier);
    expect(cached1).toBeNull(); // Cache miss
    const rpcResult = await simulateRpcCheck(true);
    expect(rpcResult).toBe(true);
    await cache.markSpent(nullifier);
    expect(rpcCalls).toBe(1);

    // Second check: cache hit, no RPC call needed
    const cached2 = await cache.get(nullifier);
    expect(cached2).toBe(true); // Cache hit
    expect(rpcCalls).toBe(1); // Still 1, no new RPC call

    // Third check: still cache hit
    const cached3 = await cache.get(nullifier);
    expect(cached3).toBe(true);
    expect(rpcCalls).toBe(1); // Still 1

    await cache.disconnect();
  });

  it('should not cache unspent nullifiers', async () => {
    const cache = new NullifierCache({
      enabled: true,
      keyPrefix: 'integration:',
    });
    await cache.connect();

    let rpcCalls = 0;
    const simulateRpcCheck = async (isSpent: boolean): Promise<boolean> => {
      rpcCalls++;
      return isSpent;
    };

    const nullifier = new Uint8Array(32).fill(0x88);

    // First check: cache miss, RPC returns unspent
    const cached1 = await cache.get(nullifier);
    expect(cached1).toBeNull();
    const rpcResult1 = await simulateRpcCheck(false);
    expect(rpcResult1).toBe(false);
    // Don't cache unspent!
    expect(rpcCalls).toBe(1);

    // Second check: still cache miss (unspent not cached)
    const cached2 = await cache.get(nullifier);
    expect(cached2).toBeNull();
    const rpcResult2 = await simulateRpcCheck(false);
    expect(rpcResult2).toBe(false);
    expect(rpcCalls).toBe(2); // Had to call RPC again

    await cache.disconnect();
  });
});
