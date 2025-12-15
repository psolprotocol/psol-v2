"use strict";
/**
 * Tests for relayer transaction retry logic
 *
 * These tests verify:
 * - Error classification (transient vs deterministic)
 * - Exponential backoff with jitter
 * - Retry behavior for transient errors
 * - Immediate failure for validation errors
 * - Overall timeout enforcement
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
// =============================================================================
// ERROR CLASSIFICATION TESTS
// =============================================================================
describe('classifyError', () => {
    describe('TRANSIENT_RPC errors', () => {
        const transientErrors = [
            'Blockhash not found',
            'block height exceeded',
            'Transaction expired before confirmation',
            'Node is behind by 10 slots',
            'Service unavailable',
            'Connection refused',
            'Connection reset by peer',
            'Connection timed out',
            'Request timeout',
            'ETIMEDOUT',
            'ECONNRESET',
            'ECONNREFUSED',
            'ENETUNREACH',
            'socket hang up',
            'Network error occurred',
            '502 Bad Gateway',
            '503 Service Unavailable',
            '504 Gateway Timeout',
            'Bad gateway error',
            'Gateway timeout exceeded',
            '429 Too Many Requests',
            'Rate limit exceeded',
            'Server too busy',
            'Temporarily unavailable, try again later',
        ];
        test.each(transientErrors)('classifies "%s" as TRANSIENT_RPC', (message) => {
            const error = new Error(message);
            expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.TRANSIENT_RPC);
        });
    });
    describe('VALIDATION errors', () => {
        const validationErrors = [
            'Invalid proof provided',
            'Proof verification failed',
            'Invalid signature',
            'Transaction simulation failed',
            'Instruction error: custom program error',
            'Invalid program id',
            'Invalid account data',
            'Account not found',
            'Invalid mint',
            'Invalid owner',
            'Deserialization failed',
            'Constraint violation',
            'Custom program error: 0x1770',
        ];
        test.each(validationErrors)('classifies "%s" as VALIDATION', (message) => {
            const error = new Error(message);
            expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.VALIDATION);
        });
    });
    describe('STATE_CONFLICT errors', () => {
        const stateConflictErrors = [
            'Nullifier already spent',
            'Transaction already processed',
            'Account already exists',
            'Duplicate transaction detected',
        ];
        test.each(stateConflictErrors)('classifies "%s" as STATE_CONFLICT', (message) => {
            const error = new Error(message);
            expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.STATE_CONFLICT);
        });
    });
    describe('RESOURCE errors', () => {
        const resourceErrors = [
            'Insufficient funds for transaction',
            'Insufficient lamports in account',
            'Insufficient balance',
        ];
        test.each(resourceErrors)('classifies "%s" as RESOURCE', (message) => {
            const error = new Error(message);
            expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.RESOURCE);
        });
    });
    describe('UNKNOWN errors', () => {
        const unknownErrors = [
            'Something weird happened',
            'Unexpected error',
            'Internal server error',
            '',
        ];
        test.each(unknownErrors)('classifies "%s" as UNKNOWN', (message) => {
            const error = new Error(message);
            expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.UNKNOWN);
        });
    });
});
// =============================================================================
// RETRY DECISION TESTS
// =============================================================================
describe('isRetryableCategory', () => {
    it('returns true for TRANSIENT_RPC', () => {
        expect((0, index_1.isRetryableCategory)(index_1.ErrorCategory.TRANSIENT_RPC)).toBe(true);
    });
    it('returns true for UNKNOWN (might be transient)', () => {
        expect((0, index_1.isRetryableCategory)(index_1.ErrorCategory.UNKNOWN)).toBe(true);
    });
    it('returns false for VALIDATION', () => {
        expect((0, index_1.isRetryableCategory)(index_1.ErrorCategory.VALIDATION)).toBe(false);
    });
    it('returns false for STATE_CONFLICT', () => {
        expect((0, index_1.isRetryableCategory)(index_1.ErrorCategory.STATE_CONFLICT)).toBe(false);
    });
    it('returns false for RESOURCE', () => {
        expect((0, index_1.isRetryableCategory)(index_1.ErrorCategory.RESOURCE)).toBe(false);
    });
});
// =============================================================================
// BACKOFF DELAY TESTS
// =============================================================================
describe('calculateBackoffDelay', () => {
    // Mock Math.random for predictable tests
    const originalRandom = Math.random;
    beforeEach(() => {
        // Fixed jitter for predictable tests
        Math.random = jest.fn(() => 0.5);
    });
    afterEach(() => {
        Math.random = originalRandom;
    });
    it('calculates correct delay for attempt 1', () => {
        // Base delay (1000) * 2^0 + jitter (250)
        const delay = (0, index_1.calculateBackoffDelay)(1);
        expect(delay).toBe(1000 + 250); // 1250ms
    });
    it('calculates correct delay for attempt 2', () => {
        // Base delay (1000) * 2^1 + jitter (250)
        const delay = (0, index_1.calculateBackoffDelay)(2);
        expect(delay).toBe(2000 + 250); // 2250ms
    });
    it('calculates correct delay for attempt 3', () => {
        // Base delay (1000) * 2^2 + jitter (250)
        const delay = (0, index_1.calculateBackoffDelay)(3);
        expect(delay).toBe(4000 + 250); // 4250ms
    });
    it('includes random jitter', () => {
        // Restore original random
        Math.random = originalRandom;
        const delays = new Set();
        for (let i = 0; i < 10; i++) {
            delays.add((0, index_1.calculateBackoffDelay)(1));
        }
        // With random jitter, we should get varying delays
        // (statistically unlikely to get all the same)
        expect(delays.size).toBeGreaterThan(1);
    });
    it('jitter is within expected range (0-500ms)', () => {
        Math.random = originalRandom;
        for (let i = 0; i < 100; i++) {
            const delay = (0, index_1.calculateBackoffDelay)(1);
            // Base is 1000ms, so delay should be between 1000 and 1500
            expect(delay).toBeGreaterThanOrEqual(1000);
            expect(delay).toBeLessThan(1500);
        }
    });
});
// =============================================================================
// SIMULATED RETRY BEHAVIOR TESTS
// =============================================================================
describe('Simulated Retry Behavior', () => {
    /**
     * Simulates the retry loop logic for testing
     */
    async function simulateRetryLoop(attemptFn, options = {}) {
        const maxAttempts = options.maxAttempts ?? 3;
        const overallTimeoutMs = options.overallTimeoutMs ?? 30000;
        const startTime = Date.now();
        let lastError = null;
        let attempts = 0;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            attempts = attempt;
            // Check overall timeout
            const elapsed = Date.now() - startTime;
            if (elapsed >= overallTimeoutMs) {
                return {
                    error: new Error(`Timeout after ${elapsed}ms`),
                    attempts: attempt - 1,
                };
            }
            try {
                const result = await attemptFn(attempt);
                return { result, attempts };
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const category = (0, index_1.classifyError)(lastError);
                if (!(0, index_1.isRetryableCategory)(category)) {
                    return { error: lastError, attempts };
                }
                // Don't wait in tests, just continue to next attempt
            }
        }
        return { error: lastError ?? new Error('Unknown error'), attempts };
    }
    it('succeeds on first attempt when no errors', async () => {
        const { result, attempts } = await simulateRetryLoop(async () => 'success');
        expect(result).toBe('success');
        expect(attempts).toBe(1);
    });
    it('retries on transient error and succeeds', async () => {
        let callCount = 0;
        const { result, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            if (callCount < 3) {
                throw new Error('Connection timeout');
            }
            return 'success';
        });
        expect(result).toBe('success');
        expect(attempts).toBe(3);
    });
    it('stops retrying on validation error immediately', async () => {
        let callCount = 0;
        const { error, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            throw new Error('Invalid proof verification failed');
        });
        expect(error?.message).toContain('Invalid proof');
        expect(attempts).toBe(1); // Should not retry
        expect(callCount).toBe(1);
    });
    it('stops retrying on state conflict error immediately', async () => {
        let callCount = 0;
        const { error, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            throw new Error('Nullifier already spent');
        });
        expect(error?.message).toContain('Nullifier already spent');
        expect(attempts).toBe(1);
        expect(callCount).toBe(1);
    });
    it('stops retrying on resource error immediately', async () => {
        let callCount = 0;
        const { error, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            throw new Error('Insufficient funds for transaction');
        });
        expect(error?.message).toContain('Insufficient funds');
        expect(attempts).toBe(1);
        expect(callCount).toBe(1);
    });
    it('exhausts all retries for persistent transient errors', async () => {
        let callCount = 0;
        const { error, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            throw new Error('Service unavailable');
        });
        expect(error?.message).toContain('Service unavailable');
        expect(attempts).toBe(3);
        expect(callCount).toBe(3);
    });
    it('retries unknown errors (might be transient)', async () => {
        let callCount = 0;
        const { error, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            throw new Error('Something completely unexpected happened');
        });
        expect(attempts).toBe(3); // Should exhaust retries
        expect(callCount).toBe(3);
    });
    it('respects overall timeout', async () => {
        const { error, attempts } = await simulateRetryLoop(async () => {
            throw new Error('Connection timeout');
        }, { overallTimeoutMs: 0 } // Immediate timeout
        );
        expect(error?.message).toContain('Timeout');
        expect(attempts).toBe(0);
    });
    it('recovers from transient error mid-retry', async () => {
        let callCount = 0;
        const { result, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('503 Service Unavailable');
            }
            if (callCount === 2) {
                throw new Error('Connection reset');
            }
            return 'finally-success';
        });
        expect(result).toBe('finally-success');
        expect(attempts).toBe(3);
        expect(callCount).toBe(3);
    });
    it('treats block height exceeded as transient', async () => {
        let callCount = 0;
        const { result, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('Transaction block height exceeded');
            }
            return 'success';
        });
        expect(result).toBe('success');
        expect(attempts).toBe(2);
    });
    it('treats rate limit as transient', async () => {
        let callCount = 0;
        const { result, attempts } = await simulateRetryLoop(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('429 Too Many Requests');
            }
            return 'success';
        });
        expect(result).toBe('success');
        expect(attempts).toBe(2);
    });
});
// =============================================================================
// EDGE CASE TESTS
// =============================================================================
describe('Edge Cases', () => {
    it('handles empty error message', () => {
        const error = new Error('');
        expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.UNKNOWN);
    });
    it('is case-insensitive for error matching', () => {
        const upperError = new Error('INVALID PROOF');
        const lowerError = new Error('invalid proof');
        const mixedError = new Error('Invalid Proof');
        expect((0, index_1.classifyError)(upperError)).toBe(index_1.ErrorCategory.VALIDATION);
        expect((0, index_1.classifyError)(lowerError)).toBe(index_1.ErrorCategory.VALIDATION);
        expect((0, index_1.classifyError)(mixedError)).toBe(index_1.ErrorCategory.VALIDATION);
    });
    it('handles errors with multiple matching patterns', () => {
        // Validation should take precedence
        const error = new Error('Invalid proof, connection timed out');
        expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.VALIDATION);
    });
    it('handles very long error messages', () => {
        const longMessage = 'Connection timeout'.repeat(1000);
        const error = new Error(longMessage);
        expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.TRANSIENT_RPC);
    });
    it('handles special characters in error messages', () => {
        const error = new Error('Error: [code=503] service_unavailable');
        expect((0, index_1.classifyError)(error)).toBe(index_1.ErrorCategory.TRANSIENT_RPC);
    });
});
//# sourceMappingURL=retry.test.js.map