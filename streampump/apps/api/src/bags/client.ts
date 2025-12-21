import { z } from 'zod';
import {
  bagsCreateLaunchTxResponseSchema,
  bagsTradeQuoteResponseSchema,
  bagsCreateSwapTxResponseSchema,
  type BagsTokenInfo,
} from '@streampump/shared';
import { config, requireBagsApiKey } from '../config.js';
import { bagsLogger as logger } from '../lib/logger.js';
import { normalizeToBase64 } from '@streampump/shared';

// ===========================================
// Error Types
// ===========================================

export class BagsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'BagsApiError';
  }
}

// ===========================================
// Response Schemas for API validation
// ===========================================

const bagsErrorSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

// ===========================================
// HTTP Client with Retry
// ===========================================

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  maxRetries?: number;
}

async function makeRequest<T>(
  options: RequestOptions,
  schema: z.ZodSchema<T>
): Promise<T> {
  const { method, path, body, maxRetries = 3 } = options;
  const apiKey = requireBagsApiKey();
  
  const url = `${config.BAGS_API_URL}${path}`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info({ method, path, attempt: attempt + 1 }, 'Making Bags API request');
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          // Include both auth header formats for compatibility
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const responseText = await response.text();
      let responseData: unknown;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      
      if (!response.ok) {
        const errorParsed = bagsErrorSchema.safeParse(responseData);
        const errorMessage = errorParsed.success 
          ? (errorParsed.data.error || errorParsed.data.message || 'Unknown error')
          : 'Unknown API error';
        
        logger.error({
          statusCode: response.status,
          error: errorMessage,
          response: responseData,
        }, 'Bags API error');
        
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new BagsApiError(errorMessage, response.status, responseData);
        }
        
        throw new BagsApiError(errorMessage, response.status, responseData);
      }
      
      // Validate response against schema
      const parsed = schema.safeParse(responseData);
      if (!parsed.success) {
        logger.error({
          errors: parsed.error.errors,
          response: responseData,
        }, 'Invalid Bags API response format');
        
        throw new BagsApiError(
          'Invalid response format from Bags API',
          500,
          responseData
        );
      }
      
      logger.info({ path }, 'Bags API request successful');
      return parsed.data;
      
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof BagsApiError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error; // Don't retry client errors
      }
      
      logger.warn({
        error: (error as Error).message,
        attempt: attempt + 1,
      }, 'Bags API request failed, retrying...');
      
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        );
      }
    }
  }
  
  throw lastError || new Error('Unknown error after retries');
}

// ===========================================
// API Functions
// ===========================================

export interface CreateLaunchTxParams {
  tokenInfo: BagsTokenInfo;
  creatorWallet: string;
  feeSplits?: { wallet: string; bps: number }[];
}

export interface CreateLaunchTxResult {
  requestId: string;
  serializedTxBase64: string;
  mint?: string;
  expiresAt?: Date;
}

/**
 * Create a token launch transaction via Bags API
 */
export async function createLaunchTransaction(
  params: CreateLaunchTxParams
): Promise<CreateLaunchTxResult> {
  logger.info({ 
    tokenName: params.tokenInfo.name,
    ticker: params.tokenInfo.ticker,
    creatorWallet: params.creatorWallet,
  }, 'Creating launch transaction');
  
  const response = await makeRequest(
    {
      method: 'POST',
      path: '/v1/tokens/launch',
      body: {
        name: params.tokenInfo.name,
        ticker: params.tokenInfo.ticker,
        description: params.tokenInfo.description,
        imageUrl: params.tokenInfo.imageUrl,
        twitter: params.tokenInfo.twitter,
        telegram: params.tokenInfo.telegram,
        website: params.tokenInfo.website,
        creatorWallet: params.creatorWallet,
        feeSplits: params.feeSplits,
      },
    },
    bagsCreateLaunchTxResponseSchema
  );
  
  // Normalize transaction to base64
  const serializedTxBase64 = normalizeToBase64(response.serializedTransaction);
  
  return {
    requestId: response.requestId,
    serializedTxBase64,
    mint: response.mint,
    expiresAt: response.expiresAt ? new Date(response.expiresAt) : undefined,
  };
}

export interface TradeQuoteParams {
  mint: string;
  amountSol: number;
  side: 'buy' | 'sell';
  slippageBps?: number;
}

export interface TradeQuoteResult {
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  fee: string;
  route?: unknown;
}

/**
 * Get a trade quote from Bags API
 */
export async function getTradeQuote(
  params: TradeQuoteParams
): Promise<TradeQuoteResult> {
  logger.info({
    mint: params.mint,
    amountSol: params.amountSol,
    side: params.side,
  }, 'Getting trade quote');
  
  const response = await makeRequest(
    {
      method: 'POST',
      path: '/v1/trade/quote',
      body: {
        mint: params.mint,
        amountSol: params.amountSol,
        side: params.side,
        slippageBps: params.slippageBps ?? 100,
      },
    },
    bagsTradeQuoteResponseSchema
  );
  
  return response;
}

export interface CreateSwapTxParams {
  mint: string;
  amountSol: number;
  side: 'buy' | 'sell';
  userWallet: string;
  slippageBps?: number;
}

export interface CreateSwapTxResult {
  requestId: string;
  serializedTxBase64: string;
  expiresAt?: Date;
}

/**
 * Create a swap transaction via Bags API
 */
export async function createSwapTransaction(
  params: CreateSwapTxParams
): Promise<CreateSwapTxResult> {
  logger.info({
    mint: params.mint,
    amountSol: params.amountSol,
    side: params.side,
    userWallet: params.userWallet,
  }, 'Creating swap transaction');
  
  const response = await makeRequest(
    {
      method: 'POST',
      path: '/v1/trade/swap',
      body: {
        mint: params.mint,
        amountSol: params.amountSol,
        side: params.side,
        userWallet: params.userWallet,
        slippageBps: params.slippageBps ?? 100,
      },
    },
    bagsCreateSwapTxResponseSchema
  );
  
  // Normalize transaction to base64
  const serializedTxBase64 = normalizeToBase64(response.serializedTransaction);
  
  return {
    requestId: response.requestId,
    serializedTxBase64,
    expiresAt: response.expiresAt ? new Date(response.expiresAt) : undefined,
  };
}

/**
 * Get token info from Bags API
 */
export async function getTokenInfo(mint: string) {
  logger.info({ mint }, 'Getting token info');
  
  // This is a simple GET request that doesn't need full validation
  const apiKey = requireBagsApiKey();
  const url = `${config.BAGS_API_URL}/v1/tokens/${mint}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey,
    },
  });
  
  if (!response.ok) {
    throw new BagsApiError('Failed to get token info', response.status);
  }
  
  return response.json();
}
