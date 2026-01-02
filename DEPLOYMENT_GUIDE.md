# Pre-Production Deployment Guide
**Vistro Lite - Translation SaaS**

This guide walks you through preparing your project for production deployment on a pre-production GitHub branch.

---

## Phase 1: Local Verification (5 minutes)

Before pushing to GitHub, verify everything works locally:

### 1.1 Clean Build
```bash
# Remove old build artifacts
rm -rf dist/

# Fresh install and build
npm install
npm run build
```

**Expected Output:** "✓ built in X.XXs" with no errors

### 1.2 Type Safety
```bash
npm run type-check
```

**Expected Output:** No errors or warnings

### 1.3 Code Quality
```bash
npm run lint
npm run format:check
```

**Expected Output:** All files pass linting and formatting

### 1.4 Manual Testing (Optional)
```bash
npm run dev
```

Visit `http://localhost:5173` to test:
- Dashboard loads without errors
- No 403/401 errors in console
- Auto-refresh works (check Network tab)

---

## Phase 2: GitHub Repository Setup (10 minutes)

### 2.1 Create New Branch from Current Code

If not already done, initialize git and create a pre-production branch:

```bash
# If git not initialized
git init

# Add all current changes
git add .

# Create initial commit
git commit -m "Initial commit: Vistro Lite with complete monitoring and security fixes"

# Create pre-production branch
git checkout -b pre-production
```

### 2.2 Verify Branch Content

```bash
git log --oneline -5
git status
```

**Expected:** Clean working directory, recent commit visible

### 2.3 Create GitHub Repository

If not already on GitHub:

1. Go to [github.com/new](https://github.com/new)
2. Enter: `vistro-lite` as repository name
3. Select: **Private** (unless public by design)
4. DO NOT initialize with README (you already have one)
5. Click **Create repository**

### 2.4 Push Pre-Production Branch

```bash
# Add GitHub as origin
git remote add origin https://github.com/YOUR_USERNAME/vistro-lite.git

# Push pre-production branch
git branch -M main
git push -u origin main

# Alternative: if you want to keep 'pre-production' as the branch name
git push -u origin pre-production
```

---

## Phase 3: GitHub Secrets Configuration (10 minutes)

These secrets are required for CI/CD and monitoring to work.

### 3.1 Navigate to Secrets

1. Go to your GitHub repository
2. Click **Settings** (top right)
3. Scroll left sidebar → **Secrets and variables** → **Actions**

### 3.2 Add Required Secrets

#### Critical (Required for Monitoring)

Click **New repository secret** for each:

**Secret 1: SUPABASE_URL**
```
Name:  SUPABASE_URL
Value: https://your-project.supabase.co
```
Find this in: Supabase Dashboard → Settings → API → Project URL

**Secret 2: SUPABASE_ANON_KEY**
```
Name:  SUPABASE_ANON_KEY
Value: eyJhbGc... (your anon public key)
```
Find this in: Supabase Dashboard → Settings → API → anon / public key

#### Optional (For Worker Trigger Only)

If you have an external worker endpoint:

**Secret 3: WORKER_ENDPOINT_URL**
```
Name:  WORKER_ENDPOINT_URL
Value: https://your-worker-api.example.com/run
```

**Secret 4: WORKER_RUN_SECRET**
```
Name:  WORKER_RUN_SECRET
Value: your-secret-token
```

### 3.3 Verify Secrets Added

```bash
# List secrets (doesn't show values for security)
curl -s -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/YOUR_USERNAME/vistro-lite/actions/secrets | jq '.secrets[].name'
```

Expected output:
```
SUPABASE_ANON_KEY
SUPABASE_URL
WORKER_ENDPOINT_URL  (optional)
WORKER_RUN_SECRET    (optional)
```

---

## Phase 4: Verify GitHub Actions Workflows (5 minutes)

### 4.1 Check Workflow Status

1. Go to your repository on GitHub
2. Click **Actions** tab
3. You should see two workflows:
   - **CI** (runs on every push/PR)
   - **Translation Worker Cron** (runs every 15 minutes)

### 4.2 Trigger Manual CI Run

1. Click **CI** workflow
2. Click **Run workflow** (top right)
3. Select branch: **main** (or **pre-production** if using that name)
4. Click **Run workflow**

**Expected:** Workflow completes in ~2 minutes with all steps passing:
- Lint ✅
- Type check ✅
- Test ✅
- Build ✅

### 4.3 Trigger Manual Health Check

1. Click **Translation Worker Cron** workflow
2. Click **Run workflow**
3. Select branch
4. Click **Run workflow**

**Expected:** Both jobs complete:
- `run-worker` (skipped if WORKER_ENDPOINT_URL not configured) ⚠️
- `health-check` (runs and returns queue status) ✅

If health-check shows:
```
::notice::Queue health is healthy
```
→ Everything is working correctly!

---

## Phase 5: Environment Variables for Deployment (5 minutes)

### 5.1 For Vercel Deployment

If deploying to Vercel:

1. Go to [vercel.com](https://vercel.com) and log in
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Click **Environment Variables**
5. Add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` |

6. Click **Deploy**

### 5.2 For Other Platforms (Netlify, AWS, etc.)

Adapt the Vercel instructions for your platform:
- Usually: Settings → Environment Variables
- Add the same `VITE_*` variables
- Redeploy

### 5.3 Verify Deployment

After deployment completes:

1. Visit your deployed URL
2. Open Browser DevTools (F12)
3. Check Console tab for errors
4. Verify dashboard loads and shows metrics
5. Check Network tab → `queue-monitor` endpoint returns 200

---

## Phase 6: Production Readiness Checklist

### 6.1 Pre-Deployment Verification

Before going to production, complete these checks:

```
Supabase Setup:
☐ Database initialized with all 7 migrations
☐ Anon key has appropriate permissions (SELECT only on views)
☐ Service role key is securely stored (not in code)
☐ Row Level Security (RLS) enabled on all tables
☐ Backups configured (daily recommended)
☐ Database logs enabled for monitoring

GitHub Configuration:
☐ All 2-4 secrets configured (SUPABASE_URL, SUPABASE_ANON_KEY, optional worker secrets)
☐ CI workflow runs successfully
☐ Health check workflow runs every 15 minutes (check logs)
☐ No failed workflow runs in last 24 hours

Code Quality:
☐ npm run lint passes (0 warnings)
☐ npm run type-check passes (0 errors)
☐ npm run build succeeds in under 5 seconds
☐ No hardcoded secrets in code (search for ANON_KEY, SECRET, etc.)
☐ .env file is in .gitignore

Monitoring Setup:
☐ Queue monitoring dashboard accessible
☐ health-check endpoint returns valid JSON
☐ Alert thresholds understood and documented
☐ On-call runbook created
☐ Slack/email notifications configured (if applicable)

Security:
☐ All environment variables are secrets (not in code)
☐ CORS headers correct in Edge Functions
☐ RLS policies tested (user can't access other user's data)
☐ Webhook endpoints secured (if applicable)
☐ Rate limiting configured (if applicable)

Documentation:
☐ AUDIT_REPORT.md reviewed
☐ DEPLOYMENT_GUIDE.md (this file) complete
☐ QUEUE_MONITORING.md read and understood
☐ Runbook created for common issues
☐ Team trained on monitoring dashboard
```

### 6.2 Staging Environment Test

Create a staging environment before production:

```bash
# Create staging branch
git checkout -b staging

# Make no code changes, just configuration
# Deploy staging environment to test fully

# After 24 hours of stability:
# Create pull request: staging → main
# Review all changes
# Merge to main
# Production deployment starts
```

### 6.3 Database Backup Before Production

```bash
# Supabase Dashboard → Database → Backups
# Click "Create backup"
# Name it: "pre-production-initial-$(date +%Y%m%d)"

# For PostgreSQL direct backup:
pg_dump -h db.PROJECT_ID.supabase.co \
  -U postgres DATABASE_NAME > backup_$(date +%Y%m%d).sql
```

---

## Phase 7: Production Deployment

### 7.1 Tag Release

```bash
# When ready for production
git tag -a v1.0.0 -m "Initial production release"
git push origin v1.0.0
```

### 7.2 Deploy to Production

**Vercel:**
1. Click **Deployments** tab
2. Click **Promote to Production** on staging deployment

**Other platforms:** Trigger production build from your deployment target

### 7.3 Post-Deployment Verification

```bash
# 1. Check health endpoint returns 200
curl -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/functions/v1/queue-monitor?action=health"

# 2. Verify RLS is working
# Try querying as unauthenticated user - should get 403

# 3. Check monitoring dashboard
# Visit your app URL, confirm metrics appear

# 4. Monitor workflow logs
# GitHub Actions → Translation Worker Cron
# Verify runs every 15 minutes
```

### 7.4 Set Up Monitoring & Alerts

**GitHub Actions Notifications:**
1. Settings → Notifications
2. Enable email for workflow failures

**Supabase Monitoring:**
1. Supabase Dashboard → Health
2. Enable alerts for slow queries or errors

**Custom Monitoring (Optional):**
- Set up UptimeRobot to ping health endpoint every 5 minutes
- Configure Slack notifications for critical alerts
- Set up PagerDuty for on-call escalation

---

## Phase 8: Post-Production Runbook

### 8.1 Daily Tasks

- [ ] Review GitHub Actions workflow logs (0 failures expected)
- [ ] Check queue monitoring dashboard
- [ ] Monitor alert logs for WARNING level issues
- [ ] Verify no spike in failed jobs

### 8.2 Weekly Tasks

- [ ] Review `alert_statistics` view for patterns
- [ ] Analyze failed job error messages
- [ ] Check database performance metrics
- [ ] Review capacity trends (queue length, processing time)

### 8.3 Monthly Tasks

- [ ] Create database backup
- [ ] Review and optimize slow queries (if any)
- [ ] Update runbooks based on incidents
- [ ] Capacity planning review
- [ ] Security audit of RLS policies

### 8.4 Quarterly Tasks

- [ ] Full disaster recovery test (restore from backup)
- [ ] Performance optimization review
- [ ] Dependency updates (npm packages)
- [ ] Security patches application

---

## Troubleshooting

### Health Check Workflow Fails

**Error:** `SUPABASE_URL secret not found`

**Fix:**
1. Go to repository Settings → Secrets
2. Verify `SUPABASE_URL` exists
3. Re-run workflow after 5 minutes

### Build Fails on GitHub but Works Locally

**Error:** Type errors appear in GitHub Actions

**Fix:**
```bash
# Ensure types are generated locally
npm run type-check

# Commit and push again
git add .
git commit -m "Fix type errors"
git push
```

### Dashboard Shows "Error Loading Dashboard"

**Error:** 401/403 from health endpoint

**Fix:**
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel settings
2. Verify Edge Function is deployed: Supabase → Edge Functions
3. Check browser Network tab for actual error
4. Verify RLS policies (anon key should have SELECT on queue_health view)

### Health Check Says "Critical"

**Issue:** Queue shows stale locks or dead jobs

**Actions:**
1. Visit monitoring dashboard to see which jobs are stuck
2. Run: `SELECT cleanup_zombie_jobs();` in Supabase SQL editor
3. Check worker logs for crashes
4. Review failed job error messages

---

## Summary

You now have:

✅ Code on GitHub (pre-production branch)
✅ CI/CD workflows automated
✅ Monitoring active (runs every 15 minutes)
✅ Secrets securely configured
✅ Documentation complete
✅ Runbook for common issues
✅ Ready for production deployment

**Next Step:** Follow Phase 6.2 (Staging Test) → Phase 7 (Production Deployment)

**Timeline:**
- Phases 1-5: ~35 minutes
- Phase 6 (Staging): 24+ hours
- Phase 7 (Production): 15 minutes

**Questions?**
- Check AUDIT_REPORT.md for technical details
- Check QUEUE_MONITORING.md for monitoring setup
- Review GitHub Actions logs for workflow details
