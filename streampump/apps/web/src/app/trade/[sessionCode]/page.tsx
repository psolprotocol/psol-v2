'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession as useAuthSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { tradeApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Rocket,
  ExternalLink,
  AlertCircle,
  Loader2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const PRESET_AMOUNTS = [0.01, 0.05, 0.1];

interface TokenInfo {
  name: string;
  ticker: string;
  imageUrl: string;
}

interface TradeInfo {
  code: string;
  title: string;
  status: string;
  mintAddress: string;
  token: TokenInfo;
  launchTx: {
    signature: string;
    confirmedAt: string;
  };
  presetAmounts: number[];
}

export default function TradePage() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { data: authSession, status: authStatus } = useAuthSession();
  const { publicKey, signTransaction, connected } = useWallet();

  const [tradeInfo, setTradeInfo] = useState<TradeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [quote, setQuote] = useState<{ outputAmount: string; priceImpact: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'generating' | 'signing' | 'broadcasting' | 'confirmed' | 'failed'>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  // Fetch trade info
  useEffect(() => {
    const fetchTradeInfo = async () => {
      try {
        const response = await tradeApi.getInfo(sessionCode);
        setTradeInfo(response.data as TradeInfo);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchTradeInfo();
  }, [sessionCode]);

  // Get quote when amount changes
  useEffect(() => {
    const getQuote = async () => {
      if (!selectedAmount || !tradeInfo) return;
      
      setQuoteLoading(true);
      try {
        const response = await tradeApi.getQuote(sessionCode, selectedAmount);
        setQuote({
          outputAmount: response.data.outputAmount,
          priceImpact: response.data.priceImpact,
        });
      } catch (err) {
        console.error('Failed to get quote:', err);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    };
    getQuote();
  }, [selectedAmount, tradeInfo, sessionCode]);

  // Handle buy
  const handleBuy = async () => {
    if (!selectedAmount || !publicKey || !signTransaction || !tradeInfo) return;

    setTxStatus('generating');
    setTxError(null);

    try {
      // Create swap transaction
      const idempotencyKey = uuidv4();
      const response = await tradeApi.createSwapTx(
        sessionCode,
        selectedAmount,
        publicKey.toBase58(),
        idempotencyKey
      );

      // Decode transaction
      setTxStatus('signing');
      const txBuffer = Buffer.from(response.data.serializedTxBase64, 'base64');
      let transaction: Transaction | VersionedTransaction;

      try {
        transaction = VersionedTransaction.deserialize(txBuffer);
      } catch {
        transaction = Transaction.from(txBuffer);
      }

      // Sign transaction
      const signedTx = await signTransaction(transaction);

      // Serialize signed transaction
      let signedTxBase64: string;
      if (signedTx instanceof VersionedTransaction) {
        signedTxBase64 = Buffer.from(signedTx.serialize()).toString('base64');
      } else {
        signedTxBase64 = signedTx.serialize().toString('base64');
      }

      // Broadcast
      setTxStatus('broadcasting');
      const broadcastResponse = await tradeApi.broadcastSwap(
        sessionCode,
        signedTxBase64,
        uuidv4()
      );

      if (broadcastResponse.data.status === 'confirmed') {
        setTxStatus('confirmed');
        if (broadcastResponse.data.explorerUrl) {
          setExplorerUrl(broadcastResponse.data.explorerUrl);
        }
      } else {
        setTxStatus('failed');
        setTxError('Transaction failed on-chain');
      }
    } catch (err) {
      setTxStatus('failed');
      setTxError((err as Error).message);
    }
  };

  // Handle sign in
  const handleSignIn = () => {
    signIn('twitch');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !tradeInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-xl">{error || 'Token not found or not yet launched'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-purple-950/20">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-8 w-8 text-purple-500" />
            <span className="text-xl font-bold">StreamPump</span>
          </div>

          <div className="flex items-center gap-4">
            {authStatus !== 'loading' && !authSession ? (
              <Button variant="outline" onClick={handleSignIn}>
                Sign in with Twitch
              </Button>
            ) : authSession && (
              <div className="flex items-center gap-2">
                <img
                  src={authSession.user?.image || ''}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
                <span className="hidden text-sm md:inline">{authSession.user?.name}</span>
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="container max-w-lg py-8">
        {/* Token Info */}
        <Card className="mb-8">
          <CardContent className="flex items-center gap-4 p-6">
            {tradeInfo.token?.imageUrl && (
              <img
                src={tradeInfo.token.imageUrl}
                alt={tradeInfo.token.name}
                className="h-20 w-20 rounded-xl object-cover"
              />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{tradeInfo.token?.name}</h1>
              <Badge variant="outline" className="mt-1">
                ${tradeInfo.token?.ticker}
              </Badge>
              {tradeInfo.launchTx && (
                <a
                  href={`https://solscan.io/tx/${tradeInfo.launchTx.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                  View launch tx
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Success */}
        {txStatus === 'confirmed' && (
          <Card className="mb-8 border-green-500/50 bg-green-500/5">
            <CardContent className="py-6 text-center">
              <Check className="mx-auto mb-4 h-12 w-12 text-green-500" />
              <h3 className="mb-2 text-lg font-bold text-green-500">
                Purchase Successful!
              </h3>
              <p className="mb-4 text-muted-foreground">
                Your tokens have been purchased
              </p>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on Explorer
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Buy Card */}
        {txStatus !== 'confirmed' && (
          <Card>
            <CardHeader>
              <CardTitle>Buy {tradeInfo.token?.ticker}</CardTitle>
              <CardDescription>
                Select an amount to purchase
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount Selection */}
              <div className="grid grid-cols-3 gap-4">
                {PRESET_AMOUNTS.map((amount) => (
                  <Button
                    key={amount}
                    variant={selectedAmount === amount ? 'default' : 'outline'}
                    className={cn(
                      'h-16 text-lg',
                      selectedAmount === amount && 'ring-2 ring-purple-500'
                    )}
                    onClick={() => setSelectedAmount(amount)}
                  >
                    {amount} SOL
                  </Button>
                ))}
              </div>

              {/* Quote */}
              {selectedAmount && (
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You pay</span>
                    <span className="font-bold">{selectedAmount} SOL</span>
                  </div>
                  <div className="my-2 flex justify-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You receive</span>
                    {quoteLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : quote ? (
                      <span className="font-bold">
                        ~{parseFloat(quote.outputAmount).toLocaleString()} {tradeInfo.token?.ticker}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                  {quote && quote.priceImpact > 1 && (
                    <div className="mt-2 text-sm text-yellow-500">
                      Price impact: {quote.priceImpact.toFixed(2)}%
                    </div>
                  )}
                </div>
              )}

              {/* Wallet Connection */}
              {!connected && (
                <div className="flex justify-center">
                  <WalletMultiButton />
                </div>
              )}

              {/* Error */}
              {txError && (
                <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
                  <AlertCircle className="mb-2 h-5 w-5" />
                  <p className="text-sm">{txError}</p>
                </div>
              )}

              {/* Buy Button */}
              {connected && (
                <Button
                  variant="gradient"
                  size="xl"
                  className="w-full"
                  disabled={!selectedAmount || txStatus !== 'idle' || quoteLoading}
                  onClick={handleBuy}
                >
                  {txStatus === 'generating' && (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating transaction...
                    </>
                  )}
                  {txStatus === 'signing' && (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sign in wallet...
                    </>
                  )}
                  {txStatus === 'broadcasting' && (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Broadcasting...
                    </>
                  )}
                  {txStatus === 'idle' && (
                    <>
                      Buy {tradeInfo.token?.ticker}
                    </>
                  )}
                  {txStatus === 'failed' && 'Try Again'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
