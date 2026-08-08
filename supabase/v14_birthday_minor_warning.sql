-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v14 · Menor de edad en cumpleaños: aviso en vez de bloqueo
-- ════════════════════════════════════════════════════════════════════════════
-- v12 bloqueaba con un trigger cargar a alguien menor de 18 (enforce_birthday_
-- signup_adult). En la práctica no sirve: es común que la persona cumpla los 18
-- ENTRE la carga y la fecha del evento (ej: nace el 13/08, el evento es el 24),
-- y el sistema no puede decidir eso solo — el evento es opcional en la ficha.
--
-- Ahora la mayoría de edad se avisa en el panel (mensaje en rojo bajo la fecha +
-- diálogo de confirmación al guardar) y la decisión queda en quien carga. Lo que
-- la DB sigue rechazando es lo que es imposible: nacer en el futuro.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Fuera el bloqueo por edad ───────────────────────────────────────────
drop trigger if exists birthday_signups_adult on public.birthday_signups;
drop function if exists public.enforce_birthday_signup_adult();

-- ─── 2) Chequeo de cordura: la fecha de nacimiento no puede ser futura ──────
-- Trigger y no CHECK por el mismo motivo que en v12: current_date no es
-- inmutable, un CHECK se reevaluaría en cada dump/restore.
create or replace function public.enforce_birthday_signup_birth_date()
returns trigger
language plpgsql
as $$
begin
  if new.birth_date > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura (%)',
      new.birth_date using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists birthday_signups_birth_date on public.birthday_signups;
create trigger birthday_signups_birth_date
  before insert or update of birth_date on public.birthday_signups
  for each row execute function public.enforce_birthday_signup_birth_date();

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Se puede cargar a un menor de 18, pero el panel avisa dos veces (mensaje
--     en rojo bajo la fecha, indicando cuándo cumple 18, y confirmación al
--     guardar). El beneficio sigue siendo para mayores: el aviso está para que
--     quien carga verifique que cumple 18 ANTES del evento.
-- ════════════════════════════════════════════════════════════════════════════
