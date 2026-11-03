-- ════════════════════════════════════════════════════════════════════════════
-- v38 — Álbum con link externo (carpeta de Adobe Creative Cloud)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las fotos de un evento pueden vivir afuera de la web (por ejemplo en una
-- carpeta compartida de Adobe Creative Cloud). Si el álbum tiene `link_url`, su
-- banner en la home abre ese link en otra pestaña en vez de /fotos/<slug>, y el
-- álbum no necesita tener fotos cargadas.
--
-- Sólo se aceptan links https. Idempotente. Requiere v37.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.gallery_albums
  add column if not exists link_url text;

alter table public.gallery_albums
  drop constraint if exists gallery_albums_link_https;
alter table public.gallery_albums
  add constraint gallery_albums_link_https
  check (link_url is null or link_url ~ '^https://[^[:space:]]+$');

comment on column public.gallery_albums.link_url is
  'v38: link externo (https) de las fotos. Si existe, el banner abre este link en vez de /fotos/<slug>.';

-- Verificación:
-- select slug, title, link_url from public.gallery_albums order by sort_order;
