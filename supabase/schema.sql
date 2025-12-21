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
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
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
  target_lang text,
  segment_hash text,
  source_text text,
  translated_text text null,
  created_at timestamptz not null default now()
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
  job_id uuid references public.translation_jobs (id) on delete cascade,
  enqueued_at timestamptz not null default now(),
  processed boolean not null default false
);

create index if not exists job_queue_processed_idx on public.job_queue (processed);

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
