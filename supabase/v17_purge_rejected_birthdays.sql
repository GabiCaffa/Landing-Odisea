-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v17 · Rechazar una solicitud de cumpleaños la BORRA
-- ════════════════════════════════════════════════════════════════════════════
-- v16 dejaba las solicitudes rechazadas en la tabla como status = 'rechazado'
-- "para tener el registro". En la práctica salió mal:
--
--   · Era un registro que no se podía ver ni gestionar: ninguna de las tres
--     pestañas del panel (A revisar / Sin regalo / Regalo dado) lo muestra.
--   · Pero sí sumaba en las tarjetas de totales de arriba, que contaban todas
--     las filas. Resultado: el panel decía que había cumpleañeros cargados que
--     no aparecían en ninguna lista.
--   · Guardaba la foto del frente de una cédula, de alguien a quien justamente
--     se le rechazó la solicitud, sin plazo de borrado.
--
-- Ahora rechazar es borrar: la fila y la foto del documento. No se pierde nada
-- funcional — los índices únicos parciales de v16 sólo miran las pendientes, así
-- que la persona ya podía volver a enviar una solicitud corregida.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0) ANTES de borrar: las fotos de esas solicitudes ──────────────────────
-- Borrar la fila no borra el archivo del bucket. Correr esto primero, copiar
-- las rutas y borrar esos archivos en Storage → id-photos (el explorador del
-- dashboard, que sí borra el archivo de verdad).
select id, first_name, last_name, id_photo_path, created_at
from public.birthday_signups
where status = 'rechazado' and id_photo_path is not null;

-- ─── 1) Purga de las rechazadas ─────────────────────────────────────────────
delete from public.birthday_signups where status = 'rechazado';

-- ─── 2) El estado deja de existir ───────────────────────────────────────────
-- Con el check apretado, una fila 'rechazado' no puede volver a aparecer ni por
-- un bug del front ni a mano.
alter table public.birthday_signups drop constraint if exists birthday_signups_status_check;
alter table public.birthday_signups
  add constraint birthday_signups_status_check
  check (status in ('pendiente', 'aprobado'));

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Las tarjetas de totales de la pestaña Cumpleaños cuadran con las listas.
--   · El botón ✕ de una solicitud pendiente la borra (avisa que también borra
--     la foto) en vez de esconderla.
-- ════════════════════════════════════════════════════════════════════════════
