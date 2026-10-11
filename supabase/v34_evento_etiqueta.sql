-- ════════════════════════════════════════════════════════════════════════════
-- v34 — Etiqueta destacada por evento ("FREE ANTES DE 1:30")
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un texto corto, propio de cada evento, que se ve como pastilla sobre el flyer
-- de la tarjeta y en la página de la fecha. Sirve para lo que no es una entrada
-- ni una promo de precio: "FREE ANTES DE 1:30", "LADIES FREE", "ÚLTIMA FECHA".
--
-- ─── Por qué una columna y no una promo (v21/v24) ───────────────────────────
-- Las promos CALCULAN: descuentan, fijan un precio, llevan cupo y vencimiento.
-- Cargar "free antes de 1:30" como promo obligaría a inventarle una cuenta que
-- el sitio aplicaría sobre el total. Esto es sólo un letrero: no toca nada del
-- camino de la plata. Tampoco es el cartel global (`cartel_eventos`, v19), que
-- es uno solo para todo el sitio.
--
-- ─── Por qué no `site_settings` ─────────────────────────────────────────────
-- Es un dato de CADA evento: va en la fila del evento.
--
-- Quién escribe: admin y operador, por la política de `events` que ya existe
-- (v22). No hace falta ninguna política nueva.
--
-- Nullable y sin valor por defecto: correrla no cambia ningún evento existente.
-- 30 caracteres: lo que entra en la pastilla de una tarjeta de 300 px.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists badge text;

alter table public.events
  drop constraint if exists events_badge_largo;
alter table public.events
  add constraint events_badge_largo
  check (badge is null or char_length(badge) <= 30);

comment on column public.events.badge is
  'v34: etiqueta corta del evento (pastilla sobre el flyer y en su página). NULL = sin etiqueta.';

-- Verificación:
--   select name, badge from public.events order by date;
--   update public.events set badge = 'FREE ANTES DE 1:30' where slug = 'dali';
