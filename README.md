# Vistro-Lite

Production-ready translation service for web content. Deploys on Vercel with Supabase for storage and DeepL for translation.

## Architecture Overview

Vistro-Lite uses a serverless job queue architecture:

1. **API Ingest** (`/api/translate`) - Receives HTML, segments it, creates job records
2. **Job Queue** - Supabase tables store pending translation jobs and segments
3. **Worker Trigger** (`/api/worker/run`) - Serverless function processes queued jobs
4. **Translation Memory** - Caches translations per site to reduce API costs

```
Client → /api/translate → Supabase (job queue)
                              ↓
                        /api/worker/run → DeepL API
                              ↓
                        Supabase (completed jobs)
```

## Translation Flow

### Step 1: Client Submits Request

```bash
POST /api/translate
Authorization: Bearer <SUPABASE_TOKEN>
Content-Type: application/json

{
  "siteId": "uuid-of-site",
  "url": "https://example.com/page.html",
  "targetLocales": ["de", "fr", "es"]
}
```

### Step 2: API Validates & Segments

- Authenticates user via Supabase token
- Fetches HTML (if URL provided) with SSRF protection
- Segments HTML into translatable units
- Creates `translation_jobs` and `translation_segments` records
- Returns `202 Accepted` with `jobId`

### Step 3: Worker Processes Jobs

Worker runs via GitHub Actions cron or manual POST:

```bash
POST /api/worker/run
x-worker-secret: <WORKER_RUN_SECRET>
```

For each queued job:
1. Fetch job and segments from database
2. Check translation memory for cache hits
3. Translate cache misses via DeepL API with exponential backoff
4. Upsert new translations to memory
5. Update segments with translations
6. Mark job as `completed`

### Step 4: Client Polls Status

```bash
GET /api/translate/<jobId>
Authorization: Bearer <SUPABASE_TOKEN>
```

Returns progress metrics. When `status: "completed"`, includes reconstructed HTML.

## Environment Variables

### Required

Must be set in Vercel project settings or `.env.local`:

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | `eyJhbGc...` |
| `SUPABASE_ANON_KEY` | Anonymous/public key for client auth | `eyJhbGc...` |
| `DEEPL_API_KEY` | DeepL API key for translations | `abc123...` |
| `WORKER_RUN_SECRET` | Secret for authenticating worker endpoint | Random 32+ char string |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Secret for LemonSqueezy webhook verification | From LemonSqueezy dashboard |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `TOKEN_ENC_KEY` | Key for encrypting sensitive tokens | None (encryption disabled) |
| `WORKER_BATCH` | Max jobs to process per worker run | `10` |
| `FETCH_TIMEOUT_MS` | Timeout for fetching HTML from URLs | `5000` |
| `LOG_LEVEL` | Minimum log level (`debug`, `info`, `warn`, `error`) | `info` |

## Running the Worker

### Option 1: GitHub Actions (Recommended)

Add this workflow at `.github/workflows/worker.yml`:

```yaml
name: Translation Worker
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
  workflow_dispatch:        # Allow manual trigger

jobs:
  run-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger worker endpoint
        run: |
          curl -X POST https://your-app.vercel.app/api/worker/run \
            -H "x-worker-secret: ${{ secrets.WORKER_RUN_SECRET }}" \
            -H "Content-Type: application/json"
```

Add `WORKER_RUN_SECRET` to repository secrets.

### Option 2: Manual POST

Trigger worker directly via HTTP:

```bash
curl -X POST https://your-app.vercel.app/api/worker/run \
  -H "x-worker-secret: YOUR_SECRET" \
  -H "Content-Type: application/json"
```

### Option 3: Vercel Cron (Enterprise)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/worker/run",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Note: Vercel Cron requires Enterprise plan and cannot send custom headers. Use GitHub Actions for secret authentication.

## Security

### SSRF Protection

- `/api/translate` blocks private/internal IP addresses
- Validates URLs before fetching
- Enforces 5-second fetch timeout

### Authentication

- All API routes require Supabase Bearer token
- Service role key used server-side only
- Job ownership validated via `sites` table join

### Secret Management

- Worker endpoint requires `x-worker-secret` header
- All secrets validated at startup (fail-fast)
- Never logged or exposed in responses

### Encryption

- Optional `TOKEN_ENC_KEY` for encrypting sensitive data
- Service role key never sent to client
- Segments sanitized in status responses

## Database Schema

Required Supabase tables:

```sql
-- Sites table (multi-tenancy)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translation jobs
CREATE TABLE translation_jobs (
  id TEXT PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  source_url TEXT,
  html_summary TEXT,
  target_locales TEXT[] NOT NULL,
  segment_count INT NOT NULL,
  estimated_tokens INT NOT NULL,
  status TEXT NOT NULL, -- pending, processing, completed, failed
  error TEXT, -- Changed from error_message to match code
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translation segments  
CREATE TABLE translation_segments (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES translation_jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL, -- text, attribute
  position INT NOT NULL,
  translations JSONB DEFAULT '{}'::jsonb, -- Stores all locales: {"fr": "Bonjour", "es": "Hola"}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translation memory (cache)
CREATE TABLE translation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL, -- Changed from target_text to match code
  target_locale TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, source_text, target_locale)
);

-- Orders table (for LemonSqueezy integration)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lemonsqueezy_id TEXT UNIQUE NOT NULL,
  user_email TEXT,
  status TEXT NOT NULL,
  total INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_jobs_status ON translation_jobs(status, created_at);
CREATE INDEX idx_segments_job ON translation_segments(job_id);
CREATE INDEX idx_memory_lookup ON translation_memory(site_id, source_text, target_locale);
CREATE INDEX idx_orders_lemonsqueezy ON orders(lemonsqueezy_id);
```

## Deployment Checklist

Before deploying to production:

1. Set all required environment variables in Vercel
2. Create Supabase project and run schema SQL
3. Generate `WORKER_RUN_SECRET` (use `openssl rand -base64 32`)
4. Add `WORKER_RUN_SECRET` to GitHub repository secrets
5. Deploy to Vercel and test `/api/translate` endpoint
6. Set up GitHub Actions workflow for worker
7. Verify worker runs successfully and processes jobs
8. Enable Supabase Row Level Security (RLS) policies

## Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Fill in required values

# Run dev server
npm run dev

# Trigger worker locally
curl -X POST http://localhost:3000/api/worker/run \
  -H "x-worker-secret: your-local-secret"
```

## Monitoring

Structured logs are emitted at key lifecycle points:

- Request received with `requestId`
- Job created with `jobId`
- Worker processing with metrics (`cacheHits`, `apiCalls`, `durationMs`)
- Job completed with final stats

Parse logs with Logflare, Datadog, or similar. Example query:

```
fields @timestamp, requestId, jobId, status, durationMs
| filter message == "Translation request metrics"
| stats avg(durationMs) by status
```

## License

MIT
