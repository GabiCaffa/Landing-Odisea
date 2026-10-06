-- ════════════════════════════════════════════════════════════════════════════
-- v30 — El operador carga banners y edita el cartel de las tarjetas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta v29 los banners (v27) y los ajustes del sitio (v19) eran sólo del admin:
-- el hero y el aspecto del sitio son lo primero que ve cualquiera. Para una
-- web que vende con anuncios, eso deja el cambio diario de banners y del cartel
-- ("15% OFF SOLO WEB") colgando de una sola cuenta. Esta migración los abre al
-- operador, y sólo a eso:
--
-- 1) BANNERS → `is_manager()` (admin u operador), con el mismo criterio que v22
--    aplicó a eventos, entradas y promos. Las imágenes ya las puede subir: el
--    bucket `event-images` admite insert/update del manager desde v22.
--
-- 2) CARTEL → sólo la fila `cartel_eventos` de `site_settings`.
--
--    La tabla es genérica (v19: "la próxima bandera global no necesita otra
--    migración") y guarda también el TEMA del sitio y la comisión de ticketera
--    (el número que se tacha al lado del precio). Abrir `site_settings` entero
--    al operador le daría, a nivel de base, cambiar la paleta del sitio entero
--    y el precio de comparación — que es un número con consecuencias legales.
--    Por eso la política es POR CLAVE y no por tabla: el operador sólo puede
--    escribir esa fila. El tema y la comisión siguen siendo del admin.
--
--    Las políticas permisivas se combinan con OR: la del admin (v19) sigue
--    cubriendo todas las claves y ésta suma una excepción acotada, sin sacarle
--    nada a nadie.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Banners ─────────────────────────────────────────────────────────────
drop policy if exists site_banners_write_admin   on public.site_banners;
drop policy if exists site_banners_write_manager on public.site_banners;

create policy site_banners_write_manager
  on public.site_banners for all
  using (public.is_manager())
  with check (public.is_manager());

-- ─── 2) El cartel de las tarjetas ───────────────────────────────────────────
drop policy if exists site_settings_write_cartel_manager on public.site_settings;

create policy site_settings_write_cartel_manager
  on public.site_settings for all
  using (key = 'cartel_eventos' and public.is_manager())
  with check (key = 'cartel_eventos' and public.is_manager());

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select polname, polcmd from pg_policy
--  where polrelid in ('public.site_banners'::regclass, 'public.site_settings'::regclass)
--  order by 1;
--
-- Debe aparecer site_banners_write_manager (y ya no site_banners_write_admin) y
-- site_settings_write_cartel_manager junto a las *_admin de v19.
-- ════════════════════════════════════════════════════════════════════════════
