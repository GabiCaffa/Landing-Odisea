-- ════════════════════════════════════════════════════════════════════════════
-- v46 — Todo cumpleañero tiene evento
-- ════════════════════════════════════════════════════════════════════════════
--
-- v12 dejó `birthday_signups.event_id` opcional ("si todavía no sabés, lo
-- coordinamos después"). En la práctica se juntaron decenas sin evento y el
-- staff no sabía en qué noche darles el regalo. El autor: "no pueden haber
-- personas sin evento asignado, cuando lo reclamen que lo reclamen para un
-- evento".
--
-- ─── Un CHECK "not valid", y no un NOT NULL ─────────────────────────────────
-- Hoy hay filas sin evento que el staff va a asignar a mano desde el panel. Un
-- NOT NULL fallaría al correr esto. `not valid` hace que la regla valga desde
-- YA para todo lo nuevo y para cada fila que se edite, sin revisar las viejas:
-- un reclamo o una carga sin evento se rechaza, y una ficha vieja sin evento
-- no se puede aprobar ni marcar con regalo hasta que se le asigne uno.
-- Cuando no quede ninguna sin evento, el bloque 3 la valida (correr de nuevo
-- esta migración alcanza).
--
-- ─── Borrar el evento borra sus cumpleañeros ────────────────────────────────
-- Antes la FK era `set null`: borrar un evento dejaba a sus cumpleañeros sin
-- evento, que es justo lo que ya no se permite (y con el CHECK, el borrado
-- fallaría). Pasa a `cascade`. Las fotos de las cédulas quedan en el bucket:
-- para borrarlas con la fila está el botón "Borrar los de eventos pasados" del
-- panel. (Un evento con ventas no se puede borrar igual, v9.)
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) La regla
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'birthday_signups_event_required'
       and conrelid = 'public.birthday_signups'::regclass
  ) then
    alter table public.birthday_signups
      add constraint birthday_signups_event_required check (event_id is not null) not valid;
  end if;
end $$;

-- 2) Borrar un evento borra sus cumpleañeros
alter table public.birthday_signups
  drop constraint if exists birthday_signups_event_id_fkey;
alter table public.birthday_signups
  add constraint birthday_signups_event_id_fkey
  foreign key (event_id) references public.events(id) on delete cascade;

-- 3) Si ya no queda ninguno sin evento, la regla pasa a valer también para las
--    filas viejas. Mientras quede alguno, no hace nada.
do $$
begin
  if not exists (select 1 from public.birthday_signups where event_id is null) then
    alter table public.birthday_signups validate constraint birthday_signups_event_required;
  end if;
end $$;

-- Verificación:
--   select count(*) as sin_evento from public.birthday_signups where event_id is null;
--   select convalidated from pg_constraint where conname = 'birthday_signups_event_required';
--   (convalidated = false mientras queden sin evento; true cuando ya no haya.)
