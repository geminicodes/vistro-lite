-- Vistro Database Schema
-- Complete schema with RLS policies for translation management and booking system

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
-- Stores user profile information linked to auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz default now() not null
);

comment on table public.profiles is 'User profiles linked to authentication';
comment on column public.profiles.id is 'References auth.users.id';
comment on column public.profiles.email is 'User email address, must be unique';

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS Policies: Users can view and update their own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- ============================================================================
-- SITES TABLE
-- ============================================================================
-- Stores website configurations for translation
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  domain text unique not null,
  name text not null,
  created_at timestamptz default now() not null
);

comment on table public.sites is 'Website configurations for translation services';
comment on column public.sites.owner is 'User who owns this site configuration';
comment on column public.sites.domain is 'Website domain, must be unique';

-- Indexes
create index idx_sites_owner on public.sites(owner);
create index idx_sites_domain on public.sites(domain);

-- Enable RLS
alter table public.sites enable row level security;

-- RLS Policies: Owners have full CRUD access
create policy "Owners can view their sites"
  on public.sites
  for select
  using (auth.uid() = owner);

create policy "Owners can insert sites"
  on public.sites
  for insert
  with check (auth.uid() = owner);

create policy "Owners can update their sites"
  on public.sites
  for update
  using (auth.uid() = owner);

create policy "Owners can delete their sites"
  on public.sites
  for delete
  using (auth.uid() = owner);

-- ============================================================================
-- SITE_LOCALES TABLE
-- ============================================================================
-- Stores target locales for each site
create table public.site_locales (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  locale text not null,
  created_at timestamptz default now() not null,
  unique(site_id, locale)
);

comment on table public.site_locales is 'Target translation locales for each site';
comment on column public.site_locales.locale is 'ISO language code (e.g., es, fr, de)';

-- Indexes
create index idx_site_locales_site_id on public.site_locales(site_id);
create index idx_site_locales_locale on public.site_locales(locale);

-- Enable RLS
alter table public.site_locales enable row level security;

-- Security definer function to check site ownership
create or replace function public.is_site_owner(_site_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sites
    where id = _site_id
      and owner = _user_id
  )
$$;

-- RLS Policies: Site owners have full CRUD access
create policy "Site owners can view locales"
  on public.site_locales
  for select
  using (public.is_site_owner(site_id, auth.uid()));

create policy "Site owners can insert locales"
  on public.site_locales
  for insert
  with check (public.is_site_owner(site_id, auth.uid()));

create policy "Site owners can update locales"
  on public.site_locales
  for update
  using (public.is_site_owner(site_id, auth.uid()));

create policy "Site owners can delete locales"
  on public.site_locales
  for delete
  using (public.is_site_owner(site_id, auth.uid()));

-- ============================================================================
-- TRANSLATION_JOBS TABLE
-- ============================================================================
-- Tracks translation jobs for content processing
create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  source_url text,
  status text default 'completed' not null,
  created_at timestamptz default now() not null
);

comment on table public.translation_jobs is 'Translation job tracking and history';
comment on column public.translation_jobs.source_url is 'Original URL that was translated';
comment on column public.translation_jobs.status is 'Job status: pending, processing, completed, failed';

-- Indexes
create index idx_translation_jobs_site_id on public.translation_jobs(site_id);
create index idx_translation_jobs_status on public.translation_jobs(status);

-- Enable RLS
alter table public.translation_jobs enable row level security;

-- RLS Policies: Site owners can view; service role can insert
create policy "Site owners can view translation jobs"
  on public.translation_jobs
  for select
  using (public.is_site_owner(site_id, auth.uid()));

-- Note: Insert policy is restricted to service role for API writes
-- This is handled at the application layer with service role key

-- ============================================================================
-- TRANSLATION_SEGMENTS TABLE
-- ============================================================================
-- Stores individual translated text segments
create table public.translation_segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.translation_jobs(id) on delete cascade,
  source_lang text not null,
  target_lang text not null,
  source_hash text not null,
  source_text text not null,
  translated_text text not null,
  created_at timestamptz default now() not null
);

comment on table public.translation_segments is 'Individual translated text segments per job';
comment on column public.translation_segments.source_hash is 'SHA-256 hash of source text for deduplication';

-- Indexes
create index idx_translation_segments_job_id on public.translation_segments(job_id);
create index idx_translation_segments_hash on public.translation_segments(source_hash);

-- Enable RLS
alter table public.translation_segments enable row level security;

-- Security definer function to check job ownership via site
create or replace function public.is_job_owner(_job_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.translation_jobs j
    join public.sites s on s.id = j.site_id
    where j.id = _job_id
      and s.owner = _user_id
  )
$$;

-- RLS Policies: Site owners can view segments
create policy "Site owners can view translation segments"
  on public.translation_segments
  for select
  using (public.is_job_owner(job_id, auth.uid()));

-- ============================================================================
-- TRANSLATION_MEMORY TABLE
-- ============================================================================
-- Caches translated segments for reuse across jobs
create table public.translation_memory (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  source_lang text not null,
  target_lang text not null,
  segment_hash text not null unique,
  translated_text text not null,
  created_at timestamptz default now() not null
);

comment on table public.translation_memory is 'Translation cache for segment reuse and consistency';
comment on column public.translation_memory.segment_hash is 'SHA-256 hash of source segment, globally unique';

-- Indexes
create index idx_translation_memory_site_id on public.translation_memory(site_id);
create index idx_translation_memory_hash on public.translation_memory(segment_hash);
create index idx_translation_memory_langs on public.translation_memory(source_lang, target_lang);

-- Enable RLS
alter table public.translation_memory enable row level security;

-- RLS Policies: Site owners can view cached translations
create policy "Site owners can view translation memory"
  on public.translation_memory
  for select
  using (public.is_site_owner(site_id, auth.uid()));

-- ============================================================================
-- BOOKINGS TABLE
-- ============================================================================
-- Stores appointment bookings with optional site association
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) on delete set null,
  name text not null,
  email text not null,
  slot timestamptz not null,
  timezone text not null,
  created_at timestamptz default now() not null
);

comment on table public.bookings is 'Appointment booking records';
comment on column public.bookings.site_id is 'Optional: associated site for booking tracking';
comment on column public.bookings.slot is 'Booked appointment time in UTC';
comment on column public.bookings.timezone is 'User timezone for the booking';

-- Indexes
create index idx_bookings_site_id on public.bookings(site_id);
create index idx_bookings_email on public.bookings(email);
create index idx_bookings_slot on public.bookings(slot);

-- Enable RLS
alter table public.bookings enable row level security;

-- Security definer function to get user email
create or replace function public.get_user_email(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where id = _user_id
$$;

-- RLS Policies: Anyone authenticated can insert; users can view their own bookings or bookings for their sites
create policy "Authenticated users can create bookings"
  on public.bookings
  for insert
  to authenticated
  with check (true);

create policy "Users can view their own bookings or site bookings"
  on public.bookings
  for select
  using (
    email = public.get_user_email(auth.uid())
    or public.is_site_owner(site_id, auth.uid())
  );

-- ============================================================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is 'Automatically creates a profile when a new user signs up';
