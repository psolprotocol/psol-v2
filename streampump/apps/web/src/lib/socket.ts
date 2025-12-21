'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/sessions`, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });
  }

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function joinSession(sessionCode: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('join:session', sessionCode);
  } else {
    s.once('connect', () => {
      s.emit('join:session', sessionCode);
    });
  }
}

export function leaveSession(sessionCode: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('leave:session', sessionCode);
  }
}

// Event types
export interface SessionUpdateEvent {
  sessionId: string;
  status: string;
  updatedAt: string;
  mintAddress?: string;
}

export interface VoteUpdateEvent {
  sessionId: string;
  results: {
    optionIndex: number;
    name: string;
    ticker: string;
    imageUrl: string;
    voteCount: number;
    percentage: number;
  }[];
  totalVotes: number;
}

export interface CountdownTickEvent {
  sessionId: string;
  remainingSeconds: number;
  endsAt: string;
}

export interface TxUpdateEvent {
  sessionId: string;
  kind: 'LAUNCH' | 'SWAP';
  status: 'PENDING' | 'BROADCAST' | 'CONFIRMED' | 'FAILED';
  signature?: string;
  error?: string;
  explorerUrl?: string;
}
