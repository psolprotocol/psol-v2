import { z } from 'zod';

// ===========================================
// Content Safety Patterns
// ===========================================

// Banned words for name validation (basic list, extend as needed)
const BANNED_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink',
  'wetback', 'cunt', 'whore', 'slut', 'bitch', 'cock', 'dick', 'pussy',
  'trump', 'biden', 'obama', 'elon', 'musk', 'vitalik', 'satoshi', 'sbf',
  'solana', 'ethereum', 'bitcoin', 'official', 'verified', 'admin'
];

const containsBannedWord = (text: string): boolean => {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(word => lower.includes(word));
};

// ===========================================
// Base Schemas
// ===========================================

export const tickerSchema = z
  .string()
  .min(2, 'Ticker must be at least 2 characters')
  .max(10, 'Ticker must be at most 10 characters')
  .regex(/^[A-Z0-9]+$/, 'Ticker must be uppercase letters and numbers only')
  .transform(v => v.toUpperCase());

export const tokenNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(32, 'Name must be at most 32 characters')
  .refine(v => !containsBannedWord(v), 'Name contains prohibited content');

export const walletPubkeySchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address');

export const sessionCodeSchema = z
  .string()
  .min(6)
  .max(12)
  .regex(/^[A-Z0-9]+$/, 'Invalid session code');

export const bpsSchema = z
  .number()
  .int()
  .min(0, 'Basis points cannot be negative')
  .max(10000, 'Basis points cannot exceed 10000 (100%)');

// ===========================================
// Session Schemas
// ===========================================

export const SessionStatus = {
  DRAFT: 'DRAFT',
  VOTING: 'VOTING',
  FINALIZED: 'FINALIZED',
  LAUNCH_TX_READY: 'LAUNCH_TX_READY',
  LAUNCHED: 'LAUNCHED',
  FAILED: 'FAILED',
} as const;

export const sessionStatusSchema = z.enum([
  'DRAFT',
  'VOTING',
  'FINALIZED',
  'LAUNCH_TX_READY',
  'LAUNCHED',
  'FAILED',
]);

export const feeSplitRoleSchema = z.enum(['STREAMER', 'MOD', 'PLATFORM']);

export const feeSplitSchema = z.object({
  walletPubkey: walletPubkeySchema,
  bps: bpsSchema,
  role: feeSplitRoleSchema,
});

export const votingOptionSchema = z.object({
  name: tokenNameSchema,
  ticker: tickerSchema,
  imageId: z.string().uuid(),
});

export const createSessionSchema = z.object({
  title: z.string().min(3).max(100),
  durationSeconds: z.number().int().min(60).max(3600), // 1 min to 1 hour
  options: z.array(votingOptionSchema).min(2).max(10),
  feeSplits: z.array(feeSplitSchema).min(1).max(5),
});

export const updateSessionSchema = createSessionSchema.partial();

export const startVotingSchema = z.object({
  sessionId: z.string().uuid(),
});

export const stopVotingSchema = z.object({
  sessionId: z.string().uuid(),
});

export const finalizeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  vetoWinnerIndex: z.number().int().min(0).optional(), // If set, use 2nd place
});

// ===========================================
// Vote Schemas
// ===========================================

export const castVoteSchema = z.object({
  optionIndex: z.number().int().min(0),
});

export const voteResultSchema = z.object({
  optionIndex: z.number(),
  name: z.string(),
  ticker: z.string(),
  imageUrl: z.string(),
  voteCount: z.number(),
  percentage: z.number(),
});

// ===========================================
// Image Schemas
// ===========================================

export const imageAssetSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  url: z.string().url(),
  sha256: z.string(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const uploadImageSchema = z.object({
  filename: z.string(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
});

// ===========================================
// Bags API Schemas
// ===========================================

export const bagsTokenInfoSchema = z.object({
  name: tokenNameSchema,
  ticker: tickerSchema,
  description: z.string().max(500).optional(),
  imageUrl: z.string().url(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  website: z.string().url().optional(),
});

export const bagsCreateLaunchTxRequestSchema = z.object({
  tokenInfo: bagsTokenInfoSchema,
  creatorWallet: walletPubkeySchema,
  feeSplits: z.array(z.object({
    wallet: walletPubkeySchema,
    bps: bpsSchema,
  })).optional(),
});

export const bagsCreateLaunchTxResponseSchema = z.object({
  requestId: z.string(),
  serializedTransaction: z.string(), // base58 or base64
  mint: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const bagsTradeQuoteRequestSchema = z.object({
  mint: z.string(),
  amountSol: z.number().positive(),
  side: z.enum(['buy', 'sell']),
  slippageBps: bpsSchema.default(100),
});

export const bagsTradeQuoteResponseSchema = z.object({
  inputAmount: z.string(),
  outputAmount: z.string(),
  priceImpact: z.number(),
  fee: z.string(),
  route: z.any().optional(),
});

export const bagsCreateSwapTxRequestSchema = z.object({
  mint: z.string(),
  amountSol: z.number().positive(),
  side: z.enum(['buy', 'sell']),
  userWallet: walletPubkeySchema,
  slippageBps: bpsSchema.default(100),
});

export const bagsCreateSwapTxResponseSchema = z.object({
  requestId: z.string(),
  serializedTransaction: z.string(),
  expiresAt: z.string().datetime().optional(),
});

// ===========================================
// Transaction Schemas
// ===========================================

export const chainTxKindSchema = z.enum(['LAUNCH', 'SWAP']);

export const chainTxStatusSchema = z.enum([
  'PENDING',
  'BROADCAST',
  'CONFIRMED',
  'FAILED',
]);

export const broadcastTxRequestSchema = z.object({
  signedTransaction: z.string(), // base64 encoded
  idempotencyKey: z.string().uuid(),
});

export const broadcastTxResponseSchema = z.object({
  signature: z.string(),
  status: chainTxStatusSchema,
  explorerUrl: z.string().url().optional(),
});

// ===========================================
// Trade Schemas
// ===========================================

export const presetAmounts = [0.01, 0.05, 0.1] as const;

export const tradeQuoteRequestSchema = z.object({
  amountSol: z.number().refine(
    v => presetAmounts.includes(v as typeof presetAmounts[number]),
    'Amount must be one of: 0.01, 0.05, 0.1 SOL'
  ),
});

export const createSwapTxRequestSchema = z.object({
  amountSol: z.number().refine(
    v => presetAmounts.includes(v as typeof presetAmounts[number]),
    'Amount must be one of: 0.01, 0.05, 0.1 SOL'
  ),
  userWallet: walletPubkeySchema,
  idempotencyKey: z.string().uuid(),
});

// ===========================================
// WebSocket Event Schemas
// ===========================================

export const wsSessionUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  status: sessionStatusSchema,
  updatedAt: z.string().datetime(),
});

export const wsVoteUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  results: z.array(voteResultSchema),
  totalVotes: z.number(),
});

export const wsCountdownTickSchema = z.object({
  sessionId: z.string().uuid(),
  remainingSeconds: z.number(),
  endsAt: z.string().datetime(),
});

export const wsTxUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  kind: chainTxKindSchema,
  status: chainTxStatusSchema,
  signature: z.string().optional(),
  error: z.string().optional(),
});

// ===========================================
// API Response Schemas
// ===========================================

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number(),
  details: z.any().optional(),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
  });

// ===========================================
// Auth Schemas
// ===========================================

export const overlayTokenPayloadSchema = z.object({
  sessionCode: sessionCodeSchema,
  iat: z.number(),
  exp: z.number(),
});

// Export all types
export type Ticker = z.infer<typeof tickerSchema>;
export type TokenName = z.infer<typeof tokenNameSchema>;
export type WalletPubkey = z.infer<typeof walletPubkeySchema>;
export type SessionCode = z.infer<typeof sessionCodeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type FeeSplitRole = z.infer<typeof feeSplitRoleSchema>;
export type FeeSplit = z.infer<typeof feeSplitSchema>;
export type VotingOption = z.infer<typeof votingOptionSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type VoteResult = z.infer<typeof voteResultSchema>;
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export type BagsTokenInfo = z.infer<typeof bagsTokenInfoSchema>;
export type BagsCreateLaunchTxRequest = z.infer<typeof bagsCreateLaunchTxRequestSchema>;
export type BagsCreateLaunchTxResponse = z.infer<typeof bagsCreateLaunchTxResponseSchema>;
export type BagsTradeQuoteRequest = z.infer<typeof bagsTradeQuoteRequestSchema>;
export type BagsTradeQuoteResponse = z.infer<typeof bagsTradeQuoteResponseSchema>;
export type BagsCreateSwapTxRequest = z.infer<typeof bagsCreateSwapTxRequestSchema>;
export type BagsCreateSwapTxResponse = z.infer<typeof bagsCreateSwapTxResponseSchema>;
export type ChainTxKind = z.infer<typeof chainTxKindSchema>;
export type ChainTxStatus = z.infer<typeof chainTxStatusSchema>;
export type BroadcastTxRequest = z.infer<typeof broadcastTxRequestSchema>;
export type BroadcastTxResponse = z.infer<typeof broadcastTxResponseSchema>;
export type TradeQuoteRequest = z.infer<typeof tradeQuoteRequestSchema>;
export type CreateSwapTxRequest = z.infer<typeof createSwapTxRequestSchema>;
export type WsSessionUpdate = z.infer<typeof wsSessionUpdateSchema>;
export type WsVoteUpdate = z.infer<typeof wsVoteUpdateSchema>;
export type WsCountdownTick = z.infer<typeof wsCountdownTickSchema>;
export type WsTxUpdate = z.infer<typeof wsTxUpdateSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type OverlayTokenPayload = z.infer<typeof overlayTokenPayloadSchema>;
