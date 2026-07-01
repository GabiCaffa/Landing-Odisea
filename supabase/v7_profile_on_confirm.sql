-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v7 · El perfil se crea SOLO cuando el usuario confirma su email
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
--
-- ANTES: el trigger creaba el perfil al registrarse (INSERT en auth.users), así
--        que aparecía en public.profiles aunque nunca confirmara el email.
-- AHORA: el perfil se crea recién cuando email_confirmed_at pasa de NULL a una
--        fecha (es decir, cuando el usuario hace click en el link del mail).
--        Mientras no confirme, NO existe en public.profiles.
--
-- Nota: el registro pendiente sigue existiendo en auth.users (tabla interna de
-- Supabase) porque ahí vive el token de confirmación. Eso es inevitable y normal.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Función que crea el perfil A PARTIR de la confirmación del email.
--    Lee la metadata que se guardó en el signUp (raw_user_meta_data).
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
          phone, country, state
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
          new.raw_user_meta_data->>'state'
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

-- 2) Borrar TODOS los triggers custom de auth.users (incluido el viejo
--    on_auth_user_created que insertaba el perfil en el INSERT).
do $$
declare r record;
begin
  for r in select tgname from pg_trigger
           where tgrelid = 'auth.users'::regclass and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end $$;

-- 3) Dejar UN solo trigger: dispara al confirmarse el email (UPDATE).
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_email_confirmed();

-- 4) (Recomendado) Limpiar perfiles de usuarios que todavía no confirmaron
--    (quedaron del trigger viejo que insertaba en el INSERT). Así profiles
--    queda consistente: solo usuarios con email confirmado.
delete from public.profiles p
using auth.users u
where p.id = u.id
  and u.email_confirmed_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar:
-- 1) Borrá tus usuarios de PRUEBA desde Authentication → Users (los que crees
--    de ahora en más sin confirmar son "pendientes", no perfiles reales).
-- 2) Asegurate de que "Confirm email" siga PRENDIDO (Authentication → Providers
--    → Email).
-- 3) Probá: registrate con un email NUEVO. En Table Editor → profiles NO debe
--    aparecer nada hasta que hagas click en el link del mail. Recién ahí aparece.
-- ════════════════════════════════════════════════════════════════════════════
