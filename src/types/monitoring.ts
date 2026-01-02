export interface QueueHealth {
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

export interface Alert {
  metric: string;
  value: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface MonitoringResponse {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  health: QueueHealth;
  alerts: Alert[];
}

export interface RecentJob {
  id: string;
  status: string;
  user_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}
