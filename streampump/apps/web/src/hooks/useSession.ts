'use client';

import { useState, useEffect, useCallback } from 'react';
import { sessionsApi, voteApi } from '@/lib/api';

interface VoteResult {
  optionIndex: number;
  name: string;
  ticker: string;
  imageUrl: string;
  voteCount: number;
  percentage: number;
}

interface SessionData {
  id: string;
  code: string;
  title: string;
  status: string;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  winnerOptionIndex: number | null;
  mintAddress: string | null;
  options: {
    options: { index: number; name: string; ticker: string; imageId: string }[];
  } | null;
  images: { id: string; url: string }[];
  feeSplits: { walletPubkey: string; bps: number; role: string }[];
  voteResults?: VoteResult[];
  overlayToken?: string;
}

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const response = await sessionsApi.get(sessionId);
      setSession(response.data as SessionData);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const updateSession = useCallback((updates: Partial<SessionData>) => {
    setSession((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const updateVoteResults = useCallback((results: VoteResult[]) => {
    setSession((prev) => (prev ? { ...prev, voteResults: results } : null));
  }, []);

  return {
    session,
    loading,
    error,
    refetch: fetchSession,
    updateSession,
    updateVoteResults,
  };
}

export function useSessionByCode(sessionCode: string) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const response = await voteApi.getSession(sessionCode);
      setSession(response.data as SessionData);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionCode]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    session,
    loading,
    error,
    refetch: fetchSession,
  };
}
