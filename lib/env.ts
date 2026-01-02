/**
 * SERVER-ONLY Environment Validator
 *
 * This module validates all required environment variables on startup.
 * If any required variable is missing, the app will fail immediately with a clear error.
 *
 * WARNING: NEVER import this in client components.
 * Only use in server-side code:
 * - API routes (app/api/*)
 * - Server Actions
 * - Server Components
 * - Other lib/* server utilities
 *
 * @example
 * \`\`\`typescript
 * import { env } from '@/lib/env'
 *
 * const apiKey = env.DEEPL_API_KEY
 * const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
 * \`\`\`
 */

/**
 * Validates that a required environment variable exists.
 * Throws a descriptive error if missing.
 *
 * @param key - The environment variable name
 * @param description - Human-readable description for error messages
 * @returns The environment variable value
 * @throws {Error} If the environment variable is not set
 */
function requireEnv(key: string, description: string): string {
  const value = process.env[key]

  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Description: ${description}\n` +
        `Action: Add ${key} to your .env.local file or Vercel project settings.\n` +
        `Deployment will fail until this is resolved.`,
    )
  }

  return value
}

/**
 * Retrieves an optional environment variable.
 *
 * @param key - The environment variable name
 * @returns The environment variable value or undefined
 */
function optionalEnv(key: string): string | undefined {
  const value = process.env[key]
  return value && value.trim() !== "" ? value : undefined
}

// Validate all environment variables on module load (fail-fast)
const SUPABASE_URL = requireEnv("SUPABASE_URL", "Supabase project URL (e.g., https://xyz.supabase.co)")

const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  "Supabase service role key with full database access (bypasses RLS)",
)

const DEEPL_API_KEY = requireEnv("DEEPL_API_KEY", "DeepL API key for translation services")

const WORKER_RUN_SECRET = requireEnv("WORKER_RUN_SECRET", "Secret token for authenticating worker endpoint requests")

const LEMONSQUEEZY_WEBHOOK_SECRET = requireEnv(
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LemonSqueezy webhook secret for signature verification",
)

// Optional environment variables
const TOKEN_ENC_KEY = optionalEnv("TOKEN_ENC_KEY")

/**
 * Validated environment variables.
 *
 * All required variables are guaranteed to be non-empty strings.
 * Optional variables may be undefined.
 *
 * This object is safe to use throughout server-side code without additional validation.
 */
export const env = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DEEPL_API_KEY,
  WORKER_RUN_SECRET,
  LEMONSQUEEZY_WEBHOOK_SECRET,
  TOKEN_ENC_KEY,
} as const

/**
 * Type-safe environment variables for TypeScript consumers.
 */
export type ServerEnv = typeof env
