import {
  Connection,
  Transaction,
  VersionedTransaction,
  SendTransactionError,
} from '@solana/web3.js';
import { config } from '../config.js';
import { txLogger as logger } from './logger.js';

// Create connection with default commitment
export const connection = new Connection(config.SOLANA_RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

export interface BroadcastResult {
  signature: string;
  status: 'confirmed' | 'failed';
  error?: string;
  slot?: number;
}

/**
 * Deserialize a transaction from base64
 */
export function deserializeTransaction(
  base64: string
): Transaction | VersionedTransaction {
  const buffer = Buffer.from(base64, 'base64');
  
  // Try versioned transaction first (has version byte)
  try {
    return VersionedTransaction.deserialize(buffer);
  } catch {
    // Fall back to legacy transaction
    return Transaction.from(buffer);
  }
}

/**
 * Broadcast a signed transaction and wait for confirmation
 */
export async function broadcastAndConfirm(
  signedTxBase64: string,
  maxRetries = 3
): Promise<BroadcastResult> {
  const transaction = deserializeTransaction(signedTxBase64);
  
  // Get latest blockhash for confirmation
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info({ attempt: attempt + 1 }, 'Broadcasting transaction');
      
      // Serialize the signed transaction
      let serialized: Buffer;
      if (transaction instanceof VersionedTransaction) {
        serialized = Buffer.from(transaction.serialize());
      } else {
        serialized = transaction.serialize();
      }
      
      // Send raw transaction
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 0, // We handle retries ourselves
      });
      
      logger.info({ signature }, 'Transaction sent, waiting for confirmation');
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );
      
      if (confirmation.value.err) {
        logger.error({ signature, error: confirmation.value.err }, 'Transaction failed on-chain');
        return {
          signature,
          status: 'failed',
          error: JSON.stringify(confirmation.value.err),
        };
      }
      
      logger.info({ signature }, 'Transaction confirmed');
      
      return {
        signature,
        status: 'confirmed',
        slot: confirmation.context.slot,
      };
      
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof SendTransactionError) {
        logger.error({ 
          error: error.message, 
          logs: error.logs,
          attempt: attempt + 1 
        }, 'Send transaction error');
        
        // Don't retry if it's a definitive failure
        if (error.message.includes('already been processed') ||
            error.message.includes('Blockhash not found')) {
          break;
        }
      } else {
        logger.error({ 
          error: (error as Error).message, 
          attempt: attempt + 1 
        }, 'Broadcast error');
      }
      
      // Wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  // All retries exhausted
  return {
    signature: '',
    status: 'failed',
    error: lastError?.message || 'Unknown error after retries',
  };
}

/**
 * Check if a blockhash is still valid
 */
export async function isBlockhashValid(blockhash: string): Promise<boolean> {
  try {
    const result = await connection.isBlockhashValid(blockhash);
    return result.value;
  } catch {
    return false;
  }
}

/**
 * Get transaction details
 */
export async function getTransactionDetails(signature: string) {
  return connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
}

/**
 * Get Solana explorer URL
 */
export function getExplorerUrl(signature: string): string {
  const cluster = config.SOLANA_NETWORK === 'mainnet-beta' 
    ? '' 
    : `?cluster=${config.SOLANA_NETWORK}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
