import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  logger.error({ error: err.message }, 'Redis error');
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('reconnecting', () => {
  logger.warn('Reconnecting to Redis...');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error) {
    // If already connected, ignore
    if ((error as Error).message?.includes('already connecting')) {
      return;
    }
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Disconnected from Redis');
}

// ===========================================
// Vote Count Cache
// ===========================================

const VOTE_COUNT_PREFIX = 'votes:';
const VOTE_COUNT_TTL = 3600; // 1 hour

export async function getVoteCounts(sessionId: string): Promise<Record<number, number>> {
  const key = `${VOTE_COUNT_PREFIX}${sessionId}`;
  const counts = await redis.hgetall(key);
  
  const result: Record<number, number> = {};
  for (const [optionIndex, count] of Object.entries(counts)) {
    result[parseInt(optionIndex, 10)] = parseInt(count, 10);
  }
  return result;
}

export async function incrementVoteCount(sessionId: string, optionIndex: number): Promise<number> {
  const key = `${VOTE_COUNT_PREFIX}${sessionId}`;
  const newCount = await redis.hincrby(key, optionIndex.toString(), 1);
  await redis.expire(key, VOTE_COUNT_TTL);
  return newCount;
}

export async function setVoteCounts(sessionId: string, counts: Record<number, number>): Promise<void> {
  const key = `${VOTE_COUNT_PREFIX}${sessionId}`;
  if (Object.keys(counts).length === 0) return;
  
  const data: Record<string, string> = {};
  for (const [optionIndex, count] of Object.entries(counts)) {
    data[optionIndex.toString()] = count.toString();
  }
  await redis.hset(key, data);
  await redis.expire(key, VOTE_COUNT_TTL);
}

export async function clearVoteCounts(sessionId: string): Promise<void> {
  const key = `${VOTE_COUNT_PREFIX}${sessionId}`;
  await redis.del(key);
}

// ===========================================
// Rate Limiting
// ===========================================

const RATE_LIMIT_PREFIX = 'ratelimit:';

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
  const windowStart = now - windowMs;

  // Remove old entries
  await redis.zremrangebyscore(redisKey, 0, windowStart);

  // Count current entries
  const count = await redis.zcard(redisKey);

  if (count >= maxRequests) {
    const oldestEntry = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetAt = oldestEntry.length > 1 ? parseInt(oldestEntry[1] as string, 10) + windowMs : now + windowMs;
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add new entry
  await redis.zadd(redisKey, now.toString(), `${now}-${Math.random()}`);
  await redis.pexpire(redisKey, windowMs);

  return {
    allowed: true,
    remaining: maxRequests - count - 1,
    resetAt: now + windowMs,
  };
}

// ===========================================
// Session Countdown
// ===========================================

const COUNTDOWN_PREFIX = 'countdown:';

export async function setSessionCountdown(sessionId: string, endsAt: Date): Promise<void> {
  const key = `${COUNTDOWN_PREFIX}${sessionId}`;
  await redis.set(key, endsAt.toISOString(), 'EX', 3600);
}

export async function getSessionCountdown(sessionId: string): Promise<Date | null> {
  const key = `${COUNTDOWN_PREFIX}${sessionId}`;
  const value = await redis.get(key);
  return value ? new Date(value) : null;
}

export async function clearSessionCountdown(sessionId: string): Promise<void> {
  const key = `${COUNTDOWN_PREFIX}${sessionId}`;
  await redis.del(key);
}
