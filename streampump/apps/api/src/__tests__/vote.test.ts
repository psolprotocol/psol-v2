import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  session: {
    findUnique: vi.fn(),
  },
  vote: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  imageAsset: {
    findMany: vi.fn(),
  },
};

vi.mock('../lib/prisma.js', () => ({
  prisma: mockPrisma,
}));

// Mock Redis
const mockVoteCounts: Record<string, Record<number, number>> = {};

vi.mock('../lib/redis.js', () => ({
  incrementVoteCount: vi.fn(async (sessionId: string, optionIndex: number) => {
    if (!mockVoteCounts[sessionId]) mockVoteCounts[sessionId] = {};
    mockVoteCounts[sessionId][optionIndex] = (mockVoteCounts[sessionId][optionIndex] || 0) + 1;
    return mockVoteCounts[sessionId][optionIndex];
  }),
  getVoteCounts: vi.fn(async (sessionId: string) => {
    return mockVoteCounts[sessionId] || {};
  }),
}));

// Mock WebSocket
vi.mock('../ws/socket.js', () => ({
  emitVoteUpdate: vi.fn(),
}));

describe('Vote Uniqueness Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset vote counts
    Object.keys(mockVoteCounts).forEach(key => delete mockVoteCounts[key]);
  });

  it('should allow a user to vote once', async () => {
    const sessionId = 'session-1';
    const twitchUserId = 'user-1';
    const optionIndex = 0;

    // Mock session exists and is voting
    mockPrisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      code: 'ABC123',
      status: 'VOTING',
      options: {
        options: [
          { index: 0, name: 'Token A', ticker: 'TOKA', imageId: 'img-1' },
          { index: 1, name: 'Token B', ticker: 'TOKB', imageId: 'img-2' },
        ],
      },
    });

    // Mock vote creation succeeds (first vote)
    mockPrisma.vote.create.mockResolvedValue({
      id: 'vote-1',
      sessionId,
      twitchUserId,
      optionIndex,
    });

    mockPrisma.imageAsset.findMany.mockResolvedValue([
      { id: 'img-1', url: 'https://example.com/img1.png' },
      { id: 'img-2', url: 'https://example.com/img2.png' },
    ]);

    // Import after mocks
    const { castVote } = await import('../services/vote.service.js');

    const result = await castVote({
      sessionId,
      twitchUserId,
      optionIndex,
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Vote recorded successfully');
    expect(mockPrisma.vote.create).toHaveBeenCalledWith({
      data: { sessionId, twitchUserId, optionIndex },
    });
  });

  it('should reject duplicate votes from same user', async () => {
    const sessionId = 'session-1';
    const twitchUserId = 'user-1';
    const optionIndex = 0;

    // Mock session exists and is voting
    mockPrisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      code: 'ABC123',
      status: 'VOTING',
      options: {
        options: [
          { index: 0, name: 'Token A', ticker: 'TOKA', imageId: 'img-1' },
        ],
      },
    });

    // Mock vote creation fails with unique constraint error
    mockPrisma.vote.create.mockRejectedValue({
      code: 'P2002', // Prisma unique constraint violation
    });

    const { castVote } = await import('../services/vote.service.js');

    const result = await castVote({
      sessionId,
      twitchUserId,
      optionIndex,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('You have already voted in this session');
    expect(result.alreadyVoted).toBe(true);
  });

  it('should reject vote for non-voting session', async () => {
    const sessionId = 'session-1';
    const twitchUserId = 'user-1';

    // Mock session exists but is not voting
    mockPrisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      code: 'ABC123',
      status: 'DRAFT', // Not VOTING
      options: {
        options: [],
      },
    });

    const { castVote } = await import('../services/vote.service.js');

    const result = await castVote({
      sessionId,
      twitchUserId,
      optionIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Voting is not currently active for this session');
  });

  it('should reject vote for invalid option index', async () => {
    const sessionId = 'session-1';
    const twitchUserId = 'user-1';

    mockPrisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      code: 'ABC123',
      status: 'VOTING',
      options: {
        options: [
          { index: 0, name: 'Token A', ticker: 'TOKA', imageId: 'img-1' },
          { index: 1, name: 'Token B', ticker: 'TOKB', imageId: 'img-2' },
        ],
      },
    });

    const { castVote } = await import('../services/vote.service.js');

    const result = await castVote({
      sessionId,
      twitchUserId,
      optionIndex: 99, // Invalid index
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid voting option');
  });
});
