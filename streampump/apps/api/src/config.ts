import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Bags API
  BAGS_API_KEY: z.string().optional(),
  BAGS_API_URL: z.string().default('https://api.bags.fm'),

  // Solana
  SOLANA_RPC_URL: z.string().default('https://api.mainnet-beta.solana.com'),
  SOLANA_NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('mainnet-beta'),

  // Twitch OAuth (validated by web app, but we need to verify tokens)
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),

  // API Configuration
  API_PORT: z.coerce.number().default(3001),
  API_URL: z.string().default('http://localhost:3001'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Session/Auth
  OVERLAY_TOKEN_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Optional: Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENABLED: z.coerce.boolean().default(false),

  // Optional: Platform fee
  PLATFORM_WALLET_PUBKEY: z.string().optional(),
  PLATFORM_FEE_BPS: z.coerce.number().default(0),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment configuration errors:');
    console.error(result.error.format());
    
    // In production, fail fast
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    
    // In development, continue with defaults but warn
    console.warn('⚠️ Using default values for missing environment variables');
    return envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://streampump:streampump@localhost:5432/streampump',
    });
  }

  return result.data;
}

export const config = loadConfig();

// Validation functions for runtime checks
export function requireBagsApiKey(): string {
  if (!config.BAGS_API_KEY) {
    throw new Error(
      'BAGS_API_KEY is required for this operation. ' +
      'Please set BAGS_API_KEY in your .env file. ' +
      'Get your API key from https://bags.fm/developers'
    );
  }
  return config.BAGS_API_KEY;
}

export function requireTwitchConfig(): { clientId: string; clientSecret: string } {
  if (!config.TWITCH_CLIENT_ID || !config.TWITCH_CLIENT_SECRET) {
    throw new Error(
      'Twitch OAuth configuration is required. ' +
      'Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your .env file. ' +
      'Create an app at https://dev.twitch.tv/console'
    );
  }
  return {
    clientId: config.TWITCH_CLIENT_ID,
    clientSecret: config.TWITCH_CLIENT_SECRET,
  };
}

export function requireOverlayTokenSecret(): string {
  if (!config.OVERLAY_TOKEN_SECRET) {
    throw new Error(
      'OVERLAY_TOKEN_SECRET is required for generating overlay tokens. ' +
      'Generate one with: openssl rand -base64 32'
    );
  }
  return config.OVERLAY_TOKEN_SECRET;
}

// Log config status on startup
export function logConfigStatus(): void {
  console.log('📋 Configuration Status:');
  console.log(`  Database: ${config.DATABASE_URL ? '✅ Configured' : '❌ Missing'}`);
  console.log(`  Redis: ${config.REDIS_URL ? '✅ Configured' : '❌ Missing'}`);
  console.log(`  Bags API Key: ${config.BAGS_API_KEY ? '✅ Configured' : '⚠️ Missing (token launches will fail)'}`);
  console.log(`  Solana RPC: ${config.SOLANA_RPC_URL}`);
  console.log(`  Solana Network: ${config.SOLANA_NETWORK}`);
  console.log(`  Twitch OAuth: ${config.TWITCH_CLIENT_ID ? '✅ Configured' : '⚠️ Missing (auth will fail)'}`);
  console.log(`  Overlay Token Secret: ${config.OVERLAY_TOKEN_SECRET ? '✅ Configured' : '⚠️ Missing'}`);
  console.log(`  Environment: ${config.NODE_ENV}`);
  
  if (config.PLATFORM_WALLET_PUBKEY) {
    console.log(`  Platform Fee: ${config.PLATFORM_FEE_BPS} bps to ${config.PLATFORM_WALLET_PUBKEY}`);
  }
}
