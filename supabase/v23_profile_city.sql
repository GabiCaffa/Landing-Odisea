-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v23: ciudad en el perfil
-- ════════════════════════════════════════════════════════════════════════════
-- `profiles` guardaba país y departamento (v3) y eso es demasiado grueso para
-- decidir dónde hacer una fecha: de los eventos cargados, DOS son en el
-- departamento de Colonia pero en ciudades distintas —Colonia del Sacramento y
-- Nueva Helvecia—, y para el filtro del panel son el mismo "Colonia".
--
-- ── La columna es NULLABLE, y no es pereza ─────────────────────────────────
-- Ponerla `not null` obligaría a inventarle un valor a todos los perfiles que
-- ya existen. Un `''` o un 'Sin especificar' es peor que un NULL: se cuela en
-- los filtros como si fuera una ciudad de verdad y no hay forma de distinguir
-- "no lo sabemos" de "eligió eso". El front la exige en el REGISTRO NUEVO, que
-- es donde se puede exigir sin mentirle a nadie, y a los que ya están se les
-- pide con un aviso que pueden posponer.
--
-- ── El valor se guarda como lo escribió la persona ────────────────────────
-- El desplegable ofrece las localidades principales del departamento más una
-- opción "Otra" que deja escribir. Lo que llega por "Otra" se guarda tal cual:
-- si una se repite, se sube al catálogo de `src/lib/ciudades.ts` y listo. No se
-- normaliza en la DB a propósito — un trigger que "arregle" mayúsculas y
-- tildes rompe el nombre propio de un pueblo antes de arreglar nada.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) La columna ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists city text;

-- ─── 2) El trigger que crea el perfil tiene que copiarla ────────────────────
-- Es el de v7: el perfil NO se crea al registrarse sino al confirmar el email,
-- leyendo la metadata que quedó en auth.users. Si esta función no copia `city`,
-- el campo del registro se completa, se manda... y se pierde en silencio.
--
-- Se reescribe entera (no hay forma de "agregarle una columna" a una función).
-- Lo único que cambia respecto de v7 es la ciudad, en tres lugares: la lista de
-- columnas, la lista de valores y este comentario.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo actuar cuando el email pasa de NO confirmado -> confirmado
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    if new.raw_user_meta_data ? 'first_name' then
      begin
        insert into public.profiles (
          id, email, first_name, last_name, birth_date, document_id,
          phone, country, state, city
        )
        values (
          new.id,
          new.email,
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name',
          nullif(new.raw_user_meta_data->>'birth_date', '')::date,
          new.raw_user_meta_data->>'document_id',
          new.raw_user_meta_data->>'phone',
          new.raw_user_meta_data->>'country',
          new.raw_user_meta_data->>'state',
          nullif(new.raw_user_meta_data->>'city', '')
        )
        on conflict (id) do nothing;
      exception
        -- Si otra cuenta ya tomó esa cédula (carrera entre dos registros sin
        -- confirmar), NO abortamos la confirmación del auth.user; solo se queda
        -- sin perfil y el login le avisará que contacte al admin.
        when unique_violation then null;
      end;
    end if;
  end if;
  return new;
end;
$$;

-- El trigger en sí no se toca: sigue apuntando a la misma función.
-- (Se deja el create por si esta migración se corre sobre una base donde
-- alguien lo borró a mano. `create or replace` arriba ya actualizó el cuerpo.)
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_email_confirmed();

-- ─── 3) Backfill de lo que se pueda deducir ─────────────────────────────────
-- Montevideo es el único departamento del país con una sola ciudad, así que
-- para esos perfiles la ciudad se sabe sin preguntarle nada a nadie. No hay
-- ningún otro caso donde el departamento determine la ciudad: cualquier otra
-- deducción sería inventarla.
update public.profiles
   set city = 'Montevideo'
 where country = 'UY' and state = 'Montevideo' and city is null;

-- ════════════════════════════════════════════════════════════════════════════
-- Ver cuánto falta (opcional)
-- ════════════════════════════════════════════════════════════════════════════
-- select
--   count(*)                                   as total,
--   count(*) filter (where city is not null)   as con_ciudad,
--   count(*) filter (where city is null)       as sin_ciudad
-- from public.profiles;
--
-- Y las que se escribieron a mano por "Otra", para ver si alguna se repite y
-- conviene subirla al catálogo de src/lib/ciudades.ts:
--
-- select city, state, count(*)
--   from public.profiles
--  where city is not null
--  group by city, state
--  order by count(*) desc;
-- ════════════════════════════════════════════════════════════════════════════
