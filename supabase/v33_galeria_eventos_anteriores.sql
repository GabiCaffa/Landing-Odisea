-- ════════════════════════════════════════════════════════════════════════════
-- v33 — Galería de eventos anteriores (fotos y videos)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Una sección de la home, bajo Promociones, con fotos y videos de fiestas que
-- ya pasaron. La carga el staff desde el panel (pestaña Galería).
--
-- ─── Tabla, y por qué no `site_settings` ────────────────────────────────────
-- Son varias filas ordenadas, cada una con su archivo y su epígrafe: la misma
-- regla de v27 (un valor global va a `site_settings`, una lista ordenada va a
-- su tabla).
--
-- ─── Un bucket propio (`gallery`), a diferencia de v27 ──────────────────────
-- Los banners se guardaron en `event-images` porque un bucket nuevo "era
-- ganar nada". Acá sí se gana: los videos pesan decenas de MB y `event-images`
-- es el bucket de los flyers, de modo que:
--   · se le pone un tope de tamaño y una lista de tipos propios, sin tocar la
--     configuración con la que ya funcionan los flyers;
--   · si algún día hay que limpiar o migrar los videos, es una carpeta aparte.
-- Es PÚBLICO (igual que un flyer: el sitio los muestra a cualquiera).
--
-- ⚠ Además del tope del bucket hay uno GLOBAL del proyecto (Supabase →
-- Storage → Settings → "Upload file size limit"; en el plan gratuito 50 MB).
-- El bucket acepta hasta 50 MB; si el global es menor, manda el global.
--
-- ─── Escritura: admin y operador (`is_manager()`, v22) ──────────────────────
-- Es contenido que se carga a diario, como los banners (v30).
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ────────────────────────────────────────────────────────────
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  -- Archivo en el bucket `gallery`.
  url text not null,
  -- Sólo videos: un cuadro suelto (JPG) para mostrar en la grilla sin bajar el
  -- video. Opcional: sin él, el navegador muestra el primer cuadro del video.
  poster_url text,
  -- Texto corto que se ve sobre la miniatura ("Halloween 2025 · Colonia").
  caption text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.gallery_items is
  'v33: fotos y videos de eventos anteriores (home, bajo Promociones). Lectura pública, escritura is_manager().';

create index if not exists gallery_items_activos_idx
  on public.gallery_items(active, sort_order)
  where active;

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
alter table public.gallery_items enable row level security;

drop policy if exists gallery_items_select_public on public.gallery_items;
create policy gallery_items_select_public
  on public.gallery_items for select
  using (true);

drop policy if exists gallery_items_write_manager on public.gallery_items;
create policy gallery_items_write_manager
  on public.gallery_items for all
  using (public.is_manager())
  with check (public.is_manager());

-- ─── 3) El bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery', 'gallery', true,
  52428800, -- 50 MB
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Subir, reemplazar y BORRAR: a diferencia de los flyers, acá sí se borra
-- (un video de 40 MB que quedó huérfano ocupa lugar en el plan).
drop policy if exists "gallery_insert_manager" on storage.objects;
drop policy if exists "gallery_update_manager" on storage.objects;
drop policy if exists "gallery_delete_manager" on storage.objects;

create policy "gallery_insert_manager" on storage.objects
  for insert with check (bucket_id = 'gallery' and public.is_manager());
create policy "gallery_update_manager" on storage.objects
  for update using (bucket_id = 'gallery' and public.is_manager())
  with check (bucket_id = 'gallery' and public.is_manager());
create policy "gallery_delete_manager" on storage.objects
  for delete using (bucket_id = 'gallery' and public.is_manager());

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select id, public, file_size_limit from storage.buckets where id = 'gallery';
-- select polname from pg_policy
--  where polrelid in ('public.gallery_items'::regclass, 'storage.objects'::regclass)
--    and polname like 'gallery%';
-- ════════════════════════════════════════════════════════════════════════════
