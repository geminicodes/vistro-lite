import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { processTranslationJob } from '../lib/translationWorker';

type TableName =
  | 'translation_jobs'
  | 'translation_segments'
  | 'translation_memory'
  | 'job_queue';

interface MockDb {
  translation_jobs: any[];
  translation_segments: any[];
  translation_memory: any[];
  job_queue: any[];
}

const {
  mockCreateSupabaseServiceClient,
  mockUpsertTranslationMemory,
  mockTranslateBatch,
  mockInfo,
  mockWarn,
} = vi.hoisted(() => ({
  mockCreateSupabaseServiceClient: vi.fn(),
  mockUpsertTranslationMemory: vi.fn(),
  mockTranslateBatch: vi.fn(),
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
}));
 
vi.mock('../lib/supabaseServer', () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
  upsertTranslationMemory: mockUpsertTranslationMemory,
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createMockSupabaseClient = (db: MockDb) => ({
  from(table: TableName) {
    return {
      select(columns: string) {
        const fields = columns.split(',').map((field) => field.trim());
        let rows = db[table].map((row) => clone(row));
        const filters: Array<(row: any) => boolean> = [];

        const builder: any = {
          eq(field: string, value: any) {
            filters.push((row) => row[field] === value);
            return builder;
          },
          then(onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) {
            try {
              const filtered = filters.reduce((result, filter) => result.filter(filter), rows);
              const projected = filtered.map((row) => {
                const projection: Record<string, any> = {};

                for (const field of fields) {
                  projection[field] = row[field];
                }

                return projection;
              });

              return Promise.resolve({ data: projected, error: null }).then(onFulfilled, onRejected);
            } catch (error) {
              if (onRejected) {
                return Promise.reject(error).catch(onRejected);
              }

              return Promise.reject(error);
            }
          },
        };

        return builder;
      },
      insert(payload: any) {
        const rows = Array.isArray(payload) ? payload : [payload];
        db[table].push(...rows.map(clone));
        return Promise.resolve({ data: rows, error: null });
      },
      upsert(payload: any, options?: { onConflict?: string }) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const conflictKeys = options?.onConflict?.split(',').map((key) => key.trim()) ?? [];

        for (const row of rows) {
          if (conflictKeys.length === 0) {
            db[table].push(clone(row));
            continue;
          }

          const index = db[table].findIndex((existing) =>
            conflictKeys.every((key) => existing[key] === row[key]),
          );

          if (index >= 0) {
            db[table][index] = { ...db[table][index], ...clone(row) };
          } else {
            db[table].push(clone(row));
          }
        }

        return Promise.resolve({ data: rows, error: null });
      },
      update(updateValue: Record<string, unknown>) {
        return {
          eq(field: string, value: unknown) {
            db[table] = db[table].map((row) =>
              row[field] === value ? { ...row, ...clone(updateValue) } : row,
            );
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  },
});

describe('translation worker', () => {
  let db: MockDb;
  const jobId = 'job-001';

  beforeEach(() => {
    db = {
      translation_jobs: [
        {
          id: jobId,
          site_id: 'site-001',
          status: 'pending',
        },
      ],
      translation_segments: [
        {
          id: 'seg-1',
          job_id: jobId,
          source_lang: 'en',
          target_lang: 'es',
          segment_hash: 'hash-1',
          source_text: 'Hello world',
          translated_text: null,
        },
        {
          id: 'seg-2',
          job_id: jobId,
          source_lang: 'en',
          target_lang: 'fr',
          segment_hash: 'hash-2',
          source_text: 'Second phrase',
          translated_text: null,
        },
      ],
      translation_memory: [],
      job_queue: [
        {
          id: 1,
          job_id: jobId,
          processed: false,
        },
      ],
    };

    mockTranslateBatch.mockImplementation((texts: string[], targetLang: string) =>
      texts.map((text) => `${text} [${targetLang}]`),
    );

    mockUpsertTranslationMemory.mockImplementation((_entries: any[], client: any) =>
      client.from('translation_memory').upsert(_entries, {
        onConflict: 'site_id,segment_hash,target_lang',
      }),
    );

    mockCreateSupabaseServiceClient.mockReturnValue(createMockSupabaseClient(db));
  });

  afterEach(() => {
    mockUpsertTranslationMemory.mockImplementation((entries: any[], client: any) =>
      client.from('translation_memory').upsert(
        entries.map((entry) => ({
          site_id: entry.siteId,
          source_lang: entry.sourceLang,
          target_lang: entry.targetLang,
          segment_hash: entry.segmentHash,
          translated_text: entry.translatedText,
          created_at: new Date().toISOString(),
        })),
        { onConflict: 'site_id,segment_hash,target_lang' },
      ),
    ),
  });

    expect(db.translation_memory).toHaveLength(2);
    expect(db.translation_memory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ segment_hash: 'hash-1', target_lang: 'es' }),
        expect.objectContaining({ segment_hash: 'hash-2', target_lang: 'fr' }),
      ]),
    );

    expect(db.translation_jobs[0]).toMatchObject({ status: 'completed' });
    expect(db.job_queue[0]).toMatchObject({ processed: true });
  });
});
