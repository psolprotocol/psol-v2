/**
 * Nullifier Cache Module
 *
 * Provides an optional Redis-backed cache for spent nullifiers
 * to reduce RPC load and improve relayer performance.
 *
 * Nullifiers are write-once: once marked spent, they remain spent forever.
 * This property makes caching safe and simple - no invalidation needed.
 *
 * @module nullifier-cache
 */
/** Configuration for the nullifier cache */
export interface NullifierCacheConfig {
    /** Whether Redis caching is enabled */
    enabled: boolean;
    /** Redis connection URL (e.g., redis://localhost:6379) */
    redisUrl?: string;
    /** Key prefix for nullifier entries */
    keyPrefix?: string;
    /** Connection timeout in milliseconds */
    connectTimeout?: number;
}
/** Cache lookup result */
export interface CacheLookupResult {
    /** Whether the nullifier was found in cache */
    found: boolean;
    /** Whether the nullifier is spent (only valid if found=true) */
    spent: boolean;
    /** Source of the result: 'cache' or 'rpc' */
    source: 'cache' | 'rpc';
}
/**
 * NullifierCache provides Redis-backed caching for spent nullifiers.
 *
 * Usage pattern:
 * 1. Check cache first with `get()`
 * 2. If not found, query RPC
 * 3. If RPC confirms spent, call `markSpent()` to cache the result
 *
 * Note: We only cache "spent" status (positive results).
 * Unspent nullifiers are not cached because they could become spent at any time.
 */
export declare class NullifierCache {
    private redis;
    private config;
    private connected;
    constructor(config: NullifierCacheConfig);
    /**
     * Initialize the cache connection.
     * Must be called before using the cache.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Redis.
     */
    disconnect(): Promise<void>;
    /**
     * Check if cache is available.
     */
    isAvailable(): boolean;
    /**
     * Build the cache key for a nullifier.
     */
    private buildKey;
    /**
     * Check if a nullifier is cached as spent.
     *
     * @param nullifierHash - The nullifier hash (32 bytes or hex string)
     * @returns true if cached as spent, false if not in cache
     */
    get(nullifierHash: Uint8Array | string): Promise<boolean | null>;
    /**
     * Mark a nullifier as spent in the cache.
     *
     * @param nullifierHash - The nullifier hash (32 bytes or hex string)
     */
    markSpent(nullifierHash: Uint8Array | string): Promise<void>;
    /**
     * Get cache statistics for monitoring.
     */
    getStats(): Promise<{
        enabled: boolean;
        connected: boolean;
        keyCount?: number;
    }>;
}
/**
 * Create a disabled/no-op cache for when Redis is not configured.
 */
export declare function createDisabledCache(): NullifierCache;
//# sourceMappingURL=nullifier-cache.d.ts.map