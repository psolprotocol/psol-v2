// Re-export schemas (this includes the zod schemas and inferred types)
export * from './schemas/index.js';

// Re-export types (selective to avoid duplicates with schemas)
export type {
  Session,
  SessionWithDetails,
  VotingOption as VotingOptionType,
  Vote,
  User,
  StreamerProfile,
  LaunchTx,
  ChainTx,
  WsEvents,
  ApiResponse,
  PaginatedResponse,
  TradeQuote,
  SwapTx,
  PresetAmount,
} from './types/index.js';

export {
  PRESET_AMOUNTS,
  SESSION_STATUS_TRANSITIONS,
  MAX_VOTING_DURATION_SECONDS,
  MIN_VOTING_DURATION_SECONDS,
  MAX_OPTIONS_PER_SESSION,
  MIN_OPTIONS_PER_SESSION,
  MAX_FEE_SPLITS,
} from './types/index.js';

// Re-export everything from utils
export * from './utils/index.js';
