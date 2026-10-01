-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v25: dirección propia por evento (+ ajustes privados del panel)
-- ════════════════════════════════════════════════════════════════════════════
-- Cada evento pasa a tener su URL: odiseaoficial.com/evento/halloween-colonia.
-- Es lo que se pone en un anuncio y lo que se comparte por WhatsApp, así que
-- tiene dos requisitos que mandan todo el diseño de abajo:
--
--   1) Tiene que ser ESTABLE. Si se deriva del nombre al vuelo, cambiarle una
--      tilde al evento rompe todos los anuncios que ya están corriendo. Por eso
--      es una columna guardada y no algo que se calcula cada vez.
--   2) Tiene que ser IMPOSIBLE de dejar vacía o repetida, porque si no la
--      página del evento no existe y el anuncio cae en la nada.
--
-- ── Por qué un trigger y no un `not null` a secas ─────────────────────────
-- El `not null` obliga a que alguien escriba el slug, y ese alguien sería el
-- front: cualquier cliente viejo, o un insert a mano desde el SQL Editor,
-- fallaría. Con el trigger el slug **siempre** sale bien aunque nadie lo mande,
-- y de paso normaliza el que sí se manda: el panel no puede guardar una URL
-- inválida ni aunque se escriba con espacios y tildes.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) La columna ──────────────────────────────────────────────────────────
alter table public.events add column if not exists slug text;

-- ─── 2) Texto → slug ────────────────────────────────────────────────────────
-- `translate` y no la extensión `unaccent`: unaccent hay que instalarla, no
-- está en todos los proyectos y es una dependencia entera para sacar tildes de
-- un idioma. Esto cubre español y portugués, que es todo lo que aparece.
--
-- IMMUTABLE porque no mira nada de afuera: así puede usarse en un índice si
-- alguna vez hace falta.
create or replace function public.slugify(txt text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        translate(
          lower(coalesce(txt, '')),
          'áàäâãéèëêíìïîóòöôõúùüûñç',
          'aaaaaeeeeiiiiooooouuuunc'
        ),
        '[^a-z0-9]+', '-', 'g'   -- todo lo que no sea letra o número → guión
      ),
      '-+', '-', 'g'             -- guiones repetidos → uno solo
    )
  );
$$;

-- ─── 3) El trigger que garantiza slug único y no vacío ──────────────────────
create or replace function public.events_set_slug()
returns trigger
language plpgsql
as $$
declare
  base       text;
  candidato  text;
  n          integer := 1;
begin
  -- Sin slug se deriva del nombre; con slug se normaliza el que vino.
  if new.slug is null or btrim(new.slug) = '' then
    base := public.slugify(new.name);
  else
    base := public.slugify(new.slug);
  end if;

  -- Un nombre de puros símbolos o emojis deja el slug vacío. Sin esta red, el
  -- evento se guardaría con slug '' y su página no existiría.
  if base = '' then
    base := 'evento';
  end if;

  -- Dos fiestas pueden llamarse igual (la misma el año que viene, por ejemplo).
  -- `id <> new.id` es lo que hace que editar un evento sin tocarle el slug no
  -- le agregue un número en cada guardado.
  candidato := base;
  while exists (
    select 1 from public.events where slug = candidato and id <> new.id
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  new.slug := candidato;
  return new;
end;
$$;

drop trigger if exists events_slug on public.events;
create trigger events_slug
  before insert or update on public.events
  for each row execute function public.events_set_slug();

-- ─── 4) Backfill de los eventos que ya existen ──────────────────────────────
-- Va fila por fila, y NO como un solo UPDATE masivo. El motivo es concreto: en
-- una sola sentencia, el trigger de cada fila lee el snapshot del inicio, así
-- que dos eventos con el mismo nombre no se ven entre sí, calculan el mismo
-- slug y el índice único de abajo revienta. Con un UPDATE por fila, cada uno ve
-- lo que escribió el anterior.
do $$
declare
  r record;
begin
  for r in
    select id from public.events
     where slug is null or btrim(slug) = ''
     order by date, created_at
  loop
    update public.events set slug = null where id = r.id;
  end loop;
end;
$$;

-- ─── 5) Recién ahora: único y obligatorio ───────────────────────────────────
create unique index if not exists events_slug_key on public.events(slug);
alter table public.events alter column slug set not null;

-- ─── 6) Ajustes privados del panel ──────────────────────────────────────────
-- `site_settings` (v19) NO sirve para esto: es de **lectura pública** a
-- propósito, porque la landing tiene que saber qué tema pintar antes de que
-- nadie inicie sesión. El Deploy Hook de Vercel es una URL que dispara un
-- build: no expone datos, pero cualquiera que la encuentre puede hacer que el
-- sitio se reconstruya en loop y quemar la cuota de builds. Va en una tabla
-- que el público no puede leer.
create table if not exists public.admin_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings_select_manager" on public.admin_settings;
drop policy if exists "admin_settings_write_admin"    on public.admin_settings;

-- Lee el staff que carga eventos (admin + operador, v22): el botón de
-- "Actualizar páginas" es parte de cargar una fecha, no una tarea de admin.
create policy "admin_settings_select_manager" on public.admin_settings
  for select using (public.is_manager());

-- Configurar el hook sí es sólo del admin.
create policy "admin_settings_write_admin" on public.admin_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- NO se agrega a la publicación de realtime: nada tiene que reaccionar a esto.

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación (opcional)
-- ════════════════════════════════════════════════════════════════════════════
-- select name, slug, date from public.events order by date;
--
-- Debería dar algo así:
--   ODISEA X OVERSIZE              odisea-x-oversize
--   HALLOWEEN COLONIA              halloween-colonia
--   HALLOWEEN NUEVA HELVECIA       halloween-nueva-helvecia
--   ODISEA x OVERSIZE HALLOWEEN…   odisea-x-oversize-halloween-paysandu
--
-- Para cambiarle la dirección a un evento a mano (ojo: rompe los links ya
-- publicados de ese evento):
--   update public.events set slug = 'el-que-quieras' where name = '...';
-- ════════════════════════════════════════════════════════════════════════════
