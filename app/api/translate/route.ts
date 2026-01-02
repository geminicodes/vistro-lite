import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { segmentHTML, estimateTokens } from "@/lib/segmenter"
import { enqueueJob } from "@/lib/jobQueue"
import { log } from "@/lib/log"
import { isPrivateOrLocalhost } from "@/lib/ssrf-guard"
import { env } from "@/lib/env"
import { createSupabaseServiceClient } from "@/lib/supabaseServer"

// Force Node.js runtime (NOT edge)
export const runtime = "nodejs"

// Request validation schema
const TranslateRequestSchema = z
  .object({
    siteId: z.string().uuid("Invalid siteId format"),
    url: z.string().url("Invalid URL format").optional(),
    html: z.string().min(1, "HTML cannot be empty").optional(),
    targetLocales: z.array(z.string()).min(1, "At least one target locale required"),
  })
  .refine(
    (data) => {
      // Exactly one of url or html must be provided
      const hasUrl = !!data.url
      const hasHtml = !!data.html
      return hasUrl !== hasHtml // XOR: one true, one false
    },
    {
      message: "Provide exactly one of url or html, not both or neither",
      path: ["url"], // Show error on url field
    },
  )

// Environment configuration
const FETCH_TIMEOUT_MS = Number.parseInt(env.FETCH_TIMEOUT_MS || "5000", 10)
const MAX_HTML_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

/**
 * POST /api/translate
 * Main translation endpoint - validates, fetches, segments, and enqueues translation jobs
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  log.info("Translation request received", { requestId })

  try {
    // 1. Parse and validate request body
    const body = await request.json()
    const validation = TranslateRequestSchema.safeParse(body)

    if (!validation.success) {
      log.warn("Validation failed", {
        requestId,
        errors: validation.error.flatten(),
      })

      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { siteId, url, html, targetLocales } = validation.data

    const authHeader = request.headers.get("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      log.warn("Missing or invalid authorization header", { requestId })
      return NextResponse.json({ error: "Unauthorized - Bearer token required" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createSupabaseServiceClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      log.warn("Invalid user token", { requestId, error: authError?.message })
      return NextResponse.json({ error: "Unauthorized - Invalid token" }, { status: 401 })
    }

    log.info("User authenticated", { requestId, siteId, userId: user.id })

    // 3. Fetch HTML if URL provided
    let finalHtml: string

    if (url) {
      // SSRF protection
      if (isPrivateOrLocalhost(url)) {
        log.warn("SSRF attempt blocked", { requestId, url })

        return NextResponse.json({ error: "Invalid URL - private/internal addresses not allowed" }, { status: 400 })
      }

      log.info("Fetching HTML from URL", { requestId, url })

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const headResponse = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            "User-Agent": "Vistro-Lite/1.0",
          },
        })

        const contentLength = headResponse.headers.get("content-length")
        if (contentLength && Number.parseInt(contentLength, 10) > MAX_HTML_SIZE_BYTES) {
          clearTimeout(timeoutId)
          return NextResponse.json({ error: "HTML content exceeds 2MB limit" }, { status: 413 })
        }

        // Now fetch the actual content
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Vistro-Lite/1.0",
          },
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        finalHtml = await response.text()

        // Double-check size after download
        if (new TextEncoder().encode(finalHtml).length > MAX_HTML_SIZE_BYTES) {
          return NextResponse.json({ error: "HTML content exceeds 2MB limit" }, { status: 413 })
        }

        log.info("HTML fetched successfully", {
          requestId,
          size: finalHtml.length,
        })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          log.error("Fetch timeout", { requestId, url, timeout: FETCH_TIMEOUT_MS })

          return NextResponse.json({ error: `Request timeout after ${FETCH_TIMEOUT_MS}ms` }, { status: 504 })
        }

        log.error("Fetch failed", {
          requestId,
          url,
          error: error instanceof Error ? error.message : "Unknown error",
        })

        return NextResponse.json({ error: "Failed to fetch URL" }, { status: 502 })
      }
    } else {
      finalHtml = html!
      log.info("Using provided HTML", { requestId, size: finalHtml.length })
    }

    // 4. Segment HTML
    log.info("Segmenting HTML", { requestId })
    const segments = segmentHTML(finalHtml)
    const estimatedTokens = estimateTokens(segments)

    log.info("HTML segmented", {
      requestId,
      segmentCount: segments.length,
      estimatedTokens,
    })

    if (segments.length === 0) {
      return NextResponse.json({ error: "No translatable content found in HTML" }, { status: 400 })
    }

    const jobId = generateJobId()
    const htmlSummary = finalHtml.substring(0, 200)

    log.info("Creating translation job", {
      requestId,
      jobId,
      siteId,
      targetLocales,
      segmentCount: segments.length,
    })

    // Insert job
    const { error: jobError } = await supabase.from("translation_jobs").insert({
      id: jobId,
      site_id: siteId,
      source_url: url || null,
      html_summary: htmlSummary,
      target_locales: targetLocales,
      segment_count: segments.length,
      estimated_tokens: estimatedTokens,
      status: "pending",
      created_at: new Date().toISOString(),
    })

    if (jobError) {
      log.error("Failed to create job", { requestId, jobId, error: jobError.message })
      throw jobError
    }

    // Insert segments
    const segmentRows = segments.map((seg) => ({
      id: seg.id,
      job_id: jobId,
      content: seg.content,
      type: seg.type,
      position: seg.position,
      translations: {}, // Empty JSONB object initially
    }))

    const { error: segmentsError } = await supabase.from("translation_segments").insert(segmentRows)

    if (segmentsError) {
      log.error("Failed to create segments", { requestId, jobId, error: segmentsError.message })
      throw segmentsError
    }

    log.info("Database records created", { requestId, jobId })

    // 6. Enqueue job for background processing
    await enqueueJob(jobId, {
      siteId,
      targetLocales,
      segmentCount: segments.length,
    })

    log.info("Job enqueued successfully", { requestId, jobId })

    const durationMs = Date.now() - startTime
    log.info("Translation request metrics", {
      requestId,
      jobId,
      segmentsCount: segments.length,
      estimatedTokens,
      durationMs,
      status: "accepted",
    })

    // 7. Return success response
    return NextResponse.json(
      {
        success: true,
        jobId,
        segmentCount: segments.length,
        estimatedTokens,
        targetLocales,
        status: "pending",
      },
      { status: 202 }, // Accepted for processing
    )
  } catch (error) {
    log.error("Translation request failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: "Internal server error",
        requestId,
      },
      { status: 500 },
    )
  }
}

// Reject non-POST methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed - use POST" }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed - use POST" }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed - use POST" }, { status: 405 })
}

// Utility functions
function generateRequestId(): string {
  return crypto.randomUUID() // Use crypto.randomUUID() for proper uniqueness
}

function generateJobId(): string {
  return `job_${Date.now()}_${crypto.randomUUID().substring(0, 8)}` // Use crypto.randomUUID()
}
