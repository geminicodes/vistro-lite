# vistro-lite

Server-side utilities for translating site content with DeepL, Supabase, and Vercel-friendly APIs.

## Getting Started

```bash
npm install
npm run lint
npm run test
```

Use Node.js 20+ for parity with the CI pipelines and worker scripts.

## Environment Variables

| Name | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (required on server and worker). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key; **server-only** and required for API + worker. |
| `DEEPL_API_KEY` | DeepL API token (skip when `MOCK_DEEPL=true`). |
| `DEEPL_BASE_URL` | Optional custom DeepL endpoint. Defaults to `https://api-free.deepl.com/v2/translate`. |
| `DEEPL_TIMEOUT_MS` | Per-request timeout in ms (default `10000`). |
| `DEEPL_MAX_RETRIES` | Max API retries (default `3`). |
| `MOCK_DEEPL` | Set to `true` to return deterministic pseudo-translations. |
| `TRANSLATE_MAX_PAGES_PER_MINUTE` | Simple rate limiter for `/api/translate` (default `10`). |
| `TOKEN_ENC_KEY` | Base64-encoded 32-byte key for AES-256-GCM (generate with `openssl rand -base64 32`). |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Shared secret for webhook signature verification. |
| `WORKER_TRANSLATE_RETRIES` | Worker retry count per DeepL batch (default `3`). |
| `WORKER_TRANSLATE_MIN_MS` | Initial worker retry delay in ms (default `500`). |
| `WORKER_TRANSLATE_MAX_MS` | Max worker retry delay in ms (default `5000`). |

Store secrets with your hosting provider (Vercel / Fly / GitHub Actions) and never expose the service role key or webhook secret to the browser.

## Supabase Schema & Seeding

1. Link your project with the Supabase CLI (`supabase link --project-ref ...`).
2. Apply the schema (`supabase db push --linked` or `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`).
3. Load the demo data (`supabase db reset --linked` or `psql "$SUPABASE_DB_URL" -f supabase/seed.sql`).

Review the RLS policies in `supabase/schema.sql` when adding new tables—service-role writes happen in server actions and workers.

## Deployment (Vercel)

1. Create a Vercel project pointing at this repository.
2. Configure the environment variables listed above (Production/Preview).
3. Use the Supabase CLI or dashboard to run migrations before your first deploy.
4. Redeploy after setting secrets so the API routes can initialize the Supabase client.

### Background Worker Options

- **Fly.io / Render / dedicated worker**: run `node workers/translationWorker.js --run-once` on a cron-like scheduler.
- **GitHub Actions**: copy or enable `.github/workflows/cron-worker.yml`, set repository secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPL_API_KEY`, `DEEPL_BASE_URL`, `TOKEN_ENC_KEY`), and schedule it as needed.

The worker script processes pending `translation_jobs` and writes results to `translation_segments` and `translation_memory`.

## Continuous Integration

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request:

1. `npm install`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

A sample scheduled workflow (`cron-worker.yml`) demonstrates running the translation worker hourly with GitHub Actions secrets.
