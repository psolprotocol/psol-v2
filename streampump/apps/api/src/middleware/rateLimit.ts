import { FastifyRequest, FastifyReply } from 'fastify';
import { checkRateLimit } from '../lib/redis.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipFailedRequests?: boolean;
  message?: string;
}

const defaultOptions: Required<RateLimitOptions> = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
  keyGenerator: (request) => {
    // Use user ID if authenticated, otherwise IP
    const userId = request.user?.id;
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    return userId || String(ip);
  },
  skipFailedRequests: false,
  message: 'Too many requests, please try again later.',
};

export function createRateLimiter(options: RateLimitOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const key = `${request.routeOptions.url}:${opts.keyGenerator(request)}`;

    try {
      const result = await checkRateLimit(key, opts.maxRequests, opts.windowMs);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', opts.maxRequests);
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        logger.warn({ key, resetAt: result.resetAt }, 'Rate limit exceeded');
        
        reply.header('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
        
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: opts.message,
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        });
      }
    } catch (error) {
      // If Redis fails, log but don't block the request
      logger.error({ error, key }, 'Rate limit check failed');
    }
  };
}

// Pre-configured rate limiters for different endpoints
export const standardRateLimit = createRateLimiter();

export const strictRateLimit = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  message: 'Rate limit exceeded for this action. Please wait before trying again.',
});

export const votingRateLimit = createRateLimiter({
  windowMs: 60000,
  maxRequests: 5,
  message: 'Too many voting attempts. Please wait before trying again.',
});

export const txRateLimit = createRateLimiter({
  windowMs: 60000,
  maxRequests: 3,
  message: 'Too many transaction requests. Please wait before trying again.',
});
