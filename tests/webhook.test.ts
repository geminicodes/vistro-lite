import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../app/api/webhooks/lemonsqueezy/route';

type TableName = 'orders' | 'subscriptions' | 'webhook_events' | 'affiliate_conversions';

interface MockDb {
  orders: any[];
  subscriptions: any[];
  webhook_events: any[];
  affiliate_conversions: any[];
}

const { mockCreateSupabaseServiceClient } = vi.hoisted(() => ({
  mockCreateSupabaseServiceClient: vi.fn(),
}));
 
vi.mock('../lib/supabaseServer', () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
}));

const createMockSupabaseClient = (db: MockDb) => ({
  from(table: TableName) {
    return {
      upsert(payload: any, options?: { onConflict?: string }) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const conflictKeys = options?.onConflict?.split(',').map((key) => key.trim()) ?? [];

        for (const row of rows) {
          if (conflictKeys.length === 0) {
            db[table].push(clone(row));
            continue;
          }

          const matchIndex = db[table].findIndex((existing) =>
            conflictKeys.every((key) => existing[key] === row[key]),
          );

          if (matchIndex >= 0) {
            db[table][matchIndex] = { ...db[table][matchIndex], ...clone(row) };
          } else {
            db[table].push(clone(row));
          }
        }

        return Promise.resolve({ data: rows, error: null });
      },
      insert(payload: any) {
        const rows = Array.isArray(payload) ? payload : [payload];
        db[table].push(...rows.map(clone));
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

describe('Lemon Squeezy webhook route', () => {
  let db: MockDb;

  beforeEach(() => {
    db = {
      orders: [],
      subscriptions: [],
      webhook_events: [],
      affiliate_conversions: [],
    };
    mockCreateSupabaseServiceClient.mockReturnValue(createMockSupabaseClient(db));
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'test-secret';
  });

  afterEach(() => {
    mockCreateSupabaseServiceClient.mockReset();
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  });

  const createRequest = (body: object, signature?: string) => {
    const rawBody = JSON.stringify(body);
    const computedSignature =
      signature ??
      createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '')
        .update(rawBody, 'utf8')
        .digest('hex');

    return new Request('http://localhost/api/webhooks/lemonsqueezy', {
      method: 'POST',
      body: rawBody,
      headers: {
        'x-event-name': 'order.created',
        'x-signature': computedSignature,
        'content-type': 'application/json',
      },
    });
  };

  it('returns 200 and upserts order on valid signature', async () => {
    const payload = {
      data: {
        id: 'order_123',
        attributes: {
          status: 'paid',
          customer_email: 'demo@example.com',
          product_id: 1,
          total_amount: 9900,
        },
        meta: {
          custom_data: {
            siteId: 'site-uuid',
            affiliate_code: 'AFF123',
          },
        },
      },
    };

    const response = await POST(createRequest(payload));
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]).toMatchObject({
      lemon_order_id: 'order_123',
      status: 'paid',
      total_cents: 9900,
    });
    expect(db.webhook_events).toHaveLength(1);
    expect(db.webhook_events[0].payload).toMatchObject({
      event: 'order.created',
      id: 'order_123',
      status: 'paid',
    });
    expect(db.affiliate_conversions).toHaveLength(1);
    expect(db.affiliate_conversions[0]).toMatchObject({
      site_id: 'site-uuid',
      affiliate_code: 'AFF123',
      lemon_order_id: 'order_123',
    });
  });

  it('returns 401 on invalid signature', async () => {
    const payload = {
      data: {
        id: 'order_456',
        attributes: {
          product_id: 2,
          total_amount: 1000,
        },
      },
    };

    const response = await POST(createRequest(payload, 'invalid-signature'));

    expect(response.status).toBe(401);
    expect(db.orders).toHaveLength(0);
    expect(db.webhook_events).toHaveLength(0);
  });
});
