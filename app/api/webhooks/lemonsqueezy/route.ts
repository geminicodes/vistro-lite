import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { env } from "@/lib/env"

export const runtime = "nodejs"

interface LemonSqueezyOrder {
  id: string
  store_id: number
  customer_id: number
  identifier: string
  order_number: number
  user_name: string
  user_email: string
  currency: string
  currency_rate: string
  subtotal: number
  discount_total: number
  tax: number
  total: number
  subtotal_usd: number
  discount_total_usd: number
  tax_usd: number
  total_usd: number
  tax_name: string
  tax_rate: string
  status: string
  status_formatted: string
  refunded: number
  refunded_at: string | null
  created_at: string
  updated_at: string
}

interface WebhookPayload {
  meta: {
    event_name: string
    custom_data?: Record<string, unknown>
  }
  data: LemonSqueezyOrder
}

/**
 * Verifies the HMAC-SHA256 signature from LemonSqueezy
 * Uses timing-safe comparison to prevent timing attacks
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  // Remove "sha256=" prefix if present
  const cleanSignature = signature.startsWith("sha256=") ? signature.slice(7) : signature

  // Compute expected signature
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(payload)
  const expectedSignature = hmac.digest("hex")

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expectedSignature))
  } catch {
    // Buffers are different lengths
    return false
  }
}

/**
 * Upserts an order into the database (idempotent)
 * In production, this would use Supabase or your database
 */
async function upsertOrder(order: LemonSqueezyOrder): Promise<void> {
  // TODO: Replace with actual database call
  // Example with Supabase:
  // const supabase = createServerClient(...)
  // await supabase.from('orders').upsert({
  //   id: order.id,
  //   store_id: order.store_id,
  //   customer_id: order.customer_id,
  //   order_number: order.order_number,
  //   user_email: order.user_email,
  //   user_name: order.user_name,
  //   currency: order.currency,
  //   total: order.total,
  //   total_usd: order.total_usd,
  //   status: order.status,
  //   created_at: order.created_at,
  //   updated_at: order.updated_at,
  // }, { onConflict: 'id' })

  console.log("[v0] Order upserted:", {
    id: order.id,
    email: order.user_email,
    total: order.total_usd,
    status: order.status,
  })
}

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body BEFORE any JSON parsing
    const rawBody = await request.text()

    // 2. Extract signature and event name from headers
    const signature = request.headers.get("x-signature")
    const eventName = request.headers.get("x-event-name")

    if (!signature) {
      return NextResponse.json({ error: "Missing x-signature header" }, { status: 401 })
    }

    if (!eventName) {
      return NextResponse.json({ error: "Missing x-event-name header" }, { status: 400 })
    }

    // 3. Verify signature BEFORE parsing JSON
    const webhookSecret = env.LEMONSQUEEZY_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error("[v0] LEMONSQUEEZY_WEBHOOK_SECRET not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    const isValid = verifySignature(rawBody, signature, webhookSecret)

    if (!isValid) {
      console.warn("[v0] Invalid webhook signature received")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // 4. Signature verified - now safe to parse JSON
    let payload: WebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch (error) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    // 5. Handle events
    switch (eventName) {
      case "order_created":
        await upsertOrder(payload.data)
        console.log("[v0] Order created:", payload.data.id)
        break

      default:
        console.log("[v0] Unhandled event:", eventName)
        // Return 200 for unhandled events (prevents retries)
        break
    }

    // 6. Return success
    return NextResponse.json({ received: true, event: eventName }, { status: 200 })
  } catch (error) {
    console.error("[v0] Webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
