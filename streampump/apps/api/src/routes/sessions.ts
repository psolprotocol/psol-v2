import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSessionSchema } from '@streampump/shared';
import { verifyAuthToken, verifySessionOwner, generateOverlayToken } from '../middleware/auth.js';
import { strictRateLimit, txRateLimit } from '../middleware/rateLimit.js';
import * as sessionService from '../services/session.service.js';
import * as txService from '../services/tx.service.js';
import { sessionLogger as logger } from '../lib/logger.js';

// Route parameter schemas
const sessionIdParams = z.object({
  id: z.string().uuid(),
});

const idempotencySchema = z.object({
  idempotencyKey: z.string().uuid(),
});

const broadcastSchema = z.object({
  signedTransaction: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  // Create session
  fastify.post(
    '/sessions',
    {
      preHandler: [verifyAuthToken, strictRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createSessionSchema.parse(request.body);
        const userId = request.user!.id;

        const session = await sessionService.createSession({
          ...body,
          createdById: userId,
        });

        return reply.status(201).send({
          success: true,
          data: session,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }
        logger.error({ error }, 'Failed to create session');
        throw error;
      }
    }
  );

  // Get session by ID
  fastify.get(
    '/sessions/:id',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const session = await sessionService.getSession(id);

        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        // Generate overlay token for session owner
        let overlayToken: string | undefined;
        if (session.createdById === request.user!.id) {
          try {
            overlayToken = await generateOverlayToken(session.code);
          } catch {
            // Ignore if secret not configured
          }
        }

        return {
          success: true,
          data: {
            ...session,
            overlayToken,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid session ID',
          });
        }
        throw error;
      }
    }
  );

  // Get user's sessions
  fastify.get(
    '/sessions',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest) => {
      const sessions = await sessionService.getUserSessions(request.user!.id);
      return {
        success: true,
        data: sessions,
      };
    }
  );

  // Start voting
  fastify.post(
    '/sessions/:id/start',
    {
      preHandler: [verifyAuthToken, verifySessionOwner, strictRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const session = await sessionService.startVoting(id);

        return {
          success: true,
          data: session,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to start voting');
        return reply.status(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Stop voting
  fastify.post(
    '/sessions/:id/stop',
    {
      preHandler: [verifyAuthToken, verifySessionOwner, strictRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const session = await sessionService.stopVoting(id);

        return {
          success: true,
          data: session,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to stop voting');
        return reply.status(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Finalize (with optional veto)
  fastify.post(
    '/sessions/:id/finalize',
    {
      preHandler: [verifyAuthToken, verifySessionOwner, strictRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const body = z.object({
          useSecondPlace: z.boolean().default(false),
        }).parse(request.body || {});

        const session = await sessionService.vetoWinner(id, body.useSecondPlace);

        return {
          success: true,
          data: session,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to finalize session');
        return reply.status(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Generate launch transaction
  fastify.post(
    '/sessions/:id/bags/launch-tx',
    {
      preHandler: [verifyAuthToken, verifySessionOwner, txRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const { idempotencyKey } = idempotencySchema.parse(request.body);

        const result = await txService.generateLaunchTransaction({
          sessionId: id,
          idempotencyKey,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to generate launch transaction');
        
        // Check for specific error types
        const errorMessage = (error as Error).message;
        if (errorMessage.includes('BAGS_API_KEY')) {
          return reply.status(503).send({
            success: false,
            error: 'Service Unavailable',
            message: errorMessage,
          });
        }
        
        return reply.status(400).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  // Broadcast signed launch transaction
  fastify.post(
    '/sessions/:id/broadcast',
    {
      preHandler: [verifyAuthToken, verifySessionOwner, txRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = sessionIdParams.parse(request.params);
        const { signedTransaction, idempotencyKey } = broadcastSchema.parse(request.body);

        const result = await txService.broadcastLaunchTransaction({
          sessionId: id,
          signedTxBase64: signedTransaction,
          idempotencyKey,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to broadcast launch transaction');
        return reply.status(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );
}
