import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { castVoteSchema } from '@streampump/shared';
import { verifyAuthToken } from '../middleware/auth.js';
import { votingRateLimit } from '../middleware/rateLimit.js';
import * as voteService from '../services/vote.service.js';
import { getSessionByCode } from '../services/session.service.js';
import { voteLogger as logger } from '../lib/logger.js';

const sessionCodeParams = z.object({
  sessionCode: z.string().min(6).max(12),
});

export async function voteRoutes(fastify: FastifyInstance): Promise<void> {
  // Cast a vote
  fastify.post(
    '/vote/:sessionCode',
    {
      preHandler: [verifyAuthToken, votingRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);
        const { optionIndex } = castVoteSchema.parse(request.body);
        const twitchUserId = request.user!.twitchId;

        // Get session by code
        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        const result = await voteService.castVote({
          sessionId: session.id,
          twitchUserId,
          optionIndex,
        });

        if (!result.success) {
          const statusCode = result.alreadyVoted ? 409 : 400;
          return reply.status(statusCode).send({
            success: false,
            error: result.message,
            alreadyVoted: result.alreadyVoted,
          });
        }

        return {
          success: true,
          message: result.message,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }
        logger.error({ error }, 'Failed to cast vote');
        throw error;
      }
    }
  );

  // Get vote results (for overlay polling fallback)
  fastify.get(
    '/vote/:sessionCode/results',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);

        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        // Get vote results
        const results = await voteService.getVoteResultsForSession({
          id: session.id,
          code: session.code,
          options: session.options,
        });

        const totalVotes = results.reduce((sum, r) => sum + r.voteCount, 0);

        return {
          success: true,
          data: {
            sessionId: session.id,
            status: session.status,
            results,
            totalVotes,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            durationSeconds: session.durationSeconds,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid session code',
          });
        }
        throw error;
      }
    }
  );

  // Check if user has voted
  fastify.get(
    '/vote/:sessionCode/status',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);
        const twitchUserId = request.user!.twitchId;

        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        const hasVoted = await voteService.hasUserVoted(session.id, twitchUserId);

        return {
          success: true,
          data: {
            hasVoted,
            sessionStatus: session.status,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid session code',
          });
        }
        throw error;
      }
    }
  );

  // Get session info for voting (public, no auth required)
  fastify.get(
    '/vote/:sessionCode/session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);

        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        // Only return necessary public info
        const options = (session.options?.options as { index: number; name: string; ticker: string; imageId: string }[]) || [];

        return {
          success: true,
          data: {
            code: session.code,
            title: session.title,
            status: session.status,
            durationSeconds: session.durationSeconds,
            startedAt: session.startedAt,
            options: options.map(opt => ({
              index: opt.index,
              name: opt.name,
              ticker: opt.ticker,
              imageUrl: session.images.find(img => img.id === opt.imageId)?.url,
            })),
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid session code',
          });
        }
        throw error;
      }
    }
  );
}
