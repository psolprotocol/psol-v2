"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullifierCache = void 0;
exports.createDisabledCache = createDisabledCache;
const ioredis_1 = __importDefault(require("ioredis"));
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
class NullifierCache {
    redis = null;
    config;
    connected = false;
    constructor(config) {
        this.config = {
            enabled: config.enabled,
            redisUrl: config.redisUrl || 'redis://localhost:6379',
            keyPrefix: config.keyPrefix || 'psol:nullifier:',
            connectTimeout: config.connectTimeout || 5000,
        };
    }
    /**
     * Initialize the cache connection.
     * Must be called before using the cache.
     */
    async connect() {
        if (!this.config.enabled) {
            console.log('Nullifier cache: disabled by configuration');
            return;
        }
        try {
            console.log(`Nullifier cache: connecting to ${this.config.redisUrl}`);
            this.redis = new ioredis_1.default(this.config.redisUrl, {
                connectTimeout: this.config.connectTimeout,
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        console.warn('Nullifier cache: max retries exceeded, giving up');
                        return null; // Stop retrying
                    }
                    return Math.min(times * 200, 1000); // Exponential backoff
                },
                lazyConnect: true,
            });
            // Handle connection events
            this.redis.on('connect', () => {
                console.log('Nullifier cache: connected to Redis');
                this.connected = true;
            });
            this.redis.on('error', (err) => {
                console.error('Nullifier cache: Redis error:', err.message);
                this.connected = false;
            });
            this.redis.on('close', () => {
                console.log('Nullifier cache: connection closed');
                this.connected = false;
            });
            // Actually connect
            await this.redis.connect();
            this.connected = true;
            console.log('Nullifier cache: ready');
        }
        catch (err) {
            console.error('Nullifier cache: failed to connect:', err);
            this.redis = null;
            this.connected = false;
            // Don't throw - cache is optional, we degrade gracefully
        }
    }
    /**
     * Disconnect from Redis.
     */
    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
            this.connected = false;
            console.log('Nullifier cache: disconnected');
        }
    }
    /**
     * Check if cache is available.
     */
    isAvailable() {
        return this.config.enabled && this.connected && this.redis !== null;
    }
    /**
     * Build the cache key for a nullifier.
     */
    buildKey(nullifierHash) {
        const hashHex = typeof nullifierHash === 'string'
            ? nullifierHash
            : bytesToHex(nullifierHash);
        return `${this.config.keyPrefix}${hashHex}`;
    }
    /**
     * Check if a nullifier is cached as spent.
     *
     * @param nullifierHash - The nullifier hash (32 bytes or hex string)
     * @returns true if cached as spent, false if not in cache
     */
    async get(nullifierHash) {
        if (!this.isAvailable()) {
            return null; // Cache miss (not available)
        }
        try {
            const key = this.buildKey(nullifierHash);
            const value = await this.redis.get(key);
            if (value === 'spent') {
                return true;
            }
            return null; // Not in cache
        }
        catch (err) {
            console.error('Nullifier cache: get error:', err);
            return null; // Treat errors as cache miss
        }
    }
    /**
     * Mark a nullifier as spent in the cache.
     *
     * @param nullifierHash - The nullifier hash (32 bytes or hex string)
     */
    async markSpent(nullifierHash) {
        if (!this.isAvailable()) {
            return; // Cache not available, skip silently
        }
        try {
            const key = this.buildKey(nullifierHash);
            // Nullifiers are permanent, so no expiration needed
            await this.redis.set(key, 'spent');
        }
        catch (err) {
            console.error('Nullifier cache: markSpent error:', err);
            // Don't throw - cache write failures are non-fatal
        }
    }
    /**
     * Get cache statistics for monitoring.
     */
    async getStats() {
        const stats = {
            enabled: this.config.enabled,
            connected: this.connected,
            keyCount: undefined,
        };
        if (this.isAvailable()) {
            try {
                // Count keys with our prefix
                const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
                stats.keyCount = keys.length;
            }
            catch {
                // Ignore errors in stats collection
            }
        }
        return stats;
    }
}
exports.NullifierCache = NullifierCache;
/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
/**
 * Create a disabled/no-op cache for when Redis is not configured.
 */
function createDisabledCache() {
    return new NullifierCache({ enabled: false });
}
//# sourceMappingURL=nullifier-cache.js.map