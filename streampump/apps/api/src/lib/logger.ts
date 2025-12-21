import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: config.NODE_ENV === 'development' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'streampump-api',
    env: config.NODE_ENV,
  },
});

// Create child loggers for different modules
export const createLogger = (module: string) => logger.child({ module });

// Request logger
export const requestLogger = createLogger('request');
export const wsLogger = createLogger('websocket');
export const bagsLogger = createLogger('bags-api');
export const txLogger = createLogger('transactions');
export const voteLogger = createLogger('voting');
export const sessionLogger = createLogger('sessions');
