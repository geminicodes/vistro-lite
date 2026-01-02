import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabaseServer"
import { log } from "@/lib/log"
import { crypto } from "crypto"

// Force Node.js runtime
export const runtime = "nodejs"

interface JobWithSite {
  id: string
  site_id: string
  status: string
  target_locales: string[]
  segment_count: number
  sites: {
    user_id: string
  }
}

/**
 * GET /api/translate/[jobId]
 * Read-only endpoint for checking translation job progress
 * Safe for polling - returns only status and completed results
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ jobId: string }> }, // Next.js 16 requires Promise<params>
) {
  const params = await props.params
  const requestId = crypto.randomUUID() // Use crypto.randomUUID() for proper uniqueness
  const { jobId } = params

  log.info("Job status request received", { requestId, jobId })

  try {
    // 1. Authenticate user via Supabase Auth
    const authHeader = request.headers.get("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      log.warn("Missing or invalid authorization header", { requestId, jobId })
      return NextResponse.json({ error: "Unauthorized - Bearer token required" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createSupabaseServiceClient()

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      log.warn("Invalid user token", { requestId, jobId, error: authError?.message })
      return NextResponse.json({ error: "Unauthorized - Invalid token" }, { status: 401 })
    }

    log.info("User authenticated", { requestId, jobId, userId: user.id })

    // 2. Fetch job with site ownership validation
    const { data: job, error: jobError } = await supabase
      .from("translation_jobs")
      .select(
        `
        id,
        site_id,
        status,
        target_locales,
        segment_count,
        sites!inner(user_id)
      `,
      )
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      log.warn("Job not found or access denied", { requestId, jobId })
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const jobWithSite = job as unknown as JobWithSite

    if (jobWithSite.sites.user_id !== user.id) {
      log.warn("Unauthorized job access attempt", {
        requestId,
        jobId,
        userId: user.id,
      })
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    log.info("Job ownership validated", { requestId, jobId, status: jobWithSite.status })

    // 3. Build response based on job status
    const response: {
      status: string
      progress?: { completed: number; total: number }
      completed_html?: Record<string, string>
    } = {
      status: jobWithSite.status,
    }

    if (jobWithSite.status === "processing" || jobWithSite.status === "completed") {
      const { data: segments } = await supabase.from("translation_segments").select("translations").eq("job_id", jobId)

      if (segments) {
        // Count segments that have at least one translation
        const completedCount = segments.filter((s) => {
          const translations = s.translations as Record<string, string>
          return translations && Object.keys(translations).length > 0
        }).length

        response.progress = {
          completed: completedCount,
          total: jobWithSite.segment_count,
        }
      }
    }

    if (jobWithSite.status === "completed") {
      response.completed_html = {}

      for (const locale of jobWithSite.target_locales) {
        // Fetch segments with JSONB translations, reconstruct HTML properly
        const { data: segments } = await supabase
          .from("translation_segments")
          .select("content, translations, position, type")
          .eq("job_id", jobId)
          .order("position", { ascending: true })

        if (segments && segments.length > 0) {
          // Extract translations for this locale
          const translatedSegments = segments
            .map((seg) => {
              const translations = seg.translations as Record<string, string>
              return translations?.[locale] || seg.content // Fallback to original if missing
            })
            .join(" ") // Simple join - production would use proper HTML reconstruction

          response.completed_html[locale] = translatedSegments
        }
      }
    }

    log.info("Job status returned successfully", {
      requestId,
      jobId,
      status: jobWithSite.status,
      hasCompletedHtml: !!response.completed_html,
    })

    // 4. Return safe response (no raw segments or secrets)
    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    log.error("Job status request failed", {
      requestId,
      jobId,
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

export async function POST() {
  return NextResponse.json({ error: "Method not allowed - use GET" }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed - use GET" }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed - use GET" }, { status: 405 })
}

// Utility function
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}
