-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v22: el operador pasa a gestionar el panel casi entero
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta acá el operador veía 2 de 9 pestañas (Entregas y Cumpleaños) porque
-- TODO lo demás —eventos, tipos de entrada, promos, cuentas, apariencia—
-- colgaba de is_admin(). Ahora hace el trabajo del día: crea y edita eventos,
-- entradas y promos.
--
--   is_admin()           → sólo lisoftuy@gmail.com
--   is_manager()         → admin, operador          ← NUEVA
--   is_staff()           → admin, operador          → Entregas          (v11)
--   is_birthday_staff()  → admin, operador, cumples → Cumpleaños        (v20)
--
-- is_manager() e is_staff() dan hoy el mismo conjunto, y aun así son dos
-- funciones. No es duplicación: significan cosas distintas —"puede gestionar
-- el contenido del sitio" contra "puede ver la recaudación"— y el día que
-- aparezca un rol que sólo cargue eventos, se cambia una sin tocar la otra.
--
-- ── Qué NO puede el operador, y por qué ───────────────────────────────────
--   payment_accounts  → es a dónde va la plata. Si puede cambiar la cuenta
--                       bancaria de un evento, redirige los cobros. Es el
--                       write más peligroso del sistema.
--   site_settings     → la cara pública del sitio.
--   profiles          → cambiar roles y dar de baja gente. La lee entera
--                       (profiles_select_staff, v11) pero no la escribe.
--   DELETE de events / ticket_types / ticket_promos → no se deshace.
--
-- ── El corte de DELETE es por tabla, no por rol ───────────────────────────
-- Las tablas de unión (event_ticket_types, event_ticket_promos) SÍ le dejan
-- borrar, y es obligatorio: saveEventTickets() y saveEventPromos() borran las
-- filas que salieron antes de insertar las nuevas. Ahí "borrar" es un paso de
-- editar un evento, no una baja. Lo que queda cerrado es borrar el EVENTO
-- entero o un tipo/promo del CATÁLOGO, que afecta a todos los eventos.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Helper ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER, igual que is_staff(): sin eso la función leería `profiles`
-- con las políticas del que consulta y se mordería la cola.
create or replace function public.is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'operador')
  );
$$;

-- ─── 2) events: crear y editar sí, borrar no ────────────────────────────────
drop policy if exists "events_insert_admin"   on public.events;
drop policy if exists "events_update_admin"   on public.events;
drop policy if exists "events_delete_admin"   on public.events;
drop policy if exists "events_insert_manager" on public.events;
drop policy if exists "events_update_manager" on public.events;

create policy "events_insert_manager" on public.events
  for insert with check (public.is_manager());
create policy "events_update_manager" on public.events
  for update using (public.is_manager()) with check (public.is_manager());
create policy "events_delete_admin" on public.events
  for delete using (public.is_admin());

-- ─── 3) Catálogos: crear y editar sí, borrar no ─────────────────────────────
-- Borrar un tipo o una promo del catálogo le pega a todos los eventos que lo
-- usan, así que esa tijera queda del lado del admin.
drop policy if exists "ticket_types_insert_admin"   on public.ticket_types;
drop policy if exists "ticket_types_update_admin"   on public.ticket_types;
drop policy if exists "ticket_types_delete_admin"   on public.ticket_types;
drop policy if exists "ticket_types_insert_manager" on public.ticket_types;
drop policy if exists "ticket_types_update_manager" on public.ticket_types;

create policy "ticket_types_insert_manager" on public.ticket_types
  for insert with check (public.is_manager());
create policy "ticket_types_update_manager" on public.ticket_types
  for update using (public.is_manager()) with check (public.is_manager());
create policy "ticket_types_delete_admin" on public.ticket_types
  for delete using (public.is_admin());

-- v21 creó ticket_promos con una sola política `for all`. Se parte en tres
-- para poder dejar el DELETE afuera.
drop policy if exists "ticket_promos_write_admin"    on public.ticket_promos;
drop policy if exists "ticket_promos_insert_manager" on public.ticket_promos;
drop policy if exists "ticket_promos_update_manager" on public.ticket_promos;
drop policy if exists "ticket_promos_delete_admin"   on public.ticket_promos;

create policy "ticket_promos_insert_manager" on public.ticket_promos
  for insert with check (public.is_manager());
create policy "ticket_promos_update_manager" on public.ticket_promos
  for update using (public.is_manager()) with check (public.is_manager());
create policy "ticket_promos_delete_admin" on public.ticket_promos
  for delete using (public.is_admin());

-- ─── 4) Tablas de unión: acá el DELETE SÍ va ────────────────────────────────
-- Ver la nota del encabezado: guardar un evento borra las filas que salieron.
drop policy if exists "event_ticket_types_insert_admin"  on public.event_ticket_types;
drop policy if exists "event_ticket_types_update_admin"  on public.event_ticket_types;
drop policy if exists "event_ticket_types_delete_admin"  on public.event_ticket_types;
drop policy if exists "event_ticket_types_write_manager" on public.event_ticket_types;

create policy "event_ticket_types_write_manager" on public.event_ticket_types
  for all using (public.is_manager()) with check (public.is_manager());

drop policy if exists "event_ticket_promos_write_admin"   on public.event_ticket_promos;
drop policy if exists "event_ticket_promos_write_manager" on public.event_ticket_promos;

create policy "event_ticket_promos_write_manager" on public.event_ticket_promos
  for all using (public.is_manager()) with check (public.is_manager());

-- ─── 5) Bucket event-images: subir sí, borrar no ────────────────────────────
-- El sitio nunca borra flyers (no hay .remove() sobre este bucket en el
-- código), así que dejar el DELETE con el admin no le rompe el flujo a nadie.
drop policy if exists "event_images_insert_admin"   on storage.objects;
drop policy if exists "event_images_update_admin"   on storage.objects;
drop policy if exists "event_images_insert_manager" on storage.objects;
drop policy if exists "event_images_update_manager" on storage.objects;

create policy "event_images_insert_manager" on storage.objects
  for insert with check (bucket_id = 'event-images' and public.is_manager());
create policy "event_images_update_manager" on storage.objects
  for update using (bucket_id = 'event-images' and public.is_manager())
  with check (bucket_id = 'event-images' and public.is_manager());

-- ─── 6) El candado de la cuenta de cobro ────────────────────────────────────
-- Sin esto, "el operador no toca las cuentas" sería mentira: no puede crear ni
-- editar una cuenta, pero podría EDITAR UN EVENTO y apuntarlo a otra. El techo
-- del daño es bajo (sólo puede elegir entre cuentas que ya existen), pero la
-- promesa tiene que valer en la base y no sólo en la pantalla.
--
-- Es sobre UPDATE nomás: al CREAR un evento el operador tiene que poder elegir
-- la cuenta, porque payment_account_id es not null (v13). Reasignar la cuenta
-- de un evento que ya existe es del admin.
create or replace function public.enforce_payment_account_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_account_id is distinct from old.payment_account_id
     and not public.is_admin() then
    raise exception
      'Sólo el administrador puede cambiar la cuenta de cobro de un evento';
  end if;
  return new;
end;
$$;

drop trigger if exists events_payment_account_lock on public.events;
create trigger events_payment_account_lock
  before update on public.events
  for each row execute function public.enforce_payment_account_lock();

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación (opcional): correr LOGUEADO como operador debería dar
--   insert / update en events      → OK
--   delete en events               → 0 filas (la política lo filtra)
--   insert en payment_accounts     → error de RLS
--   update de events.payment_account_id → error del trigger
-- ════════════════════════════════════════════════════════════════════════════
