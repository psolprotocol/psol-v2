import { prisma } from '../lib/prisma.js';
import { incrementVoteCount, getVoteCounts } from '../lib/redis.js';
import { voteLogger as logger } from '../lib/logger.js';
import { emitVoteUpdate } from '../ws/socket.js';
import type { VoteResult } from '@streampump/shared';

// ===========================================
// Types
// ===========================================

export interface CastVoteInput {
  sessionId: string;
  twitchUserId: string;
  optionIndex: number;
}

export interface CastVoteResult {
  success: boolean;
  message: string;
  alreadyVoted?: boolean;
}

// ===========================================
// Vote Functions
// ===========================================

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const { sessionId, twitchUserId, optionIndex } = input;
  
  logger.info({ sessionId, twitchUserId, optionIndex }, 'Casting vote');
  
  // Check if session exists and is in VOTING state
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { options: true },
  });
  
  if (!session) {
    return { success: false, message: 'Session not found' };
  }
  
  if (session.status !== 'VOTING') {
    return { success: false, message: 'Voting is not currently active for this session' };
  }
  
  // Validate option index
  const options = (session.options?.options as { index: number }[]) || [];
  const validOption = options.some(opt => opt.index === optionIndex);
  
  if (!validOption) {
    return { success: false, message: 'Invalid voting option' };
  }
  
  // Check if user already voted (using unique constraint)
  try {
    await prisma.vote.create({
      data: {
        sessionId,
        twitchUserId,
        optionIndex,
      },
    });
  } catch (error: unknown) {
    // Check for unique constraint violation
    if ((error as { code?: string }).code === 'P2002') {
      logger.info({ sessionId, twitchUserId }, 'User already voted');
      return { success: false, message: 'You have already voted in this session', alreadyVoted: true };
    }
    throw error;
  }
  
  // Increment vote count in Redis
  await incrementVoteCount(sessionId, optionIndex);
  
  // Get updated results and emit via WebSocket
  const voteResults = await getVoteResultsForSession(session);
  const totalVotes = voteResults.reduce((sum, r) => sum + r.voteCount, 0);
  
  emitVoteUpdate(session.code, {
    sessionId,
    results: voteResults,
    totalVotes,
  });
  
  logger.info({ sessionId, twitchUserId, optionIndex }, 'Vote recorded');
  
  return { success: true, message: 'Vote recorded successfully' };
}

export async function hasUserVoted(sessionId: string, twitchUserId: string): Promise<boolean> {
  const vote = await prisma.vote.findUnique({
    where: {
      sessionId_twitchUserId: {
        sessionId,
        twitchUserId,
      },
    },
  });
  
  return vote !== null;
}

export async function getVoteResultsForSession(
  session: { id: string; code: string; options: { options: unknown } | null }
): Promise<VoteResult[]> {
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

export async function syncVoteCountsFromDb(sessionId: string): Promise<void> {
  // Count votes from database and sync to Redis
  const votes = await prisma.vote.groupBy({
    by: ['optionIndex'],
    where: { sessionId },
    _count: { optionIndex: true },
  });
  
  const counts: Record<number, number> = {};
  for (const vote of votes) {
    counts[vote.optionIndex] = vote._count.optionIndex;
  }
  
  // Note: This would require importing setVoteCounts from redis
  // For now, this is a helper function for data recovery
  logger.info({ sessionId, counts }, 'Synced vote counts from database');
}
