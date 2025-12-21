// ===========================================
// Session Types
// ===========================================

export interface Session {
  id: string;
  code: string;
  title: string;
  status: SessionStatus;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  winnerOptionIndex: number | null;
  vetoedWinnerIndex: number | null;
  mintAddress: string | null;
}

export type SessionStatus = 
  | 'DRAFT'
  | 'VOTING'
  | 'FINALIZED'
  | 'LAUNCH_TX_READY'
  | 'LAUNCHED'
  | 'FAILED';

export interface SessionWithDetails extends Session {
  options: VotingOption[];
  feeSplits: FeeSplit[];
  images: ImageAsset[];
  voteResults?: VoteResult[];
  launchTx?: LaunchTx | null;
  chainTxs?: ChainTx[];
}

// ===========================================
// Voting Option Types
// ===========================================

export interface VotingOption {
  index: number;
  name: string;
  ticker: string;
  imageId: string;
  imageUrl?: string;
}

export interface VoteResult {
  optionIndex: number;
  name: string;
  ticker: string;
  imageUrl: string;
  voteCount: number;
  percentage: number;
}

// ===========================================
// Fee Split Types
// ===========================================

export type FeeSplitRole = 'STREAMER' | 'MOD' | 'PLATFORM';

export interface FeeSplit {
  id: string;
  sessionId: string;
  walletPubkey: string;
  bps: number;
  role: FeeSplitRole;
}

// ===========================================
// Image Types
// ===========================================

export interface ImageAsset {
  id: string;
  sessionId: string | null;
  url: string;
  sha256: string;
  mime: string;
  width: number;
  height: number;
  createdAt: string;
}

// ===========================================
// Transaction Types
// ===========================================

export type ChainTxKind = 'LAUNCH' | 'SWAP';

export type ChainTxStatus = 'PENDING' | 'BROADCAST' | 'CONFIRMED' | 'FAILED';

export interface LaunchTx {
  id: string;
  sessionId: string;
  bagsRequestId: string;
  serializedTxBase64: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface ChainTx {
  id: string;
  sessionId: string;
  kind: ChainTxKind;
  signature: string;
  status: ChainTxStatus;
  error: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

// ===========================================
// User Types
// ===========================================

export interface User {
  id: string;
  twitchId: string;
  displayName: string;
  email: string | null;
  profileImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreamerProfile {
  id: string;
  userId: string;
  streamerWalletPubkey: string;
  platformFeeBps: number;
  createdAt: string;
  updatedAt: string;
}

// ===========================================
// Vote Types
// ===========================================

export interface Vote {
  id: string;
  sessionId: string;
  twitchUserId: string;
  optionIndex: number;
  createdAt: string;
}

// ===========================================
// WebSocket Event Types
// ===========================================

export interface WsEvents {
  'session:update': {
    sessionId: string;
    status: SessionStatus;
    updatedAt: string;
  };
  'vote:update': {
    sessionId: string;
    results: VoteResult[];
    totalVotes: number;
  };
  'countdown:tick': {
    sessionId: string;
    remainingSeconds: number;
    endsAt: string;
  };
  'tx:update': {
    sessionId: string;
    kind: ChainTxKind;
    status: ChainTxStatus;
    signature?: string;
    error?: string;
  };
}

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ===========================================
// Trade Types
// ===========================================

export interface TradeQuote {
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  fee: string;
  route?: unknown;
}

export interface SwapTx {
  requestId: string;
  serializedTxBase64: string;
  expiresAt: string | null;
}

// ===========================================
// Constants
// ===========================================

export const PRESET_AMOUNTS = [0.01, 0.05, 0.1] as const;
export type PresetAmount = typeof PRESET_AMOUNTS[number];

export const SESSION_STATUS_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  DRAFT: ['VOTING'],
  VOTING: ['FINALIZED', 'FAILED'],
  FINALIZED: ['LAUNCH_TX_READY', 'FAILED'],
  LAUNCH_TX_READY: ['LAUNCHED', 'FAILED'],
  LAUNCHED: [],
  FAILED: [],
};

export const MAX_VOTING_DURATION_SECONDS = 3600;
export const MIN_VOTING_DURATION_SECONDS = 60;
export const MAX_OPTIONS_PER_SESSION = 10;
export const MIN_OPTIONS_PER_SESSION = 2;
export const MAX_FEE_SPLITS = 5;
