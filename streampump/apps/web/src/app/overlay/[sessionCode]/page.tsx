'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { voteApi } from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Trophy, Clock, Rocket } from 'lucide-react';

interface VoteResult {
  optionIndex: number;
  name: string;
  ticker: string;
  imageUrl: string;
  voteCount: number;
  percentage: number;
}

export default function OverlayPage() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [sessionStatus, setSessionStatus] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection
  useSocket({
    sessionCode,
    autoConnect: true,
    onSessionUpdate: (event) => {
      setSessionStatus(event.status);
    },
    onVoteUpdate: (event) => {
      setVoteResults(event.results);
      setTotalVotes(event.totalVotes);
    },
    onCountdownTick: (event) => {
      setRemainingSeconds(event.remainingSeconds);
    },
  });

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await voteApi.getResults(sessionCode);
        const data = response.data as {
          status: string;
          results: VoteResult[];
          totalVotes: number;
          durationSeconds: number;
          startedAt: string | null;
        };
        setSessionStatus(data.status);
        setVoteResults(data.results);
        setTotalVotes(data.totalVotes);

        // Calculate remaining time
        if (data.startedAt && data.status === 'VOTING') {
          const startTime = new Date(data.startedAt).getTime();
          const endTime = startTime + data.durationSeconds * 1000;
          const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
          setRemainingSeconds(remaining);
        }
      } catch (err) {
        setError('Failed to load session');
      }
    };

    fetchData();
    // Poll every 5 seconds as fallback
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [sessionCode]);

  // Get top 3 results
  const topResults = voteResults.slice(0, 3);

  // Background colors for positions
  const positionColors = [
    'from-yellow-500/20 to-yellow-600/10 border-yellow-500/50',
    'from-gray-400/20 to-gray-500/10 border-gray-400/50',
    'from-amber-700/20 to-amber-800/10 border-amber-700/50',
  ];

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent text-white">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-transparent p-4 font-sans text-white">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-purple-400" />
            <span className="text-lg font-bold text-purple-400">StreamPump</span>
          </div>

          {sessionStatus === 'VOTING' && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/20 px-4 py-2">
              <Clock className="h-5 w-5 text-blue-400" />
              <span className="text-2xl font-bold tabular-nums text-blue-400">
                {formatDuration(remainingSeconds)}
              </span>
            </div>
          )}

          {sessionStatus === 'LAUNCHED' && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/20 px-4 py-2">
              <span className="text-lg font-bold text-green-400">LAUNCHED!</span>
            </div>
          )}

          {sessionStatus === 'FINALIZED' && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-500/20 px-4 py-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="text-lg font-bold text-yellow-400">WINNER</span>
            </div>
          )}
        </div>

        {/* Vote Results */}
        <div className="flex-1 space-y-3">
          {topResults.map((result, index) => (
            <div
              key={result.optionIndex}
              className={cn(
                'relative overflow-hidden rounded-xl border bg-gradient-to-r p-4',
                positionColors[index],
                index === 0 && sessionStatus !== 'VOTING' && 'ring-2 ring-yellow-500/50'
              )}
            >
              <div className="relative z-10 flex items-center gap-4">
                {/* Position Badge */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold',
                    index === 0 && 'bg-yellow-500 text-black',
                    index === 1 && 'bg-gray-400 text-black',
                    index === 2 && 'bg-amber-700 text-white'
                  )}
                >
                  {index + 1}
                </div>

                {/* Token Image */}
                {result.imageUrl && (
                  <img
                    src={result.imageUrl}
                    alt={result.name}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                )}

                {/* Token Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{result.name}</span>
                    <span className="text-sm text-gray-400">${result.ticker}</span>
                    {index === 0 && sessionStatus !== 'VOTING' && (
                      <Trophy className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="mt-1">
                    <Progress
                      value={result.percentage}
                      className="h-3 bg-black/30"
                      indicatorClassName={cn(
                        index === 0 && 'bg-yellow-500',
                        index === 1 && 'bg-gray-400',
                        index === 2 && 'bg-amber-700'
                      )}
                    />
                  </div>
                </div>

                {/* Vote Count */}
                <div className="text-right">
                  <div className="text-2xl font-bold">{result.voteCount}</div>
                  <div className="text-sm text-gray-400">
                    {result.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>{totalVotes} total votes</span>
          <span>streampump.dev</span>
        </div>
      </div>
    </div>
  );
}
