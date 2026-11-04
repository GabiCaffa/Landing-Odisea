-- ════════════════════════════════════════════════════════════════════════════
-- v39 — El comprobante de la transferencia, adjunto a la venta
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta acá el comprobante vivía en DOS lugares fuera del sitio: el chat del
-- cliente y un grupo de WhatsApp donde el staff lo reenviaba "para guardarlo".
-- La venta (`ticket_deliveries`, v9) no sabía nada de él. Ahora el staff lo
-- pega (Ctrl+V) al cargar la venta desde "Pegar mensaje" y queda en la fila.
--
-- ─── Lo carga el STAFF, no el cliente ───────────────────────────────────────
-- Se evaluó que el cliente lo subiera desde la web y se descartó: descargar el
-- comprobante, entrar al sitio y subirlo es un flujo que el cliente no iba a
-- entender. El cliente sigue mandando todo por WhatsApp; esto ordena el lado
-- del staff. Por eso las políticas son `is_staff()` y no hay nada para `anon`.
--
-- ─── Bucket PRIVADO, como las cédulas (v12) ─────────────────────────────────
-- Un comprobante tiene nombre, banco y a veces número de cuenta del que paga.
-- Se guarda la RUTA (no una URL pública) y el panel lo abre con URLs firmadas
-- de 5 minutos. Bucket propio y no `id-photos`: ése lo ve el rol `cumples`
-- (v20), que justamente NO tiene que ver las ventas.
--
-- ─── `receipt_hash` ─────────────────────────────────────────────────────────
-- SHA-256 del archivo tal como se pegó. Sirve para avisar "este comprobante ya
-- está cargado" (la misma compra cargada dos veces, o un comprobante reusado).
-- **Es un índice común y NO único, a propósito**: el panel avisa y deja seguir
-- (mismo criterio que el resto de los duplicados). Sólo detecta el MISMO
-- archivo: una captura nueva del mismo comprobante tiene otro hash.
--
-- Las dos columnas son nullable: correr esto no cambia ninguna venta, y las
-- ventas cargadas antes quedan sin comprobante.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Columnas en la venta
alter table public.ticket_deliveries
  add column if not exists receipt_path text,
  add column if not exists receipt_hash text;

create index if not exists deliveries_receipt_hash_idx
  on public.ticket_deliveries(receipt_hash)
  where receipt_hash is not null;

comment on column public.ticket_deliveries.receipt_path is
  'v39: ruta del comprobante en el bucket privado `comprobantes`. NULL = sin comprobante.';
comment on column public.ticket_deliveries.receipt_hash is
  'v39: SHA-256 (hex) del archivo del comprobante, para avisar si se carga dos veces.';

-- 2) Bucket privado. 10 MB alcanza de sobra: las imágenes se achican antes de
--    subir y un PDF de comprobante pesa menos de 1 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes', 'comprobantes', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Sólo staff (admin y operador), igual que las ventas (v11).
drop policy if exists "comprobantes_select_staff" on storage.objects;
drop policy if exists "comprobantes_insert_staff" on storage.objects;
drop policy if exists "comprobantes_update_staff" on storage.objects;
drop policy if exists "comprobantes_delete_staff" on storage.objects;

create policy "comprobantes_select_staff" on storage.objects
  for select using (bucket_id = 'comprobantes' and public.is_staff());
create policy "comprobantes_insert_staff" on storage.objects
  for insert with check (bucket_id = 'comprobantes' and public.is_staff());
create policy "comprobantes_update_staff" on storage.objects
  for update using (bucket_id = 'comprobantes' and public.is_staff())
  with check (bucket_id = 'comprobantes' and public.is_staff());
create policy "comprobantes_delete_staff" on storage.objects
  for delete using (bucket_id = 'comprobantes' and public.is_staff());

-- Verificación:
--   select id, public, file_size_limit from storage.buckets where id = 'comprobantes';
--   select column_name from information_schema.columns
--    where table_name = 'ticket_deliveries' and column_name like 'receipt_%';
