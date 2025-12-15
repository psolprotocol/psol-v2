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
import { Keypair, PublicKey } from '@solana/web3.js';
/**
 * Error categories for logging and retry decisions
 */
export declare enum ErrorCategory {
    /** Validation failures - invalid proof, wrong inputs, etc. */
    VALIDATION = "VALIDATION",
    /** Transient RPC/network errors - can retry */
    TRANSIENT_RPC = "TRANSIENT_RPC",
    /** On-chain state conflicts - nullifier spent, etc. */
    STATE_CONFLICT = "STATE_CONFLICT",
    /** Resource exhaustion - insufficient funds, etc. */
    RESOURCE = "RESOURCE",
    /** Unknown errors */
    UNKNOWN = "UNKNOWN"
}
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
/**
 * pSOL v2 Relayer Service
 */
export declare class RelayerService {
    private config;
    private connection;
    private provider;
    private program;
    private app;
    private totalTransactions;
    private totalFeesEarned;
    private supportedAssets;
    /** Verification key for withdraw circuit (snarkjs format) */
    private withdrawVk;
    constructor(config: RelayerConfig);
    /**
     * Load withdraw verification key from file
     * Fails fast if the key is not available
     */
    private loadWithdrawVerificationKey;
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup API routes
     */
    private setupRoutes;
    /**
     * Get relayer status
     */
    getStatus(): Promise<RelayerStatus>;
    /**
     * Calculate relayer fee
     */
    calculateFee(amount: bigint): bigint;
    /**
     * Process a withdrawal request
     */
    processWithdrawal(request: WithdrawRequest): Promise<WithdrawResponse>;
    /**
     * Locally verify a withdraw proof using snarkjs before submitting on-chain.
     *
     * This mirrors WithdrawPublicInputs::to_field_elements in the on-chain program
     * and the serializeProof layout in sdk/src/proof/prover.ts.
     */
    private verifyWithdrawProofLocally;
    /**
     * Validate withdrawal request format
     */
    private validateWithdrawRequest;
    /**
     * Check if nullifier has been spent on-chain
     */
    private checkNullifierSpent;
    /**
     * Submit withdrawal transaction with retry logic
     *
     * Features:
     * - Exponential backoff with jitter
     * - Overall timeout to prevent hanging
     * - Smart error classification (only retries transient errors)
     * - Detailed logging for debugging
     */
    private submitWithdrawalWithRetry;
    /**
     * Log a retry attempt start
     */
    private logRetryAttempt;
    /**
     * Log a successful retry
     */
    private logRetrySuccess;
    /**
     * Log a retry error with classification
     */
    private logRetryError;
    /**
     * Log when not retrying due to error type
     */
    private logNonRetryableError;
    /**
     * Log backoff delay before next retry
     */
    private logRetryBackoff;
    /**
     * Log overall timeout reached
     */
    private logRetryTimeout;
    /**
     * Log all retries exhausted
     */
    private logRetryExhausted;
    /**
     * Submit withdrawal transaction
     */
    private submitWithdrawal;
    /**
     * Register asset as supported
     */
    addSupportedAsset(assetId: string): void;
    /**
     * Remove asset from supported list
     */
    removeSupportedAsset(assetId: string): void;
    /**
     * Start the relayer service
     */
    start(): void;
}
/**
 * Classify an error into a category for logging and retry decisions
 */
export declare function classifyError(error: Error): ErrorCategory;
/**
 * Check if an error category is retryable
 */
export declare function isRetryableCategory(category: ErrorCategory): boolean;
/**
 * Calculate backoff delay with jitter
 */
export declare function calculateBackoffDelay(attempt: number): number;
/**
 * Create a new relayer service instance
 */
export declare function createRelayer(config: RelayerConfig): RelayerService;
/**
 * Example usage / entry point
 */
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map