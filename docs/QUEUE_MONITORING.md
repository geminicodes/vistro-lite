# Queue Monitoring Infrastructure

Complete monitoring solution for the translation job queue system.

## Overview

This monitoring infrastructure provides:

1. **Real-time Queue Health Dashboard** - Visual interface showing queue metrics
2. **API Monitoring Endpoint** - Programmatic access to queue health data
3. **Automated Health Checks** - GitHub Actions cron job for continuous monitoring
4. **Alert Logging** - Database storage of historical alerts for pattern analysis

## Components

### 1. Queue Monitor API (Edge Function)

**Endpoint:** `{SUPABASE_URL}/functions/v1/queue-monitor`

**Authentication:** Requires Bearer token (Supabase Anon Key or Service Key)

**Available Actions:**

#### Get Health Status
```bash
GET /functions/v1/queue-monitor?action=health
```

Returns comprehensive health data with alerts:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-02T12:00:00Z",
  "health": {
    "total_jobs": 100,
    "queued_jobs": 5,
    "processing_jobs": 2,
    "completed_jobs": 88,
    "failed_jobs": 5,
    "stale_locks": 0,
    "dead_jobs": 0,
    "avg_wait_seconds": 45.2,
    "avg_processing_seconds": 120.5,
    "oldest_queued_job_age_seconds": 180
  },
  "alerts": []
}
```

#### Get Alerts Only
```bash
GET /functions/v1/queue-monitor?action=alerts
```

Returns active alerts:
```json
{
  "timestamp": "2026-01-02T12:00:00Z",
  "alerts": [
    {
      "metric": "stale_locks",
      "value": 2,
      "severity": "critical",
      "message": "stale_locks is 2 (threshold: 0)"
    }
  ],
  "count": 1
}
```

#### Get Recent Jobs
```bash
GET /functions/v1/queue-monitor?action=jobs
```

Returns last 20 jobs with details.

### 2. React Dashboard Component

**Location:** `src/components/QueueMonitorDashboard.tsx`

**Features:**
- Real-time metrics display
- Color-coded status indicators
- Auto-refresh every 10 seconds (toggleable)
- Alert notifications
- Recent jobs table

**Usage:**
```tsx
import { QueueMonitorDashboard } from './components/QueueMonitorDashboard';

function App() {
  return <QueueMonitorDashboard />;
}
```

**Environment Variables Required:**
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. GitHub Actions Health Check

**File:** `.github/workflows/cron-worker.yml`

Runs every 15 minutes and:
- Checks queue health status
- Logs warnings and errors to GitHub Actions
- Fails the workflow if status is "critical"
- Specifically checks for stale locks and dead jobs

**Required GitHub Secrets:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

**Manual Trigger:**
You can manually trigger the health check from GitHub Actions UI.

### 4. Database Alert System

**Tables:**
- `queue_alerts_log` - Historical alert records
- `alert_statistics` - View showing alert patterns

**Functions:**

#### Check and Log Alerts
```sql
SELECT check_and_log_queue_alerts();
```

Checks current queue health against thresholds and logs new alerts. Returns the number of alerts created.

**Alert Thresholds:**
- `stale_locks > 0` → CRITICAL
- `dead_jobs > 0` → CRITICAL
- `oldest_queued_job_age_seconds > 600` → CRITICAL (10 minutes)
- `avg_wait_seconds > 300` → WARNING (5 minutes)
- `failed_jobs > 10` AND failure rate > 10% → WARNING

#### Resolve Alert
```sql
SELECT resolve_queue_alert('alert-uuid', 'user-uuid');
```

Marks an alert as resolved.

#### Get Active Alerts
```sql
SELECT * FROM get_active_alerts();
```

Returns all unresolved alerts ordered by severity.

#### View Alert Statistics
```sql
SELECT * FROM alert_statistics;
```

Shows patterns: total count, active count, average resolution time, etc.

## Alert Severity Levels

### CRITICAL
System requires immediate attention. Jobs may be stuck or unable to process.

**Conditions:**
- Stale locks detected (jobs locked but not processing)
- Dead jobs found (processing for >1 hour with no worker activity)
- Oldest queued job waiting >10 minutes

**Action Required:**
1. Check worker processes are running
2. Review database for stuck transactions
3. Consider running zombie cleanup function
4. Investigate worker logs for crashes

### WARNING
Performance degradation or elevated failure rate.

**Conditions:**
- Average wait time >5 minutes
- Failure rate >10% (when >10 failed jobs exist)

**Action Required:**
1. Check translation API quotas/rate limits
2. Review failed job error messages
3. Consider scaling worker capacity
4. Investigate if specific users are causing failures

## Deployment to Production

### Vercel Environment Variables

When deploying to Vercel, add these environment variables:

**For Frontend:**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**For GitHub Actions:**

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

### Edge Function Deployment

Already deployed via Supabase MCP tools. No additional configuration needed.

## Monitoring Best Practices

### 1. Regular Health Checks

Set up automated monitoring:

**Option A: Use GitHub Actions (Included)**
- Runs every 15 minutes automatically
- Logs visible in GitHub Actions tab
- Fails workflow on critical issues

**Option B: External Monitoring Service**
```bash
# UptimeRobot, BetterUptime, etc.
curl -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/functions/v1/queue-monitor?action=health"
```

### 2. Alert Response Procedures

**Stale Locks:**
```sql
-- View locked jobs
SELECT * FROM translation_jobs
WHERE status = 'processing'
  AND started_at < now() - interval '5 minutes';

-- If worker crashed, unlock jobs manually (CAREFUL!)
UPDATE translation_jobs
SET status = 'queued', started_at = NULL
WHERE id = 'stuck-job-id';
```

**Dead Jobs:**
```sql
-- Run zombie cleanup function
SELECT cleanup_zombie_jobs();

-- Review what was cleaned up
SELECT * FROM translation_jobs
WHERE status = 'failed'
  AND error_message LIKE '%zombie%'
ORDER BY completed_at DESC;
```

### 3. Capacity Planning

Monitor these metrics over time:

- **avg_wait_seconds** - If consistently >2 minutes, scale workers
- **processing_jobs** - If always at max capacity, add workers
- **failed_jobs trend** - Increasing failures indicate API issues

### 4. Historical Analysis

```sql
-- View alert patterns
SELECT * FROM alert_statistics;

-- Find recurring issues
SELECT
  alert_type,
  COUNT(*) as occurrences,
  AVG(metric_value) as avg_value,
  MAX(created_at) as last_seen
FROM queue_alerts_log
WHERE created_at > now() - interval '7 days'
GROUP BY alert_type
ORDER BY occurrences DESC;

-- Check resolution times
SELECT
  alert_type,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) / 60 as avg_minutes_to_resolve,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) as still_open
FROM queue_alerts_log
WHERE created_at > now() - interval '7 days'
GROUP BY alert_type;
```

## Troubleshooting

### Dashboard Not Loading

**Check:**
1. Environment variables are set correctly in `.env`
2. Supabase project is accessible
3. Browser console for errors
4. Network tab shows 200 response from edge function

### Health Check Returns 404

**Fix:**
Edge function not deployed. Redeploy:
```bash
# Function is deployed via Supabase MCP tools
# Check if function exists in Supabase dashboard
```

### GitHub Actions Failing

**Check:**
1. Secrets are configured in repository settings
2. SUPABASE_URL includes `https://`
3. SUPABASE_ANON_KEY is valid (not expired)
4. Edge function is deployed and accessible

### No Alerts Being Logged

**Check:**
```sql
-- Verify function exists
SELECT check_and_log_queue_alerts();

-- Check if thresholds are being exceeded
SELECT * FROM queue_health;

-- View recent alerts
SELECT * FROM queue_alerts_log ORDER BY created_at DESC LIMIT 10;
```

## API Integration Examples

### Node.js Worker
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkHealth() {
  const { data } = await supabase.functions.invoke('queue-monitor', {
    body: { action: 'health' }
  });

  if (data.status === 'critical') {
    console.error('CRITICAL: Queue health degraded!', data.alerts);
    // Send notification, page on-call, etc.
  }
}
```

### Python Script
```python
import requests
import os

url = f"{os.getenv('SUPABASE_URL')}/functions/v1/queue-monitor"
headers = {
    "Authorization": f"Bearer {os.getenv('SUPABASE_ANON_KEY')}",
    "Content-Type": "application/json"
}

response = requests.get(f"{url}?action=health", headers=headers)
health = response.json()

if health['status'] == 'critical':
    print(f"ALERT: {len(health['alerts'])} critical issues!")
    for alert in health['alerts']:
        print(f"  - {alert['message']}")
```

## Maintenance

### Cleanup Old Alerts

```sql
-- Delete resolved alerts older than 30 days
DELETE FROM queue_alerts_log
WHERE resolved_at IS NOT NULL
  AND resolved_at < now() - interval '30 days';

-- Archive old alerts (if needed)
CREATE TABLE queue_alerts_archive AS
SELECT * FROM queue_alerts_log
WHERE created_at < now() - interval '90 days';

DELETE FROM queue_alerts_log
WHERE created_at < now() - interval '90 days';
```

### Performance Optimization

Indexes are already created, but if you're logging thousands of alerts:

```sql
-- Partition by month (PostgreSQL 10+)
-- Consult DBA before implementing partitioning
```

## Support

For issues or questions:
1. Check this documentation
2. Review queue health metrics
3. Check GitHub Actions logs
4. Review Supabase Edge Function logs
5. Query database alert logs for patterns
