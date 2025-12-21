import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config.js';
import { wsLogger as logger } from '../lib/logger.js';
import type { VoteResult, ChainTxKind, ChainTxStatus, SessionStatus } from '@streampump/shared';

// ===========================================
// Types
// ===========================================

interface ServerToClientEvents {
  'session:update': (data: SessionUpdatePayload) => void;
  'vote:update': (data: VoteUpdatePayload) => void;
  'countdown:tick': (data: CountdownTickPayload) => void;
  'tx:update': (data: TxUpdatePayload) => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  'join:session': (sessionCode: string) => void;
  'leave:session': (sessionCode: string) => void;
}

interface SessionUpdatePayload {
  sessionId: string;
  status: SessionStatus;
  updatedAt: string;
  mintAddress?: string;
}

interface VoteUpdatePayload {
  sessionId: string;
  results: VoteResult[];
  totalVotes: number;
}

interface CountdownTickPayload {
  sessionId: string;
  remainingSeconds: number;
  endsAt: string;
}

interface TxUpdatePayload {
  sessionId: string;
  kind: ChainTxKind;
  status: ChainTxStatus;
  signature?: string;
  error?: string;
  explorerUrl?: string;
}

// ===========================================
// Socket.IO Server
// ===========================================

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: config.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Namespace for sessions
  const sessionsNs = io.of('/sessions');

  sessionsNs.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Join a session room
    socket.on('join:session', (sessionCode: string) => {
      const room = `session:${sessionCode}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, 'Client joined session room');
    });

    // Leave a session room
    socket.on('leave:session', (sessionCode: string) => {
      const room = `session:${sessionCode}`;
      socket.leave(room);
      logger.info({ socketId: socket.id, room }, 'Client left session room');
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Client disconnected');
    });

    socket.on('error', (error) => {
      logger.error({ socketId: socket.id, error: error.message }, 'Socket error');
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

export function getSocketServer(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error('Socket server not initialized');
  }
  return io;
}

// ===========================================
// Emit Functions
// ===========================================

export function emitSessionUpdate(
  sessionCode: string,
  payload: SessionUpdatePayload
): void {
  if (!io) return;
  
  const room = `session:${sessionCode}`;
  io.of('/sessions').to(room).emit('session:update', payload);
  
  logger.debug({ sessionCode, status: payload.status }, 'Emitted session:update');
}

export function emitVoteUpdate(
  sessionCode: string,
  payload: VoteUpdatePayload
): void {
  if (!io) return;
  
  const room = `session:${sessionCode}`;
  io.of('/sessions').to(room).emit('vote:update', payload);
  
  logger.debug({ 
    sessionCode, 
    totalVotes: payload.totalVotes 
  }, 'Emitted vote:update');
}

export function emitCountdownTick(
  sessionCode: string,
  payload: CountdownTickPayload
): void {
  if (!io) return;
  
  const room = `session:${sessionCode}`;
  io.of('/sessions').to(room).emit('countdown:tick', payload);
}

export function emitTxUpdate(
  sessionCode: string,
  payload: TxUpdatePayload
): void {
  if (!io) return;
  
  const room = `session:${sessionCode}`;
  io.of('/sessions').to(room).emit('tx:update', payload);
  
  logger.debug({ 
    sessionCode, 
    kind: payload.kind,
    status: payload.status,
  }, 'Emitted tx:update');
}

// ===========================================
// Countdown Timer Management
// ===========================================

const activeCountdowns = new Map<string, NodeJS.Timeout>();

export function startCountdown(
  sessionCode: string,
  sessionId: string,
  durationSeconds: number
): Date {
  // Clear any existing countdown
  stopCountdown(sessionCode);
  
  const endsAt = new Date(Date.now() + durationSeconds * 1000);
  
  // Emit ticks every second
  const interval = setInterval(() => {
    const remainingSeconds = Math.max(
      0,
      Math.floor((endsAt.getTime() - Date.now()) / 1000)
    );
    
    emitCountdownTick(sessionCode, {
      sessionId,
      remainingSeconds,
      endsAt: endsAt.toISOString(),
    });
    
    if (remainingSeconds <= 0) {
      stopCountdown(sessionCode);
    }
  }, 1000);
  
  activeCountdowns.set(sessionCode, interval);
  logger.info({ sessionCode, durationSeconds, endsAt }, 'Started countdown');
  
  return endsAt;
}

export function stopCountdown(sessionCode: string): void {
  const interval = activeCountdowns.get(sessionCode);
  if (interval) {
    clearInterval(interval);
    activeCountdowns.delete(sessionCode);
    logger.info({ sessionCode }, 'Stopped countdown');
  }
}

export function getActiveCountdownsCount(): number {
  return activeCountdowns.size;
}
