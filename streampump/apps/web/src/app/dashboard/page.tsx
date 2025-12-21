'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sessionsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Rocket, Clock, CheckCircle, XCircle, Play, Settings } from 'lucide-react';

interface Session {
  id: string;
  code: string;
  title: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  mintAddress: string | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'secondary',
  VOTING: 'info',
  FINALIZED: 'warning',
  LAUNCH_TX_READY: 'warning',
  LAUNCHED: 'success',
  FAILED: 'destructive',
};

const statusIcons: Record<string, React.ReactNode> = {
  DRAFT: <Settings className="h-4 w-4" />,
  VOTING: <Play className="h-4 w-4" />,
  FINALIZED: <Clock className="h-4 w-4" />,
  LAUNCH_TX_READY: <Rocket className="h-4 w-4" />,
  LAUNCHED: <CheckCircle className="h-4 w-4" />,
  FAILED: <XCircle className="h-4 w-4" />,
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await sessionsApi.list();
        setSessions(response.data as Session[]);
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchSessions();
    }
  }, [session]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Rocket className="h-8 w-8 text-purple-500" />
            <span className="text-2xl font-bold bg-pump-gradient bg-clip-text text-transparent">
              StreamPump
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src={session?.user?.image || ''} />
              <AvatarFallback>
                {session?.user?.name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{session?.user?.name}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Your Sessions</h1>
            <p className="text-muted-foreground">
              Create and manage your token launch sessions
            </p>
          </div>
          <Link href="/dashboard/sessions/new">
            <Button variant="gradient">
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </Link>
        </div>

        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Rocket className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No sessions yet</h3>
              <p className="mb-4 text-center text-muted-foreground">
                Create your first session to start engaging with your community
              </p>
              <Link href="/dashboard/sessions/new">
                <Button variant="gradient">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Session
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
                <Card className="cursor-pointer transition-all hover:border-purple-500/50 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="line-clamp-1">{s.title}</CardTitle>
                        <CardDescription className="mt-1">
                          Code: <code className="text-primary">{s.code}</code>
                        </CardDescription>
                      </div>
                      <Badge variant={statusColors[s.status] as 'default'}>
                        {statusIcons[s.status]}
                        <span className="ml-1">{s.status}</span>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>
                        Created{' '}
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                      {s.mintAddress && (
                        <span className="text-green-500">Token Launched</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
