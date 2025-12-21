import { prisma } from '../lib/prisma.js';
import { txLogger as logger } from '../lib/logger.js';
import { emitTxUpdate } from '../ws/socket.js';
import { broadcastAndConfirm, getExplorerUrl } from '../lib/solana.js';
import * as bagsClient from '../bags/client.js';
import { setSessionStatus } from './session.service.js';
import { v4 as uuidv4 } from 'uuid';
import type { BagsTokenInfo } from '@streampump/shared';

// ===========================================
// Types
// ===========================================

export interface GenerateLaunchTxInput {
  sessionId: string;
  idempotencyKey: string;
}

export interface GenerateLaunchTxResult {
  serializedTxBase64: string;
  requestId: string;
  expiresAt?: Date;
}

export interface BroadcastLaunchTxInput {
  sessionId: string;
  signedTxBase64: string;
  idempotencyKey: string;
}

export interface BroadcastResult {
  signature: string;
  status: 'confirmed' | 'failed';
  explorerUrl?: string;
  error?: string;
}

// ===========================================
// Idempotency Check
// ===========================================

async function checkIdempotency(key: string): Promise<{ exists: boolean; response?: unknown }> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key },
  });
  
  if (existing) {
    if (existing.expiresAt > new Date()) {
      return { exists: true, response: existing.response };
    }
    // Expired, delete it
    await prisma.idempotencyKey.delete({ where: { key } });
  }
  
  return { exists: false };
}

async function setIdempotency(key: string, response: unknown): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  await prisma.idempotencyKey.upsert({
    where: { key },
    update: { response: response as object, expiresAt },
    create: { key, response: response as object, expiresAt },
  });
}

// ===========================================
// Launch Transaction
// ===========================================

export async function generateLaunchTransaction(
  input: GenerateLaunchTxInput
): Promise<GenerateLaunchTxResult> {
  const { sessionId, idempotencyKey } = input;
  
  logger.info({ sessionId, idempotencyKey }, 'Generating launch transaction');
  
  // Check idempotency
  const idempotencyCheck = await checkIdempotency(`launch:${idempotencyKey}`);
  if (idempotencyCheck.exists) {
    logger.info({ idempotencyKey }, 'Returning cached launch transaction');
    return idempotencyCheck.response as GenerateLaunchTxResult;
  }
  
  // Get session with all details
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      options: true,
      feeSplits: true,
      images: true,
      createdBy: {
        include: { streamerProfile: true },
      },
    },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (session.status !== 'FINALIZED') {
    throw new Error('Session must be finalized before generating launch transaction');
  }
  
  // Get winning option
  const options = (session.options?.options as { index: number; name: string; ticker: string; imageId: string }[]) || [];
  const winnerOption = options.find(opt => opt.index === session.winnerOptionIndex);
  
  if (!winnerOption) {
    throw new Error('Winner option not found');
  }
  
  // Get winner image
  const winnerImage = session.images.find(img => img.id === winnerOption.imageId);
  if (!winnerImage) {
    throw new Error('Winner image not found');
  }
  
  // Get streamer wallet
  const streamerWallet = session.createdBy.streamerProfile?.streamerWalletPubkey;
  if (!streamerWallet) {
    throw new Error('Streamer wallet not configured');
  }
  
  // Prepare token info
  const tokenInfo: BagsTokenInfo = {
    name: winnerOption.name,
    ticker: winnerOption.ticker,
    imageUrl: winnerImage.url,
  };
  
  // Prepare fee splits
  const feeSplits = session.feeSplits.map(split => ({
    wallet: split.walletPubkey,
    bps: split.bps,
  }));
  
  // Call Bags API
  const bagsResult = await bagsClient.createLaunchTransaction({
    tokenInfo,
    creatorWallet: streamerWallet,
    feeSplits,
  });
  
  // Store launch transaction
  await prisma.launchTx.create({
    data: {
      sessionId,
      bagsRequestId: bagsResult.requestId,
      serializedTxBase64: bagsResult.serializedTxBase64,
      idempotencyKey,
      expiresAt: bagsResult.expiresAt,
    },
  });
  
  // Update session status
  await setSessionStatus(sessionId, 'LAUNCH_TX_READY');
  
  // Emit update
  emitTxUpdate(session.code, {
    sessionId,
    kind: 'LAUNCH',
    status: 'PENDING',
  });
  
  const result = {
    serializedTxBase64: bagsResult.serializedTxBase64,
    requestId: bagsResult.requestId,
    expiresAt: bagsResult.expiresAt,
  };
  
  // Store in idempotency cache
  await setIdempotency(`launch:${idempotencyKey}`, result);
  
  logger.info({ sessionId, requestId: bagsResult.requestId }, 'Launch transaction generated');
  
  return result;
}

export async function broadcastLaunchTransaction(
  input: BroadcastLaunchTxInput
): Promise<BroadcastResult> {
  const { sessionId, signedTxBase64, idempotencyKey } = input;
  
  logger.info({ sessionId, idempotencyKey }, 'Broadcasting launch transaction');
  
  // Check idempotency
  const idempotencyCheck = await checkIdempotency(`broadcast:${idempotencyKey}`);
  if (idempotencyCheck.exists) {
    logger.info({ idempotencyKey }, 'Returning cached broadcast result');
    return idempotencyCheck.response as BroadcastResult;
  }
  
  // Get session
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { launchTx: true },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (session.status !== 'LAUNCH_TX_READY') {
    throw new Error('Session is not ready for launch transaction broadcast');
  }
  
  // Emit pending status
  emitTxUpdate(session.code, {
    sessionId,
    kind: 'LAUNCH',
    status: 'BROADCAST',
  });
  
  // Broadcast and confirm
  const broadcastResult = await broadcastAndConfirm(signedTxBase64);
  
  // Store chain transaction
  await prisma.chainTx.create({
    data: {
      sessionId,
      kind: 'LAUNCH',
      signature: broadcastResult.signature || uuidv4(), // Use UUID if no signature (failed before broadcast)
      status: broadcastResult.status === 'confirmed' ? 'CONFIRMED' : 'FAILED',
      error: broadcastResult.error,
      confirmedAt: broadcastResult.status === 'confirmed' ? new Date() : null,
    },
  });
  
  const explorerUrl = broadcastResult.signature ? getExplorerUrl(broadcastResult.signature) : undefined;
  
  if (broadcastResult.status === 'confirmed') {
    // Update session to LAUNCHED
    // Note: In a real implementation, we'd parse the transaction to get the mint address
    await setSessionStatus(sessionId, 'LAUNCHED', {
      mintAddress: session.launchTx?.bagsRequestId, // Placeholder - would extract from tx
    });
    
    emitTxUpdate(session.code, {
      sessionId,
      kind: 'LAUNCH',
      status: 'CONFIRMED',
      signature: broadcastResult.signature,
      explorerUrl,
    });
  } else {
    await setSessionStatus(sessionId, 'FAILED');
    
    emitTxUpdate(session.code, {
      sessionId,
      kind: 'LAUNCH',
      status: 'FAILED',
      error: broadcastResult.error,
    });
  }
  
  const result = {
    signature: broadcastResult.signature,
    status: broadcastResult.status,
    explorerUrl,
    error: broadcastResult.error,
  };
  
  // Store in idempotency cache
  await setIdempotency(`broadcast:${idempotencyKey}`, result);
  
  logger.info({ 
    sessionId, 
    signature: broadcastResult.signature,
    status: broadcastResult.status,
  }, 'Launch transaction broadcast complete');
  
  return result;
}

// ===========================================
// Swap Transaction
// ===========================================

export interface GenerateSwapTxInput {
  sessionId: string;
  userWallet: string;
  amountSol: number;
  idempotencyKey: string;
}

export interface GenerateSwapTxResult {
  serializedTxBase64: string;
  requestId: string;
  quote: {
    inputAmount: string;
    outputAmount: string;
    priceImpact: number;
  };
}

export async function generateSwapTransaction(
  input: GenerateSwapTxInput
): Promise<GenerateSwapTxResult> {
  const { sessionId, userWallet, amountSol, idempotencyKey } = input;
  
  logger.info({ sessionId, userWallet, amountSol }, 'Generating swap transaction');
  
  // Check idempotency
  const idempotencyCheck = await checkIdempotency(`swap:${idempotencyKey}`);
  if (idempotencyCheck.exists) {
    logger.info({ idempotencyKey }, 'Returning cached swap transaction');
    return idempotencyCheck.response as GenerateSwapTxResult;
  }
  
  // Get session
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (session.status !== 'LAUNCHED') {
    throw new Error('Token is not yet launched');
  }
  
  if (!session.mintAddress) {
    throw new Error('Token mint address not available');
  }
  
  // Get quote first
  const quote = await bagsClient.getTradeQuote({
    mint: session.mintAddress,
    amountSol,
    side: 'buy',
  });
  
  // Create swap transaction
  const swapResult = await bagsClient.createSwapTransaction({
    mint: session.mintAddress,
    amountSol,
    side: 'buy',
    userWallet,
  });
  
  const result = {
    serializedTxBase64: swapResult.serializedTxBase64,
    requestId: swapResult.requestId,
    quote: {
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      priceImpact: quote.priceImpact,
    },
  };
  
  // Store in idempotency cache
  await setIdempotency(`swap:${idempotencyKey}`, result);
  
  logger.info({ sessionId, requestId: swapResult.requestId }, 'Swap transaction generated');
  
  return result;
}

export interface BroadcastSwapTxInput {
  sessionId: string;
  signedTxBase64: string;
  userWallet: string;
  idempotencyKey: string;
}

export async function broadcastSwapTransaction(
  input: BroadcastSwapTxInput
): Promise<BroadcastResult> {
  const { sessionId, signedTxBase64, idempotencyKey } = input;
  
  logger.info({ sessionId, idempotencyKey }, 'Broadcasting swap transaction');
  
  // Check idempotency
  const idempotencyCheck = await checkIdempotency(`swap-broadcast:${idempotencyKey}`);
  if (idempotencyCheck.exists) {
    logger.info({ idempotencyKey }, 'Returning cached swap broadcast result');
    return idempotencyCheck.response as BroadcastResult;
  }
  
  // Get session
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  // Broadcast and confirm
  const broadcastResult = await broadcastAndConfirm(signedTxBase64);
  
  // Store chain transaction
  await prisma.chainTx.create({
    data: {
      sessionId,
      kind: 'SWAP',
      signature: broadcastResult.signature || uuidv4(),
      status: broadcastResult.status === 'confirmed' ? 'CONFIRMED' : 'FAILED',
      error: broadcastResult.error,
      confirmedAt: broadcastResult.status === 'confirmed' ? new Date() : null,
    },
  });
  
  const explorerUrl = broadcastResult.signature ? getExplorerUrl(broadcastResult.signature) : undefined;
  
  const result = {
    signature: broadcastResult.signature,
    status: broadcastResult.status,
    explorerUrl,
    error: broadcastResult.error,
  };
  
  // Store in idempotency cache
  await setIdempotency(`swap-broadcast:${idempotencyKey}`, result);
  
  logger.info({ 
    sessionId, 
    signature: broadcastResult.signature,
    status: broadcastResult.status,
  }, 'Swap transaction broadcast complete');
  
  return result;
}
