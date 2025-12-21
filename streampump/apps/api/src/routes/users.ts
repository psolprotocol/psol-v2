import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { walletPubkeySchema } from '@streampump/shared';
import { verifyAuthToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Get current user profile
  fastify.get(
    '/users/me',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
        include: {
          streamerProfile: true,
        },
      });

      return {
        success: true,
        data: user,
      };
    }
  );

  // Update streamer profile (wallet, fee settings)
  fastify.put(
    '/users/me/streamer-profile',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const schema = z.object({
          streamerWalletPubkey: walletPubkeySchema,
          platformFeeBps: z.number().int().min(0).max(10000).optional(),
        });

        const body = schema.parse(request.body);
        const userId = request.user!.id;

        const profile = await prisma.streamerProfile.upsert({
          where: { userId },
          update: {
            streamerWalletPubkey: body.streamerWalletPubkey,
            ...(body.platformFeeBps !== undefined && { platformFeeBps: body.platformFeeBps }),
          },
          create: {
            userId,
            streamerWalletPubkey: body.streamerWalletPubkey,
            platformFeeBps: body.platformFeeBps ?? 0,
          },
        });

        logger.info({ userId, wallet: body.streamerWalletPubkey }, 'Streamer profile updated');

        return {
          success: true,
          data: profile,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  // Sync user from NextAuth (called by web app after auth)
  fastify.post(
    '/users/sync',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const schema = z.object({
          twitchId: z.string().min(1),
          displayName: z.string().min(1),
          email: z.string().email().optional(),
          profileImageUrl: z.string().url().optional(),
        });

        const body = schema.parse(request.body);

        const user = await prisma.user.upsert({
          where: { twitchId: body.twitchId },
          update: {
            displayName: body.displayName,
            email: body.email,
            profileImageUrl: body.profileImageUrl,
          },
          create: {
            twitchId: body.twitchId,
            displayName: body.displayName,
            email: body.email,
            profileImageUrl: body.profileImageUrl,
          },
        });

        logger.info({ userId: user.id, twitchId: body.twitchId }, 'User synced');

        return {
          success: true,
          data: user,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation Error',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );
}
