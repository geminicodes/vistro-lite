'use server';

import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { info, warn } from '../../../../lib/log';
import { getClientIpHint, getRequestId } from '../../../../lib/security';
import { createSupabaseServiceClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 256 * 1024; // 256 KiB

const orderEventSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      status: z.string().optional(),
      customer_email: z.string().email().optional(),
      product_id: z.union([z.number(), z.string()]).optional(),
      total_amount: z.union([z.number(), z.string()]).optional(),
    }),
    meta: z
      .object({
        custom_data: z.record(z.unknown()).optional(),
      })
      .optional(),
  }),
});

const subscriptionEventSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      status: z.string().optional(),
      plan_name: z.string().optional(),
      renews_at: z.union([z.string(), z.null()]).optional(),
    }),
  }),
});

const eventIdSchema = z.object({
  data: z.object({
    id: z.string(),
  }),
});

const safeCompare = (computed: string, received: string): boolean => {
  const computedBuffer = Buffer.from(computed, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (computedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, receivedBuffer);
};

const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  const digest = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return safeCompare(digest, signature);
};

const toInteger = (value: number | string | null | undefined): number => {
  if (value == null) {
    throw new Error('Missing numeric value.');
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(value.toString(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid numeric value.');
  }
  return parsed;
};

const getEventId = (payload: unknown): string =>
  (() => {
    try {
      return eventIdSchema.parse(payload).data.id;
    } catch {
      return crypto.randomUUID();
    }
  })();

const sanitizePayload = (eventName: string, payload: unknown): Record<string, unknown> => {
  if (typeof payload !== 'object' || payload === null) {
    return { event: eventName };
  }

  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const attributes = (data?.attributes as Record<string, unknown> | undefined) ?? {};

  return {
    event: eventName,
    id: data?.id ?? null,
    status: attributes.status ?? null,
    product_id: attributes.product_id ?? null,
    plan_name: attributes.plan_name ?? null,
  };
};

const persistWebhookEvent = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  eventName: string,
  eventId: string,
  payload: unknown,
): Promise<void> => {
  const sanitizedPayload = sanitizePayload(eventName, payload);

  const { error } = await supabase
    .from('webhook_events')
    .upsert(
      {
        lemon_event_id: eventId,
        event_name: eventName,
        payload: sanitizedPayload,
      },
      { onConflict: 'lemon_event_id' },
    );

  if (error) {
    throw new Error(`Failed to persist webhook event: ${error.message}`);
  }
};

const recordAffiliateConversion = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  customData: Record<string, unknown> | undefined,
  lemonOrderId: string,
): Promise<void> => {
  if (!customData) {
    return;
  }

  const siteId = typeof customData.siteId === 'string' ? customData.siteId : undefined;
  const affiliateCode =
    typeof customData.affiliate_code === 'string' ? customData.affiliate_code : undefined;

  if (!siteId && !affiliateCode) {
    return;
  }

  const { error } = await supabase
    .from('affiliate_conversions')
    .upsert(
      {
        site_id: siteId ?? null,
        affiliate_code: affiliateCode ?? null,
        lemon_order_id: lemonOrderId,
      },
      { onConflict: 'lemon_order_id' },
    );

  if (error) {
    // Non-critical: do not block webhook processing on affiliate tracking.
    warn('[LemonSqueezy] Failed to record affiliate conversion', {
      lemonOrderId,
      error: error.message,
    });
  }
};

const handleOrderCreated = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = orderEventSchema.parse(payload);
  const { id, attributes, meta } = parsed.data;

  const totalCents = toInteger(attributes.total_amount);
  const status = attributes.status ?? 'paid';

  const { error } = await supabase
    .from('orders')
    .upsert(
      { lemon_order_id: id, status, total_cents: totalCents },
      { onConflict: 'lemon_order_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert order: ${error.message}`);
  }

  await recordAffiliateConversion(
    supabase,
    meta?.custom_data as Record<string, unknown> | undefined,
    id,
  );
};

const handleOrderRefunded = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = orderEventSchema.parse(payload);
  const { id } = parsed.data;

  const { error } = await supabase.from('orders').update({ status: 'refunded' }).eq('lemon_order_id', id);
  if (error) {
    throw new Error(`Failed to update refunded order: ${error.message}`);
  }
};

const handleSubscriptionCreated = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = subscriptionEventSchema.parse(payload);
  const { id, attributes } = parsed.data;

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        lemon_subscription_id: id,
        status: attributes.status ?? 'active',
        plan_name: attributes.plan_name ?? null,
        renews_at: attributes.renews_at ?? null,
      },
      { onConflict: 'lemon_subscription_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
};

const handleSubscriptionCanceled = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = subscriptionEventSchema.parse(payload);
  const { id } = parsed.data;

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('lemon_subscription_id', id);

  if (error) {
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
};

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const ipHint = getClientIpHint(request);

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'misconfigured', message: 'Webhook secret not configured.' } },
      { status: 500 },
    );
  }

  const eventNameHeader = request.headers.get('x-event-name')?.trim();
  const signature = request.headers.get('x-signature') ?? '';

  if (!eventNameHeader) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Missing x-event-name header.' } },
      { status: 400 },
    );
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'Webhook payload too large.' } },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'Webhook payload too large.' } },
      { status: 413 },
    );
  }

  if (!verifySignature(rawBody, signature, secret)) {
    warn('[LemonSqueezy] Invalid signature', { requestId, ip: ipHint });
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Invalid signature.' } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: error instanceof Error ? error.message : 'Unable to parse JSON.' } },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();
  const eventName = eventNameHeader.toLowerCase();
  const eventId = getEventId(payload);

  // Best-effort replay/idempotency guard (events are also written via upsert).
  const { count, error: seenError } = await supabase
    .from('webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('lemon_event_id', eventId);

  if (seenError) {
    warn('[LemonSqueezy] Failed to check idempotency', { requestId, eventId, error: seenError.message });
  } else if ((count ?? 0) > 0) {
    info('[LemonSqueezy] Duplicate event received (ignored)', { requestId, eventId, eventName });
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    switch (eventName) {
      case 'order.created':
        await handleOrderCreated(supabase, payload);
        break;
      case 'order.refunded':
        await handleOrderRefunded(supabase, payload);
        break;
      case 'subscription.created':
        await handleSubscriptionCreated(supabase, payload);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(supabase, payload);
        break;
      default:
        warn('[LemonSqueezy] Unsupported event received', { requestId, eventId, eventName });
        break;
    }

    await persistWebhookEvent(supabase, eventName, eventId, payload);
  } catch (error) {
    warn('[LemonSqueezy] Webhook processing failed', {
      requestId,
      eventId,
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: { code: 'internal', message: error instanceof Error ? error.message : 'Webhook processing failed.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
