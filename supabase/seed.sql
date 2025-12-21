-- supabase/seed.sql
-- Run with: supabase db reset --linked
-- or: psql "$SUPABASE_DB_URL" -f supabase/seed.sql

-- Replace these IDs with real user/site identifiers for non-demo environments.
-- `demo-user-uuid` is a placeholder and should be swapped for a real auth user id.

insert into public.profiles (id, email)
values
  ('demo-user-uuid'::uuid, 'demo@example.com')
on conflict (id) do update
  set email = excluded.email;

insert into public.sites (id, owner, domain, name)
values
  (gen_random_uuid(), 'demo-user-uuid'::uuid, 'demo.vistro.local', 'Demo Site')
returning id as site_id
\gset

insert into public.site_locales (site_id, locale)
values
  (:site_id, 'es'),
  (:site_id, 'fr')
on conflict (site_id, locale) do nothing;

insert into public.translation_jobs (id, site_id, source_url, status)
values
  (gen_random_uuid(), :site_id, 'https://demo.vistro.local/about', 'completed')
returning id as job_id
\gset

insert into public.translation_segments (
  job_id,
  source_lang,
  target_lang,
  segment_hash,
  source_text,
  translated_text
)
values
  (:job_id, 'en', 'es', 'hash-segment-1', 'Welcome to our demo site.', 'Bienvenido a nuestro sitio de demostración.'),
  (:job_id, 'en', 'fr', 'hash-segment-2', 'Learn more about Vistro.', 'En savoir plus sur Vistro.')
on conflict do nothing;

-- Example translation memory seeded for quick testing.
insert into public.translation_memory (
  site_id,
  source_lang,
  target_lang,
  segment_hash,
  translated_text
)
values
  (:site_id, 'en', 'es', 'hash-segment-1', 'Bienvenido a nuestro sitio de demostración.'),
  (:site_id, 'en', 'fr', 'hash-segment-2', 'En savoir plus sur Vistro.')
on conflict (site_id, segment_hash, target_lang) do update
  set translated_text = excluded.translated_text,
      created_at = now();

-- Lemon Squeezy demo artifacts (optional).
insert into public.orders (profile_id, lemon_order_id, status, total_cents)
values ('demo-user-uuid'::uuid, 'demo-order-1', 'paid', 9900)
on conflict (lemon_order_id) do nothing;

insert into public.subscriptions (
  profile_id,
  lemon_subscription_id,
  status,
  plan_name,
  renews_at
)
values (
  'demo-user-uuid'::uuid,
  'demo-sub-1',
  'active',
  'Starter',
  now() + interval '30 days'
)
on conflict (lemon_subscription_id) do nothing;

insert into public.webhook_events (lemon_event_id, payload)
values ('demo-event-1', '{"type":"order.created","order_id":"demo-order-1"}'::jsonb)
on conflict (lemon_event_id) do nothing;
