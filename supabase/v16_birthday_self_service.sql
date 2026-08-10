-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v16 · El cliente registrado carga su propia solicitud de cumpleaños
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta ahora la pestaña Cumpleaños la llenaba sólo el staff (todas las
-- políticas de birthday_signups son is_staff()). El cliente pedía el beneficio
-- por WhatsApp y alguien lo tipeaba a mano.
--
-- Ahora un usuario REGISTRADO puede cargar su solicitud desde la web, con su
-- foto de documento, y entra como 'pendiente' hasta que el staff la apruebe.
--
-- Dos decisiones que explican el diseño:
--   · Sólo registrados. Abrirle el insert a anon sería exponer a escritura
--     pública una tabla con documentos y fechas de nacimiento, más un bucket de
--     fotos de cédula. Con cuenta, cada fila tiene dueño (user_id = auth.uid())
--     y el abuso es rastreable y acotable.
--   · Entra como 'pendiente'. Si el cliente escribiera directo en la lista, se
--     perdería la diferencia entre lo que el staff verificó y lo que afirma un
--     desconocido, y la lista dejaría de servir para decidir el regalo.
--
-- Los invitados sin cuenta siguen usando el flujo de WhatsApp.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Estado de la solicitud ──────────────────────────────────────────────
-- default 'aprobado': lo que ya estaba cargado lo puso el staff, así que se
-- considera verificado y la lista no cambia. Lo que entra por autogestión se
-- fuerza a 'pendiente' desde la política de RLS, no desde el cliente.
alter table public.birthday_signups
  add column if not exists status text not null default 'aprobado';

alter table public.birthday_signups drop constraint if exists birthday_signups_status_check;
alter table public.birthday_signups
  add constraint birthday_signups_status_check
  check (status in ('pendiente', 'aprobado', 'rechazado'));

create index if not exists birthdays_status_idx on public.birthday_signups (status);

-- Una sola solicitud pendiente por persona y evento: evita que se manden diez.
-- Van dos índices porque event_id es nullable y en SQL los NULL no colisionan
-- entre sí, así que el primero no cubre el caso "sin evento elegido".
create unique index if not exists birthdays_one_pending_per_event
  on public.birthday_signups (user_id, event_id)
  where status = 'pendiente' and user_id is not null;

create unique index if not exists birthdays_one_pending_without_event
  on public.birthday_signups (user_id)
  where status = 'pendiente' and user_id is not null and event_id is null;

-- ─── 2) RLS: el dueño carga y consulta SÓLO su solicitud ────────────────────
-- Las políticas de staff de v11/v12 se mantienen; estas se suman (son
-- permisivas, se evalúan con OR). El staff sigue viendo y editando todo.
drop policy if exists "birthdays_insert_own" on public.birthday_signups;
drop policy if exists "birthdays_select_own" on public.birthday_signups;

-- El with check es lo que hace segura la autogestión:
--   user_id = auth.uid()  → no puede cargar una solicitud a nombre de otro
--   status = 'pendiente'  → no puede autoaprobarse
--   gift_given = false    → no puede marcarse el regalo como ya entregado
create policy "birthdays_insert_own" on public.birthday_signups
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pendiente'
    and gift_given = false
  );

create policy "birthdays_select_own" on public.birthday_signups
  for select to authenticated
  using (user_id = auth.uid());

-- A propósito NO hay update ni delete para el dueño: una vez enviada, la
-- solicitud es del staff. Si se equivocó, se resuelve por WhatsApp.

-- ─── 3) Storage: subir la foto sólo a su propia carpeta ─────────────────────
-- Las fotos pasan a guardarse como '{uid}/archivo.jpg'. El dueño puede ESCRIBIR
-- en su carpeta y nada más: no puede leer (ni la suya), listar, ni borrar. Ver
-- la foto sigue siendo exclusivo del staff, con URL firmada de 5 minutos.
-- Las rutas planas viejas siguen funcionando porque el staff tiene acceso total.
drop policy if exists "id_photos_insert_own" on storage.objects;

create policy "id_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'id-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Un usuario logueado ve en la promo de cumpleaños la opción de enviar su
--     solicitud con la foto del documento, sin pasar por WhatsApp.
--   · En el panel → Cumpleaños aparecen con badge "Pendiente" y botones para
--     aprobar o rechazar. El resto de la lista queda como estaba.
--
-- NOTA de retención: las fotos de documento se guardan sin plazo de borrado
-- (decisión tomada explícitamente). Si algún día se quiere un vencimiento, el
-- molde es el job de pg_cron de v8_cleanup_unconfirmed.sql.
-- ════════════════════════════════════════════════════════════════════════════
