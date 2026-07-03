-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v10: link opcional de una entrega a un cliente REGISTRADO
-- ════════════════════════════════════════════════════════════════════════════
-- Cuando el que compra ya es un usuario registrado, la entrega se puede vincular
-- a su perfil (public.profiles) para no cargar los datos a mano: se copian de su
-- perfil. El vínculo es opcional (las entregas manuales siguen con user_id NULL).
--
-- on delete set null: si el usuario se borra, la entrega queda igual (los datos
-- ya quedaron copiados en las columnas de la fila; sólo se pierde el vínculo).
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ticket_deliveries
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists deliveries_user_idx on public.ticket_deliveries(user_id);

-- ════════════════════════════════════════════════════════════════════════════

