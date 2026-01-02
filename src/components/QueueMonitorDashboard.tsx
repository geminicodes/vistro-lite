import { useEffect, useState } from 'react';
import type { MonitoringResponse, RecentJob } from '../types/monitoring';

const API_BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function QueueMonitorDashboard() {
  const [monitoring, setMonitoring] = useState<MonitoringResponse | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMonitoring = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/functions/v1/queue-monitor?action=health`,
        {
          headers: {
            Authorization: `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setMonitoring(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentJobs = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/functions/v1/queue-monitor?action=jobs`,
        {
          headers: {
            Authorization: `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setRecentJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch recent jobs:', err);
    }
  };

  useEffect(() => {
    fetchMonitoring();
    fetchRecentJobs();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchMonitoring();
        fetchRecentJobs();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityColor = (severity: string) => {
    return severity === 'critical'
      ? 'bg-red-500 text-white'
      : 'bg-yellow-500 text-white';
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'queued':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">Error Loading Dashboard</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchMonitoring();
            }}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!monitoring) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Queue Monitor</h1>
            <p className="text-gray-600 mt-1">Real-time translation job queue health</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (10s)
            </label>
            <button
              onClick={() => {
                fetchMonitoring();
                fetchRecentJobs();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Refresh Now
            </button>
          </div>
        </div>

        <div
          className={`rounded-lg border-2 p-4 mb-6 ${getStatusColor(monitoring.status)}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                System Status: {monitoring.status.toUpperCase()}
              </h2>
              <p className="text-sm opacity-75 mt-1">
                Last updated: {formatTimestamp(monitoring.timestamp)}
              </p>
            </div>
            {monitoring.alerts.length > 0 && (
              <div className="text-right">
                <span className="text-2xl font-bold">{monitoring.alerts.length}</span>
                <p className="text-sm">Active Alerts</p>
              </div>
            )}
          </div>
        </div>

        {monitoring.alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Alerts</h2>
            <div className="space-y-2">
              {monitoring.alerts.map((alert, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200"
                >
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getSeverityColor(
                      alert.severity
                    )}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="flex-1 text-gray-700">{alert.message}</span>
                  <span className="text-gray-500 text-sm">{alert.metric}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <MetricCard
            label="Total Jobs"
            value={monitoring.health.total_jobs}
            color="blue"
          />
          <MetricCard
            label="Queued"
            value={monitoring.health.queued_jobs}
            color="gray"
          />
          <MetricCard
            label="Processing"
            value={monitoring.health.processing_jobs}
            color="blue"
          />
          <MetricCard
            label="Completed"
            value={monitoring.health.completed_jobs}
            color="green"
          />
          <MetricCard
            label="Failed"
            value={monitoring.health.failed_jobs}
            color="red"
            warning={monitoring.health.failed_jobs > 0}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <MetricCard
            label="Stale Locks"
            value={monitoring.health.stale_locks}
            color="red"
            warning={monitoring.health.stale_locks > 0}
          />
          <MetricCard
            label="Dead Jobs"
            value={monitoring.health.dead_jobs}
            color="red"
            warning={monitoring.health.dead_jobs > 0}
          />
          <MetricCard
            label="Oldest Queued Job"
            value={formatDuration(monitoring.health.oldest_queued_job_age_seconds)}
            color="yellow"
            warning={monitoring.health.oldest_queued_job_age_seconds > 300}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <MetricCard
            label="Avg Wait Time"
            value={formatDuration(monitoring.health.avg_wait_seconds)}
            color="gray"
          />
          <MetricCard
            label="Avg Processing Time"
            value={formatDuration(monitoring.health.avg_processing_seconds)}
            color="gray"
          />
        </div>

        {recentJobs.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Jobs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-700">Job ID</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Status</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Created</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Duration</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => {
                    const duration =
                      job.completed_at && job.started_at
                        ? (new Date(job.completed_at).getTime() -
                            new Date(job.started_at).getTime()) /
                          1000
                        : null;

                    return (
                      <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs">{job.id.slice(0, 8)}...</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getJobStatusColor(
                              job.status
                            )}`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600">
                          {formatTimestamp(job.created_at)}
                        </td>
                        <td className="p-3 text-gray-600">{formatDuration(duration)}</td>
                        <td className="p-3 text-red-600 text-xs">
                          {job.error_message ? job.error_message.slice(0, 50) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
  warning?: boolean;
}

function MetricCard({ label, value, color, warning }: MetricCardProps) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    gray: 'border-gray-200 bg-gray-50',
  };

  const textColors = {
    blue: 'text-blue-900',
    green: 'text-green-900',
    red: 'text-red-900',
    yellow: 'text-yellow-900',
    gray: 'text-gray-900',
  };

  return (
    <div
      className={`rounded-lg border-2 p-4 ${colors[color]} ${
        warning ? 'ring-2 ring-red-500 ring-offset-2' : ''
      }`}
    >
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${textColors[color]}`}>{value}</p>
    </div>
  );
}
