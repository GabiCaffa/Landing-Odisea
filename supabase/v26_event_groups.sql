-- ════════════════════════════════════════════════════════════════════════════
-- v26 — Eventos de varios días (selector de día)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Una fiesta que dura tres días son TRES EVENTOS SEPARADOS: cada día tiene sus
-- propias entradas, sus propios precios y su propia venta (una compra por día).
-- Lo único que falta es que el sitio sepa que van juntos, para mostrar UNA
-- tarjeta en la home y un selector de día adentro.
--
-- ─── Por qué DOS COLUMNAS y no una tabla `event_groups` ─────────────────────
--
-- El proyecto viene eligiendo tablas de catálogo (v13 cuentas, v15 tipos de
-- entrada, v21 promos) y acá NO corresponde, porque el motivo de aquéllas no
-- se cumple: una cuenta de cobro o un tipo de entrada se REUSAN entre eventos
-- distintos, y por eso vale la pena tenerlos una sola vez. Un grupo lo usan
-- exactamente sus propios días y nadie más. Una tabla sería una fila por grupo
-- con un solo campo útil, más su CRUD, más una pestaña en el panel, para algo
-- que el autor avisó que "seguramente no usemos más allá de esto".
--
-- Lo que se paga: `group_name` queda repetido en los días del grupo. Si no
-- coinciden gana el del día más temprano (lo resuelve el front). Renombrar un
-- grupo es editar sus eventos de a uno.
--
-- ─── Por qué el grupo NO tiene slug propio ──────────────────────────────────
--
-- Sería un segundo espacio de nombres que podría chocar con `events.slug`
-- (v25) sin que ningún índice lo impida. No hace falta: cada día ya tiene su
-- URL, y la página de cualquier día muestra el selector con todo el grupo. Un
-- anuncio puede apuntar al día que se quiera, o al primero.
--
-- ─── El `group_key` se normaliza ────────────────────────────────────────────
--
-- Es lo que une a los días, así que "Halloween XXL" y "halloween-xxl" tienen
-- que ser el mismo grupo o quedan dos fiestas de un día cada una. Se pasa por
-- `slugify()` (v25) al guardar. El panel igual ofrece los grupos que ya
-- existen en un desplegable, así que tipearlo mal es difícil; esto es el
-- cinturón para lo que se cargue a mano por SQL.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Las columnas ────────────────────────────────────────────────────────
-- Las dos nullable: `null` = evento suelto, que es como están TODOS los que ya
-- existen y como van a seguir estando casi todos. Agrupar es opt-in.
alter table public.events add column if not exists group_key text;
alter table public.events add column if not exists group_name text;

comment on column public.events.group_key is
  'v26: eventos con el mismo valor son días de una misma fiesta. NULL = evento suelto.';
comment on column public.events.group_name is
  'v26: nombre que muestra la tarjeta agrupada. Repetido en los días del grupo a propósito.';

-- ─── 2) Normalizar el group_key ─────────────────────────────────────────────
create or replace function public.events_normalize_group()
returns trigger
language plpgsql
as $$
begin
  -- Un string en blanco es "sin grupo", no un grupo llamado "".
  if new.group_key is not null then
    new.group_key := nullif(public.slugify(new.group_key), '');
  end if;

  if new.group_name is not null then
    new.group_name := nullif(btrim(new.group_name), '');
  end if;

  -- Sin grupo no hay nombre de grupo que valga: si no, queda un group_name
  -- colgado que el día que alguien vuelva a agrupar el evento reaparece solo.
  if new.group_key is null then
    new.group_name := null;
  end if;

  return new;
end;
$$;

drop trigger if exists events_group on public.events;
create trigger events_group
  before insert or update on public.events
  for each row execute function public.events_normalize_group();

-- ─── 3) Índice ──────────────────────────────────────────────────────────────
-- Parcial: la inmensa mayoría de las filas tienen NULL y no hay por qué
-- indexarlas. Se consulta "dame los días de este grupo" y "agrupá la home".
create index if not exists events_group_key_idx
  on public.events(group_key)
  where group_key is not null;

-- ─── 4) Permisos ────────────────────────────────────────────────────────────
-- Ninguno nuevo. Son dos columnas de `events`, que ya tiene sus políticas:
-- lectura pública y escritura `is_manager()` (v22). Agrupar eventos es trabajo
-- del día, así que el operador puede hacerlo igual que puede crear un evento.

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select name, date, slug, group_key, group_name
--   from public.events
--  order by group_key nulls last, date;
--
-- Para agrupar tres días a mano (el panel lo hace solo):
--
--   update public.events
--      set group_key = 'halloween-xxl', group_name = 'HALLOWEEN XXL'
--    where slug in ('dia-uno', 'dia-dos', 'dia-tres');
--
-- Para desagrupar: `set group_key = null` (el trigger limpia group_name).
-- ════════════════════════════════════════════════════════════════════════════
