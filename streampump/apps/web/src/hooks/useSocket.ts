'use client';

import { useEffect, useCallback, useRef } from 'react';
import {
  getSocket,
  connectSocket,
  joinSession,
  leaveSession,
  type SessionUpdateEvent,
  type VoteUpdateEvent,
  type CountdownTickEvent,
  type TxUpdateEvent,
} from '@/lib/socket';

interface UseSocketOptions {
  sessionCode: string;
  onSessionUpdate?: (event: SessionUpdateEvent) => void;
  onVoteUpdate?: (event: VoteUpdateEvent) => void;
  onCountdownTick?: (event: CountdownTickEvent) => void;
  onTxUpdate?: (event: TxUpdateEvent) => void;
  autoConnect?: boolean;
}

export function useSocket({
  sessionCode,
  onSessionUpdate,
  onVoteUpdate,
  onCountdownTick,
  onTxUpdate,
  autoConnect = true,
}: UseSocketOptions) {
  const connectedRef = useRef(false);

  const handleSessionUpdate = useCallback(
    (event: SessionUpdateEvent) => {
      onSessionUpdate?.(event);
    },
    [onSessionUpdate]
  );

  const handleVoteUpdate = useCallback(
    (event: VoteUpdateEvent) => {
      onVoteUpdate?.(event);
    },
    [onVoteUpdate]
  );

  const handleCountdownTick = useCallback(
    (event: CountdownTickEvent) => {
      onCountdownTick?.(event);
    },
    [onCountdownTick]
  );

  const handleTxUpdate = useCallback(
    (event: TxUpdateEvent) => {
      onTxUpdate?.(event);
    },
    [onTxUpdate]
  );

  useEffect(() => {
    if (!autoConnect || connectedRef.current) return;

    const socket = getSocket();

    // Connect and join session
    connectSocket();
    joinSession(sessionCode);
    connectedRef.current = true;

    // Set up event listeners
    socket.on('session:update', handleSessionUpdate);
    socket.on('vote:update', handleVoteUpdate);
    socket.on('countdown:tick', handleCountdownTick);
    socket.on('tx:update', handleTxUpdate);

    // Cleanup
    return () => {
      socket.off('session:update', handleSessionUpdate);
      socket.off('vote:update', handleVoteUpdate);
      socket.off('countdown:tick', handleCountdownTick);
      socket.off('tx:update', handleTxUpdate);
      leaveSession(sessionCode);
      connectedRef.current = false;
    };
  }, [
    sessionCode,
    autoConnect,
    handleSessionUpdate,
    handleVoteUpdate,
    handleCountdownTick,
    handleTxUpdate,
  ]);

  return {
    socket: getSocket(),
    isConnected: getSocket().connected,
  };
}
