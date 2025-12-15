/**
 * pSOL v2 Relayer Service
 * 
 * HTTP service that relays withdrawal transactions for users.
 * Users submit proofs to the relayer, which submits them on-chain
 * and collects a fee.
 * 
 * Features:
 * - Local ZK proof verification before chain submission
 * - Asset registration validation
 * - Retry logic with exponential backoff
 * - Rate limiting per recipient
 * - Comprehensive request validation
 * 
 * @module relayer
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as fs from 'fs';
import * as snarkjs from 'snarkjs';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// =============================================================================
// CONSTANTS
// =============================================================================

/** BN254 scalar field order (same curve as used in circuits) */
const BN254_FIELD_ORDER = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

/** Maximum retry attempts for transaction submission */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 1000;

/** Maximum jitter to add to backoff (ms) */
const MAX_JITTER_MS = 500;

/** Overall timeout for all retry attempts (ms) - 30 seconds */
const RETRY_OVERALL_TIMEOUT_MS = 30000;

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Error categories for logging and retry decisions
 */
export enum ErrorCategory {
  /** Validation failures - invalid proof, wrong inputs, etc. */
  VALIDATION = 'VALIDATION',
  /** Transient RPC/network errors - can retry */
  TRANSIENT_RPC = 'TRANSIENT_RPC',
  /** On-chain state conflicts - nullifier spent, etc. */
  STATE_CONFLICT = 'STATE_CONFLICT',
  /** Resource exhaustion - insufficient funds, etc. */
  RESOURCE = 'RESOURCE',
  /** Unknown errors */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Patterns for identifying transient RPC errors that should be retried
 */
const TRANSIENT_ERROR_PATTERNS = [
  'blockhash not found',
  'block height exceeded',
  'transaction expired',
  'node is behind',
  'node is unhealthy',
  'service unavailable',
  'connection refused',
  'connection reset',
  'connection timed out',
  'timeout',
  'etimedout',
  'econnreset',
  'econnrefused',
  'enetunreach',
  'socket hang up',
  'network error',
  '502',
  '503',
  '504',
  'bad gateway',
  'gateway timeout',
  'too many requests',
  '429',
  'rate limit',
  'server too busy',
  'temporarily unavailable',
];

/**
 * Patterns for validation errors that should NOT be retried
 */
const VALIDATION_ERROR_PATTERNS = [
  'invalid proof',
  'proof verification failed',
  'invalid signature',
  'simulation failed',
  'instruction error',
  'invalid program',
  'invalid account',
  'account not found',
  'invalid mint',
  'invalid owner',
  'deserialization failed',
  'constraint violation',
  'custom program error',
];

/**
 * Patterns for state conflict errors that should NOT be retried
 */
const STATE_CONFLICT_PATTERNS = [
  'nullifier already spent',
  'already processed',
  'account already exists',
  'duplicate',
];

/**
 * Patterns for resource errors that should NOT be retried
 */
const RESOURCE_ERROR_PATTERNS = [
  'insufficient funds',
  'insufficient lamports',
  'insufficient balance',
];

// =============================================================================
// INTERFACES
// =============================================================================

/** Configuration interface */
interface RelayerConfig {
  /** Solana RPC endpoint */
  rpcEndpoint: string;
  /** Relayer wallet keypair */
  walletKeypair: Keypair;
  /** pSOL program ID */
  programId: PublicKey;
  /** Pool configuration account */
  poolConfig: PublicKey;
  /** Fee in basis points (1 bp = 0.01%) */
  feeBps: number;
  /** Minimum withdrawal amount */
  minWithdrawalAmount: bigint;
  /** Maximum withdrawal amount */
  maxWithdrawalAmount: bigint;
  /** Server port */
  port: number;
  /** Path to withdraw verification key JSON (snarkjs vkey) */
  withdrawVkPath: string;
}

/** Withdrawal request interface */
interface WithdrawRequest {
  /** 256-byte proof data (hex encoded) */
  proofData: string;
  /** Merkle root (hex encoded) */
  merkleRoot: string;
  /** Nullifier hash (hex encoded) */
  nullifierHash: string;
  /** Recipient public key (base58) */
  recipient: string;
  /** Withdrawal amount */
  amount: string;
  /** Asset ID (hex encoded) */
  assetId: string;
  /** Token mint (base58) */
  mint: string;
}

/** Withdrawal response interface */
interface WithdrawResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

/** Relayer status interface */
interface RelayerStatus {
  active: boolean;
  feeBps: number;
  operator: string;
  totalTransactions: number;
  totalFeesEarned: string;
  supportedAssets: string[];
  proofVerificationEnabled: boolean;
}

/** Groth16 proof structure for snarkjs */
interface Groth16Proof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

/** Parameters for local proof verification */
interface VerifyProofParams {
  proofData: Uint8Array;
  merkleRoot: Uint8Array;
  nullifierHash: Uint8Array;
  assetId: Uint8Array;
  recipient: PublicKey;
  amount: bigint;
  relayer: PublicKey;
  relayerFee: bigint;
  publicDataHash?: Uint8Array;
}

/** Parameters for withdrawal submission */
interface SubmitWithdrawalParams {
  proofData: Uint8Array;
  merkleRoot: Uint8Array;
  nullifierHash: Uint8Array;
  recipient: PublicKey;
  amount: bigint;
  fee: bigint;
  assetId: Uint8Array;
  mint: PublicKey;
}

// =============================================================================
// RELAYER SERVICE
// =============================================================================

/**
 * pSOL v2 Relayer Service
 */
export class RelayerService {
  private config: RelayerConfig;
  private connection: Connection;
  private provider: AnchorProvider;
  private program!: Program; // Initialized lazily, but always before use
  private app: express.Application;
  private totalTransactions: number = 0;
  private totalFeesEarned: bigint = BigInt(0);
  private supportedAssets: Set<string> = new Set();
  
  /** Verification key for withdraw circuit (snarkjs format) */
  private withdrawVk: any;
  
  constructor(config: RelayerConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcEndpoint, 'confirmed');
    
    // Load withdraw verification key at startup (fail fast if missing)
    this.loadWithdrawVerificationKey();
    
    // Setup Anchor provider
    const wallet = {
      publicKey: config.walletKeypair.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.sign(config.walletKeypair);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]) => {
        txs.forEach(tx => tx.sign(config.walletKeypair));
        return txs;
      },
    };
    
    this.provider = new AnchorProvider(this.connection, wallet as any, {
      commitment: 'confirmed',
    });
    
    // Setup Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Load withdraw verification key from file
   * Fails fast if the key is not available
   */
  private loadWithdrawVerificationKey(): void {
    try {
      console.log(`Loading withdraw verification key from: ${this.config.withdrawVkPath}`);
      const vkeyJson = fs.readFileSync(this.config.withdrawVkPath, 'utf8');
      this.withdrawVk = JSON.parse(vkeyJson);
      
      // Basic validation of vkey structure
      if (!this.withdrawVk.protocol || !this.withdrawVk.curve) {
        throw new Error('Invalid verification key format: missing protocol or curve');
      }
      if (!this.withdrawVk.vk_alpha_1 || !this.withdrawVk.vk_beta_2) {
        throw new Error('Invalid verification key format: missing vk_alpha_1 or vk_beta_2');
      }
      
      console.log('Withdraw verification key loaded successfully');
      console.log(`  Protocol: ${this.withdrawVk.protocol}`);
      console.log(`  Curve: ${this.withdrawVk.curve}`);
      console.log(`  IC points: ${this.withdrawVk.IC?.length || 0}`);
    } catch (err) {
      console.error('Failed to load withdraw verification key from', this.config.withdrawVkPath);
      console.error(err);
      throw new Error('Withdraw verification key not available for relayer');
    }
  }
  
  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    }));
    
    // JSON parsing
    this.app.use(express.json({ limit: '1mb' }));
    
    // Global backstop limiter (per IP, high cap, protects against total flood)
    const globalLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 500,            // 500 requests/minute per IP
      message: { error: 'Service temporarily unavailable' },
    });

    // Per-key limiter (recipient for /withdraw, IP otherwise)
    const perKeyLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 30,             // 30 requests per minute per key
      message: { error: 'Too many requests, please slow down' },
      keyGenerator: (req: Request) => {
        // For withdraw we rate-limit by recipient, otherwise by IP
        if (req.method === 'POST' && req.path === '/withdraw') {
          const body = req.body as any;
          if (body && typeof body.recipient === 'string' && body.recipient.length > 0) {
            return `recipient:${body.recipient}`;
          }
        }
        // Fallback: per-IP limiting
        return req.ip || 'unknown';
      },
    });

    // Apply both: global then per-key
    this.app.use(globalLimiter);
    this.app.use(perKeyLimiter);
    
    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }
  
  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        proofVerificationEnabled: !!this.withdrawVk,
      });
    });
    
    // Relayer status
    this.app.get('/status', async (req: Request, res: Response) => {
      try {
        const status = await this.getStatus();
        res.json(status);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Fee quote
    this.app.get('/quote', (req: Request, res: Response) => {
      const amount = BigInt(req.query.amount as string || '0');
      const fee = this.calculateFee(amount);
      res.json({
        amount: amount.toString(),
        fee: fee.toString(),
        feeBps: this.config.feeBps,
        netAmount: (amount - fee).toString(),
      });
    });
    
    // Submit withdrawal
    this.app.post('/withdraw', async (req: Request, res: Response) => {
      try {
        const result = await this.processWithdrawal(req.body as WithdrawRequest);
        res.json(result);
      } catch (error: any) {
        console.error('Withdrawal error:', error);
        res.status(400).json({
          success: false,
          error: error.message,
        });
      }
    });
    
    // Supported assets
    this.app.get('/assets', async (req: Request, res: Response) => {
      res.json({
        assets: Array.from(this.supportedAssets),
      });
    });
    
    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }
  
  /**
   * Get relayer status
   */
  async getStatus(): Promise<RelayerStatus> {
    return {
      active: true,
      feeBps: this.config.feeBps,
      operator: this.config.walletKeypair.publicKey.toBase58(),
      totalTransactions: this.totalTransactions,
      totalFeesEarned: this.totalFeesEarned.toString(),
      supportedAssets: Array.from(this.supportedAssets),
      proofVerificationEnabled: !!this.withdrawVk,
    };
  }
  
  /**
   * Calculate relayer fee
   */
  calculateFee(amount: bigint): bigint {
    return (amount * BigInt(this.config.feeBps)) / BigInt(10000);
  }
  
  /**
   * Process a withdrawal request
   */
  async processWithdrawal(request: WithdrawRequest): Promise<WithdrawResponse> {
    const startTime = Date.now();
    
    // 1. Validate request format
    this.validateWithdrawRequest(request);
    
    const amount = BigInt(request.amount);
    const fee = this.calculateFee(amount);
    
    // 2. Verify amount bounds
    if (amount < this.config.minWithdrawalAmount) {
      throw new Error(`Amount below minimum: ${this.config.minWithdrawalAmount}`);
    }
    if (amount > this.config.maxWithdrawalAmount) {
      throw new Error(`Amount above maximum: ${this.config.maxWithdrawalAmount}`);
    }
    
    // 3. Check asset is supported BEFORE expensive proof verification
    if (this.supportedAssets.size > 0 && !this.supportedAssets.has(request.assetId)) {
      throw new Error(`Asset ${request.assetId} not supported by this relayer`);
    }
    
    // 4. Decode inputs
    const proofData = hexToBytes(request.proofData);
    const merkleRoot = hexToBytes(request.merkleRoot);
    const nullifierHash = hexToBytes(request.nullifierHash);
    const assetId = hexToBytes(request.assetId);
    const recipient = new PublicKey(request.recipient);
    const mint = new PublicKey(request.mint);
    
    // 5. Locally verify the ZK proof before touching chain state
    const proofVerifyStart = Date.now();
    const isProofValid = await this.verifyWithdrawProofLocally({
      proofData,
      merkleRoot,
      nullifierHash,
      assetId,
      recipient,
      amount,
      relayer: this.config.walletKeypair.publicKey,
      relayerFee: fee,
      publicDataHash: undefined, // If you add encrypted metadata later, pass its hash here
    });
    const proofVerifyTime = Date.now() - proofVerifyStart;
    console.log(`Proof verification took ${proofVerifyTime}ms, result: ${isProofValid}`);
    
    if (!isProofValid) {
      throw new Error('Invalid withdrawal proof (local verification failed)');
    }
    
    // 6. Check nullifier hasn't been spent
    const isSpent = await this.checkNullifierSpent(nullifierHash);
    if (isSpent) {
      throw new Error('Nullifier already spent');
    }
    
    // 7. Build and submit transaction with retry logic
    const signature = await this.submitWithdrawalWithRetry({
      proofData,
      merkleRoot,
      nullifierHash,
      recipient,
      amount,
      fee,
      assetId,
      mint,
    });
    
    // 8. Update statistics
    this.totalTransactions++;
    this.totalFeesEarned += fee;
    
    const totalTime = Date.now() - startTime;
    console.log(`Withdrawal processed successfully in ${totalTime}ms: ${signature}`);
    
    return {
      success: true,
      signature,
    };
  }
  
  /**
   * Locally verify a withdraw proof using snarkjs before submitting on-chain.
   *
   * This mirrors WithdrawPublicInputs::to_field_elements in the on-chain program
   * and the serializeProof layout in sdk/src/proof/prover.ts.
   */
  private async verifyWithdrawProofLocally(params: VerifyProofParams): Promise<boolean> {
    if (!this.withdrawVk) {
      throw new Error('Withdraw verification key not loaded in relayer');
    }
    
    // Validate proof data length
    if (params.proofData.length !== 256) {
      console.error(`Invalid proof data length: expected 256 bytes, got ${params.proofData.length}`);
      return false;
    }
    
    try {
      // Deserialize the proof
      const proof = deserializeGroth16Proof(params.proofData);
      
      // Convert inputs to field elements
      const merkleRootScalar = bytesToBigInt(params.merkleRoot);
      const nullifierHashScalar = bytesToBigInt(params.nullifierHash);
      const assetIdScalar = bytesToBigInt(params.assetId);
      const recipientScalar = pubkeyToScalar(params.recipient);
      const relayerScalar = pubkeyToScalar(params.relayer);
      const publicDataHashScalar = params.publicDataHash
        ? bytesToBigInt(params.publicDataHash)
        : 0n;
      
      // Validate all field elements are within BN254 order
      validateFieldElement(merkleRootScalar, 'merkleRoot');
      validateFieldElement(nullifierHashScalar, 'nullifierHash');
      validateFieldElement(assetIdScalar, 'assetId');
      validateFieldElement(recipientScalar, 'recipient');
      validateFieldElement(relayerScalar, 'relayer');
      validateFieldElement(publicDataHashScalar, 'publicDataHash');
      validateFieldElement(params.amount, 'amount');
      validateFieldElement(params.relayerFee, 'relayerFee');
      
      // Public signals order must match circuit's public inputs:
      // merkle_root, nullifier_hash, asset_id, recipient, amount,
      // relayer, relayer_fee, public_data_hash
      const publicSignals = [
        merkleRootScalar.toString(),
        nullifierHashScalar.toString(),
        assetIdScalar.toString(),
        recipientScalar.toString(),
        params.amount.toString(),
        relayerScalar.toString(),
        params.relayerFee.toString(),
        publicDataHashScalar.toString(),
      ];
      
      console.log('Verifying proof with public signals:', {
        merkleRoot: merkleRootScalar.toString().slice(0, 20) + '...',
        nullifierHash: nullifierHashScalar.toString().slice(0, 20) + '...',
        amount: params.amount.toString(),
        relayerFee: params.relayerFee.toString(),
      });
      
      const result = await snarkjs.groth16.verify(
        this.withdrawVk,
        publicSignals,
        proof,
      );
      
      if (typeof result !== 'boolean') {
        throw new Error('Unexpected snarkjs verify() result type');
      }
      
      return result;
    } catch (err) {
      console.error('Proof verification error:', err);
      return false;
    }
  }
  
  /**
   * Validate withdrawal request format
   */
  private validateWithdrawRequest(request: WithdrawRequest): void {
    if (!request.proofData || request.proofData.length !== 512) {
      throw new Error('Invalid proof data length (must be 256 bytes hex)');
    }
    if (!request.merkleRoot || request.merkleRoot.length !== 64) {
      throw new Error('Invalid merkle root length');
    }
    if (!request.nullifierHash || request.nullifierHash.length !== 64) {
      throw new Error('Invalid nullifier hash length');
    }
    if (!request.recipient) {
      throw new Error('Missing recipient');
    }
    
    // Validate recipient is a valid Solana public key
    try {
      new PublicKey(request.recipient);
    } catch {
      throw new Error('Invalid recipient public key');
    }
    
    if (!request.amount || BigInt(request.amount) <= 0) {
      throw new Error('Invalid amount');
    }
    if (!request.assetId || request.assetId.length !== 64) {
      throw new Error('Invalid asset ID length');
    }
    if (!request.mint) {
      throw new Error('Missing mint');
    }
    
    // Validate mint is a valid Solana public key
    try {
      new PublicKey(request.mint);
    } catch {
      throw new Error('Invalid mint public key');
    }
    
    // Validate hex strings are valid
    if (!/^[0-9a-fA-F]+$/.test(request.proofData)) {
      throw new Error('Invalid proof data: not valid hex');
    }
    if (!/^[0-9a-fA-F]+$/.test(request.merkleRoot)) {
      throw new Error('Invalid merkle root: not valid hex');
    }
    if (!/^[0-9a-fA-F]+$/.test(request.nullifierHash)) {
      throw new Error('Invalid nullifier hash: not valid hex');
    }
    if (!/^[0-9a-fA-F]+$/.test(request.assetId)) {
      throw new Error('Invalid asset ID: not valid hex');
    }
  }
  
  /**
   * Check if nullifier has been spent on-chain
   */
  private async checkNullifierSpent(nullifierHash: Uint8Array): Promise<boolean> {
    const [nullifierPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('nullifier_v2'),
        this.config.poolConfig.toBuffer(),
        Buffer.from(nullifierHash),
      ],
      this.config.programId,
    );
    
    try {
      const accountInfo = await this.connection.getAccountInfo(nullifierPda);
      // Account exists => nullifier is spent
      return accountInfo !== null;
    } catch (err) {
      // RPC/network error, do not silently treat as spent or unspent
      console.error('RPC error checking nullifier status', {
        nullifier: bytesToHex(nullifierHash),
        pda: nullifierPda.toBase58(),
        error: err instanceof Error ? err.message : err,
      });
      throw new Error('Failed to verify nullifier status - RPC error');
    }
  }
  
  /**
   * Submit withdrawal transaction with retry logic
   * 
   * Features:
   * - Exponential backoff with jitter
   * - Overall timeout to prevent hanging
   * - Smart error classification (only retries transient errors)
   * - Detailed logging for debugging
   */
  private async submitWithdrawalWithRetry(params: SubmitWithdrawalParams): Promise<string> {
    const overallStartTime = Date.now();
    let lastError: Error | null = null;
    let lastErrorCategory: ErrorCategory = ErrorCategory.UNKNOWN;
    
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      // Check overall timeout before each attempt
      const elapsed = Date.now() - overallStartTime;
      if (elapsed >= RETRY_OVERALL_TIMEOUT_MS) {
        this.logRetryTimeout(attempt, elapsed, lastError);
        throw new Error(
          `Transaction submission timed out after ${elapsed}ms ` +
          `(${attempt - 1} attempts). Last error: ${lastError?.message || 'unknown'}`
        );
      }
      
      const remainingTimeout = RETRY_OVERALL_TIMEOUT_MS - elapsed;
      
      try {
        this.logRetryAttempt(attempt, MAX_RETRY_ATTEMPTS, remainingTimeout);
        const signature = await this.submitWithdrawal(params);
        this.logRetrySuccess(attempt, Date.now() - overallStartTime);
        return signature;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        lastErrorCategory = classifyError(lastError);
        
        this.logRetryError(attempt, lastError, lastErrorCategory);
        
        // Don't retry on non-retryable errors
        if (!isRetryableCategory(lastErrorCategory)) {
          this.logNonRetryableError(lastErrorCategory, lastError);
          throw lastError;
        }
        
        // Calculate backoff delay and wait before retry
        if (attempt < MAX_RETRY_ATTEMPTS) {
          const delay = calculateBackoffDelay(attempt);
          // Don't wait longer than the remaining timeout
          const actualDelay = Math.min(delay, remainingTimeout);
          
          if (actualDelay <= 0) {
            this.logRetryTimeout(attempt + 1, Date.now() - overallStartTime, lastError);
            throw new Error(
              `Transaction submission timed out after ${Date.now() - overallStartTime}ms ` +
              `(${attempt} attempts). Last error: ${lastError.message}`
            );
          }
          
          this.logRetryBackoff(attempt, actualDelay);
          await sleep(actualDelay);
        }
      }
    }
    
    // All retries exhausted
    this.logRetryExhausted(lastError, lastErrorCategory, Date.now() - overallStartTime);
    throw lastError || new Error('Transaction submission failed after all retries');
  }
  
  // =========================================================================
  // RETRY LOGGING HELPERS
  // =========================================================================
  
  /**
   * Log a retry attempt start
   */
  private logRetryAttempt(attempt: number, maxAttempts: number, remainingTimeoutMs: number): void {
    console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} - Submitting transaction (timeout: ${remainingTimeoutMs}ms remaining)`);
  }
  
  /**
   * Log a successful retry
   */
  private logRetrySuccess(attempt: number, totalTimeMs: number): void {
    console.log(`[RETRY] SUCCESS on attempt ${attempt} after ${totalTimeMs}ms`);
  }
  
  /**
   * Log a retry error with classification
   */
  private logRetryError(attempt: number, error: Error, category: ErrorCategory): void {
    const categoryLabel = getCategoryLogLabel(category);
    console.error(`[RETRY] Attempt ${attempt} FAILED [${categoryLabel}]: ${error.message}`);
  }
  
  /**
   * Log when not retrying due to error type
   */
  private logNonRetryableError(category: ErrorCategory, error: Error): void {
    const categoryLabel = getCategoryLogLabel(category);
    console.error(`[RETRY] Not retrying - ${categoryLabel} error: ${error.message}`);
  }
  
  /**
   * Log backoff delay before next retry
   */
  private logRetryBackoff(attempt: number, delayMs: number): void {
    console.log(`[RETRY] Backoff: waiting ${delayMs}ms before attempt ${attempt + 1}`);
  }
  
  /**
   * Log overall timeout reached
   */
  private logRetryTimeout(attempt: number, elapsedMs: number, lastError: Error | null): void {
    console.error(`[RETRY] TIMEOUT after ${elapsedMs}ms before attempt ${attempt}`);
    if (lastError) {
      console.error(`[RETRY] Last error was: ${lastError.message}`);
    }
  }
  
  /**
   * Log all retries exhausted
   */
  private logRetryExhausted(lastError: Error | null, category: ErrorCategory, totalTimeMs: number): void {
    const categoryLabel = getCategoryLogLabel(category);
    console.error(`[RETRY] All ${MAX_RETRY_ATTEMPTS} attempts exhausted after ${totalTimeMs}ms`);
    console.error(`[RETRY] Final error [${categoryLabel}]: ${lastError?.message || 'unknown'}`);
  }
  
  /**
   * Submit withdrawal transaction
   */
  private async submitWithdrawal(params: SubmitWithdrawalParams): Promise<string> {
    // Derive PDAs
    const [merkleTree] = PublicKey.findProgramAddressSync(
      [Buffer.from('merkle_tree_v2'), this.config.poolConfig.toBuffer()],
      this.config.programId
    );
    
    const [assetVault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('vault_v2'),
        this.config.poolConfig.toBuffer(),
        Buffer.from(params.assetId),
      ],
      this.config.programId
    );
    
    const [vkAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vk_withdraw'), this.config.poolConfig.toBuffer()],
      this.config.programId
    );
    
    const [nullifierPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('nullifier_v2'),
        this.config.poolConfig.toBuffer(),
        Buffer.from(params.nullifierHash),
      ],
      this.config.programId
    );
    
    const [relayerRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from('relayer_registry'), this.config.poolConfig.toBuffer()],
      this.config.programId
    );
    
    const [relayerNode] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('relayer'),
        relayerRegistry.toBuffer(),
        this.config.walletKeypair.publicKey.toBuffer(),
      ],
      this.config.programId
    );
    
    // Get token accounts
    const vaultTokenAccount = getAssociatedTokenAddressSync(params.mint, assetVault, true);
    const recipientTokenAccount = getAssociatedTokenAddressSync(params.mint, params.recipient);
    const relayerTokenAccount = getAssociatedTokenAddressSync(
      params.mint,
      this.config.walletKeypair.publicKey
    );
    
    // Build instruction
    const ix = await this.program.methods
      .withdrawMasp(
        Array.from(params.proofData),
        Array.from(params.merkleRoot),
        Array.from(params.nullifierHash),
        new BN(params.amount.toString()),
        new BN(params.fee.toString())
      )
      .accounts({
        relayer: this.config.walletKeypair.publicKey,
        poolConfig: this.config.poolConfig,
        merkleTree,
        assetVault,
        vkAccount,
        nullifierAccount: nullifierPda,
        relayerRegistry,
        relayerNode,
        recipient: params.recipient,
        vaultTokenAccount,
        recipientTokenAccount,
        relayerTokenAccount,
        mint: params.mint,
      })
      .instruction();
    
    // Build and send transaction
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.config.walletKeypair],
      { commitment: 'confirmed' }
    );
    
    return signature;
  }
  
  /**
   * Register asset as supported
   */
  addSupportedAsset(assetId: string): void {
    // Validate asset ID format
    if (!/^[0-9a-fA-F]{64}$/.test(assetId)) {
      throw new Error('Invalid asset ID format: must be 64 hex characters');
    }
    this.supportedAssets.add(assetId.toLowerCase());
    console.log(`Registered supported asset: ${assetId}`);
  }
  
  /**
   * Remove asset from supported list
   */
  removeSupportedAsset(assetId: string): void {
    this.supportedAssets.delete(assetId.toLowerCase());
    console.log(`Removed supported asset: ${assetId}`);
  }
  
  /**
   * Start the relayer service
   */
  start(): void {
    this.app.listen(this.config.port, () => {
      console.log('========================================');
      console.log('pSOL v2 Relayer Service Started');
      console.log('========================================');
      console.log(`Port: ${this.config.port}`);
      console.log(`Operator: ${this.config.walletKeypair.publicKey.toBase58()}`);
      console.log(`Fee: ${this.config.feeBps} bps`);
      console.log(`Min withdrawal: ${this.config.minWithdrawalAmount}`);
      console.log(`Max withdrawal: ${this.config.maxWithdrawalAmount}`);
      console.log(`Proof verification: ${this.withdrawVk ? 'ENABLED' : 'DISABLED'}`);
      console.log(`Supported assets: ${this.supportedAssets.size}`);
      console.log('========================================');
    });
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert 32-byte big-endian array into a bigint.
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Convert Solana PublicKey to scalar field element (BN254).
 * Mirrors pubkeyToScalar in the SDK.
 */
function pubkeyToScalar(pubkey: PublicKey): bigint {
  const bytes = pubkey.toBytes();
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result % BN254_FIELD_ORDER;
}

/**
 * Validate a field element is within BN254 order
 */
function validateFieldElement(value: bigint, name: string): void {
  if (value < 0n) {
    throw new Error(`${name} is negative: ${value}`);
  }
  if (value >= BN254_FIELD_ORDER) {
    throw new Error(`${name} exceeds field order: ${value}`);
  }
}

/**
 * Deserialize Groth16 proof from 256-byte compressed format.
 * Inverse of sdk/src/proof/prover.ts::serializeProof.
 *
 * Layout:
 *   A: 0..32 (x), 32..64 (y)
 *   B: 64..96 (x0_1), 96..128 (x0_0), 128..160 (y1_1), 160..192 (y1_0)
 *   C: 192..224 (x), 224..256 (y)
 */
function deserializeGroth16Proof(proofData: Uint8Array): Groth16Proof {
  if (proofData.length !== 256) {
    throw new Error(`Invalid proof data length: expected 256 bytes, got ${proofData.length}`);
  }

  const slice = (start: number, end: number) => proofData.slice(start, end);

  const a0 = bytesToBigInt(slice(0, 32)).toString();
  const a1 = bytesToBigInt(slice(32, 64)).toString();

  // Note: see serializeProof for this swapped ordering
  const b01 = bytesToBigInt(slice(64, 96)).toString();   // pi_b[0][1]
  const b00 = bytesToBigInt(slice(96, 128)).toString();  // pi_b[0][0]
  const b11 = bytesToBigInt(slice(128, 160)).toString(); // pi_b[1][1]
  const b10 = bytesToBigInt(slice(160, 192)).toString(); // pi_b[1][0]

  const c0 = bytesToBigInt(slice(192, 224)).toString();
  const c1 = bytesToBigInt(slice(224, 256)).toString();

  const proof: Groth16Proof = {
    pi_a: [a0, a1, '1'],
    pi_b: [
      [b00, b01],
      [b10, b11],
      ['1', '0'],
    ],
    pi_c: [c0, c1, '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };

  return proof;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify an error into a category for logging and retry decisions
 */
export function classifyError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  
  // Check validation errors first (most specific)
  for (const pattern of VALIDATION_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return ErrorCategory.VALIDATION;
    }
  }
  
  // Check state conflict errors
  for (const pattern of STATE_CONFLICT_PATTERNS) {
    if (message.includes(pattern)) {
      return ErrorCategory.STATE_CONFLICT;
    }
  }
  
  // Check resource errors
  for (const pattern of RESOURCE_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return ErrorCategory.RESOURCE;
    }
  }
  
  // Check transient errors
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return ErrorCategory.TRANSIENT_RPC;
    }
  }
  
  // Check for TransactionExpiredBlockheightExceededError
  if (error.name === 'TransactionExpiredBlockheightExceededError' ||
      error instanceof TransactionExpiredBlockheightExceededError) {
    return ErrorCategory.TRANSIENT_RPC;
  }
  
  return ErrorCategory.UNKNOWN;
}

/**
 * Check if an error category is retryable
 */
export function isRetryableCategory(category: ErrorCategory): boolean {
  // Only transient RPC errors and unknown errors are retryable
  // Unknown errors are retried because they might be transient
  return category === ErrorCategory.TRANSIENT_RPC || category === ErrorCategory.UNKNOWN;
}

/**
 * Calculate backoff delay with jitter
 */
export function calculateBackoffDelay(attempt: number): number {
  // Exponential backoff: base * 2^(attempt-1)
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  // Add random jitter to prevent thundering herd
  const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
  return exponentialDelay + jitter;
}

/**
 * Get a human-readable log label for an error category
 */
function getCategoryLogLabel(category: ErrorCategory): string {
  switch (category) {
    case ErrorCategory.VALIDATION:
      return 'VALIDATION_ERROR';
    case ErrorCategory.TRANSIENT_RPC:
      return 'TRANSIENT_RPC';
    case ErrorCategory.STATE_CONFLICT:
      return 'STATE_CONFLICT';
    case ErrorCategory.RESOURCE:
      return 'RESOURCE_ERROR';
    case ErrorCategory.UNKNOWN:
    default:
      return 'UNKNOWN_ERROR';
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Create a new relayer service instance
 */
export function createRelayer(config: RelayerConfig): RelayerService {
  return new RelayerService(config);
}

/**
 * Example usage / entry point
 */
export async function main(): Promise<void> {
  // Load configuration from environment
  const config: RelayerConfig = {
    rpcEndpoint: process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com',
    walletKeypair: Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.RELAYER_KEYPAIR || '[]'))
    ),
    programId: new PublicKey(process.env.PROGRAM_ID || 'pSoL2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    poolConfig: new PublicKey(process.env.POOL_CONFIG || '11111111111111111111111111111111'),
    feeBps: parseInt(process.env.FEE_BPS || '50', 10),
    minWithdrawalAmount: BigInt(process.env.MIN_WITHDRAWAL || '1000000'),
    maxWithdrawalAmount: BigInt(process.env.MAX_WITHDRAWAL || '1000000000000'),
    port: parseInt(process.env.PORT || '3000', 10),
    withdrawVkPath: process.env.WITHDRAW_VK_PATH || './circuits/withdraw/withdraw.vkey.json',
  };
  
  const relayer = createRelayer(config);
  
  // Add supported assets if configured
  const supportedAssets = process.env.SUPPORTED_ASSETS?.split(',') || [];
  for (const asset of supportedAssets) {
    if (asset.trim()) {
      relayer.addSupportedAsset(asset.trim());
    }
  }
  
  relayer.start();
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Failed to start relayer:', err);
    process.exit(1);
  });
}
