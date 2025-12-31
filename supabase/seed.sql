-- Vistro Seed Data
-- Demo data for testing and development

-- ============================================================================
-- DEMO PROFILE
-- ============================================================================
-- Note: In production, profiles are created via auth trigger
-- For testing, we insert a demo profile with a mock UUID
insert into public.profiles (id, email, created_at)
values 
  ('00000000-0000-0000-0000-000000000001', 'demo@vistro.app', now())
on conflict (id) do nothing;

-- ============================================================================
-- DEMO SITE
-- ============================================================================
insert into public.sites (id, owner, domain, name, created_at)
values 
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'demo.example.com', 'Demo Site', now())
on conflict (id) do nothing;

-- ============================================================================
-- DEMO SITE LOCALES
-- ============================================================================
insert into public.site_locales (site_id, locale, created_at)
values 
  ('10000000-0000-0000-0000-000000000001', 'es', now()),
  ('10000000-0000-0000-0000-000000000001', 'fr', now())
on conflict (site_id, locale) do nothing;

-- ============================================================================
-- DEMO TRANSLATION JOB
-- ============================================================================
insert into public.translation_jobs (id, site_id, source_url, status, created_at)
values 
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://demo.example.com/page', 'completed', now())
on conflict (id) do nothing;

-- ============================================================================
-- DEMO TRANSLATION SEGMENTS
-- ============================================================================
insert into public.translation_segments (job_id, source_lang, target_lang, source_hash, source_text, translated_text, created_at)
values 
  (
    '20000000-0000-0000-0000-000000000001',
    'en',
    'es',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'Welcome to our website',
    'Bienvenido a nuestro sitio web',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'en',
    'fr',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'Welcome to our website',
    'Bienvenue sur notre site web',
    now()
  )
on conflict (id) do nothing;

-- ============================================================================
-- DEMO TRANSLATION MEMORY
-- ============================================================================
-- Cache the translated segments for reuse
insert into public.translation_memory (site_id, source_lang, target_lang, segment_hash, translated_text, created_at)
values 
  (
    '10000000-0000-0000-0000-000000000001',
    'en',
    'es',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'Bienvenido a nuestro sitio web',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    'en',
    'fr',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'Bienvenue sur notre site web',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    'en',
    'es',
    'b3a8e0e1f9ab1bfe3a36f231f676f78bb30a519d2b21e6c530c0eee8ebb4a5d0',
    'Contact us for more information',
    'Contáctenos para más información',
    now()
  )
on conflict (segment_hash) do nothing;

-- ============================================================================
-- DEMO BOOKINGS
-- ============================================================================
insert into public.bookings (site_id, name, email, slot, timezone, created_at)
values 
  (
    '10000000-0000-0000-0000-000000000001',
    'John Doe',
    'john@example.com',
    now() + interval '2 days',
    'America/New_York',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    'Jane Smith',
    'jane@example.com',
    now() + interval '5 days',
    'Europe/London',
    now()
  )
on conflict (id) do nothing;
