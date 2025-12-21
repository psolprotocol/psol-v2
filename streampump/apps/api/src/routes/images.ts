import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { verifyAuthToken } from '../middleware/auth.js';
import { strictRateLimit } from '../middleware/rateLimit.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function imageRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize upload directory
  await ensureUploadDir();

  // Upload image
  fastify.post(
    '/images/upload',
    {
      preHandler: [verifyAuthToken, strictRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await request.file();
        
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: 'No file uploaded',
          });
        }

        // Validate mime type
        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
          return reply.status(400).send({
            success: false,
            error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          });
        }

        // Read file buffer
        const buffer = await data.toBuffer();

        // Check file size
        if (buffer.length > MAX_FILE_SIZE) {
          return reply.status(400).send({
            success: false,
            error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          });
        }

        // Calculate hash
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

        // Check if image already exists
        const existing = await prisma.imageAsset.findFirst({
          where: { sha256 },
        });

        if (existing) {
          return {
            success: true,
            data: existing,
          };
        }

        // Generate filename
        const ext = data.mimetype.split('/')[1];
        const filename = `${sha256}.${ext}`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // Save file
        await fs.writeFile(filepath, buffer);

        // Get image dimensions (simplified - in production use sharp)
        // For now, just use placeholder dimensions
        const width = 256;
        const height = 256;

        // Create database record
        const url = `${config.API_URL}/images/${filename}`;
        
        const image = await prisma.imageAsset.create({
          data: {
            url,
            sha256,
            mime: data.mimetype,
            width,
            height,
          },
        });

        logger.info({ imageId: image.id, sha256 }, 'Image uploaded');

        return {
          success: true,
          data: image,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to upload image');
        return reply.status(500).send({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }
  );

  // Serve uploaded images
  fastify.get(
    '/images/:filename',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { filename } = z.object({
          filename: z.string(),
        }).parse(request.params);

        // Sanitize filename
        const sanitized = path.basename(filename);
        const filepath = path.join(UPLOAD_DIR, sanitized);

        // Check if file exists
        try {
          await fs.access(filepath);
        } catch {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Determine content type from extension
        const ext = path.extname(filename).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';

        // Read and send file
        const buffer = await fs.readFile(filepath);
        
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=31536000'); // 1 year
        return reply.send(buffer);
      } catch (error) {
        logger.error({ error }, 'Failed to serve image');
        return reply.status(500).send({
          success: false,
          error: 'Failed to serve image',
        });
      }
    }
  );

  // Get user's uploaded images
  fastify.get(
    '/images',
    {
      preHandler: [verifyAuthToken],
    },
    async () => {
      const images = await prisma.imageAsset.findMany({
        where: { sessionId: null }, // Images not yet attached to a session
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return {
        success: true,
        data: images,
      };
    }
  );

  // Attach images to session
  fastify.post(
    '/images/attach',
    {
      preHandler: [verifyAuthToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const schema = z.object({
          sessionId: z.string().uuid(),
          imageIds: z.array(z.string().uuid()).min(1).max(10),
        });

        const { sessionId, imageIds } = schema.parse(request.body);

        // Verify session ownership
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
        });

        if (!session) {
          return reply.status(404).send({
            success: false,
            error: 'Session not found',
          });
        }

        if (session.createdById !== request.user!.id) {
          return reply.status(403).send({
            success: false,
            error: 'You do not own this session',
          });
        }

        // Attach images to session
        await prisma.imageAsset.updateMany({
          where: { id: { in: imageIds } },
          data: { sessionId },
        });

        return {
          success: true,
          message: 'Images attached to session',
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
