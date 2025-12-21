'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { sessionsApi, imageApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Rocket, ArrowLeft, Plus, X, Upload, Image as ImageIcon } from 'lucide-react';

interface VotingOption {
  name: string;
  ticker: string;
  imageId: string;
  imageUrl: string;
}

interface FeeSplit {
  walletPubkey: string;
  bps: number;
  role: 'STREAMER' | 'MOD';
}

export default function NewSessionPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { publicKey } = useWallet();

  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [options, setOptions] = useState<VotingOption[]>([
    { name: '', ticker: '', imageId: '', imageUrl: '' },
    { name: '', ticker: '', imageId: '', imageUrl: '' },
  ]);
  const [feeSplits, setFeeSplits] = useState<FeeSplit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, { name: '', ticker: '', imageId: '', imageUrl: '' }]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (
    index: number,
    field: keyof VotingOption,
    value: string
  ) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setOptions(newOptions);
  };

  const handleImageUpload = async (index: number, file: File) => {
    try {
      const response = await imageApi.upload(file);
      const newOptions = [...options];
      newOptions[index] = {
        ...newOptions[index],
        imageId: response.data.id,
        imageUrl: response.data.url,
      };
      setOptions(newOptions);
    } catch (err) {
      setError('Failed to upload image');
    }
  };

  const handleAddModSplit = () => {
    setFeeSplits([...feeSplits, { walletPubkey: '', bps: 100, role: 'MOD' }]);
  };

  const handleRemoveModSplit = (index: number) => {
    setFeeSplits(feeSplits.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate options
      for (const opt of options) {
        if (!opt.name || !opt.ticker || !opt.imageId) {
          throw new Error('All options must have a name, ticker, and image');
        }
        if (!/^[A-Z0-9]{2,10}$/.test(opt.ticker.toUpperCase())) {
          throw new Error('Ticker must be 2-10 uppercase letters/numbers');
        }
      }

      // Build fee splits
      const allFeeSplits: FeeSplit[] = [];
      
      if (publicKey) {
        allFeeSplits.push({
          walletPubkey: publicKey.toBase58(),
          bps: 500, // 5% for streamer
          role: 'STREAMER',
        });
      }

      for (const split of feeSplits) {
        if (split.walletPubkey) {
          allFeeSplits.push(split);
        }
      }

      const response = await sessionsApi.create({
        title,
        durationSeconds: durationMinutes * 60,
        options: options.map((opt) => ({
          name: opt.name,
          ticker: opt.ticker.toUpperCase(),
          imageId: opt.imageId,
        })),
        feeSplits: allFeeSplits,
      });

      router.push(`/dashboard/sessions/${(response.data as { id: string }).id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-purple-500" />
            <span className="text-xl font-bold">Create New Session</span>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container max-w-3xl py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Session Details</CardTitle>
              <CardDescription>
                Set the title and duration for your voting session
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Session Title</Label>
                <Input
                  id="title"
                  placeholder="Pick the next meme coin!"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Voting Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={60}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 5)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Voting Options */}
          <Card>
            <CardHeader>
              <CardTitle>Voting Options</CardTitle>
              <CardDescription>
                Create 2-10 options for your viewers to vote on
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {options.map((option, index) => (
                <div
                  key={index}
                  className="flex gap-4 rounded-lg border p-4"
                >
                  <div className="flex-1 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Token Name</Label>
                        <Input
                          placeholder="DogeCoin Moon"
                          value={option.name}
                          onChange={(e) =>
                            handleOptionChange(index, 'name', e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ticker</Label>
                        <Input
                          placeholder="DOGE"
                          value={option.ticker}
                          onChange={(e) =>
                            handleOptionChange(
                              index,
                              'ticker',
                              e.target.value.toUpperCase()
                            )
                          }
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Image</Label>
                      <div className="flex items-center gap-4">
                        {option.imageUrl ? (
                          <img
                            src={option.imageUrl}
                            alt={option.name}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(index, file);
                            }}
                          />
                          <Button type="button" variant="outline" size="sm">
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </Button>
                        </label>
                      </div>
                    </div>
                  </div>
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveOption(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddOption}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Option
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Wallet & Fee Splits */}
          <Card>
            <CardHeader>
              <CardTitle>Wallet & Fees</CardTitle>
              <CardDescription>
                Connect your wallet and configure fee splits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Streamer Wallet</Label>
                <div className="flex items-center gap-4">
                  <WalletMultiButton />
                  {publicKey && (
                    <span className="text-sm text-muted-foreground">
                      5% fee on launch
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mod Wallets (Optional)</Label>
                {feeSplits.map((split, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Wallet address"
                      value={split.walletPubkey}
                      onChange={(e) => {
                        const newSplits = [...feeSplits];
                        newSplits[index].walletPubkey = e.target.value;
                        setFeeSplits(newSplits);
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="BPS"
                      value={split.bps}
                      onChange={(e) => {
                        const newSplits = [...feeSplits];
                        newSplits[index].bps = parseInt(e.target.value) || 0;
                        setFeeSplits(newSplits);
                      }}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveModSplit(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddModSplit}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Mod Wallet
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <Link href="/dashboard">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="gradient"
              disabled={loading || !publicKey}
            >
              {loading ? 'Creating...' : 'Create Session'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
