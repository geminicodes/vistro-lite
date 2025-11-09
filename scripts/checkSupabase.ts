'use server';

import { createSupabaseServiceClient } from '../lib/supabaseServer';

const hasConfig =
  Boolean(process.env.SUPABASE_URL?.trim()) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

if (!hasConfig) {
  console.warn('Skipping Supabase check: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.');
  process.exit(0);
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();

  const { error } = await client
    .from('translation_memory')
    .select('segment_hash', { head: true, count: 'exact' })
    .limit(1);

  if (error) {
    console.error(`Supabase connection failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log('Supabase connection OK.');
}

main().catch((error) => {
  console.error('Unexpected error while checking Supabase connection:', error);
  process.exit(1);
});
