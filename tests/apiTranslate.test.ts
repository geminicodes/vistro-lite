import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { splitHtmlToSegments } from '../lib/segmenter';
import { POST } from '../app/api/translate/route';

type TableName = 'translation_jobs' | 'translation_segments' | 'translation_memory' | 'job_queue';

interface MockDb {
  translation_jobs: any[];
  translation_segments: any[];
  translation_memory: any[];
  job_queue: any[];
}

const { mockCreateSupabaseServiceClient } = vi.hoisted(() => ({
  mockCreateSupabaseServiceClient: vi.fn(),
}));

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

vi.mock('../lib/supabaseServer', () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
  upsertTranslationMemory: vi.fn(),
}));

const cloneRow = (row: any) => JSON.parse(JSON.stringify(row));

const applyFilters = (rows: any[], filters: Array<(row: any) => boolean>) =>
  filters.reduce((result, filter) => result.filter(filter), rows);

const projectRows = (rows: any[], columns: string) => {
  if (!columns || columns === '*') {
    return rows.map(cloneRow);
  }

  const fields = columns.split(',').map((col) => col.trim());
  return rows.map((row) => {
    const projected: Record<string, any> = {};
    for (const field of fields) projected[field] = row[field];
    return projected;
  });
};

const createMockSupabaseClient = (db: MockDb) => {
  const buildSelectBuilder = (
    table: TableName,
    columns: string,
    options?: { count?: 'exact'; head?: boolean },
  ) => {
    const filters: Array<(row: any) => boolean> = [];

    const builder: any = {
      eq(field: string, value: any) {
        filters.push((row) => row[field] === value);
        return builder;
      },
      gte(field: string, value: any) {
        filters.push((row) => row[field] >= value);
        return builder;
      },
      in(field: string, values: any[]) {
        filters.push((row) => values.includes(row[field]));
        return builder;
      },
      then(onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) {
        try {
          const filtered = applyFilters(db[table], filters);
          const result =
            options?.count === 'exact' && options?.head
              ? { data: null, count: filtered.length, error: null }
              : { data: projectRows(filtered, columns), error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        } catch (error) {
          if (onRejected) return Promise.reject(error).catch(onRejected);
          return Promise.reject(error);
        }
      },
    };

    return builder;
  };

  return {
    from(table: TableName) {
      return {
        select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
          return buildSelectBuilder(table, columns, options);
        },
        insert(payload: any) {
          const rows = Array.isArray(payload) ? payload : [payload];
          db[table].push(...rows.map(cloneRow));
          return Promise.resolve({ data: rows, error: null });
        },
      };
    },
    rpc(fnName: string, args: any) {
      if (fnName !== 'enqueue_translation_job') {
        return Promise.resolve({ data: null, error: new Error(`Unsupported rpc: ${fnName}`) });
      }

      const jobId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      db.translation_jobs.push(
        cloneRow({
          id: jobId,
          site_id: args.p_site_id,
          source_url: args.p_source_url ?? null,
          status: 'pending',
          created_at: nowIso,
        }),
      );

      const segments = Array.isArray(args.p_segments) ? args.p_segments : [];
      for (const seg of segments) {
        db.translation_segments.push(
          cloneRow({
            id: crypto.randomUUID(),
            job_id: jobId,
            source_lang: seg.source_lang ?? 'auto',
            target_lang: seg.target_lang,
            segment_hash: seg.segment_hash,
            source_text: seg.source_text,
            translated_text: null,
            created_at: nowIso,
          }),
        );
      }

      db.job_queue.push(
        cloneRow({
          id: db.job_queue.length + 1,
          job_id: jobId,
          processed: false,
          enqueued_at: nowIso,
        }),
      );

      return Promise.resolve({ data: jobId, error: null });
    },
  };
};

describe('POST /api/translate', () => {
  let db: MockDb;

  beforeEach(() => {
    db = {
      translation_jobs: [],
      translation_segments: [],
      translation_memory: [],
      job_queue: [],
    };

    mockCreateSupabaseServiceClient.mockReturnValue(createMockSupabaseClient(db));
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const allowedSiteId = '123e4567-e89b-12d3-a456-426614174000';

    mockCreateClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        if (table !== 'sites') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [{ id: allowedSiteId }], error: null }),
            }),
          }),
        };
      },
    });
  });

  afterEach(() => {
    mockCreateSupabaseServiceClient.mockReset();
    mockCreateClient.mockReset();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  });

  it('creates a translation job and segments for url/html input', async () => {
    const siteId = '123e4567-e89b-12d3-a456-426614174000';
    const html = `
      <article>
        <p>Hello world</p>
        <p>Second block</p>
      </article>
    `;
    const targetLocales = ['es', 'fr'];

    const segments = splitHtmlToSegments(html);

    const request = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        siteId,
        html,
        targetLocales,
      }),
      headers: { authorization: 'Bearer user-jwt' },
    });

    const response = await POST(request);
    const json = (await response.json()) as any;
    
    expect(response.status).toBe(200);
    expect(typeof json.jobId).toBe('string');
    expect(json.segments).toBe(segments.length);

    expect(db.translation_jobs).toHaveLength(1);
    expect(db.translation_segments).toHaveLength(segments.length * targetLocales.length);
    expect(db.job_queue).toHaveLength(1);
    expect(db.job_queue[0].job_id).toBe(json.jobId);
  });

  it('rejects when neither url nor html is provided', async () => {
    const siteId = '123e4567-e89b-12d3-a456-426614174000';
    const request = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        siteId,
        targetLocales: ['es'],
      }),
      headers: { authorization: 'Bearer user-jwt' },
    });

    const response = await POST(request);
    const json = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(json.error?.code).toBe('bad_request');

    expect(db.translation_jobs).toHaveLength(0);
    expect(db.translation_segments).toHaveLength(0);
    expect(db.job_queue).toHaveLength(0);
  });
});
