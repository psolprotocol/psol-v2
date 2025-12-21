import { SESSION_STATUS_TRANSITIONS, SessionStatus } from '../types/index.js';

// ===========================================
// Session Code Generation
// ===========================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars

export function generateSessionCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

// ===========================================
// Session State Validation
// ===========================================

export function canTransitionTo(
  currentStatus: SessionStatus,
  targetStatus: SessionStatus
): boolean {
  const allowed = SESSION_STATUS_TRANSITIONS[currentStatus];
  return allowed.includes(targetStatus);
}

export function isVotingActive(status: SessionStatus): boolean {
  return status === 'VOTING';
}

export function canStartVoting(status: SessionStatus): boolean {
  return status === 'DRAFT';
}

export function canStopVoting(status: SessionStatus): boolean {
  return status === 'VOTING';
}

export function canFinalize(status: SessionStatus): boolean {
  return status === 'VOTING';
}

export function canGenerateLaunchTx(status: SessionStatus): boolean {
  return status === 'FINALIZED';
}

export function canBroadcastLaunch(status: SessionStatus): boolean {
  return status === 'LAUNCH_TX_READY';
}

export function isLaunched(status: SessionStatus): boolean {
  return status === 'LAUNCHED';
}

// ===========================================
// Transaction Encoding Utilities
// ===========================================

/**
 * Detect if a string is base58 encoded (Solana transaction format)
 */
export function isBase58(str: string): boolean {
  // Base58 uses these characters
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  return base58Regex.test(str);
}

/**
 * Detect if a string is base64 encoded
 */
export function isBase64(str: string): boolean {
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(str) && str.length % 4 === 0;
}

/**
 * Convert base58 to base64
 */
export function base58ToBase64(base58: string): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Decode base58 to bytes
  let num = BigInt(0);
  for (const char of base58) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base58 character');
    num = num * BigInt(58) + BigInt(index);
  }
  
  // Convert to bytes
  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }
  
  // Add leading zeros for leading '1's in base58
  for (const char of base58) {
    if (char === '1') bytes.unshift(0);
    else break;
  }
  
  // Convert to base64
  const buffer = Buffer.from(bytes);
  return buffer.toString('base64');
}

/**
 * Convert base64 to base58
 */
export function base64ToBase58(base64: string): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Decode base64 to bytes
  const bytes = Buffer.from(base64, 'base64');
  
  // Convert bytes to bigint
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte);
  }
  
  // Convert to base58
  let result = '';
  while (num > 0) {
    result = ALPHABET[Number(num % BigInt(58))] + result;
    num = num / BigInt(58);
  }
  
  // Add leading '1's for leading zeros
  for (const byte of bytes) {
    if (byte === 0) result = '1' + result;
    else break;
  }
  
  return result || '1';
}

/**
 * Normalize transaction to base64 (accepts either base58 or base64)
 */
export function normalizeToBase64(serializedTx: string): string {
  if (isBase64(serializedTx)) {
    return serializedTx;
  }
  if (isBase58(serializedTx)) {
    return base58ToBase64(serializedTx);
  }
  throw new Error('Invalid transaction encoding: must be base58 or base64');
}

/**
 * Normalize transaction to base58 (accepts either base58 or base64)
 */
export function normalizeToBase58(serializedTx: string): string {
  if (isBase58(serializedTx)) {
    return serializedTx;
  }
  if (isBase64(serializedTx)) {
    return base64ToBase58(serializedTx);
  }
  throw new Error('Invalid transaction encoding: must be base58 or base64');
}

// ===========================================
// Time Utilities
// ===========================================

export function calculateRemainingSeconds(endsAt: Date | string): number {
  const end = typeof endsAt === 'string' ? new Date(endsAt) : endsAt;
  const now = new Date();
  const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  return remaining;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===========================================
// Validation Utilities
// ===========================================

export function validateTicker(ticker: string): { valid: boolean; error?: string } {
  if (ticker.length < 2) {
    return { valid: false, error: 'Ticker must be at least 2 characters' };
  }
  if (ticker.length > 10) {
    return { valid: false, error: 'Ticker must be at most 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(ticker)) {
    return { valid: false, error: 'Ticker must be uppercase letters and numbers only' };
  }
  return { valid: true };
}

export function validateSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ===========================================
// Fee Calculation
// ===========================================

export function calculateFeeAmount(totalAmount: number, bps: number): number {
  return (totalAmount * bps) / 10000;
}

export function validateTotalFeeBps(feeSplits: { bps: number }[]): boolean {
  const total = feeSplits.reduce((sum, split) => sum + split.bps, 0);
  return total <= 10000;
}

// ===========================================
// Solana Explorer URL
// ===========================================

export function getSolanaExplorerUrl(
  signature: string,
  network: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'
): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function getSolscanUrl(
  signature: string,
  network: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): string {
  const cluster = network === 'mainnet-beta' ? '' : '?cluster=devnet';
  return `https://solscan.io/tx/${signature}${cluster}`;
}
