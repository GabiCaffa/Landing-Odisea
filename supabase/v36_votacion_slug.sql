-- ════════════════════════════════════════════════════════════════════════════
-- v36 — Dirección propia para cada votación (/votacion/colonia)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Con dos votaciones a la vez (v35 ya lo permite: cada una tiene sus fotos y
-- cada persona tiene un voto POR votación) hace falta una URL para cada una,
-- que es lo que se pone en un anuncio o se manda por WhatsApp.
--
-- Una columna opcional, no una tabla: es un dato de cada votación. Sin
-- `slug`, la votación se abre igual por su id (/votacion/<uuid>), que no es
-- lindo pero anda: por eso correr esto no es obligatorio para tener dos.
--
-- Único (dos votaciones no pueden compartir dirección) y con formato fijo
-- (minúsculas, números y guiones): es parte de una URL.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contests
  add column if not exists slug text;

alter table public.contests
  drop constraint if exists contests_slug_formato;
alter table public.contests
  add constraint contests_slug_formato
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,39}$');

create unique index if not exists contests_slug_unico
  on public.contests(slug)
  where slug is not null;

comment on column public.contests.slug is
  'v36: dirección de la votación (/votacion/<slug>). NULL = se abre por su id.';

-- Verificación:
--   select title, slug from public.contests order by created_at;
