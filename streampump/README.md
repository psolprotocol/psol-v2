# StreamPump 🚀

A production-grade full-stack application for launching community-driven tokens on Solana. Streamers can create voting sessions, viewers vote on token options, and winning tokens are launched via Bags.fm API.

## Architecture

```
streampump/
├── apps/
│   ├── web/          # Next.js 14+ frontend (App Router)
│   └── api/          # Fastify + Socket.IO backend
├── packages/
│   └── shared/       # Shared types, schemas, utilities
├── docker-compose.yml # Postgres + Redis
└── README.md
```

### Tech Stack

**Frontend (apps/web)**
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS + shadcn/ui components
- NextAuth.js (Twitch OAuth)
- @solana/wallet-adapter-react (Phantom, Solflare, Backpack)
- Socket.IO client for real-time updates

**Backend (apps/api)**
- Fastify with TypeScript
- Prisma ORM + PostgreSQL
- Redis for caching & rate limiting
- Socket.IO for WebSocket events
- Pino for structured logging
- Zod for validation

**Blockchain**
- Solana @solana/web3.js
- Bags.fm API for token launches

## Local Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose

### 1. Clone and Install Dependencies

```bash
cd streampump
pnpm install
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### 3. Configure Environment

```bash
# Copy env files
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edit `.env` and `apps/web/.env.local` with your credentials:

**Required for full functionality:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` - Create at https://dev.twitch.tv/console
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `BAGS_API_KEY` - Get from https://bags.fm/developers (required for token launches)
- `SOLANA_RPC_URL` - Helius, QuickNode, or other RPC provider

### 4. Initialize Database

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed demo data (optional)
pnpm db:seed
```

### 5. Start Development Servers

```bash
pnpm dev
```

This starts:
- Web app at http://localhost:3000
- API server at http://localhost:3001
- WebSocket at ws://localhost:3001/sessions

## Application Routes

### Web (Next.js)

| Route | Description |
|-------|-------------|
| `/` | Marketing page + Twitch login |
| `/dashboard` | Streamer home, list sessions |
| `/dashboard/sessions/new` | Create new session |
| `/dashboard/sessions/[id]` | Control room (manage session) |
| `/vote/[sessionCode]` | Viewer voting page |
| `/trade/[sessionCode]` | Viewer buy page (after launch) |
| `/overlay/[sessionCode]` | OBS overlay (add as browser source) |

### API (Fastify)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/sessions` | POST | Create session |
| `/v1/sessions` | GET | List user's sessions |
| `/v1/sessions/:id` | GET | Get session details |
| `/v1/sessions/:id/start` | POST | Start voting |
| `/v1/sessions/:id/stop` | POST | Stop voting |
| `/v1/sessions/:id/finalize` | POST | Finalize (with optional veto) |
| `/v1/sessions/:id/bags/launch-tx` | POST | Generate launch transaction |
| `/v1/sessions/:id/broadcast` | POST | Broadcast signed launch tx |
| `/v1/vote/:sessionCode` | POST | Cast vote |
| `/v1/vote/:sessionCode/results` | GET | Get vote results |
| `/v1/trade/:sessionCode/quote` | POST | Get trade quote |
| `/v1/trade/:sessionCode/swap-tx` | POST | Create swap transaction |
| `/v1/trade/:sessionCode/broadcast` | POST | Broadcast signed swap tx |

### WebSocket Events

Namespace: `/sessions`

| Event | Direction | Description |
|-------|-----------|-------------|
| `join:session` | Client → Server | Join session room |
| `leave:session` | Client → Server | Leave session room |
| `session:update` | Server → Client | Session status changed |
| `vote:update` | Server → Client | Vote counts updated |
| `countdown:tick` | Server → Client | Countdown timer tick |
| `tx:update` | Server → Client | Transaction status update |

## Happy Path Manual Test

1. **Start the app**
   ```bash
   docker-compose up -d
   pnpm db:push
   pnpm dev
   ```

2. **Sign in as streamer**
   - Go to http://localhost:3000
   - Click "Sign in with Twitch"
   - Complete OAuth flow

3. **Create a session**
   - Go to Dashboard → New Session
   - Enter title: "Pick Our Token!"
   - Add 2-3 voting options with names, tickers, images
   - Connect Solana wallet (Phantom/Solflare)
   - Click "Create Session"

4. **Start voting**
   - In the control room, click "Start Voting"
   - Copy the voting URL and share it
   - Open the overlay URL in OBS as browser source

5. **Vote (as viewer)**
   - Open voting URL in incognito window
   - Sign in with different Twitch account
   - Select an option and submit vote
   - Verify vote appears in control room

6. **Stop voting and finalize**
   - Click "Stop Voting" in control room
   - Review winner, optionally veto
   - Click "Generate & Sign Launch TX"
   - Sign transaction in wallet popup

7. **Verify launch**
   - Transaction broadcasts and confirms
   - Session status changes to LAUNCHED
   - Viewers can now buy tokens on trade page

## Content Safety

- **Tickers**: Uppercase A-Z0-9, 2-10 characters
- **Names**: 2-32 characters, filtered for banned words
- **Images**: Only from curated gallery (uploaded by streamer)
- **Votes**: One per Twitch user per session

## Security Features

- Rate limiting on all public endpoints
- Bags API key is server-only (never sent to client)
- Idempotency keys for transaction endpoints
- Audit logging for all state transitions
- CORS configured for specific origins
- JWT-based overlay tokens

## Fee Configuration

Fee splits are transparent and configurable:
- **Streamer**: Primary fee recipient (configurable BPS)
- **Mods**: Optional additional recipients
- **Platform**: Optional platform fee (via env var)

## Missing Environment Variables

The app handles missing configuration gracefully:

- **Without BAGS_API_KEY**: Token launches fail with clear error message
- **Without TWITCH_CLIENT_ID**: Auth redirects fail with error
- **Without NEXTAUTH_SECRET**: JWT signing fails with error

All errors are surfaced in the UI and logs.

## Running Tests

```bash
cd apps/api
pnpm test
```

Tests cover:
- Vote uniqueness enforcement
- Session state transitions
- Bags API response validation

## Scripts

```bash
pnpm dev          # Start all services in development
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm test         # Run tests
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to database
pnpm db:migrate   # Run migrations
pnpm db:seed      # Seed demo data
```

## Environment Variables Reference

See `.env.example` for complete list with descriptions.

## Troubleshooting

### Database connection failed
```bash
# Check if Docker containers are running
docker-compose ps

# Restart containers
docker-compose down && docker-compose up -d
```

### Twitch login not working
- Verify TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are set
- Check callback URL is configured in Twitch developer console
- Ensure NEXTAUTH_URL matches your frontend URL

### Wallet not connecting
- Check browser console for errors
- Try different wallet (Phantom, Solflare, Backpack)
- Verify you're on the correct Solana network

### Token launch failing
- Verify BAGS_API_KEY is set and valid
- Check API logs for detailed error messages
- Ensure wallet has enough SOL for transaction fees

## License

MIT
