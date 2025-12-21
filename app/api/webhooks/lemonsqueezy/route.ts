'use server';

import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServiceClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Set `LEMONSQUEEZY_WEBHOOK_SECRET` in your environment to validate webhook
 * signatures. Never expose this value to the client.
 */

const orderCreatedSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      status: z.string().optional(),
      customer_email: z.string().email().optional(),
      product_id: z.union([z.number(), z.string()]),
      total_amount: z.union([z.number(), z.string()]),
    }),
    meta: z
      .object({
        custom_data: z
          .record(z.any())
          .optional()
          .default(undefined),
      })
      .optional(),
  }),
});

const subscriptionCreatedSchema = z.object({
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

const toInteger = (value: number | string | null | undefined): number => {
  if (value == null) {
    throw new Error('Missing numeric value.');
  }

  const parsed =
    typeof value === 'number' ? value : Number.parseInt(value.toString(), 10);

  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid numeric value.');
  }

  return parsed;
};

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

  try {
    await supabase
      .from('affiliate_conversions')
      .insert({
        site_id: siteId ?? null,
        affiliate_code: affiliateCode ?? null,
        lemon_order_id: lemonOrderId,
      });
  } catch (error) {
    console.warn(
      '[LemonSqueezy] Failed to record affiliate conversion:',
      error instanceof Error ? error.message : error,
    );
  }
};

const persistWebhookEvent = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  eventName: string,
  payload: unknown,
): Promise<void> => {
  const eventId = (() => {
    try {
      return eventIdSchema.parse(payload).data.id;
    } catch {
      return crypto.randomUUID();
    }
  })();

  const sanitizedPayload = (() => {
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
  })();

  await supabase
    .from('webhook_events')
    .upsert(
      {
        lemon_event_id: eventId,
        payload: sanitizedPayload,
      },
      { onConflict: 'lemon_event_id', returning: 'minimal' },
    );
};

const handleOrderCreated = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = orderCreatedSchema.parse(payload);
  const { id, attributes, meta } = parsed.data;
  const totalCents = toInteger(attributes.total_amount);
  const status = attributes.status ?? 'paid';

  const { error } = await supabase
    .from('orders')
    .upsert(
      {
        lemon_order_id: id,
        status,
        total_cents: totalCents,
      },
      { onConflict: 'lemon_order_id', returning: 'minimal' },
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
  const parsed = orderCreatedSchema.parse(payload);
  const { id } = parsed.data;

  const { error } = await supabase
    .from('orders')
    .update({ status: 'refunded' })
    .eq('lemon_order_id', id);

  if (error) {
    throw new Error(`Failed to update refunded order: ${error.message}`);
  }
};

const handleSubscriptionCreated = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = subscriptionCreatedSchema.parse(payload);
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
      { onConflict: 'lemon_subscription_id', returning: 'minimal' },
    );

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
};

const handleSubscriptionCanceled = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: unknown,
): Promise<void> => {
  const parsed = subscriptionCreatedSchema.parse(payload);
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
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured. Set LEMONSQUEEZY_WEBHOOK_SECRET.' },
      { status: 500 },
    );
  }

  const signature = request.headers.get('x-signature') ?? '';
  const eventNameHeader = request.headers.get('x-event-name');

  if (!eventNameHeader) {
    return NextResponse.json({ error: 'Missing x-event-name header.' }, { status: 400 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to parse JSON payload.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();
  const event = eventNameHeader.toLowerCase();

  try {
    switch (event) {
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
        console.warn(`[LemonSqueezy] Unsupported event received: ${event}`);
        break;
    }

    await persistWebhookEvent(supabase, event, payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
