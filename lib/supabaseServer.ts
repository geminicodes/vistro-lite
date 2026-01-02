/**
 * SERVER-ONLY Supabase Client
 *
 * WARNING: This file uses the service role key which bypasses Row Level Security (RLS).
 * NEVER import this file in client components or pages.
 * Only use in:
 * - API routes (app/api/*)
 * - Server Actions
 * - Server Components (with caution)
 *
 * @example
 * \`\`\`typescript
 * import { createSupabaseServiceClient } from '@/lib/supabaseServer'
 *
 * export async function POST(request: Request) {
 *   const supabase = createSupabaseServiceClient()
 *   const { data, error } = await supabase
 *     .from('translation_jobs')
 *     .select('*')
 *     .eq('status', 'pending')
 *
 *   if (error) throw error
 *   return Response.json(data)
 * }
 * \`\`\`
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"

/**
 * Creates a Supabase client with service role access.
 *
 * This client has full database access and bypasses Row Level Security.
 * Use with extreme caution and only in trusted server-side contexts.
 *
 * @throws {Error} If required environment variables are missing
 * @returns {SupabaseClient} Supabase client with service role privileges
 */
export function createSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = env.SUPABASE_URL
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error(
      "Missing SUPABASE_URL environment variable. " + "Add it to your .env.local or Vercel project settings.",
    )
  }

  if (!supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. " +
        "Add it to your .env.local or Vercel project settings. " +
        "WARNING: Never use SUPABASE_ANON_KEY here - service role key is required.",
    )
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
