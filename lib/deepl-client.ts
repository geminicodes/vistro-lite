/**
 * DeepL API client for batch translation
 * Handles authentication, request formatting, and response parsing
 */

import { env } from "@/lib/env"
import { log } from "@/lib/log"

interface TranslateOptions {
  targetLanguage: string
  sourceLanguage?: string
  formality?: "default" | "more" | "less"
}

interface DeepLTranslation {
  detected_source_language: string
  text: string
}

interface DeepLResponse {
  translations: DeepLTranslation[]
}

const MAX_BATCH_SIZE = 50

/**
 * Translates multiple text segments using DeepL API
 * Returns translations in the same order as input
 */
export async function translateBatch(texts: string[], options: TranslateOptions): Promise<string[]> {
  const apiKey = env.DEEPL_API_KEY

  if (!apiKey) {
    throw new Error("DEEPL_API_KEY environment variable not set")
  }

  if (texts.length > MAX_BATCH_SIZE) {
    log.info("Splitting large batch", { totalTexts: texts.length, batchSize: MAX_BATCH_SIZE })

    const results: string[] = []

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const chunk = texts.slice(i, i + MAX_BATCH_SIZE)
      const chunkResults = await translateBatchInternal(chunk, options, apiKey)
      results.push(...chunkResults)
    }

    return results
  }

  return translateBatchInternal(texts, options, apiKey)
}

/**
 * Internal function to translate a single batch (max 50 texts)
 */
async function translateBatchInternal(texts: string[], options: TranslateOptions, apiKey: string): Promise<string[]> {
  // DeepL API endpoint (Free vs Pro)
  const apiUrl = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate"

  // Prepare request body
  const body = new URLSearchParams()
  texts.forEach((text) => body.append("text", text))
  body.append("target_lang", options.targetLanguage.toUpperCase())

  if (options.sourceLanguage) {
    body.append("source_lang", options.sourceLanguage.toUpperCase())
  }

  if (options.formality) {
    body.append("formality", options.formality)
  }

  let response: Response
  try {
    // Make API call
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })
  } catch (error) {
    const networkError = new Error(
      `Network error calling DeepL API: ${error instanceof Error ? error.message : "Unknown error"}`,
    ) as Error & { status: number; isNetworkError: boolean }
    networkError.status = 0
    networkError.isNetworkError = true
    throw networkError
  }

  // Handle errors
  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(`DeepL API error ${response.status}: ${errorText}`) as Error & { status: number }
    error.status = response.status
    throw error
  }

  // Parse response
  const data: DeepLResponse = await response.json()

  if (!data || !data.translations || !Array.isArray(data.translations)) {
    throw new Error("DeepL API returned invalid response structure")
  }

  // Validate response length matches input
  if (data.translations.length !== texts.length) {
    throw new Error(
      `DeepL returned ${data.translations.length} translations but expected ${texts.length}. Possible data loss.`,
    )
  }

  const translations = data.translations.map((t, index) => {
    if (!t.text || typeof t.text !== "string") {
      throw new Error(`DeepL returned invalid translation at index ${index}`)
    }
    if (t.text.trim().length === 0) {
      throw new Error(`DeepL returned empty translation at index ${index}`)
    }
    return t.text
  })

  return translations
}
