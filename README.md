# Vistro-Lite - Translation SaaS

A production-grade translation API service with job queuing, translation memory caching, webhook delivery, and subscription management.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Get values from Supabase dashboard: Settings → API

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Build

```bash
npm run build
```

### Testing

```bash
npm run test          # Run tests in watch mode
npm run test:ci       # Run tests once
npm run test:coverage # Generate coverage report
```

### Code Quality

```bash
npm run lint          # Lint code
npm run lint:fix      # Fix linting issues
npm run type-check    # TypeScript type checking
npm run format        # Format code
npm run format:check  # Check code formatting
```

## Database Migrations

The project includes Supabase migrations in `supabase/migrations/`:

1. `20260101171532_create_vistro_lite_schema.sql` - Core schema
2. `20260101172248_fix_rls_policies_strict.sql` - Security policies
3. `20260101172428_optimize_translation_memory_indexes.sql` - Performance indexes
4. `20260101172547_enhance_billing_webhook_safety.sql` - Billing safety
5. `20260101172958_validate_job_queue_invariants.sql` - Queue validation

These migrations are automatically applied to your Supabase instance.

## CI/CD

### GitHub Actions

The project includes two workflows:

1. **CI Pipeline** (`.github/workflows/ci.yml`)
   - Runs on push and pull requests to `main`
   - Executes linting, type checking, tests, and builds

2. **Worker Cron** (`.github/workflows/cron-worker.yml`)
   - Runs every 15 minutes
   - Triggers translation worker endpoint
   - Requires `WORKER_ENDPOINT_URL` and `WORKER_RUN_SECRET` secrets

### GitHub Secrets

Configure these in your repository settings:

- `WORKER_ENDPOINT_URL` - Your worker API endpoint
- `WORKER_RUN_SECRET` - Authentication token for worker

## Project Structure

```
vistro-lite/
├── src/                    # Application source code
├── supabase/
│   └── migrations/        # Database migrations
├── .github/
│   └── workflows/         # CI/CD workflows
├── index.html             # Entry HTML file
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Test configuration
└── package.json           # Dependencies and scripts
```

## Deployment

### Vercel

#### Step 1: Push Code to GitHub

```bash
git push origin main
```

#### Step 2: Get Your Supabase Keys

**Required Keys:**

1. **VITE_SUPABASE_URL** - Your Supabase project URL
   - Go to: [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project
   - Click **Settings** → **API**
   - Copy **Project URL** (looks like: `https://xxxxx.supabase.co`)

2. **VITE_SUPABASE_ANON_KEY** - Your anonymous public key
   - Same location: **Settings** → **API**
   - Copy **anon public** key (long string starting with `eyJh...`)
   - ⚠️ This is public (safe to expose in client code)
   - ❌ Do NOT use the `service_role secret` key

**Visual Guide:**
```
Supabase Dashboard
└── [Your Project]
    └── Settings
        └── API
            ├── Project URL ← Copy this (VITE_SUPABASE_URL)
            ├── Project API keys
            │   ├── anon public ← Copy this (VITE_SUPABASE_ANON_KEY)
            │   └── service_role secret (DO NOT USE)
            └── JWT Secret
```

#### Step 3: Add Keys to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Search for and select your `vistro-lite` repository
4. Click **Import**
5. Look for **Environment Variables** section

**Add these two variables:**

| Variable Name | Value | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase Settings → API → anon public |

**How to add:**
1. Click **Environment Variables** section
2. Enter variable name in first field
3. Enter value in second field
4. Click **Add**
5. Repeat for second variable
6. Scroll down and click **Deploy**

#### Step 4: Verify Deployment

After deployment completes:

1. Visit your Vercel URL (e.g., `https://vistro-lite.vercel.app`)
2. Open Browser DevTools (F12)
3. Check **Console** tab for errors
4. Verify queue monitoring dashboard loads
5. Confirm no 401/403 authentication errors

**If you see errors:**
- Double-check keys are correct (no spaces, exactly as copied)
- Verify keys are from correct Supabase project
- Clear Vercel cache: **Settings** → **Git** → **Clear all Deployments**

#### Optional: GitHub Secrets (For CI/CD Health Checks)

These are **required** if you want automated health checks every 15 minutes:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the same keys:

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same as `VITE_SUPABASE_ANON_KEY` |

Without these, the health check workflow will skip silently.

### Other Platforms

Build the project and deploy the `dist` folder:

```bash
npm run build
```

Configure these environment variables on your platform:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## License

Private - All rights reserved
