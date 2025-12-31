#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

require('ts-node/register');

const os = require('node:os');
const { randomUUID } = require('node:crypto');

const { info, warn, error: logError } = require('../lib/log');
const { createSupabaseServiceClient } = require('../lib/supabaseServer');
const { processTranslationJob } = require('../lib/translationWorker');

const args = process.argv.slice(2);
const runOnce = args.includes('--run-once');
const jobIdFlagIndex = args.indexOf('--job-id');
const cliJobId = jobIdFlagIndex >= 0 ? args[jobIdFlagIndex + 1] : undefined;

const parseIntegerEnv = (value, fallback) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const WORKER_ID = process.env.WORKER_ID || `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const WORKER_LEASE_SECONDS = parseIntegerEnv(process.env.WORKER_LEASE_SECONDS, 300);
const WORKER_MAX_JOB_ATTEMPTS = parseIntegerEnv(process.env.WORKER_MAX_JOB_ATTEMPTS, 5);
const WORKER_IDLE_POLL_MS = parseIntegerEnv(process.env.WORKER_IDLE_POLL_MS, 2_000);
const WORKER_CONCURRENCY = parseIntegerEnv(process.env.WORKER_CONCURRENCY, 1);
const WORKER_HEARTBEAT_MS = parseIntegerEnv(process.env.WORKER_HEARTBEAT_MS, 60_000);

let shouldStop = false;
const inFlight = new Map(); // jobId -> { lockToken, promise }

process.on('SIGINT', () => {
  shouldStop = true;
});
process.on('SIGTERM', () => {
  shouldStop = true;
});

const claimNextJob = async (client) => {
  const { data, error } = await client.rpc('claim_next_translation_job', {
    p_worker_id: WORKER_ID,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });

  if (error) {
    throw new Error(`Failed to claim next job: ${error.message}`);
  }

  // PostgREST returns null when no rows were updated.
  return data || null;
};

const claimSpecificJob = async (client, jobId) => {
  const { data, error } = await client.rpc('claim_translation_job', {
    p_job_id: jobId,
    p_worker_id: WORKER_ID,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });

  if (error) {
    throw new Error(`Failed to claim job ${jobId}: ${error.message}`);
  }

  return data || null;
};

const completeJob = async (client, jobId, lockToken) => {
  const { data, error } = await client.rpc('complete_translation_job', {
    p_job_id: jobId,
    p_lock_token: lockToken,
    p_success: true,
    p_error: null,
  });

  if (error || data !== true) {
    throw new Error(`Failed to complete job ${jobId}: ${error ? error.message : 'lock mismatch'}`);
  }
};

const failJobPermanently = async (client, jobId, lockToken, err) => {
  const message = err && err.message ? err.message : String(err);
  const { data, error } = await client.rpc('complete_translation_job', {
    p_job_id: jobId,
    p_lock_token: lockToken,
    p_success: false,
    p_error: message,
  });

  if (error || data !== true) {
    throw new Error(
      `Failed to mark job ${jobId} failed: ${error ? error.message : 'lock mismatch'}`,
    );
  }
};

const releaseJob = async (client, jobId, lockToken, err) => {
  const message = err && err.message ? err.message : String(err);
  const { data, error } = await client.rpc('release_translation_job', {
    p_job_id: jobId,
    p_lock_token: lockToken,
    p_error: message,
  });

  if (error || data !== true) {
    throw new Error(
      `Failed to release job ${jobId}: ${error ? error.message : 'lock mismatch'}`,
    );
  }
};

const main = async () => {
  const client = createSupabaseServiceClient();
  const heartbeat = setInterval(() => {
    info('Worker heartbeat', {
      workerId: WORKER_ID,
      inFlight: inFlight.size,
      shouldStop,
    });
  }, WORKER_HEARTBEAT_MS).unref?.();

  if (cliJobId) {
    const claimed = await claimSpecificJob(client, cliJobId);
    if (!claimed) {
      info('No claimable translation job found (already locked or processed)', { jobId: cliJobId });
      return;
    }

    const { job_id: jobId, lock_token: lockToken, attempts } = claimed;
    inFlight.set(jobId, { lockToken, promise: Promise.resolve() });
    info('Running translation worker for specific job', { jobId, attempts, workerId: WORKER_ID });

    try {
      if (attempts > WORKER_MAX_JOB_ATTEMPTS) {
        warn('Job exceeded max attempts; marking failed', { jobId, attempts });
        await failJobPermanently(client, jobId, lockToken, new Error('Exceeded maximum attempts.'));
        return;
      }

      await processTranslationJob(jobId);
      await completeJob(client, jobId, lockToken);
    } catch (err) {
      if (attempts >= WORKER_MAX_JOB_ATTEMPTS) {
        await failJobPermanently(client, jobId, lockToken, err);
      } else {
        await releaseJob(client, jobId, lockToken, err);
      }
      throw err;
    } finally {
      inFlight.delete(jobId);
      clearInterval(heartbeat);
    }
    return;
  }

  const startJob = async (claimed) => {
    const { job_id: jobId, lock_token: lockToken, attempts } = claimed;
    info('Processing queued translation job', { jobId, attempts, workerId: WORKER_ID });

    const promise = (async () => {
      try {
        if (attempts > WORKER_MAX_JOB_ATTEMPTS) {
          warn('Job exceeded max attempts; marking failed', { jobId, attempts });
          await failJobPermanently(client, jobId, lockToken, new Error('Exceeded maximum attempts.'));
          return;
        }

        await processTranslationJob(jobId);
        await completeJob(client, jobId, lockToken);
      } catch (err) {
        if (attempts >= WORKER_MAX_JOB_ATTEMPTS) {
          await failJobPermanently(client, jobId, lockToken, err);
        } else {
          await releaseJob(client, jobId, lockToken, err);
        }

        warn('Translation job failed', {
          jobId,
          attempts,
          workerId: WORKER_ID,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        inFlight.delete(jobId);
      }
    })();

    inFlight.set(jobId, { lockToken, promise });
    return promise;
  };

  while (!shouldStop) {
    if (inFlight.size >= WORKER_CONCURRENCY) {
      await Promise.race(Array.from(inFlight.values()).map((entry) => entry.promise));
      continue;
    }

    const claimed = await claimNextJob(client);
    if (!claimed) {
      if (runOnce) {
        info('No pending translation jobs found');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, WORKER_IDLE_POLL_MS));
      continue;
    }

    void startJob(claimed);

    if (runOnce) {
      break;
    }
  }

  // Graceful shutdown: wait for in-flight jobs to finish, then release any locks if still present.
  if (shouldStop) {
    await Promise.allSettled(Array.from(inFlight.values()).map((entry) => entry.promise));
    for (const [jobId, entry] of inFlight.entries()) {
      try {
        await releaseJob(client, jobId, entry.lockToken, new Error('Worker shutdown.'));
      } catch (err) {
        warn('Failed releasing in-flight job on shutdown', {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  clearInterval(heartbeat);
};

main()
  .then(() => {
    info('Translation worker run complete');
    process.exit(0);
  })
  .catch((err) => {
    logError('Translation worker failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
