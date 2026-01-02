import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueueHealth {
  total_jobs: number;
  queued_jobs: number;
  processing_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  stale_locks: number;
  dead_jobs: number;
  avg_wait_seconds: number;
  avg_processing_seconds: number;
  oldest_queued_job_age_seconds: number;
}

interface AlertRule {
  metric: string;
  threshold: number;
  condition: 'greater_than' | 'less_than';
  severity: 'warning' | 'critical';
}

const ALERT_RULES: AlertRule[] = [
  { metric: 'stale_locks', threshold: 0, condition: 'greater_than', severity: 'critical' },
  { metric: 'dead_jobs', threshold: 0, condition: 'greater_than', severity: 'critical' },
  { metric: 'failed_jobs', threshold: 10, condition: 'greater_than', severity: 'warning' },
  { metric: 'avg_wait_seconds', threshold: 300, condition: 'greater_than', severity: 'warning' },
  { metric: 'oldest_queued_job_age_seconds', threshold: 600, condition: 'greater_than', severity: 'critical' },
];

function checkAlerts(health: QueueHealth): Array<{ metric: string; value: number; severity: string; message: string }> {
  const alerts = [];
  
  for (const rule of ALERT_RULES) {
    const value = health[rule.metric as keyof QueueHealth] as number;
    
    if (rule.condition === 'greater_than' && value > rule.threshold) {
      alerts.push({
        metric: rule.metric,
        value,
        severity: rule.severity,
        message: `${rule.metric} is ${value} (threshold: ${rule.threshold})`,
      });
    } else if (rule.condition === 'less_than' && value < rule.threshold) {
      alerts.push({
        metric: rule.metric,
        value,
        severity: rule.severity,
        message: `${rule.metric} is ${value} (threshold: ${rule.threshold})`,
      });
    }
  }
  
  return alerts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'health';

    // Query the queue_health view
    const { data: healthData, error: healthError } = await supabase
      .from('queue_health')
      .select('*')
      .maybeSingle();

    if (healthError) {
      throw new Error(`Failed to fetch queue health: ${healthError.message}`);
    }

    if (!healthData) {
      return new Response(
        JSON.stringify({ error: 'No queue health data available' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const health = healthData as QueueHealth;

    if (action === 'health') {
      // Return health data with alert status
      const alerts = checkAlerts(health);
      const hasWarnings = alerts.some(a => a.severity === 'warning');
      const hasCritical = alerts.some(a => a.severity === 'critical');
      
      const status = hasCritical ? 'critical' : hasWarnings ? 'warning' : 'healthy';

      return new Response(
        JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
          health,
          alerts,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (action === 'alerts') {
      // Return only alerts
      const alerts = checkAlerts(health);
      
      return new Response(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          alerts,
          count: alerts.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (action === 'jobs') {
      // Return recent jobs for debugging
      const { data: recentJobs, error: jobsError } = await supabase
        .from('translation_jobs')
        .select('id, status, user_id, created_at, started_at, completed_at, error_message')
        .order('created_at', { ascending: false })
        .limit(20);

      if (jobsError) {
        throw new Error(`Failed to fetch recent jobs: ${jobsError.message}`);
      }

      return new Response(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          jobs: recentJobs,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use: health, alerts, or jobs' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Queue monitor error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
