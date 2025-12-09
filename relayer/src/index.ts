/**
 * pSOL v2 Relayer Service
 * 
 * HTTP service that relays withdrawal transactions for users.
 * Users submit proofs to the relayer, which submits them on-chain
 * and collects a fee.
 * 
 * @module relayer
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// Configuration interface
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
}

// Withdrawal request interface
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

// Withdrawal response interface
interface WithdrawResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

// Relayer status interface
interface RelayerStatus {
  active: boolean;
  feeBps: number;
  operator: string;
  totalTransactions: number;
  totalFeesEarned: string;
  supportedAssets: string[];
}

/**
 * pSOL v2 Relayer Service
 */
export class RelayerService {
  private config: RelayerConfig;
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program;
  private app: express.Application;
  private totalTransactions: number = 0;
  private totalFeesEarned: bigint = BigInt(0);
  private supportedAssets: Set<string> = new Set();
  
  constructor(config: RelayerConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcEndpoint, 'confirmed');
    
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
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: { error: 'Too many requests' },
    });
    this.app.use(limiter);
    
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
      res.json({ status: 'ok', timestamp: Date.now() });
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
    // Validate request
    this.validateWithdrawRequest(request);
    
    const amount = BigInt(request.amount);
    const fee = this.calculateFee(amount);
    
    // Verify amount bounds
    if (amount < this.config.minWithdrawalAmount) {
      throw new Error(`Amount below minimum: ${this.config.minWithdrawalAmount}`);
    }
    if (amount > this.config.maxWithdrawalAmount) {
      throw new Error(`Amount above maximum: ${this.config.maxWithdrawalAmount}`);
    }
    
    // Decode inputs
    const proofData = hexToBytes(request.proofData);
    const merkleRoot = hexToBytes(request.merkleRoot);
    const nullifierHash = hexToBytes(request.nullifierHash);
    const assetId = hexToBytes(request.assetId);
    const recipient = new PublicKey(request.recipient);
    const mint = new PublicKey(request.mint);
    
    // Check nullifier hasn't been spent
    const isSpent = await this.checkNullifierSpent(nullifierHash);
    if (isSpent) {
      throw new Error('Nullifier already spent');
    }
    
    // Build and submit transaction
    const signature = await this.submitWithdrawal({
      proofData,
      merkleRoot,
      nullifierHash,
      recipient,
      amount,
      fee,
      assetId,
      mint,
    });
    
    // Update statistics
    this.totalTransactions++;
    this.totalFeesEarned += fee;
    
    return {
      success: true,
      signature,
    };
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
    if (!request.amount || BigInt(request.amount) <= 0) {
      throw new Error('Invalid amount');
    }
    if (!request.assetId || request.assetId.length !== 64) {
      throw new Error('Invalid asset ID length');
    }
    if (!request.mint) {
      throw new Error('Missing mint');
    }
  }
  
  /**
   * Check if nullifier has been spent on-chain
   */
  /**
 * Check if nullifier has been spent on-chain
 */
private async checkNullifierSpent(nullifierHash: Uint8Array): Promise<boolean> {
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("nullifier_v2"),
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
    // RPC/network error – do not silently treat as spent or unspent
    console.error("RPC error checking nullifier status", {
      nullifier: bytesToHex(nullifierHash),
      pda: nullifierPda.toBase58(),
      error: err instanceof Error ? err.message : err,
    });

    throw new Error("Failed to verify nullifier status - RPC error");
  }
}

  
  /**
   * Submit withdrawal transaction
   */
  private async submitWithdrawal(params: {
    proofData: Uint8Array;
    merkleRoot: Uint8Array;
    nullifierHash: Uint8Array;
    recipient: PublicKey;
    amount: bigint;
    fee: bigint;
    assetId: Uint8Array;
    mint: PublicKey;
  }): Promise<string> {
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
    this.supportedAssets.add(assetId);
  }
  
  /**
   * Start the relayer service
   */
  start(): void {
    this.app.listen(this.config.port, () => {
      console.log(`pSOL v2 Relayer started on port ${this.config.port}`);
      console.log(`Operator: ${this.config.walletKeypair.publicKey.toBase58()}`);
      console.log(`Fee: ${this.config.feeBps} bps`);
    });
  }
}

// Utility functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Export for direct execution
export function createRelayer(config: RelayerConfig): RelayerService {
  return new RelayerService(config);
}
