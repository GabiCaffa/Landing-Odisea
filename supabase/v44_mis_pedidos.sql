-- ════════════════════════════════════════════════════════════════════════════
-- v44 — Los pedidos se ven SÓLO desde la cuenta de su dueño
-- ════════════════════════════════════════════════════════════════════════════
--
-- v43 dejaba ver un pedido a cualquiera que tuviera su número (`anon` podía
-- llamar a `estado_pedido`). El autor lo marcó como un error, y lo es: el
-- número viaja en chats y capturas, y con él cualquiera veía nombre, evento,
-- cantidad y total de otra persona.
--
-- Ahora un pedido lo ve:
--   · quien entró con la cuenta que lo hizo (`user_id`), o
--   · quien entró con una cuenta del MISMO email que el pedido. Es seguro
--     porque una cuenta sólo existe con el email confirmado (v7/v8): nadie
--     puede registrarse con el email de otro y ver sus pedidos.
--   · el staff (admin y operador), igual que en el panel.
-- Sin sesión, nada.
--
-- Y `mis_pedidos()` lista los de la cuenta con la que se entró: los hechos con
-- sesión y los hechos sin cuenta con ese mismo email.
--
-- Idempotente. Pegar en el SQL Editor de Supabase. Reemplaza `estado_pedido`
-- de v43.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) ¿Este pedido es de quien está mirando?
create or replace function public.es_pedido_propio(p_user_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       p_user_id = auth.uid()
       or exists (
         select 1 from auth.users u
          where u.id = auth.uid()
            and u.email_confirmed_at is not null
            and lower(u.email) = lower(trim(p_email))
       )
     );
$$;

revoke all on function public.es_pedido_propio(uuid, text) from public;

-- 2) Un pedido por su número: sólo el propio, o cualquiera para el staff.
create or replace function public.estado_pedido(p_code text)
returns table (
  codigo text, estado text, evento text, fecha date, lugar text, slug text,
  cantidad integer, total numeric, nombre text, detalle text,
  creado timestamptz, confirmado timestamptz, enviado timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.order_code,
         d.status,
         e.name,
         e.date::date,
         e.location,
         e.slug,
         d.quantity,
         d.value,
         split_part(trim(d.first_name), ' ', 1),
         (select string_agg(dtt.quantity || ' ' || tt.name, ' · ' order by tt.name)
            from public.delivery_ticket_types dtt
            join public.ticket_types tt on tt.id = dtt.ticket_type_id
           where dtt.delivery_id = d.id),
         d.created_at,
         d.confirmed_at,
         d.sent_at
    from public.ticket_deliveries d
    join public.events e on e.id = d.event_id
   where d.order_code = upper(trim(p_code))
     and upper(trim(p_code)) ~ '^[A-HJKMNP-Z2-9]{6}$'
     and (public.es_pedido_propio(d.user_id, d.email) or public.is_staff());
$$;

-- Sin sesión, no se puede ni llamar.
revoke all on function public.estado_pedido(text) from public;
revoke all on function public.estado_pedido(text) from anon;
grant execute on function public.estado_pedido(text) to authenticated;

-- 3) Los pedidos de la cuenta con la que se entró (no los de todos, ni para el staff:
--    ésos están en el panel).
create or replace function public.mis_pedidos()
returns table (
  codigo text, estado text, evento text, fecha date, lugar text, slug text,
  cantidad integer, total numeric, nombre text, detalle text,
  creado timestamptz, confirmado timestamptz, enviado timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.*
    from public.ticket_deliveries d
    cross join lateral public.estado_pedido(d.order_code) p
   where d.order_code is not null
     and public.es_pedido_propio(d.user_id, d.email)
   order by d.created_at desc
   limit 50;
$$;

revoke all on function public.mis_pedidos() from public;
revoke all on function public.mis_pedidos() from anon;
grant execute on function public.mis_pedidos() to authenticated;

-- Verificación (sin sesión, en el SQL Editor, la primera tiene que dar 0 filas):
--   select * from public.estado_pedido('XXXXXX');
--   select has_function_privilege('anon', 'public.estado_pedido(text)', 'execute');  -- false
