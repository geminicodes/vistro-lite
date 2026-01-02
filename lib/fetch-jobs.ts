import { createSupabaseServiceClient } from "@/lib/supabaseServer"
import { log } from "@/lib/log"

/**
 * Database utilities for fetching and processing translation jobs
 */

interface TranslationSegment {
  id: string
  job_id: string
  content: string
  type: "text" | "attribute"
  position: number
  translations: Record<string, string> // JSONB field: { "fr": "Bonjour", "es": "Hola" }
}

interface TranslationJob {
  id: string
  site_id: string
  source_url: string | null
  html_summary: string
  target_locales: string[]
  segment_count: number
  estimated_tokens: number
  status: "pending" | "processing" | "completed" | "failed"
  created_at: string
  segments: TranslationSegment[]
}

/**
 * Fetches queued translation jobs with their segments
 * Returns jobs with status='pending', ordered by creation time
 */
export async function fetchQueuedJobs(limit: number): Promise<TranslationJob[]> {
  const supabase = createSupabaseServiceClient()

  const { data: jobs, error } = await supabase
    .from("translation_jobs")
    .select(
      `
      *,
      segments:translation_segments(*)
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    log.error("Failed to fetch queued jobs", { error: error.message })
    throw error
  }

  return (jobs || []) as TranslationJob[]
}

/**
 * Updates job status
 */
export async function updateJobStatus(
  jobId: string,
  status: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { error } = await supabase
    .from("translation_jobs")
    .update({
      status,
      error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)

  if (error) {
    log.error("Failed to update job status", { jobId, status, error: error.message })
    throw error
  }
}

/**
 * Checks translation memory for cache hits
 */
export async function getCachedTranslations(
  siteId: string,
  texts: string[],
  targetLocale: string,
): Promise<Map<string, string>> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from("translation_memory")
    .select("source_text, translated_text")
    .eq("site_id", siteId)
    .eq("target_locale", targetLocale)
    .in("source_text", texts)

  if (error) {
    log.error("Failed to fetch cached translations", { siteId, targetLocale, error: error.message })
    throw error
  }

  return new Map((data || []).map((row) => [row.source_text, row.translated_text]))
}

/**
 * Upserts translations into translation_memory
 */
export async function upsertTranslationMemory(
  siteId: string,
  translations: Array<{ source: string; target: string; locale: string }>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const rows = translations.map((t) => ({
    site_id: siteId,
    source_text: t.source,
    translated_text: t.target,
    target_locale: t.locale,
    created_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from("translation_memory").upsert(rows, {
    onConflict: "site_id,source_text,target_locale",
  })

  if (error) {
    log.error("Failed to upsert translation memory", { siteId, count: translations.length, error: error.message })
    throw error
  }
}

/**
 * Updates translation segments with completed translations
 * Stores translations in JSONB field keyed by locale
 */
export async function updateTranslationSegments(
  jobId: string,
  locale: string,
  translations: Map<string, string>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  // Fetch all segments for this job
  const { data: segments, error: fetchError } = await supabase
    .from("translation_segments")
    .select("id, content, translations")
    .eq("job_id", jobId)

  if (fetchError) {
    log.error("Failed to fetch segments for update", { jobId, error: fetchError.message })
    throw fetchError
  }

  if (!segments) return

  // Update each segment's translations JSONB field
  for (const segment of segments) {
    const translation = translations.get(segment.content)
    if (!translation) continue

    // Merge new translation into existing JSONB
    const updatedTranslations = {
      ...(segment.translations || {}),
      [locale]: translation,
    }

    const { error: updateError } = await supabase
      .from("translation_segments")
      .update({ translations: updatedTranslations })
      .eq("id", segment.id)

    if (updateError) {
      log.error("Failed to update segment translation", { segmentId: segment.id, error: updateError.message })
      throw updateError
    }
  }

  log.info("Updated translation segments", { jobId, locale, count: segments.length })
}
