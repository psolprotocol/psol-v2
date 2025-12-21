'use client';

import { useState, useEffect, useCallback } from 'react';
import { signIn, useSession as useAuthSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { useSessionByCode } from '@/hooks/useSession';
import { useSocket } from '@/hooks/useSocket';
import { voteApi } from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Rocket,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Trophy,
} from 'lucide-react';

interface VoteResult {
  optionIndex: number;
  name: string;
  ticker: string;
  imageUrl: string;
  voteCount: number;
  percentage: number;
}

export default function VotePage() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { data: authSession, status: authStatus } = useAuthSession();
  const { session, loading, error } = useSessionByCode(sessionCode);
  
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('');

  // WebSocket connection
  useSocket({
    sessionCode,
    autoConnect: !!session,
    onSessionUpdate: (event) => {
      setSessionStatus(event.status);
    },
    onVoteUpdate: (event) => {
      setVoteResults(event.results);
    },
    onCountdownTick: (event) => {
      setRemainingSeconds(event.remainingSeconds);
    },
  });

  // Check if user has voted
  useEffect(() => {
    const checkVoteStatus = async () => {
      if (!authSession || !session) return;
      try {
        const response = await voteApi.getStatus(sessionCode);
        setHasVoted(response.data.hasVoted);
        setSessionStatus(response.data.sessionStatus);
      } catch (err) {
        console.error('Failed to check vote status:', err);
      }
    };
    checkVoteStatus();
  }, [authSession, session, sessionCode]);

  // Fetch initial results
  useEffect(() => {
    const fetchResults = async () => {
      if (!session) return;
      try {
        const response = await voteApi.getResults(sessionCode);
        const data = response.data as { results: VoteResult[]; status: string };
        setVoteResults(data.results);
        setSessionStatus(data.status);
      } catch (err) {
        console.error('Failed to fetch results:', err);
      }
    };
    fetchResults();
  }, [session, sessionCode]);

  // Handle vote
  const handleVote = async () => {
    if (selectedOption === null || !authSession) return;
    
    setVoting(true);
    setVoteError(null);

    try {
      await voteApi.cast(sessionCode, selectedOption);
      setHasVoted(true);
    } catch (err) {
      setVoteError((err as Error).message);
    } finally {
      setVoting(false);
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

  if (error || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-xl">{error || 'Session not found'}</p>
      </div>
    );
  }

  const options = (session.options as unknown as { index: number; name: string; ticker: string; imageUrl: string }[]) || [];
  const isVoting = sessionStatus === 'VOTING';
  const isFinalized = ['FINALIZED', 'LAUNCH_TX_READY', 'LAUNCHED'].includes(sessionStatus);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-purple-950/20">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-8 w-8 text-purple-500" />
            <span className="text-xl font-bold">StreamPump</span>
          </div>
          
          {authStatus === 'loading' ? (
            <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
          ) : authSession ? (
            <div className="flex items-center gap-2">
              <img
                src={authSession.user?.image || ''}
                alt=""
                className="h-8 w-8 rounded-full"
              />
              <span className="text-sm font-medium">{authSession.user?.name}</span>
            </div>
          ) : (
            <Button variant="gradient" onClick={handleSignIn}>
              Sign in with Twitch
            </Button>
          )}
        </div>
      </header>

      <main className="container max-w-2xl py-8">
        {/* Session Info */}
        <Card className="mb-8">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{session.title}</CardTitle>
            <CardDescription>
              Session Code: <code className="text-primary">{session.code}</code>
            </CardDescription>
          </CardHeader>
          
          {isVoting && (
            <CardContent>
              <div className="flex items-center justify-center gap-4 rounded-lg bg-blue-500/10 p-4">
                <Clock className="h-6 w-6 text-blue-500" />
                <span className="text-3xl font-bold tabular-nums">
                  {formatDuration(remainingSeconds)}
                </span>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Auth Required */}
        {!authSession && authStatus !== 'loading' && (
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="flex flex-col items-center py-8">
              <AlertCircle className="mb-4 h-12 w-12 text-yellow-500" />
              <h3 className="mb-2 text-lg font-semibold">Sign in Required</h3>
              <p className="mb-4 text-center text-muted-foreground">
                You need to sign in with Twitch to vote
              </p>
              <Button variant="gradient" onClick={handleSignIn}>
                Sign in with Twitch
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Already Voted */}
        {hasVoted && (
          <Card className="mb-8 border-green-500/50 bg-green-500/5">
            <CardContent className="flex items-center justify-center gap-4 py-6">
              <Check className="h-8 w-8 text-green-500" />
              <span className="text-lg font-semibold text-green-500">
                Your vote has been recorded!
              </span>
            </CardContent>
          </Card>
        )}

        {/* Session Not Active */}
        {!isVoting && !isFinalized && sessionStatus === 'DRAFT' && (
          <Card className="mb-8">
            <CardContent className="flex flex-col items-center py-8">
              <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Voting hasn&apos;t started yet</h3>
              <p className="text-muted-foreground">Check back soon!</p>
            </CardContent>
          </Card>
        )}

        {/* Voting Options */}
        {(isVoting || isFinalized) && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">
              {isVoting ? 'Vote for your favorite:' : 'Results:'}
            </h2>

            {options.map((option, index) => {
              const result = voteResults.find(r => r.optionIndex === option.index);
              const isWinner = isFinalized && voteResults[0]?.optionIndex === option.index;

              return (
                <Card
                  key={option.index}
                  className={cn(
                    'cursor-pointer transition-all',
                    isVoting && !hasVoted && 'hover:border-purple-500/50',
                    selectedOption === option.index && 'border-purple-500 ring-2 ring-purple-500/50',
                    isWinner && 'border-yellow-500/50 bg-yellow-500/5'
                  )}
                  onClick={() => {
                    if (isVoting && !hasVoted && authSession) {
                      setSelectedOption(option.index);
                    }
                  }}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <img
                      src={option.imageUrl}
                      alt={option.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{option.name}</h3>
                        <Badge variant="outline">${option.ticker}</Badge>
                        {isWinner && <Trophy className="h-5 w-5 text-yellow-500" />}
                      </div>
                      {result && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-sm">
                            <span>{result.voteCount} votes</span>
                            <span>{result.percentage.toFixed(1)}%</span>
                          </div>
                          <Progress
                            value={result.percentage}
                            className="h-2"
                            indicatorClassName={isWinner ? 'bg-yellow-500' : ''}
                          />
                        </div>
                      )}
                    </div>
                    {isVoting && !hasVoted && authSession && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2">
                        {selectedOption === option.index && (
                          <div className="h-3 w-3 rounded-full bg-purple-500" />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Vote Button */}
        {isVoting && !hasVoted && authSession && (
          <div className="mt-8">
            {voteError && (
              <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive">
                {voteError}
              </div>
            )}
            <Button
              variant="gradient"
              size="xl"
              className="w-full"
              disabled={selectedOption === null || voting}
              onClick={handleVote}
            >
              {voting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Vote'
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
