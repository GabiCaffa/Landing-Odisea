-- ════════════════════════════════════════════════════════════════════════════
-- v37 — Álbumes de fotos por evento (banners "Fotos Halloween Colonia", etc.)
-- ════════════════════════════════════════════════════════════════════════════
--
-- La galería de v33 es una sola lista. Para cargar las fotos de UN evento
-- (cientos) hace falta agruparlas: cada álbum es un banner en la home, bajo
-- "Eventos anteriores", que abre su propia página (/fotos/<slug>).
--
-- · `gallery_albums`: el álbum (título, dirección, orden, activo).
-- · `gallery_items.album_id`: a qué álbum pertenece cada foto o video.
--   NULL = suelta, va al mosaico general de la home (como hasta ahora).
--   Borrar un álbum NO borra sus fotos: quedan sueltas (on delete set null).
--
-- Lectura pública, escritura `is_manager()` (admin y operador), igual que v33.
--
-- Se crean ya los dos álbumes de Halloween. Idempotente: se puede correr más de
-- una vez (no pisa títulos que el staff haya cambiado).
--
-- Pegar en el SQL Editor de Supabase. Requiere v33.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Los álbumes ─────────────────────────────────────────────────────────
create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  -- Dirección: /fotos/<slug>. Minúsculas, números y guiones.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  -- Sin la palabra "Fotos": el banner la agrega ("Fotos Halloween Colonia").
  title text not null check (char_length(title) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.gallery_albums is
  'v37: álbumes de fotos por evento (home → /fotos/<slug>). Lectura pública, escritura is_manager().';

alter table public.gallery_albums enable row level security;

drop policy if exists gallery_albums_select_public on public.gallery_albums;
create policy gallery_albums_select_public
  on public.gallery_albums for select
  using (true);

drop policy if exists gallery_albums_write_manager on public.gallery_albums;
create policy gallery_albums_write_manager
  on public.gallery_albums for all
  using (public.is_manager())
  with check (public.is_manager());

-- ─── 2) Cada foto, a su álbum ───────────────────────────────────────────────
alter table public.gallery_items
  add column if not exists album_id uuid references public.gallery_albums(id) on delete set null;

create index if not exists gallery_items_album_idx
  on public.gallery_items(album_id, sort_order)
  where album_id is not null;

comment on column public.gallery_items.album_id is
  'v37: álbum al que pertenece. NULL = suelta (mosaico general de la home).';

-- ─── 3) Los dos álbumes de Halloween ────────────────────────────────────────
insert into public.gallery_albums (slug, title, sort_order) values
  ('halloween-colonia',  'Halloween Colonia',  0),
  ('halloween-paysandu', 'Halloween Paysandú', 1)
on conflict (slug) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select slug, title, active from public.gallery_albums order by sort_order;
-- ════════════════════════════════════════════════════════════════════════════
