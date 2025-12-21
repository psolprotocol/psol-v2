'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession as useAuthSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { useSession } from '@/hooks/useSession';
import { useSocket } from '@/hooks/useSocket';
import { sessionsApi } from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Rocket,
  ArrowLeft,
  Play,
  Square,
  Trophy,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const statusColors: Record<string, string> = {
  DRAFT: 'secondary',
  VOTING: 'info',
  FINALIZED: 'warning',
  LAUNCH_TX_READY: 'warning',
  LAUNCHED: 'success',
  FAILED: 'destructive',
};

export default function SessionControlRoom() {
  const { id } = useParams<{ id: string }>();
  const { data: authSession } = useAuthSession();
  const router = useRouter();
  const { publicKey, signTransaction } = useWallet();
  
  const { session, loading, error, updateSession, updateVoteResults } = useSession(id);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'generating' | 'signing' | 'broadcasting' | 'confirmed' | 'failed'>('idle');
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // WebSocket connection
  useSocket({
    sessionCode: session?.code || '',
    autoConnect: !!session?.code,
    onSessionUpdate: (event) => {
      updateSession({ status: event.status as string, mintAddress: event.mintAddress });
    },
    onVoteUpdate: (event) => {
      updateVoteResults(event.results);
    },
    onCountdownTick: (event) => {
      setRemainingSeconds(event.remainingSeconds);
    },
    onTxUpdate: (event) => {
      if (event.status === 'CONFIRMED') {
        setTxStatus('confirmed');
        if (event.explorerUrl) setExplorerUrl(event.explorerUrl);
      } else if (event.status === 'FAILED') {
        setTxStatus('failed');
        setTxError(event.error || 'Transaction failed');
      }
    },
  });

  // Handle start voting
  const handleStartVoting = async () => {
    if (!session) return;
    try {
      await sessionsApi.startVoting(session.id);
    } catch (err) {
      console.error('Failed to start voting:', err);
    }
  };

  // Handle stop voting
  const handleStopVoting = async () => {
    if (!session) return;
    try {
      await sessionsApi.stopVoting(session.id);
    } catch (err) {
      console.error('Failed to stop voting:', err);
    }
  };

  // Handle veto
  const handleVeto = async (useSecondPlace: boolean) => {
    if (!session) return;
    try {
      await sessionsApi.finalize(session.id, useSecondPlace);
    } catch (err) {
      console.error('Failed to finalize:', err);
    }
  };

  // Handle generate and sign launch tx
  const handleLaunch = async () => {
    if (!session || !publicKey || !signTransaction) return;
    
    setTxLoading(true);
    setTxError(null);
    setTxStatus('generating');

    try {
      // Generate launch transaction
      const idempotencyKey = uuidv4();
      const response = await sessionsApi.generateLaunchTx(session.id, idempotencyKey);
      
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
      const broadcastResponse = await sessionsApi.broadcastLaunchTx(
        session.id,
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
    } finally {
      setTxLoading(false);
    }
  };

  // Copy session code
  const handleCopyCode = () => {
    if (session?.code) {
      navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-xl">{error || 'Session not found'}</p>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const options = (session.options?.options || []) as { index: number; name: string; ticker: string; imageId: string }[];
  const voteResults = session.voteResults || [];
  const totalVotes = voteResults.reduce((sum, r) => sum + r.voteCount, 0);
  const winnerOption = options.find(opt => opt.index === session.winnerOptionIndex);
  const winnerResult = voteResults.find(r => r.optionIndex === session.winnerOptionIndex);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{session.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Code:</span>
              <code className="font-mono text-primary">{session.code}</code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyCode}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          <Badge variant={statusColors[session.status] as 'default'} className="text-sm">
            {session.status}
          </Badge>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left: Vote Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Countdown */}
            {session.status === 'VOTING' && (
              <Card className="border-blue-500/50 bg-blue-500/5">
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Clock className="mx-auto mb-2 h-8 w-8 text-blue-500" />
                    <div className="text-5xl font-bold tabular-nums">
                      {formatDuration(remainingSeconds)}
                    </div>
                    <p className="mt-2 text-muted-foreground">Time Remaining</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Vote Results */}
            <Card>
              <CardHeader>
                <CardTitle>Vote Results</CardTitle>
                <CardDescription>
                  {totalVotes} total votes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {voteResults.length > 0 ? (
                  voteResults.map((result, index) => (
                    <div
                      key={result.optionIndex}
                      className={cn(
                        'rounded-lg border p-4',
                        index === 0 && session.status !== 'VOTING' && 'border-yellow-500/50 bg-yellow-500/5'
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {result.imageUrl && (
                            <img
                              src={result.imageUrl}
                              alt={result.name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          )}
                          <div>
                            <span className="font-semibold">{result.name}</span>
                            <span className="ml-2 text-sm text-muted-foreground">
                              ${result.ticker}
                            </span>
                          </div>
                          {index === 0 && session.status !== 'VOTING' && (
                            <Trophy className="h-5 w-5 text-yellow-500" />
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold">{result.voteCount}</span>
                          <span className="ml-2 text-sm text-muted-foreground">
                            ({result.percentage.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={result.percentage}
                        className="h-2"
                        indicatorClassName={index === 0 ? 'bg-yellow-500' : ''}
                      />
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    {session.status === 'DRAFT'
                      ? 'Start voting to see results'
                      : 'No votes yet'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Overlay Link */}
            {session.overlayToken && (
              <Card>
                <CardHeader>
                  <CardTitle>OBS Overlay</CardTitle>
                  <CardDescription>
                    Add this URL as a browser source in OBS
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted p-2 text-sm">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/overlay/${session.code}?token=${session.overlayToken}`
                        : ''}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/overlay/${session.code}?token=${session.overlayToken}`
                        );
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Controls */}
          <div className="space-y-6">
            {/* Session Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {session.status === 'DRAFT' && (
                  <Button
                    variant="gradient"
                    className="w-full"
                    onClick={handleStartVoting}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Voting
                  </Button>
                )}

                {session.status === 'VOTING' && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleStopVoting}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Stop Voting
                  </Button>
                )}

                {session.status === 'FINALIZED' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <p className="mb-2 text-sm text-muted-foreground">Winner</p>
                      <div className="flex items-center gap-3">
                        {winnerResult?.imageUrl && (
                          <img
                            src={winnerResult.imageUrl}
                            alt={winnerResult.name}
                            className="h-12 w-12 rounded-lg"
                          />
                        )}
                        <div>
                          <p className="font-bold">{winnerResult?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${winnerResult?.ticker}
                          </p>
                        </div>
                      </div>
                    </div>

                    {voteResults.length > 1 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleVeto(true)}
                      >
                        Veto - Use 2nd Place
                      </Button>
                    )}

                    <div className="space-y-2">
                      <WalletMultiButton className="w-full" />
                      <Button
                        variant="gradient"
                        className="w-full"
                        onClick={handleLaunch}
                        disabled={!publicKey || txLoading}
                      >
                        {txLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {txStatus === 'generating' && 'Generating...'}
                            {txStatus === 'signing' && 'Sign in Wallet...'}
                            {txStatus === 'broadcasting' && 'Broadcasting...'}
                          </>
                        ) : (
                          <>
                            <Rocket className="mr-2 h-4 w-4" />
                            Generate & Sign Launch TX
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {session.status === 'LAUNCH_TX_READY' && (
                  <div className="space-y-4">
                    <WalletMultiButton className="w-full" />
                    <Button
                      variant="gradient"
                      className="w-full"
                      onClick={handleLaunch}
                      disabled={!publicKey || txLoading}
                    >
                      {txLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="mr-2 h-4 w-4" />
                      )}
                      Sign & Broadcast
                    </Button>
                  </div>
                )}

                {session.status === 'LAUNCHED' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-center">
                      <Check className="mx-auto mb-2 h-8 w-8 text-green-500" />
                      <p className="font-bold text-green-500">Token Launched!</p>
                    </div>

                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="w-full">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View on Explorer
                        </Button>
                      </a>
                    )}

                    <Link href={`/trade/${session.code}`}>
                      <Button variant="gradient" className="w-full">
                        Go to Trade Page
                      </Button>
                    </Link>
                  </div>
                )}

                {txError && (
                  <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
                    <AlertCircle className="mb-2 h-5 w-5" />
                    <p className="text-sm">{txError}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fee Splits */}
            <Card>
              <CardHeader>
                <CardTitle>Fee Splits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {session.feeSplits.map((split, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {split.role}
                      </span>
                      <span>
                        {(split.bps / 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a
                  href={`/vote/${session.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full justify-start">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Voting Page
                  </Button>
                </a>
                <a
                  href={`/overlay/${session.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full justify-start">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Overlay Preview
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
