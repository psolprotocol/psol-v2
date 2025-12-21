'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Rocket, Vote, Wallet, Users, Zap, Shield } from 'lucide-react';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleSignIn = () => {
    signIn('twitch');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-purple-950/20">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-8 w-8 text-purple-500" />
            <span className="text-2xl font-bold bg-pump-gradient bg-clip-text text-transparent">
              StreamPump
            </span>
          </div>

          <div className="flex items-center gap-4">
            {status === 'loading' ? (
              <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
            ) : session ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user?.image || ''} />
                    <AvatarFallback>
                      {session.user?.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">
                    {session.user?.name}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  Sign Out
                </Button>
                <Button variant="gradient" onClick={handleGoToDashboard}>
                  Dashboard
                </Button>
              </div>
            ) : (
              <Button variant="gradient" onClick={handleSignIn}>
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
                Sign in with Twitch
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container flex min-h-screen flex-col items-center justify-center pt-16 text-center">
        <div className="animate-pulse-glow mb-8 rounded-full bg-purple-500/20 p-4">
          <Rocket className="h-16 w-16 text-purple-500" />
        </div>
        
        <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-7xl">
          Launch Tokens with{' '}
          <span className="bg-pump-gradient bg-clip-text text-transparent">
            Your Community
          </span>
        </h1>
        
        <p className="mb-8 max-w-2xl text-xl text-muted-foreground">
          Let your viewers vote on the next meme coin. Create engaging live sessions, 
          run polls, and launch tokens on Solana with one click.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          {session ? (
            <Button size="xl" variant="gradient" onClick={handleGoToDashboard}>
              Go to Dashboard
            </Button>
          ) : (
            <Button size="xl" variant="gradient" onClick={handleSignIn}>
              <svg className="mr-2 h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
              </svg>
              Get Started with Twitch
            </Button>
          )}
          <Button size="xl" variant="outline">
            Learn More
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-24">
        <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
        
        <div className="grid gap-8 md:grid-cols-3">
          <Card className="border-purple-500/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/20">
                <Vote className="h-6 w-6 text-purple-500" />
              </div>
              <CardTitle>Create & Vote</CardTitle>
              <CardDescription>
                Set up voting options with names, tickers, and images. 
                Your viewers vote in real-time through Twitch auth.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-pink-500/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-pink-500/20">
                <Wallet className="h-6 w-6 text-pink-500" />
              </div>
              <CardTitle>Sign & Launch</CardTitle>
              <CardDescription>
                Connect your Solana wallet, sign the transaction, 
                and launch the winning token on Bags.fm.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-cyan-500/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/20">
                <Users className="h-6 w-6 text-cyan-500" />
              </div>
              <CardTitle>Community Buys</CardTitle>
              <CardDescription>
                Viewers can buy the launched token with preset SOL amounts. 
                Everyone wins together.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Trust Section */}
      <section className="container pb-24">
        <div className="grid gap-8 md:grid-cols-2">
          <Card className="border-green-500/20 bg-card/50">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/20">
                <Shield className="h-6 w-6 text-green-500" />
              </div>
              <CardTitle>Content Safety</CardTitle>
              <CardDescription>
                All voting options are curated by the streamer. 
                Built-in filters prevent inappropriate content.
                Tickers are validated (uppercase A-Z0-9, 2-10 chars).
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-yellow-500/20 bg-card/50">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/20">
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
              <CardTitle>Transparent Fees</CardTitle>
              <CardDescription>
                Configure fee splits for streamer, mods, and platform.
                All fees are visible and on-chain.
                You control who gets what.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-purple-500" />
            <span className="font-bold">StreamPump</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Powered by Solana &amp; Bags.fm
          </p>
        </div>
      </footer>
    </div>
  );
}
