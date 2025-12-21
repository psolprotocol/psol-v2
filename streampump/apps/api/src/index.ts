import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { createServer } from 'http';
import { config, logConfigStatus } from './config.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { initializeSocketServer } from './ws/socket.js';
import { sessionRoutes } from './routes/sessions.js';
import { voteRoutes } from './routes/votes.js';
import { tradeRoutes } from './routes/trade.js';
import { imageRoutes } from './routes/images.js';
import { userRoutes } from './routes/users.js';

async function main() {
  console.log('\n🚀 StreamPump API Server\n');
  
  // Log configuration status
  logConfigStatus();
  console.log('');

  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // We use pino directly
    trustProxy: true,
  });

  // Create HTTP server for both Fastify and Socket.IO
  const httpServer = createServer(fastify.server);

  // Register plugins
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN.split(','),
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    }),
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1,
    },
  });

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // API version prefix
  await fastify.register(
    async (api) => {
      await api.register(sessionRoutes);
      await api.register(voteRoutes);
      await api.register(tradeRoutes);
      await api.register(imageRoutes);
      await api.register(userRoutes);
    },
    { prefix: '/v1' }
  );

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    }, 'Unhandled error');

    // Don't expose internal errors in production
    const statusCode = error.statusCode || 500;
    const message = config.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : error.message;

    reply.status(statusCode).send({
      success: false,
      error: message,
      ...(config.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // Connect to databases
  try {
    await connectDatabase();
    await connectRedis();
  } catch (error) {
    logger.error({ error }, 'Failed to connect to databases');
    console.error('\n❌ Database connection failed.');
    console.error('   Make sure PostgreSQL and Redis are running.');
    console.error('   Run: docker-compose up -d\n');
    process.exit(1);
  }

  // Initialize WebSocket server
  initializeSocketServer(httpServer);

  // Start server
  try {
    await fastify.ready();
    
    httpServer.listen(config.API_PORT, '0.0.0.0', () => {
      console.log(`\n✅ API server running at http://localhost:${config.API_PORT}`);
      console.log(`   WebSocket server running at ws://localhost:${config.API_PORT}/sessions`);
      console.log(`   Health check: http://localhost:${config.API_PORT}/health\n`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    httpServer.close();
    await fastify.close();
    await disconnectDatabase();
    await disconnectRedis();
    
    console.log('Server shut down successfully.\n');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
