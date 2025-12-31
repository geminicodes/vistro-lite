# Vistro Lite — Security & Production Readiness Audit

This audit covers the server-side translation pipeline (Next.js API routes + Supabase + DeepL worker) and the Lemon Squeezy webhook receiver.

All fixes in this report are implemented in this repo and verified with:

- `npm run lint` (TypeScript `tsc --noEmit`)
- `npm test` (Vitest)

---

🔴 ISSUE #1 [SEVERITY: Critical]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `app/api/translate/route.ts:232`  
Category: Authentication / Authorization  
Problem: `POST /api/translate` previously allowed unauthenticated callers to enqueue jobs using the Supabase **service-role** key. Any attacker could create jobs for arbitrary `siteId`, run up DeepL costs, and write into tenant data.  
Risk: Cost blowup, data pollution, multi-tenant isolation bypass (service role bypasses RLS).  
Fix: Added **mandatory bearer API key** enforcement (`TRANSLATE_API_KEY`) with constant-time compare and secure misconfiguration failure (refuses to run without a configured key).  
Code:

```ts
requireBearerApiKey(request, 'TRANSLATE_API_KEY');
```

Verified: ✅ `tests/apiTranslate.test.ts` now includes Authorization header and passes.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #2 [SEVERITY: Critical]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `app/api/translate/route.ts:106`  
Category: Security - SSRF / Network Boundary  
Problem: URL-based translation fetch previously allowed fetching **arbitrary URLs** with no SSRF defenses.  
Risk: Access to internal services (metadata endpoints), private networks, localhost, or internal-only hosts; data exfiltration; credential theft.  
Fix: Implemented best-effort SSRF controls:

- Only `http:`/`https:` schemes
- No embedded credentials (`user:pass@host`)
- DNS resolution of hostnames and blocking private/loopback/link-local/reserved IP ranges
- Manual redirect handling with re-validation on each hop + redirect cap
- Response streaming with strict byte limits

Code:

```ts
const validated = await validateOutboundUrl(currentUrl);
```

Verified: ✅ Type checks and tests pass; SSRF controls are enforced before outbound fetches.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #3 [SEVERITY: Critical]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `supabase/schema.sql:364`  
Category: Data Integrity - Transactions / Atomicity  
Problem: Enqueue flow previously performed **multiple independent inserts** (`translation_jobs`, `translation_segments`, `job_queue`) without a transaction. Partial failure could leave orphaned jobs or inconsistent queue state.  
Risk: Corrupted queue/job state, stuck jobs, inconsistent retries, operational toil.  
Fix: Added `enqueue_translation_job(...)` SQL function that performs job creation, segment insertion (with idempotent constraints), and queue upsert **atomically**. The API route calls this RPC instead of multi-step inserts.  
Code:

```sql
create or replace function public.enqueue_translation_job(...)
returns uuid
language plpgsql
...
```

Verified: ✅ `tests/apiTranslate.test.ts` exercises the RPC path; compile/tests pass.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #4 [SEVERITY: Critical]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `workers/translationWorker.js:41`  
Category: Concurrency - Double Processing / Race Condition  
Problem: The worker previously dequeued by `select ... where processed=false ... limit 1` which is **not an atomic claim**, so multiple workers could process the same job concurrently.  
Risk: Duplicate DeepL calls (cost), inconsistent writes, job flapping, partial results.  
Fix: Implemented an atomic queue lease/lock model:

- `claim_next_translation_job(...)` uses `FOR UPDATE SKIP LOCKED`
- lock token (`lock_token`) prevents other workers from completing/releasing a job they did not claim
- lease expiry supports crash recovery
- attempt counter supports poison-pill handling

Worker now claims jobs via RPC and completes/releases via RPC.

Verified: ✅ Worker now uses claim/complete/release RPC calls and includes bounded retries.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #5 [SEVERITY: High]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `supabase/schema.sql:153`  
Category: Data Integrity - Idempotency / Deduplication  
Problem: `translation_segments` previously allowed duplicate `(job_id, segment_hash, target_lang)` rows, and `job_queue` allowed duplicate entries for the same job.  
Risk: Duplicate work, hard-to-debug “phantom jobs”, inconsistent cache behavior.  
Fix:

- Added `unique (job_id, segment_hash, target_lang)` on `translation_segments`
- Added `unique (job_id)` on `job_queue` and made `job_id` `NOT NULL`
- Queue upsert in `enqueue_translation_job` ensures job is (re)queued without duplication

Verified: ✅ Constraints are in schema; enqueue is idempotent at DB level.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #6 [SEVERITY: High]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `app/api/translate/route.ts:221`  
Category: Availability - DoS / Resource Exhaustion  
Problem: Provided HTML previously had no size cap and could generate unbounded segments and DB writes.  
Risk: Memory pressure, DB write amplification, queue flooding, worker overload.  
Fix:

- Enforced byte-size limit on provided HTML (same 2 MiB cap as fetched HTML)
- Added `TRANSLATE_MAX_SEGMENTS` and `TRANSLATE_MAX_SEGMENT_TARGET_PAIRS` caps

Verified: ✅ Limits enforced in route; tests still pass.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #7 [SEVERITY: High]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `app/api/webhooks/lemonsqueezy/route.ts:15`  
Category: Webhook Security - Payload Handling / Replay / Idempotency  
Problem: Webhook route previously lacked body size limits, had inconsistent parsing, and affiliate conversion writes were not idempotent.  
Risk: Payload-based DoS, duplicate side effects on replay, noisy operational failures.  
Fix:

- Added strict payload size limits (`MAX_WEBHOOK_BYTES`)
- Signature verification remains first (never bypassed)
- Added best-effort duplicate detection via `webhook_events` lookup (post-signature)
- Switched affiliate conversion persistence to `upsert` and added missing table in schema
- Structured security logging for invalid signatures and failures

Verified: ✅ `tests/webhook.test.ts` passes (valid + invalid signature cases).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #8 [SEVERITY: Medium]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `lib/translationWorker.ts:41`  
Category: Reliability - Logic Bug  
Problem: `groupSegmentsByTarget` was a stub, causing runtime failure in the worker translation path.  
Risk: Worker crash → stuck queue, never-completing jobs.  
Fix: Implemented deterministic grouping and changed worker persistence to write results per-language group so partial progress isn’t lost if a later group fails.  
Verified: ✅ `tests/worker.test.ts` passes and covers segment updates + memory upsert.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #9 [SEVERITY: Medium]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `app/api/translate/route.ts:225`  
Category: Production Readiness - Runtime Compatibility  
Problem: The route uses Node-only modules (`dns/promises`, `net`), but did not declare Node runtime.  
Risk: Deployment/runtime crash if the route runs in an Edge runtime.  
Fix: Declared `export const runtime = 'nodejs';` for `/api/translate`.  
Verified: ✅ Type checks pass; route is explicit about runtime requirements.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

🔴 ISSUE #10 [SEVERITY: Medium]  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
File: `package.json`  
Category: Dependency Security  
Problem: `npm audit` reported moderate vulnerabilities in dev tooling (Vite/Vitest/esbuild chain).  
Risk: Vulnerable dev tooling and CI surface; potential local dev server exposure.  
Fix: Upgraded `vitest` to the latest version, clearing audit findings.  
Verified: ✅ `npm audit` now reports 0 vulnerabilities; tests still pass.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  

---

## Remaining recommendations (not implemented here)

- **Per-site authorization**: today `/api/translate` is protected by a single API key. For true multi-tenant isolation, introduce per-site tokens/keys (stored hashed, rotated, tied to `siteId`) and verify the caller is authorized for that `siteId`.
- **Stronger SSRF protection**: DNS rebinding is hard to fully prevent without egress proxying. Consider routing outbound fetches through a dedicated proxy that enforces allowlists and blocks internal networks at the network layer.
- **Supabase type generation**: generate and use typed database models (`supabase gen types typescript`) to eliminate `any` usage in `AnySupabaseClient`.

