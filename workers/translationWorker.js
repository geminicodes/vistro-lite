#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

require('ts-node/register');

const { info, error: logError } = require('../lib/log');
const { createSupabaseServiceClient } = require('../lib/supabaseServer');
const { processTranslationJob } = require('../lib/translationWorker');

const args = process.argv.slice(2);
const runOnce = args.includes('--run-once');
const jobIdFlagIndex = args.indexOf('--job-id');
const cliJobId = jobIdFlagIndex >= 0 ? args[jobIdFlagIndex + 1] : undefined;

const getNextJobId = async (client) => {
  const { data, error } = await client
    .from('job_queue')
    .select('job_id')
    .eq('processed', false)
    .order('enqueued_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load job queue: ${error.message}`);
  }

  return (data && data[0]?.job_id) || null;
};

const main = async () => {
  const client = createSupabaseServiceClient();

  if (cliJobId) {
    info('Running translation worker for specific job', { jobId: cliJobId });
    await processTranslationJob(cliJobId);
    return;
  }

  do {
    const nextJobId = await getNextJobId(client);

    if (!nextJobId) {
      info('No pending translation jobs found');
      break;
    }

    info('Processing queued translation job', { jobId: nextJobId });
    await processTranslationJob(nextJobId);
  } while (!runOnce);
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
