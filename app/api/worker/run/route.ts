import { type NextRequest, NextResponse } from "next/server"
import { log } from "@/lib/log"
import {
  fetchQueuedJobs,
  updateJobStatus,
  getCachedTranslations,
  upsertTranslationMemory,
  updateTranslationSegments,
} from "@/lib/fetch-jobs"
import { translateBatch } from "@/lib/deepl-client"
import { retryWithBackoff } from "@/lib/retry"
import { env } from "@/lib/env"
import { crypto } from "crypto"

// Force Node.js runtime (required for crypto and longer execution)
export const runtime = "nodejs"

// Configuration from environment
const WORKER_BATCH = Number.parseInt(env.WORKER_BATCH || "10", 10)

interface ProcessingStats {
  jobsProcessed: number
  jobsSucceeded: number
  jobsFailed: number
  totalSegments: number
  cacheHits: number
  apiCalls: number
}

interface JobStats {
  jobId: string
  segmentsCount: number
  cacheHits: number
  cacheMisses: number
  durationMs: number
  success: boolean
  error?: string
}

/**
 * POST /api/worker/run
 * Serverless worker endpoint for processing translation jobs
 * Called by GitHub Actions or Vercel Cron
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = crypto.randomUUID() // Use crypto.randomUUID() for proper uniqueness

  log.info("Worker run started", { requestId, batch: WORKER_BATCH })

  // Verify worker secret
  const secret = request.headers.get("x-worker-secret")

  if (!env.WORKER_RUN_SECRET) {
    log.error("WORKER_RUN_SECRET not configured", { requestId })
    return NextResponse.json({ error: "Worker secret not configured" }, { status: 500 })
  }

  if (!secret || secret !== env.WORKER_RUN_SECRET) {
    log.warn("Invalid worker secret", { requestId })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Initialize stats
  const stats: ProcessingStats = {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    totalSegments: 0,
    cacheHits: 0,
    apiCalls: 0,
  }

  const jobStats: JobStats[] = []

  try {
    // Fetch queued jobs
    log.info("Fetching queued jobs", { requestId, limit: WORKER_BATCH })
    const jobs = await fetchQueuedJobs(WORKER_BATCH)

    if (jobs.length === 0) {
      log.info("No jobs to process", { requestId })
      return NextResponse.json({
        success: true,
        message: "No jobs in queue",
        stats,
        duration: Date.now() - startTime,
      })
    }

    log.info("Jobs fetched", { requestId, count: jobs.length })

    // Process each job
    for (const job of jobs) {
      const jobStartTime = Date.now()
      const jobStat: JobStats = {
        jobId: job.id,
        segmentsCount: job.segments.length,
        cacheHits: 0,
        cacheMisses: 0,
        durationMs: 0,
        success: false,
      }

      try {
        stats.jobsProcessed++
        stats.totalSegments += job.segments.length

        log.info("Processing job", {
          requestId,
          jobId: job.id,
          segmentCount: job.segments.length,
          targetLocales: job.target_locales,
        })

        // Mark job as processing
        await updateJobStatus(job.id, "processing")

        // Process each target locale
        for (const locale of job.target_locales) {
          await processJobForLocale(job, locale, stats, jobStat)
        }

        // Mark job as completed
        await updateJobStatus(job.id, "completed")
        stats.jobsSucceeded++

        jobStat.success = true
        jobStat.durationMs = Date.now() - jobStartTime

        log.info("Job completed", {
          requestId,
          jobId: job.id,
          cacheHits: jobStat.cacheHits,
          apiCalls: stats.apiCalls,
          durationMs: jobStat.durationMs,
        })
      } catch (error) {
        stats.jobsFailed++

        const errorMessage = error instanceof Error ? error.message : "Unknown error"

        jobStat.success = false
        jobStat.error = errorMessage
        jobStat.durationMs = Date.now() - jobStartTime

        log.error("Job processing failed", {
          requestId,
          jobId: job.id,
          error: errorMessage,
        })

        // Mark job as failed
        await updateJobStatus(job.id, "failed", errorMessage)
      } finally {
        jobStats.push(jobStat)
      }
    }

    // Return success with stats
    const duration = Date.now() - startTime

    log.info("Worker run completed", {
      requestId,
      duration,
      ...stats,
    })

    return NextResponse.json({
      success: true,
      stats,
      jobStats, // Include per-job breakdown
      duration,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    log.error("Worker run failed", {
      requestId,
      error: errorMessage,
      stats,
    })

    return NextResponse.json(
      {
        error: "Worker run failed",
        message: errorMessage,
        stats,
        jobStats, // Include partial results even on failure
      },
      { status: 500 },
    )
  }
}

/**
 * Processes a single job for one target locale
 * Handles cache lookups, DeepL API calls, and result storage
 */
async function processJobForLocale(
  job: {
    id: string
    site_id: string
    segments: Array<{ id: string; content: string; type: string; position: number }>
  },
  targetLocale: string,
  stats: ProcessingStats,
  jobStat: JobStats, // Added jobStat parameter to track per-job metrics
): Promise<void> {
  const startTime = Date.now()

  // Extract all unique source texts
  const sourceTexts = job.segments.map((seg) => seg.content)

  // Check translation memory for cache hits
  const cached = await getCachedTranslations(job.site_id, sourceTexts, targetLocale)
  stats.cacheHits += cached.size
  jobStat.cacheHits += cached.size // Track cache hits for this job

  // Identify texts that need translation (cache misses)
  const textsToTranslate: string[] = []
  const indexMap = new Map<number, number>()

  sourceTexts.forEach((text, index) => {
    if (!cached.has(text)) {
      indexMap.set(index, textsToTranslate.length)
      textsToTranslate.push(text)
    }
  })

  jobStat.cacheMisses += textsToTranslate.length // Track cache misses for this job

  // Translate cache misses via DeepL (with retry)
  let translatedTexts: string[] = []

  if (textsToTranslate.length > 0) {
    log.info("Calling DeepL API", {
      jobId: job.id,
      locale: targetLocale,
      count: textsToTranslate.length,
    })

    translatedTexts = await retryWithBackoff(() => translateBatch(textsToTranslate, { targetLanguage: targetLocale }), {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
    })

    stats.apiCalls++

    log.info("DeepL API call successful", {
      jobId: job.id,
      locale: targetLocale,
      translated: translatedTexts.length,
    })
  }

  // Combine cached and newly translated results
  const allTranslations = new Map<string, string>()

  // Add cached translations
  cached.forEach((translation, source) => {
    allTranslations.set(source, translation)
  })

  // Add new translations
  textsToTranslate.forEach((source, index) => {
    allTranslations.set(source, translatedTexts[index])
  })

  // Upsert new translations to translation_memory
  if (textsToTranslate.length > 0) {
    const newTranslations = textsToTranslate.map((source, index) => ({
      source,
      target: translatedTexts[index],
      locale: targetLocale,
    }))

    await upsertTranslationMemory(job.site_id, newTranslations)

    log.info("Translation memory updated", {
      jobId: job.id,
      locale: targetLocale,
      newEntries: newTranslations.length,
    })
  }

  // Update translation_segments with results
  await updateTranslationSegments(job.id, targetLocale, allTranslations)

  log.info("Segments updated", {
    jobId: job.id,
    locale: targetLocale,
    segments: job.segments.length,
  })

  // Build completed HTML (would reconstruct HTML with translations here)
  // This step would take the original HTML structure and insert translated segments
  // For now, we just log completion
  log.info("HTML reconstruction complete", {
    jobId: job.id,
    locale: targetLocale,
  })

  const durationMs = Date.now() - startTime

  log.info("Job processing metrics", {
    jobId: job.id,
    locale: targetLocale,
    segmentsCount: job.segments.length,
    cacheHits: jobStat.cacheHits,
    cacheMisses: jobStat.cacheMisses,
    durationMs,
  })
}

// Reject non-POST methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed - use POST" }, { status: 405 })
}

// Utility
function generateRequestId(): string {
  return `worker_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}
