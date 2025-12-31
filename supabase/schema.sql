-- supabase/schema.sql
-- Migration helpers:
--   supabase db push --linked
--   or psql "$SUPABASE_DB_URL" -f supabase/schema.sql
-- RLS reference: https://supabase.com/docs/guides/auth/row-level-security

create extension if not exists "pgcrypto";

-- 1. profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by owner" on public.profiles
  for select
  using (auth.uid() = id);

create policy "Profiles are editable by owner" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. sites ------------------------------------------------------------------
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  domain text unique,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists sites_owner_idx on public.sites (owner);

alter table public.sites enable row level security;

create policy "Site owners manage their sites" on public.sites
  for insert
  with check (auth.uid() = owner);

create policy "Site owners can read their sites" on public.sites
  for select
  using (auth.uid() = owner);

create policy "Site owners can update their sites" on public.sites
  for update
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

create policy "Site owners can delete their sites" on public.sites
  for delete
  using (auth.uid() = owner);

-- 3. site_locales -----------------------------------------------------------
create table if not exists public.site_locales (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  locale text not null,
  created_at timestamptz not null default now(),
  unique (site_id, locale)
);

create index if not exists site_locales_site_id_idx on public.site_locales (site_id);

alter table public.site_locales enable row level security;

create policy "Site locales inherit site ownership for insert" on public.site_locales
  for insert
  with check (
    exists (
      select 1
      from public.sites s
      where s.id = site_locales.site_id
        and s.owner = auth.uid()
    )
  );

create policy "Site owners read locales" on public.site_locales
  for select
  using (
    exists (
      select 1
      from public.sites s
      where s.id = site_locales.site_id
        and s.owner = auth.uid()
    )
  );

create policy "Site owners update locales" on public.site_locales
  for update
  using (
    exists (
      select 1
      from public.sites s
      where s.id = site_locales.site_id
        and s.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sites s
      where s.id = site_locales.site_id
        and s.owner = auth.uid()
    )
  );

create policy "Site owners delete locales" on public.site_locales
  for delete
  using (
    exists (
      select 1
      from public.sites s
      where s.id = site_locales.site_id
        and s.owner = auth.uid()
    )
  );

-- 4. translation_jobs -------------------------------------------------------
create table if not exists public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  source_url text,
  idempotency_key text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  last_error text null,
  requested_segments integer null,
  translated_segments integer not null default 0,
  unique (site_id, idempotency_key),
  constraint translation_jobs_status_check check (status in ('pending', 'processing', 'completed', 'failed'))
);

create index if not exists translation_jobs_site_id_idx on public.translation_jobs (site_id);

alter table public.translation_jobs enable row level security;

create policy "Site owners read their translation jobs" on public.translation_jobs
  for select
  using (
    exists (
      select 1
      from public.sites s
      where s.id = translation_jobs.site_id
        and s.owner = auth.uid()
    )
  );

create policy "Service role manages translation jobs" on public.translation_jobs
  for all
  to service_role
  using (true)
  with check (true);

-- 5. translation_segments ---------------------------------------------------
create table if not exists public.translation_segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.translation_jobs (id) on delete cascade,
  source_lang text,
  target_lang text not null,
  segment_hash text not null,
  source_text text not null,
  translated_text text null,
  created_at timestamptz not null default now(),
  unique (job_id, segment_hash, target_lang)
);

create index if not exists translation_segments_job_id_idx on public.translation_segments (job_id);

alter table public.translation_segments enable row level security;

create policy "Site owners read their translation segments" on public.translation_segments
  for select
  using (
    exists (
      select 1
      from public.translation_jobs tj
      join public.sites s on s.id = tj.site_id
      where tj.id = translation_segments.job_id
        and s.owner = auth.uid()
    )
  );

create policy "Service role manages translation segments" on public.translation_segments
  for all
  to service_role
  using (true)
  with check (true);

-- 6. translation_memory -----------------------------------------------------
create table if not exists public.translation_memory (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  source_lang text,
  target_lang text,
  segment_hash text,
  translated_text text,
  created_at timestamptz not null default now(),
  unique (site_id, segment_hash, target_lang)
);

create index if not exists translation_memory_site_id_idx on public.translation_memory (site_id);
create index if not exists translation_memory_hash_idx on public.translation_memory (segment_hash);

alter table public.translation_memory enable row level security;

create policy "Site owners read their translation memory" on public.translation_memory
  for select
  using (
    exists (
      select 1
      from public.sites s
      where s.id = translation_memory.site_id
        and s.owner = auth.uid()
    )
  );

create policy "Service role manages translation memory" on public.translation_memory
  for all
  to service_role
  using (true)
  with check (true);

-- 7. job_queue --------------------------------------------------------------
create table if not exists public.job_queue (
  id serial primary key,
  job_id uuid not null references public.translation_jobs (id) on delete cascade,
  enqueued_at timestamptz not null default now(),
  processed boolean not null default false,
  processed_at timestamptz null,
  attempts integer not null default 0,
  locked_at timestamptz null,
  locked_by text null,
  lease_expires_at timestamptz null,
  lock_token uuid null,
  last_error text null,
  unique (job_id)
);

create index if not exists job_queue_processed_idx on public.job_queue (processed);
create index if not exists job_queue_lease_idx on public.job_queue (lease_expires_at);

alter table public.job_queue enable row level security;

create policy "Site owners see their queued jobs" on public.job_queue
  for select
  using (
    exists (
      select 1
      from public.translation_jobs tj
      join public.sites s on s.id = tj.site_id
      where tj.id = job_queue.job_id
        and s.owner = auth.uid()
    )
  );

create policy "Service role manages job queue" on public.job_queue
  for all
  to service_role
  using (true)
  with check (true);

-- 8. Lemon Squeezy integration tables --------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  lemon_order_id text unique,
  status text not null default 'pending',
  total_cents integer,
  created_at timestamptz not null default now()
);

create index if not exists orders_profile_idx on public.orders (profile_id);

alter table public.orders enable row level security;

create policy "Order owners read their orders" on public.orders
  for select
  using (auth.uid() = profile_id);

create policy "Order owners insert their orders" on public.orders
  for insert
  with check (auth.uid() = profile_id);

create policy "Service role manages orders" on public.orders
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  lemon_subscription_id text unique,
  status text not null default 'active',
  plan_name text,
  renews_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_profile_idx on public.subscriptions (profile_id);

alter table public.subscriptions enable row level security;

create policy "Subscription owners read their subscriptions" on public.subscriptions
  for select
  using (auth.uid() = profile_id);

create policy "Service role manages subscriptions" on public.subscriptions
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  lemon_event_id text unique,
  event_name text,
  payload jsonb,
  received_at timestamptz not null default now()
);

create index if not exists webhook_events_received_idx on public.webhook_events (received_at desc);

alter table public.webhook_events enable row level security;

create policy "Service role manages webhook events" on public.webhook_events
  for all
  to service_role
  using (true)
  with check (true);

-- (Optional) Bookings table guidance ---------------------------------------
-- If a `bookings` table exists, replicate policy patterns:
--   - allow authenticated users to insert their own bookings
--   - allow site owners to select bookings tied to their site_id
-- See https://supabase.com/docs/guides/auth/row-level-security for examples.

-- 9. Affiliate conversions (optional but referenced by webhook route) -------
create table if not exists public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites (id) on delete cascade,
  affiliate_code text,
  lemon_order_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_conversions_site_id_idx on public.affiliate_conversions (site_id);

alter table public.affiliate_conversions enable row level security;

create policy "Service role manages affiliate conversions" on public.affiliate_conversions
  for all
  to service_role
  using (true)
  with check (true);

-- 10. Queue & worker RPC helpers --------------------------------------------

create or replace function public.enqueue_translation_job(
  p_site_id uuid,
  p_source_url text,
  p_idempotency_key text,
  p_segments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if jsonb_typeof(p_segments) is distinct from 'array' then
    raise exception 'p_segments must be a JSON array';
  end if;

  insert into public.translation_jobs (site_id, source_url, idempotency_key, status, requested_segments, translated_segments)
  values (p_site_id, p_source_url, nullif(p_idempotency_key, ''), 'pending', jsonb_array_length(p_segments), 0)
  on conflict (site_id, idempotency_key)
  do update set
    source_url = excluded.source_url,
    requested_segments = excluded.requested_segments,
    translated_segments = 0
  returning id into v_job_id;

  insert into public.translation_segments (job_id, source_lang, target_lang, segment_hash, source_text)
  select
    v_job_id,
    coalesce((seg->>'source_lang')::text, 'auto'),
    (seg->>'target_lang')::text,
    (seg->>'segment_hash')::text,
    (seg->>'source_text')::text
  from jsonb_array_elements(p_segments) as seg
  on conflict (job_id, segment_hash, target_lang) do nothing;

  insert into public.job_queue (job_id, processed, enqueued_at)
  values (v_job_id, false, now())
  on conflict (job_id)
  do update set
    processed = false,
    processed_at = null,
    enqueued_at = excluded.enqueued_at,
    locked_at = null,
    locked_by = null,
    lease_expires_at = null,
    lock_token = null,
    last_error = null;

  return v_job_id;
end;
$$;

create or replace function public.claim_next_translation_job(
  p_worker_id text,
  p_lease_seconds integer
)
returns table(job_id uuid, lock_token uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception 'p_lease_seconds must be > 0';
  end if;

  with claimed as (
    update public.job_queue jq
    set
      locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lock_token = gen_random_uuid(),
      attempts = jq.attempts + 1
    where jq.id = (
      select id
      from public.job_queue
      where processed = false
        and (lease_expires_at is null or lease_expires_at < now())
      order by enqueued_at asc
      for update skip locked
      limit 1
    )
    returning jq.job_id, jq.lock_token, jq.attempts
  )
  update public.translation_jobs tj
  set status = 'processing',
      started_at = coalesce(tj.started_at, now()),
      last_error = null
  where tj.id in (select job_id from claimed);

  return query
  select claimed.job_id, claimed.lock_token, claimed.attempts from claimed;
end;
$$;

create or replace function public.claim_translation_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns table(job_id uuid, lock_token uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    raise exception 'p_job_id is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception 'p_lease_seconds must be > 0';
  end if;

  with claimed as (
    update public.job_queue jq
    set
      locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lock_token = gen_random_uuid(),
      attempts = jq.attempts + 1
    where jq.job_id = p_job_id
      and jq.processed = false
      and (jq.lease_expires_at is null or jq.lease_expires_at < now())
    returning jq.job_id, jq.lock_token, jq.attempts
  )
  update public.translation_jobs tj
  set status = 'processing',
      started_at = coalesce(tj.started_at, now()),
      last_error = null
  where tj.id in (select job_id from claimed);

  return query
  select claimed.job_id, claimed.lock_token, claimed.attempts from claimed;
end;
$$;

create or replace function public.release_translation_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.job_queue
  set
    locked_at = null,
    locked_by = null,
    lease_expires_at = now() - interval '1 second',
    lock_token = null,
    last_error = left(coalesce(p_error, ''), 2000)
  where job_id = p_job_id
    and lock_token = p_lock_token
    and processed = false;

  get diagnostics updated_count = row_count;

  update public.translation_jobs
  set
    status = 'pending',
    last_error = left(coalesce(p_error, ''), 2000)
  where id = p_job_id;

  return updated_count = 1;
end;
$$;

create or replace function public.complete_translation_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.job_queue
  set
    processed = true,
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    lease_expires_at = null,
    lock_token = null,
    last_error = left(coalesce(p_error, ''), 2000)
  where job_id = p_job_id
    and lock_token = p_lock_token
    and processed = false;

  get diagnostics updated_count = row_count;

  if p_success then
    update public.translation_jobs
    set
      status = 'completed',
      completed_at = now(),
      failed_at = null,
      last_error = null
    where id = p_job_id;
  else
    update public.translation_jobs
    set
      status = 'failed',
      failed_at = now(),
      last_error = left(coalesce(p_error, ''), 2000)
    where id = p_job_id;
  end if;

  return updated_count = 1;
end;
$$;

grant execute on function public.enqueue_translation_job(uuid, text, text, jsonb) to service_role;
grant execute on function public.claim_next_translation_job(text, integer) to service_role;
grant execute on function public.claim_translation_job(uuid, text, integer) to service_role;
grant execute on function public.release_translation_job(uuid, uuid, text) to service_role;
grant execute on function public.complete_translation_job(uuid, uuid, boolean, text) to service_role;
