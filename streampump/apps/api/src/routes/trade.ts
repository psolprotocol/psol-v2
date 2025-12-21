import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tradeQuoteRequestSchema, createSwapTxRequestSchema, PRESET_AMOUNTS } from '@streampump/shared';
import { verifyAuthToken } from '../middleware/auth.js';
import { txRateLimit } from '../middleware/rateLimit.js';
import { getSessionByCode } from '../services/session.service.js';
import * as txService from '../services/tx.service.js';
import * as bagsClient from '../bags/client.js';
import { txLogger as logger } from '../lib/logger.js';

const sessionCodeParams = z.object({
  sessionCode: z.string().min(6).max(12),
});

const broadcastSwapSchema = z.object({
  signedTransaction: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

export async function tradeRoutes(fastify: FastifyInstance): Promise<void> {
  // Get trade quote
  fastify.post(
    '/trade/:sessionCode/quote',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);
        const { amountSol } = tradeQuoteRequestSchema.parse(request.body);

        // Get session
        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        if (session.status !== 'LAUNCHED') {
          return reply.status(400).send({
            success: false,
            error: 'Token is not yet launched',
          });
        }

        if (!session.mintAddress) {
          return reply.status(400).send({
            success: false,
            error: 'Token mint address not available',
          });
        }

        // Get quote from Bags
        const quote = await bagsClient.getTradeQuote({
          mint: session.mintAddress,
          amountSol,
          side: 'buy',
        });

        return {
          success: true,
          data: {
            inputAmount: quote.inputAmount,
            outputAmount: quote.outputAmount,
            priceImpact: quote.priceImpact,
            fee: quote.fee,
            presetAmounts: PRESET_AMOUNTS,
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('BAGS_API_KEY')) {
          return reply.status(503).send({
            success: false,
            error: 'Service Unavailable',
            message: errorMessage,
          });
        }

        logger.error({ error }, 'Failed to get trade quote');
        return reply.status(400).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  // Create swap transaction
  fastify.post(
    '/trade/:sessionCode/swap-tx',
    {
      preHandler: [verifyAuthToken, txRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);
        const { amountSol, userWallet, idempotencyKey } = createSwapTxRequestSchema.parse(request.body);

        // Get session
        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        if (session.status !== 'LAUNCHED') {
          return reply.status(400).send({
            success: false,
            error: 'Token is not yet launched',
          });
        }

        const result = await txService.generateSwapTransaction({
          sessionId: session.id,
          userWallet,
          amountSol,
          idempotencyKey,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('BAGS_API_KEY')) {
          return reply.status(503).send({
            success: false,
            error: 'Service Unavailable',
            message: errorMessage,
          });
        }

        logger.error({ error }, 'Failed to create swap transaction');
        return reply.status(400).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  // Broadcast signed swap transaction
  fastify.post(
    '/trade/:sessionCode/broadcast',
    {
      preHandler: [verifyAuthToken, txRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionCode } = sessionCodeParams.parse(request.params);
        const { signedTransaction, idempotencyKey } = broadcastSwapSchema.parse(request.body);

        // Get session
        const session = await getSessionByCode(sessionCode);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        const result = await txService.broadcastSwapTransaction({
          sessionId: session.id,
          signedTxBase64: signedTransaction,
          userWallet: request.user!.id, // For audit purposes
          idempotencyKey,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }

        logger.error({ error }, 'Failed to broadcast swap transaction');
        return reply.status(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Get session trade info (public)
  fastify.get(
    '/trade/:sessionCode',
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

        if (session.status !== 'LAUNCHED') {
          return reply.status(400).send({
            success: false,
            error: 'Token is not yet launched',
            data: {
              status: session.status,
            },
          });
        }

        // Get winner option
        const options = (session.options?.options as { index: number; name: string; ticker: string; imageId: string }[]) || [];
        const winnerOption = options.find(opt => opt.index === session.winnerOptionIndex);
        const winnerImage = session.images.find(img => img.id === winnerOption?.imageId);

        // Get launch transaction
        const launchTx = session.chainTxs?.find(tx => tx.kind === 'LAUNCH' && tx.status === 'CONFIRMED');

        return {
          success: true,
          data: {
            code: session.code,
            title: session.title,
            status: session.status,
            mintAddress: session.mintAddress,
            token: winnerOption ? {
              name: winnerOption.name,
              ticker: winnerOption.ticker,
              imageUrl: winnerImage?.url,
            } : null,
            launchTx: launchTx ? {
              signature: launchTx.signature,
              confirmedAt: launchTx.confirmedAt,
            } : null,
            presetAmounts: PRESET_AMOUNTS,
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
