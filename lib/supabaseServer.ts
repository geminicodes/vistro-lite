'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AnySupabaseClient = SupabaseClient<any, 'public', any>;

let cachedClient: AnySupabaseClient | null = null;
let fetchPolyfill: typeof fetch | undefined;

const resolveFetch = (): typeof fetch => {
  if (typeof fetch === 'function') {
    return fetch;
  }

  if (fetchPolyfill) {
    return fetchPolyfill;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFetch = require('node-fetch');
    fetchPolyfill = nodeFetch as typeof fetch;
    return fetchPolyfill;
  } catch (error) {
    throw new Error(
      'Global fetch is not available. Install the "node-fetch" package to use the Supabase client in Node environments.',
    );
  }
};

/**
 * Create a Supabase service-role client.
 *
 * This must only be used from trusted server-side code. The service role key
 * grants elevated privileges and must never be exposed to browsers or logged.
 *
 * @throws {Error} When required environment variables are missing.
 */
export const createSupabaseServiceClient = (): AnySupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error('SUPABASE_URL is not set.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: resolveFetch(),
    },
  });

  return cachedClient;
};

export interface TranslationMemoryEntry {
  siteId: string;
  sourceLang: string;
  targetLang: string;
  segmentHash: string;
  translatedText: string;
}

/**
 * Upsert translation memory entries into the `translation_memory` table.
 *
 * Uses `ON CONFLICT (site_id, segment_hash, target_lang) DO UPDATE SET
 * translated_text = EXCLUDED.translated_text, created_at = now()`.
 *
 * @param entries - Translation memory payloads to persist.
 */
export const upsertTranslationMemory = async (
  entries: TranslationMemoryEntry[],
  clientParam?: AnySupabaseClient,
): Promise<void> => {
  if (entries.length === 0) {
    return;
  }

  const client = clientParam ?? createSupabaseServiceClient();

  const payload = entries.map((entry) => ({
    site_id: entry.siteId,
    source_lang: entry.sourceLang,
    target_lang: entry.targetLang,
    segment_hash: entry.segmentHash,
    translated_text: entry.translatedText,
    created_at: new Date().toISOString(),
  }));

  const { error } = await client
    .from('translation_memory')
    .upsert(payload, {
      onConflict: 'site_id,segment_hash,target_lang',
    });

  if (error) {
    throw new Error(`Failed to upsert translation memory: ${error.message}`);
  }
};
