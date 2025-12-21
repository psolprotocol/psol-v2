import { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Extend FastifyRequest with user info
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      twitchId: string;
      displayName: string;
    };
    sessionOwner?: boolean;
  }
}

/**
 * Verify NextAuth session token
 */
export async function verifyAuthToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get token from Authorization header
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required. Please log in with Twitch.',
      });
    }

    // For NextAuth tokens, we need to verify with the secret
    const secret = config.NEXTAUTH_SECRET;
    if (!secret) {
      logger.warn('NEXTAUTH_SECRET not configured, using fallback auth');
      // In development, try to decode without verification
      if (config.NODE_ENV === 'development') {
        const payload = jose.decodeJwt(token);
        if (payload.sub) {
          const user = await prisma.user.findUnique({
            where: { id: payload.sub as string },
          });
          if (user) {
            request.user = {
              id: user.id,
              twitchId: user.twitchId,
              displayName: user.displayName,
            };
            return;
          }
        }
      }
      return reply.status(500).send({
        error: 'Configuration Error',
        message: 'NEXTAUTH_SECRET is required for authentication',
      });
    }

    // Verify the token
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);

    if (!payload.sub) {
      return reply.status(401).send({
        error: 'Invalid Token',
        message: 'Token does not contain user information',
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'User Not Found',
        message: 'User no longer exists',
      });
    }

    request.user = {
      id: user.id,
      twitchId: user.twitchId,
      displayName: user.displayName,
    };
  } catch (error) {
    logger.error({ error }, 'Auth verification failed');
    return reply.status(401).send({
      error: 'Authentication Failed',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Verify that the user owns the session
 */
export async function verifySessionOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const sessionId = (request.params as { id?: string }).id;
  if (!sessionId) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Session ID is required',
    });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { createdById: true },
  });

  if (!session) {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'Session not found',
    });
  }

  if (session.createdById !== request.user.id) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'You do not own this session',
    });
  }

  request.sessionOwner = true;
}

/**
 * Verify overlay token (for read-only access)
 */
export async function verifyOverlayToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = (request.query as { token?: string }).token;

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Overlay token required',
      });
    }

    const secret = config.OVERLAY_TOKEN_SECRET;
    if (!secret) {
      // In development, allow without verification
      if (config.NODE_ENV === 'development') {
        return;
      }
      return reply.status(500).send({
        error: 'Configuration Error',
        message: 'OVERLAY_TOKEN_SECRET is required',
      });
    }

    const secretKey = new TextEncoder().encode(secret);
    await jose.jwtVerify(token, secretKey);
  } catch (error) {
    logger.error({ error }, 'Overlay token verification failed');
    return reply.status(401).send({
      error: 'Invalid Token',
      message: 'Invalid or expired overlay token',
    });
  }
}

/**
 * Generate an overlay token for a session
 */
export async function generateOverlayToken(sessionCode: string): Promise<string> {
  const secret = config.OVERLAY_TOKEN_SECRET;
  if (!secret) {
    throw new Error('OVERLAY_TOKEN_SECRET is required to generate overlay tokens');
  }

  const secretKey = new TextEncoder().encode(secret);
  const token = await new jose.SignJWT({ sessionCode })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secretKey);

  return token;
}
