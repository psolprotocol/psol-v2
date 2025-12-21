import { prisma } from '../lib/prisma.js';
import { getVoteCounts, setVoteCounts, setSessionCountdown, clearSessionCountdown } from '../lib/redis.js';
import { sessionLogger as logger } from '../lib/logger.js';
import { emitSessionUpdate, startCountdown, stopCountdown } from '../ws/socket.js';
import { generateSessionCode, canTransitionTo, type SessionStatus, type VoteResult } from '@streampump/shared';
import { config } from '../config.js';
import type { Session, OptionSet, LaunchTx, ChainTx } from '@prisma/client';

// ===========================================
// Types
// ===========================================

export interface CreateSessionInput {
  title: string;
  durationSeconds: number;
  options: { name: string; ticker: string; imageId: string }[];
  feeSplits: { walletPubkey: string; bps: number; role: 'STREAMER' | 'MOD' | 'PLATFORM' }[];
  createdById: string;
}

export interface SessionWithDetails extends Session {
  options: OptionSet | null;
  feeSplits: { id: string; walletPubkey: string; bps: number; role: string }[];
  images: { id: string; url: string }[];
  voteResults?: VoteResult[];
  launchTx?: LaunchTx | null;
  chainTxs?: ChainTx[];
}

// ===========================================
// Session CRUD
// ===========================================

export async function createSession(input: CreateSessionInput): Promise<SessionWithDetails> {
  const code = generateSessionCode();
  
  logger.info({ title: input.title, code }, 'Creating new session');
  
  // Add platform fee if configured
  const feeSplits = [...input.feeSplits];
  if (config.PLATFORM_WALLET_PUBKEY && config.PLATFORM_FEE_BPS > 0) {
    feeSplits.push({
      walletPubkey: config.PLATFORM_WALLET_PUBKEY,
      bps: config.PLATFORM_FEE_BPS,
      role: 'PLATFORM' as const,
    });
  }
  
  const session = await prisma.session.create({
    data: {
      code,
      title: input.title,
      durationSeconds: input.durationSeconds,
      createdById: input.createdById,
      options: {
        create: {
          options: input.options.map((opt, index) => ({
            index,
            name: opt.name,
            ticker: opt.ticker,
            imageId: opt.imageId,
          })),
        },
      },
      feeSplits: {
        createMany: {
          data: feeSplits,
        },
      },
    },
    include: {
      options: true,
      feeSplits: true,
      images: {
        select: { id: true, url: true },
      },
    },
  });
  
  // Create audit log
  await createAuditLog(session.id, 'SESSION_CREATED', { title: input.title });
  
  logger.info({ sessionId: session.id, code }, 'Session created');
  return session;
}

export async function getSession(sessionId: string): Promise<SessionWithDetails | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      options: true,
      feeSplits: true,
      images: {
        select: { id: true, url: true },
      },
      launchTx: true,
      chainTxs: true,
    },
  });
  
  if (!session) return null;
  
  // Get vote results if voting or finalized
  if (['VOTING', 'FINALIZED', 'LAUNCH_TX_READY', 'LAUNCHED'].includes(session.status)) {
    const voteResults = await getVoteResults(session);
    return { ...session, voteResults };
  }
  
  return session;
}

export async function getSessionByCode(code: string): Promise<SessionWithDetails | null> {
  const session = await prisma.session.findUnique({
    where: { code },
    include: {
      options: true,
      feeSplits: true,
      images: {
        select: { id: true, url: true },
      },
      launchTx: true,
      chainTxs: true,
    },
  });
  
  if (!session) return null;
  
  if (['VOTING', 'FINALIZED', 'LAUNCH_TX_READY', 'LAUNCHED'].includes(session.status)) {
    const voteResults = await getVoteResults(session);
    return { ...session, voteResults };
  }
  
  return session;
}

export async function getUserSessions(userId: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      options: true,
      chainTxs: {
        where: { kind: 'LAUNCH', status: 'CONFIRMED' },
        take: 1,
      },
    },
  });
}

// ===========================================
// State Transitions
// ===========================================

export async function startVoting(sessionId: string): Promise<SessionWithDetails> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { options: true },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (!canTransitionTo(session.status, 'VOTING')) {
    throw new Error(`Cannot start voting from status: ${session.status}`);
  }
  
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + session.durationSeconds * 1000);
  
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'VOTING',
      startedAt,
    },
    include: {
      options: true,
      feeSplits: true,
      images: { select: { id: true, url: true } },
    },
  });
  
  // Initialize vote counts in Redis
  const options = (session.options?.options as { index: number }[]) || [];
  const initialCounts: Record<number, number> = {};
  for (const opt of options) {
    initialCounts[opt.index] = 0;
  }
  await setVoteCounts(sessionId, initialCounts);
  
  // Set countdown in Redis
  await setSessionCountdown(sessionId, endsAt);
  
  // Start countdown timer (emits ticks via WebSocket)
  startCountdown(session.code, sessionId, session.durationSeconds);
  
  // Emit session update
  emitSessionUpdate(session.code, {
    sessionId,
    status: 'VOTING',
    updatedAt: updated.updatedAt.toISOString(),
  });
  
  await createAuditLog(sessionId, 'VOTING_STARTED', { startedAt, endsAt });
  logger.info({ sessionId, endsAt }, 'Voting started');
  
  return updated;
}

export async function stopVoting(sessionId: string): Promise<SessionWithDetails> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { options: true },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (!canTransitionTo(session.status, 'FINALIZED')) {
    throw new Error(`Cannot stop voting from status: ${session.status}`);
  }
  
  // Stop countdown
  stopCountdown(session.code);
  await clearSessionCountdown(sessionId);
  
  // Calculate winner
  const voteCounts = await getVoteCounts(sessionId);
  const options = (session.options?.options as { index: number; name: string; ticker: string }[]) || [];
  
  let winnerIndex = 0;
  let maxVotes = 0;
  
  for (const opt of options) {
    const count = voteCounts[opt.index] || 0;
    if (count > maxVotes) {
      maxVotes = count;
      winnerIndex = opt.index;
    }
  }
  
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'FINALIZED',
      endedAt: new Date(),
      winnerOptionIndex: winnerIndex,
    },
    include: {
      options: true,
      feeSplits: true,
      images: { select: { id: true, url: true } },
    },
  });
  
  // Emit session update
  emitSessionUpdate(session.code, {
    sessionId,
    status: 'FINALIZED',
    updatedAt: updated.updatedAt.toISOString(),
  });
  
  await createAuditLog(sessionId, 'VOTING_STOPPED', { 
    winnerIndex, 
    voteCounts,
  });
  
  logger.info({ sessionId, winnerIndex, maxVotes }, 'Voting stopped');
  
  const voteResults = await getVoteResults(updated);
  return { ...updated, voteResults };
}

export async function vetoWinner(
  sessionId: string,
  useSecondPlace: boolean
): Promise<SessionWithDetails> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { options: true },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (session.status !== 'FINALIZED') {
    throw new Error('Can only veto winner when session is finalized');
  }
  
  if (!useSecondPlace) {
    // No veto, just confirm winner
    return getSession(sessionId) as Promise<SessionWithDetails>;
  }
  
  // Find second place
  const voteCounts = await getVoteCounts(sessionId);
  const options = (session.options?.options as { index: number }[]) || [];
  
  const sortedOptions = [...options].sort((a, b) => {
    return (voteCounts[b.index] || 0) - (voteCounts[a.index] || 0);
  });
  
  if (sortedOptions.length < 2) {
    throw new Error('Not enough options to veto winner');
  }
  
  const secondPlaceIndex = sortedOptions[1].index;
  
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      vetoedWinnerIndex: session.winnerOptionIndex,
      winnerOptionIndex: secondPlaceIndex,
    },
    include: {
      options: true,
      feeSplits: true,
      images: { select: { id: true, url: true } },
    },
  });
  
  await createAuditLog(sessionId, 'WINNER_VETOED', {
    originalWinner: session.winnerOptionIndex,
    newWinner: secondPlaceIndex,
  });
  
  logger.info({ sessionId, originalWinner: session.winnerOptionIndex, newWinner: secondPlaceIndex }, 'Winner vetoed');
  
  const voteResults = await getVoteResults(updated);
  return { ...updated, voteResults };
}

export async function setSessionStatus(
  sessionId: string,
  status: SessionStatus,
  additionalData?: { mintAddress?: string }
): Promise<Session> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (!canTransitionTo(session.status, status)) {
    throw new Error(`Cannot transition from ${session.status} to ${status}`);
  }
  
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status,
      ...additionalData,
    },
  });
  
  // Emit session update
  emitSessionUpdate(session.code, {
    sessionId,
    status,
    updatedAt: updated.updatedAt.toISOString(),
    mintAddress: additionalData?.mintAddress,
  });
  
  await createAuditLog(sessionId, `STATUS_CHANGED_TO_${status}`, additionalData);
  
  return updated;
}

// ===========================================
// Vote Results
// ===========================================

async function getVoteResults(session: SessionWithDetails | Session & { options: OptionSet | null }): Promise<VoteResult[]> {
  const voteCounts = await getVoteCounts(session.id);
  const options = (session.options?.options as { index: number; name: string; ticker: string; imageId: string }[]) || [];
  
  // Get images for the options
  const imageIds = options.map(opt => opt.imageId);
  const images = await prisma.imageAsset.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, url: true },
  });
  const imageMap = new Map(images.map(img => [img.id, img.url]));
  
  const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
  
  return options.map(opt => ({
    optionIndex: opt.index,
    name: opt.name,
    ticker: opt.ticker,
    imageUrl: imageMap.get(opt.imageId) || '',
    voteCount: voteCounts[opt.index] || 0,
    percentage: totalVotes > 0 ? ((voteCounts[opt.index] || 0) / totalVotes) * 100 : 0,
  })).sort((a, b) => b.voteCount - a.voteCount);
}

// ===========================================
// Audit Logging
// ===========================================

async function createAuditLog(
  sessionId: string,
  action: string,
  details?: unknown,
  userId?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      sessionId,
      action,
      details: details as object,
      userId,
    },
  });
}
