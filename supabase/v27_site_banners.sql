-- ════════════════════════════════════════════════════════════════════════════
-- v27 — Banners del hero (slider de la home)
-- ════════════════════════════════════════════════════════════════════════════
--
-- El hero de la home pasa a ser un slider de banners que carga el staff. Hoy
-- son 3, de 1920×600.
--
-- ─── Por qué SÍ una tabla, cuando el cartel de §6.0 fue una clave suelta ────
--
-- Un banner no es un valor: son varias filas, con orden entre ellas, cada una
-- con su imagen, su texto alternativo y su link. Eso es exactamente lo que
-- `site_settings` no sabe hacer. La regla que viene siguiendo el proyecto es
-- la misma de siempre: un valor global va a `site_settings` (v19), una lista
-- ordenada va a su tabla.
--
-- ─── El interruptor sí va a site_settings ───────────────────────────────────
--
-- Clave `hero` = 'clasico' | 'banners'. Va aparte de la tabla y no como un
-- "¿hay banners activos?" por el mismo motivo operativo de v19: se pueden
-- cargar los tres, mirarlos, y recién ahí prenderlo — y apagarlo en 5 segundos
-- si a las 3 de la mañana se ve mal en un celular, sin borrar nada.
--
-- ─── Escritura sólo admin ───────────────────────────────────────────────────
--
-- El hero es LO PRIMERO que ve cualquiera que entra. Va con el mismo criterio
-- que `site_settings` y `payment_accounts` en v22: el operador gestiona el
-- contenido del sitio (eventos, entradas, promos) pero no la cara pública.
-- Si algún día se quiere que el operador suba banners, se cambia esta política
-- por `is_manager()` y no hay nada más que tocar.
--
-- ─── Las imágenes van al bucket que ya existe ───────────────────────────────
--
-- `event-images` (público), bajo el prefijo `banners/`. Un bucket nuevo
-- significa políticas nuevas de `storage.objects` para ganar exactamente nada:
-- un banner es tan público como el flyer de un evento.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ────────────────────────────────────────────────────────────
create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),

  -- Imagen de escritorio. 1920×600 (16:5) es el formato acordado.
  image_url text not null,

  -- Imagen de celular, OPCIONAL. Un 1920×600 en un teléfono de 375 px mide
  -- 117 px de alto: una franja fina donde antes había un hero de pantalla
  -- completa. Con una versión vertical (1080×1350) el hero sigue siendo un
  -- hero. Sin ella se muestra el de escritorio a su proporción real, que es
  -- feo pero honesto: recortarlo a ciegas corta justo lo que el diseñador
  -- puso en los costados.
  image_url_mobile text,

  -- Para lectores de pantalla y para cuando la imagen no carga. No es
  -- decoración: el hero puede ser el único contenido de la primera pantalla.
  alt text not null default '',

  -- A dónde lleva al tocarlo. Vacío = no es un link.
  link_url text,

  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.site_banners is
  'v27: banners del slider del hero. Lectura pública, escritura sólo admin.';
comment on column public.site_banners.image_url_mobile is
  'v27: versión vertical opcional (1080×1350). Sin ella se usa la de escritorio.';

-- Lo que consulta la home: los activos, en orden.
create index if not exists site_banners_activos_idx
  on public.site_banners(active, sort_order)
  where active;

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
alter table public.site_banners enable row level security;

-- Lectura pública: la home tiene que poder pintar el hero antes de que nadie
-- inicie sesión. Mismo criterio que `site_settings` (v19).
drop policy if exists site_banners_select_public on public.site_banners;
create policy site_banners_select_public
  on public.site_banners for select
  using (true);

drop policy if exists site_banners_write_admin on public.site_banners;
create policy site_banners_write_admin
  on public.site_banners for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 3) Realtime ────────────────────────────────────────────────────────────
-- Para que prender o reordenar los banners se vea sin recargar, igual que el
-- tema (v19). `add table` falla si ya está en la publicación, de ahí el bloque.
do $$
begin
  alter publication supabase_realtime add table public.site_banners;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- sin la publicación, no es un error
end;
$$;

-- ─── 4) El interruptor ──────────────────────────────────────────────────────
-- No se siembra ningún valor: sin la fila, `src/lib/siteSettings.ts` cae en
-- 'clasico' y la home queda exactamente como está. Prenderlo es una decisión
-- que se toma desde el panel con los banners ya cargados y mirados.

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select sort_order, active, alt, image_url, image_url_mobile
--   from public.site_banners order by sort_order;
--
-- select * from public.site_settings where key = 'hero';
--
-- Para apagar el slider desde SQL (el panel lo hace con un click):
--   update public.site_settings set value = 'clasico' where key = 'hero';
-- ════════════════════════════════════════════════════════════════════════════
