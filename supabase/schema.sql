-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · Setup completo de Supabase
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar todo este archivo en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── TABLA: profiles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  first_name   text not null,
  last_name    text not null,
  birth_date   date not null,
  document_id  text not null unique,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_created_at_idx on public.profiles(created_at desc);

-- ─── TABLA: events ──────────────────────────────────────────────────────────
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  date            date not null,
  location        text not null,
  description     text not null default '',
  price           numeric(10, 2) not null default 0,
  capacity        integer not null default 0,
  status          text not null default 'activo' check (status in ('activo', 'agotado', 'finalizado')),
  sale_ends_at    timestamptz,
  image_url       text,
  image_position  jsonb not null default '{"x":50,"y":50,"scale":1,"fit":"cover"}'::jsonb,
  instagram_url   text,
  created_at      timestamptz not null default now()
);

-- Para tablas ya existentes (create table if not exists no agrega columnas nuevas):
alter table public.events add column if not exists sale_ends_at timestamptz;

create index if not exists events_date_idx on public.events(date);
create index if not exists events_status_idx on public.events(status);

-- ─── HELPER: is_admin() ─────────────────────────────────────────────────────
-- SECURITY DEFINER evita recursión infinita en políticas RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ─── RLS: habilitar ─────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.events   enable row level security;

-- ─── RLS: profiles ──────────────────────────────────────────────────────────
drop policy if exists "profiles_select_own"   on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_self"  on public.profiles;
drop policy if exists "profiles_update_own"   on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

create policy "profiles_select_own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_insert_self"  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on public.profiles for update using (auth.uid() = id);
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());
create policy "profiles_delete_admin" on public.profiles for delete using (public.is_admin());

-- ─── RLS: events ────────────────────────────────────────────────────────────
drop policy if exists "events_select_public" on public.events;
drop policy if exists "events_insert_admin"  on public.events;
drop policy if exists "events_update_admin"  on public.events;
drop policy if exists "events_delete_admin"  on public.events;

create policy "events_select_public" on public.events for select using (true);
create policy "events_insert_admin"  on public.events for insert with check (public.is_admin());
create policy "events_update_admin"  on public.events for update using (public.is_admin());
create policy "events_delete_admin"  on public.events for delete using (public.is_admin());

-- ─── STORAGE: bucket de imágenes de eventos ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "event_images_select_public" on storage.objects;
drop policy if exists "event_images_insert_admin"  on storage.objects;
drop policy if exists "event_images_update_admin"  on storage.objects;
drop policy if exists "event_images_delete_admin"  on storage.objects;

create policy "event_images_select_public" on storage.objects
  for select using (bucket_id = 'event-images');

create policy "event_images_insert_admin" on storage.objects
  for insert with check (bucket_id = 'event-images' and public.is_admin());

create policy "event_images_update_admin" on storage.objects
  for update using (bucket_id = 'event-images' and public.is_admin());

create policy "event_images_delete_admin" on storage.objects
  for delete using (bucket_id = 'event-images' and public.is_admin());

-- ─── REALTIME: publicar tablas ──────────────────────────────────────────────
-- Para que la home se sincronice en vivo cuando el admin edita.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.profiles;

-- ─── SEED: 3 eventos iniciales (sin imagen, las subís desde el panel) ───────
insert into public.events (name, date, location, description, price, capacity, status, instagram_url)
values
  ('ODISEA NUEVA HELVECIA', '2026-06-13', 'Club Artesano',     'Odisea Nueva Helvecia te espera...', 450, 500, 'activo', 'https://www.instagram.com/odisea.uy/'),
  ('ODISEA COLONIA',        '2026-06-20', 'Colonia Soho',      'Odisea Colonia te espera',            350, 400, 'activo', 'https://www.instagram.com/odisea.uy/'),
  ('ODISEA CARMELO',        '2026-06-20', 'Club Union Carmelo','Odisea Carmelo te espera',            250, 300, 'activo', 'https://www.instagram.com/odisea.uy/')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
-- 1) Andá a /registro en la app y creá tu cuenta normalmente.
-- 2) En el Dashboard de Supabase → SQL Editor, ejecutá:
--      update public.profiles set role = 'admin' where email = 'tu@email.com';
-- 3) Cerrá sesión y volvé a entrar para que se refresque el rol.
-- 4) Listo: ya tenés acceso al panel /admin.
-- ════════════════════════════════════════════════════════════════════════════
