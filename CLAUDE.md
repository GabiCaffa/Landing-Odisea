# ODÍSEA — Landing (Contexto del proyecto)

> Fuente de verdad de este proyecto para Claude Code. Mantener actualizado a
> medida que se avanza. (Distinto de JuventudApp: son proyectos separados.)

---

## 1. Qué es

Landing / web de **ODÍSEA**, productora de eventos de música electrónica en
Uruguay (Colonia del Sacramento). Muestra eventos y promociones, permite a las
personas **registrarse, confirmar su cuenta por email** y a un admin gestionar
eventos y usuarios. En producción en **https://odiseaoficial.com** (redirige a
`www.`), desplegada en **Vercel**.

---

## 2. Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind. UI shadcn/ui (Radix),
  `sonner` (toasts), `react-router-dom`, `react-hook-form` + `zod`,
  `@tanstack/react-query`, `recharts`, `libphonenumber-js`, `lucide-react`.
- **Backend/DB:** **Supabase** (Postgres + Auth + Storage). No hay backend propio;
  el front pega directo a Supabase con la anon key.
- **Deploy:** Vercel (build `vite build`). SPA con rewrites a `/index.html`
  (`vercel.json`). Push a `master` → deploy automático.
- **Scripts:** `npm run dev` | `build` | `preview` | `lint`.

---

## 3. Estructura

- `src/pages/` — páginas por ruta: `Index`, `Register`, `Login`, `ForgotPassword`,
  `ResetPassword`, `AuthCallback`, `Profile`, `Admin`, `Terms`, `Privacy`, `NotFound`.
- `src/contexts/AuthContext.tsx` — **núcleo**: sesión, login/register/logout,
  perfil (`profiles`), eventos (CRUD admin + realtime), promos de cumpleaños.
- `src/components/` — UI propia + `src/components/ui/` (shadcn).
- `src/lib/supabase.ts` — cliente Supabase (`persistSession`, `detectSessionInUrl`).
- `supabase/` — DDL y migraciones **a mano** (`schema.sql` + `v3..v8`) + template
  de email. **Se corren manualmente** en el SQL Editor de Supabase.
- `public/` — assets servidos tal cual en producción (incluye `email-logo-*.png`).

---

## 4. Config / secretos

- `.env` (fuera del repo, en `.gitignore`): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. Ver `.env.example`.
- Cuenta **admin única e inmutable**: `lisoftuy@gmail.com` (enforzado en front y DB,
  ver `v6_lock_admin.sql`). Correo de contacto público: `odiseaoficialcolonia@gmail.com`.

---

## 5. Flujo de registro / confirmación de email (Supabase Auth)

Estado actual (funcionando en producción):

1. **Registro** (`Register.tsx` → `AuthContext.register`): `signUp` con metadata
   (nombre, cédula, etc.) y `emailRedirectTo = <origin>/auth/callback`. Hay campo
   **"Confirmar email"** (coincidencia obligatoria + `onPaste` bloqueado) anti-typo.
2. **"Confirm email" está PRENDIDO** en Supabase → `signUp` no devuelve sesión;
   se muestra "REVISÁ TU EMAIL". Sin confirmar **no** se puede iniciar sesión.
3. **Perfil sólo al confirmar** (`v7_profile_on_confirm.sql`): un trigger crea la
   fila en `public.profiles` recién cuando `email_confirmed_at` pasa de NULL a fecha.
   Mientras no confirme, no existe perfil (los datos viven en `auth.users`).
4. **Callback** (`AuthCallback.tsx`): consume el token, crea sesión y muestra
   **"¡BIENVENIDO, {NOMBRE}!"** (nombre desde la metadata de la sesión) y redirige.
5. **Expiración 5 min**: setting Supabase **Authentication → Emails → Email OTP
   Expiration = 300**. Link vencido → callback muestra "LINK INVÁLIDO".
6. **Limpieza automática** (`v8_cleanup_unconfirmed.sql`): job `pg_cron` que corre
   cada 5 min y borra de `auth.users` los no-confirmados con **> 15 min**, así el
   email queda libre si alguien se equivocó al tipearlo.
7. **Reenvío**: `AuthContext.resendConfirmation` (botón en Register y Login).

> Config de Supabase que debe estar seteada (dashboard, no en repo):
> - Authentication → Providers → Email → **Confirm email ON**.
> - Authentication → URL Configuration → **Site URL** `https://odiseaoficial.com`
>   y **Redirect URLs** con `https://odiseaoficial.com/auth/callback`.
> - Email OTP Expiration = **300**.
> - Template "Confirm signup" = contenido de `supabase/email-confirm-signup.html`.

**Envío de mails — Resend:** para no depender del SMTP de prueba de Supabase (límite
bajo), se configura **Resend** como SMTP propio (dominio `odiseaoficial.com`, remitente
`no-reply@odiseaoficial.com`, DNS en Vercel). Runbook paso a paso en
**`supabase/RESEND_SMTP.md`**. Es trabajo de dashboards/DNS (sin cambios de código).

---

## 6. Migraciones SQL (orden)

`schema.sql` (base) → `profile_features.sql` → `v3_profile_and_promos.sql` →
`v4_sale_ends_at.sql` → `v5_fix_registration.sql` → `v6_lock_admin.sql` →
`v7_profile_on_confirm.sql` → `v8_cleanup_unconfirmed.sql` →
`v9_ticket_deliveries.sql` → `v10_delivery_user_link.sql` → `v11_operator_role.sql` →
`v12_birthday_signups.sql` → `v13_payment_accounts.sql` →
`v14_birthday_minor_warning.sql` → `v15_ticket_types.sql` →
`v16_birthday_self_service.sql` → `v17_purge_rejected_birthdays.sql` →
`v18_delivery_ticket_types.sql`.
Todas idempotentes y pensadas para pegarse en el SQL Editor. Al agregar una nueva,
seguir la numeración `vN_...` y documentar arriba qué hace.

**v9 — Entregas de entradas:** tabla `ticket_deliveries` (sólo admin vía RLS) para
llevar a mano a quién enviarle las entradas por mail y a quién ya se le enviaron,
**agrupado por evento** (reemplaza el Excel). Datos del cliente (nombre, contacto,
ubicación, documento) + `quantity` + `value` (total pagado) + estado `pending`/`sent`.
FK a `events` con `on delete restrict` (no se puede borrar un evento con entregas
cargadas). UI: pestaña **Entregas** en el panel admin (`DeliveriesAdmin` en
`Admin.tsx`); acceso a datos en `src/lib/deliveries.ts`.

**v10 — Link a cliente registrado:** columna opcional `user_id` en
`ticket_deliveries` (FK a `profiles`, `on delete set null`). Si el que compra ya es
usuario registrado, el form permite elegirlo con `UserSearchSelect` (typeahead, ver v12)
y copia sus datos del perfil (badge "Registrado"); si no, carga manual. La lista de Entregas es **mobile-first**
(tarjetas en celular, tabla en desktop). Extras del módulo: exportar CSV de la lista
visible, aviso de duplicados (mismo email+evento) y resumen de recaudación. El envío
de las entradas al cliente es **manual** (botón ✉️ que abre el correo; se marca como
enviada a mano).

**v11 — Rol `operador`:** rol intermedio entre `user` y `admin`. El operador entra al
panel pero **sólo ve/gestiona Entregas** (no eventos ni usuarios). DB: helper
`is_staff()` (admin u operador); las políticas de `ticket_deliveries` y la lectura de
`profiles` pasan a `is_staff()`. Front: `isStaffRole()` en `AuthContext`; el guard de
`Admin.tsx` deja pasar a staff y fuerza la pestaña Entregas para el operador; el rol se
asigna desde la pestaña Usuarios (selector user/operador). El admin sigue siendo único
(`lisoftuy@gmail.com`).

**v12 — Promo cumpleaños:** tabla `birthday_signups` (RLS `is_staff()`) para registrar
a quién le corresponde el beneficio de cumpleaños y a quién ya se le dio el regalo.
La persona puede ser un **usuario registrado** (`user_id` opcional a `profiles`; el form
trae sus datos del perfil y quedan editables) o **alguien de afuera** (carga manual).
Campos: nombre, apellido, documento + país/depto, **fecha de nacimiento**, email y
teléfono (opcionales), notas, `event_id` **opcional** (`on delete set null`) y el toggle
`gift_given` + `gift_given_at`. **Mayoría de edad:** validada en el form y con un trigger
en la DB (trigger y no CHECK porque `current_date` no es inmutable). **v14 la convirtió
en aviso, ver abajo.** Otro trigger mantiene coherente `gift_given_at`.
**Foto del frente del documento:** bucket **privado** `id-photos` (`public = false`,
políticas de `storage.objects` para staff); se guarda la **ruta** en `id_photo_path`, no
una URL pública, y el panel la muestra con **URLs firmadas de 5 min** — nunca se expone
un documento de identidad por link permanente. UI: pestaña **Cumpleaños** en el panel
(`BirthdaysAdmin` + `BirthdayFormModal` + `IdPhotoModal` en `Admin.tsx`), accesible a
**admin y operador** (`OPERATOR_TABS`); acceso a datos en `src/lib/birthdays.ts`. Lista
mobile-first agrupada por evento, ordenada por cumple más próximo, con buscador,
contador "cumple en N días", export CSV (sin la foto) y aviso de documento repetido.
En el form, elegir un usuario registrado usa `UserSearchSelect`
(`src/components/UserSearchSelect.tsx`): typeahead que filtra por nombre/email/documento/
teléfono ignorando tildes, con navegación por teclado (reemplaza al `<select>` nativo,
inusable con muchos usuarios). La foto del documento se puede **arrastrar y soltar**
sobre el recuadro o **pegar con Ctrl+V**, además del explorador de archivos.

**v13 — Cuentas de cobro por evento:** los datos para transferir estaban **hardcodeados**
en `TicketPurchaseModal.tsx` (una sola cuenta Itaú). Ahora hay catálogo `payment_accounts`
(label interno, titular, banco, tipo, nro de cuenta, documento, nota, `active`, `is_default`)
y `events.payment_account_id` **not null** con `on delete restrict`: cada evento cobra en la
cuenta que se le asigne y **no se puede publicar un evento sin cuenta**. Para retirar una
cuenta se **desactiva** (borrarla falla si algún evento la usa → el error 23503 se traduce a
un mensaje claro); así los eventos viejos conservan a qué cuenta se cobró. Un trigger
mantiene una sola `is_default` (la que se propone al crear un evento). RLS: **lectura
pública** (el comprador tiene que ver a dónde transferir — ese dato ya viajaba en el JS del
sitio), escritura **sólo admin**: el operador no toca cuentas. UI: pestaña **Cuentas** en el
panel (`AccountsAdmin` + `AccountFormModal` en `Admin.tsx`, sólo admin), selector obligatorio
en el form de evento y columna "Cuenta" en la tabla de eventos; acceso a datos en
`src/lib/paymentAccounts.ts`. El modal de compra resuelve la cuenta del evento en una sola
consulta (`fetchAccountForEvent`, embed por la FK) y la usa tanto en el bloque visual como
en el mensaje de WhatsApp. La migración siembra la Itaú actual, hace backfill de los eventos
existentes y recién ahí aplica el `not null`.

**v14 — Menor de edad en cumpleaños: aviso, no bloqueo.** v12 bloqueaba en tres capas
(`max` del input de fecha, validación del submit y trigger `enforce_birthday_signup_adult`).
No servía: es habitual que la persona cumpla 18 **entre la carga y el evento** (nace el
13/08, el evento es el 24), y el sistema no puede decidirlo solo porque `event_id` es
opcional en la ficha. Ahora se puede cargar igual, avisando dos veces —mensaje en rojo bajo
la fecha con **la fecha exacta en que cumple 18** (helper `eighteenthBirthday`) y diálogo de
confirmación al guardar, mismo patrón que el documento repetido y la foto faltante—. En la
DB, el trigger de 18+ se reemplazó por uno que sólo rechaza **fechas de nacimiento futuras**.

**v15 — Tipos de entrada por evento.** Antes el evento tenía **un** precio (`events.price`) y
el sitio inventaba un único tipo `"general"` en el código. Ahora: catálogo `ticket_types`
(nombre único, `description` = qué incluye, `sort_order`, `active`) + `event_ticket_types`
(`event_id`, `ticket_type_id`, `price`, `active`, `sort_order`, único por evento+tipo). El
**precio vive en la relación**, no en el catálogo, porque el mismo "VIP" vale distinto en
cada fecha. **El evento ya no tiene precio propio:** `events.price` pasó a ser DERIVADO —el
tipo activo más barato, mantenido por el trigger `sync_event_price`— y `eventToDb` **dejó de
escribirlo**; el form muestra "desde $X". El comprador arma un carrito (cantidades por tipo)
y el total + desglose salen en el mensaje de WhatsApp; el modal ya soportaba varios tipos,
sólo se le cambió el origen de los datos. RLS: lectura pública, escritura sólo admin.
UI: pestaña **Entradas** (`TicketTypesAdmin` + `TicketTypeFormModal`) para el catálogo, y
`TicketsEditor` dentro del form de evento (tildar tipo + poner precio; al menos uno,
validado). Acceso a datos en `src/lib/ticketTypes.ts` (`saveEventTickets` reemplaza el
conjunto: borra los que salieron y hace upsert del resto).
**OJO — realtime:** `loadEvents` ahora trae los tipos embebidos
(`event_ticket_types(*, ticket_types(*))`), así que la suscripción de `events` **recarga**
en vez de parchear con el payload; parchear dejaba los eventos sin entradas (el payload de
realtime es sólo la fila de `events`). `createEvent` devuelve el `id` porque las entradas se
guardan después, en su propia tabla.

**v18 — Qué tipo de entrada compró cada uno.** `ticket_deliveries` (v9) guardaba `quantity` y
`value` pero nunca **cuál** entrada: cuando se hizo el módulo el evento tenía un precio único.
Desde v15 los tipos son una tabla y el comprador puede armar un carrito mezclado, así que el
dato existía y se perdía (el importador de mensajes lo escribía en Notas como texto suelto).
La planilla que el staff llevaba a mano **sí** tenía la columna "Tipo de entrada". Ahora hay
tabla hija `delivery_ticket_types` (`delivery_id`, `ticket_type_id`, `quantity`, `unit_price`),
sólo staff por RLS. Decisiones: **tabla hija y no una columna** porque una compra puede tener
más de un tipo; apunta al **catálogo** (`ticket_types`) y no a `event_ticket_types` porque
`saveEventTickets` **borra** las filas de esa tabla cuando el evento deja de vender un tipo, y
con una FK ahí editar las entradas de un evento fallaría por las ventas viejas; `unit_price` es
una **foto** de lo que se cobró (mismo criterio que v13); y `quantity`/`value` de la entrega
**siguen siendo la verdad**, no se derivan del desglose (hay entregas viejas sin desglose y el
staff puede cobrar un total distinto por promo o cortesía) — el form los recalcula al cargar el
desglose y avisa si no coinciden. Al editar, los tipos que la entrega tiene pero el evento ya
no vende **se muestran igual**: si no, al guardar se borraría un desglose que nadie pidió
borrar. Acceso a datos en `src/lib/deliveries.ts` (`saveDeliveryTickets`, `ticketsSummary`);
`createDelivery` ahora devuelve el `id` porque el desglose se guarda después.

**Importar la planilla histórica:** `scripts/planilla-a-sql.mjs` convierte los CSV exportados
de Google Sheets (una hoja por fecha) en un SQL para pegar en el SQL Editor. Detecta las
columnas por el nombre del encabezado (el total es la columna sin título, anterior al nombre),
normaliza el teléfono a E.164 y la plata escrita a mano, y salta las filas de plantilla. La
clave de deduplicación es **email + cantidad + total**, no sólo el email: en la planilla real
hay mails repetidos con **compras distintas** (alguien que compró para otro) y deduplicando
sólo por email se perdía una de las dos sin avisar. El SQL generado es idempotente y pide
pegar a mano el `id` de cada evento (una hoja no se puede cruzar sola con un evento: hay dos
fechas distintas el mismo día).

> **El verde de la planilla no se puede importar solo.** En la planilla, la fila verde significa
> "ya le envié las entradas", pero **el CSV no exporta colores de celda**. Se resuelve de dos
> formas: `--enviadas` si la hoja entera ya fue enviada, o una marca en la columna
> *Confirmacion* de las verdes antes de exportar (fila con marca = `sent`). Las importadas como
> enviadas llevan en `sent_at` la **fecha del evento**, no la de la importación: no se sabe el
> día exacto del envío, pero es una aproximación razonable y no dice que se enviaron hoy. El
> bloque de cada hoja aborta con un mensaje claro si el `id` de evento pegado no existe.

## 6.1 Promo cumpleaños en el sitio (sin migración)

La card 02 de `PromosSection` era un link fijo a WhatsApp ("Quiero info"). Ahora abre
`BirthdayPromoModal`, que **exige cuenta**: sin sesión el modal muestra sólo el paso de
login/registro (`AuthPromptStep` sin `onContinue`) y no hay forma de reclamar el beneficio
como invitado. Con sesión, el form se autocompleta del perfil (nombre, fecha de nacimiento,
email, teléfono; el documento sale del perfil y no se vuelve a pedir), se adjunta la **foto
del frente de la cédula** y la solicitud se carga como `pendiente` (ver v16 abajo). Si el
cumple **no** cae en la ventana de ±15 días **avisa pero deja enviar** (mismo criterio que
v14).

> **La vía de WhatsApp se sacó** (antes el modal armaba un mensaje con los datos y la foto se
> pasaba por el chat). Motivo: por WhatsApp la cédula queda en un chat, la solicitud no tiene
> dueño en la base y el staff tenía que retipearla. Ahora hay **un solo camino desde el
> sitio** —la solicitud del cliente registrado—; el staff **sigue pudiendo cargar a mano** en
> la pestaña Cumpleaños a quien no tenga cuenta. `AuthPromptStep` conserva la opción de
> invitado como **opcional** (`onContinue`), porque la compra de entradas sí la usa.

> `daysBirthdayToEvent` (en `BirthdayPromoModal`) replica la regla de la RPC
> `can_claim_birthday_promo` (±15 días) pero **corrige el salto de año**: la RPC compara el
> cumple contra el año del evento, así que un cumple del 28/12 con evento del 05/01 le da
> ~357 días en vez de 8. El modal prueba los años vecinos. La RPC sigue con el bug y la usa
> el modal de compra (`birthday_promo_claims`, cooldown 90 días) — pendiente de arreglar.

**v16 — El cliente registrado carga su propia solicitud.** Un usuario **con cuenta** envía la
solicitud desde el sitio (con la foto del documento) y entra como **`pendiente`** hasta que el
staff la apruebe. Es la **única** vía de autogestión. Dos decisiones que explican el diseño:

1. **Sólo registrados.** Abrirle el insert a `anon` sería exponer a escritura pública una
   tabla con documentos y fechas de nacimiento más un bucket de fotos de cédula. Con cuenta,
   cada fila tiene dueño (`user_id = auth.uid()`) y el abuso es rastreable.
2. **Nunca directo a la lista.** Si el cliente escribiera en la lista verificada, se perdería
   la diferencia entre lo que el staff validó y lo que afirma un desconocido.

DB: `status` (`pendiente`/`aprobado`/`rechazado`), default **`aprobado`** para que lo ya
cargado no cambie. El `with check` de `birthdays_insert_own` es lo que hace segura la
autogestión: fuerza `user_id = auth.uid()`, `status = 'pendiente'` y `gift_given = false`
—sin lo último, un usuario podría insertarse el regalo como ya entregado—. `select` propio sí;
**update y delete del dueño, no** (una vez enviada la solicitud es del staff). Dos índices
únicos parciales frenan las repetidas (van dos porque `event_id` es nullable y los NULL no
colisionan entre sí). Storage: las fotos pasan a `{uid}/archivo.jpg` y la política nueva sólo
deja **escribir** en la carpeta propia — **leerlas sigue siendo exclusivo del staff**, ni el
dueño puede volver a bajar la suya. La foto se sube **al enviar**, no al elegirla: si cierra
el modal antes, no queda un archivo huérfano que el cliente no puede borrar.
UI: pestaña Cumpleaños con un tercer filtro **"A revisar"** (badge en rojo si hay algo) +
botones Aprobar/Rechazar; las listas de regalo muestran sólo `aprobado`. **Rechazar borra
(v17).**

## 6.2 Cargar la entrega pegando el mensaje de WhatsApp (sin migración)

El flujo real de una venta era: el cliente manda por WhatsApp el mensaje que **el propio
sitio le armó**, el staff lo pasaba a un Excel a mano y además lo retipeaba en la pestaña
Entregas. Ahora hay un botón **"Pegar mensaje"**: se pega el texto (Ctrl+V), se muestra
**qué se entendió** y al confirmar se abre el form de entrega de siempre con todo cargado.

**El formato vive en un solo archivo, `src/lib/purchaseMessage.ts`**, con
`buildPurchaseMessage()` (lo usa `TicketPurchaseModal`) y `parsePurchaseMessage()` (lo usa el
panel) **pegados uno al lado del otro**, compartiendo las etiquetas en la constante `MSG`. La
razón es concreta: si el armado cambia en un archivo y el parser queda en otro, el importador
se rompe **en silencio** —una carga que sale vacía, sin ningún error—. Al tocar el mensaje,
tocar los dos lados de una vez.

Decisiones del importador (`PasteMessageModal` en `Admin.tsx`):

- **No escribe en la base.** Deja el form pre-cargado (`DeliveryPrefill`) y guarda el staff.
  Así el importador no duplica la validación, el aviso de duplicado ni el vínculo al perfil.
- **Corta el bloque de la transferencia antes de buscar etiquetas.** El mensaje trae
  `Documento:` (del cliente) y `Documento del titular:` (de *nuestra* cuenta de cobro, v13).
  Sin ese corte se carga la cédula del titular como si fuera la del comprador.
- **Limpia el sello del chat** (`[12/9/26, 21:03] Juan: ` al principio de cada línea), que
  aparece cuando se copian varios mensajes o se exporta el chat. El nombre del remitente se
  saca sólo si lo que sigue no es una etiqueta conocida, para no comerse `Nombre completo:`.
- **`parseMoney`**: `$1.500` es 1500 (miles, como se escribe en Uruguay) y `1500,50` es
  decimal. La regla es cuántos dígitos quedan después del último separador.
- **El desglose por tipo de entrada va a Notas** ("2 General · 1 VIP"): `ticket_deliveries`
  sólo tiene `quantity` y `value`, así que si no se perdería qué compró cada uno. El documento
  también va ahí (la tabla tiene la columna `document_id`, pero el form nunca la expuso).
- Cruza el evento por nombre sin tildes ni mayúsculas (si no lo encuentra, se elige a mano) y
  el email contra los perfiles, para enganchar el `user_id` y el badge "Registrado" (v10).

**Bug arreglado de paso:** el modal de compra mostraba *"Promo cumpleaños aplicada · Aviso en
el mensaje de WhatsApp"* pero `buildMessage` **no escribía ninguna línea de la promo**
(`birthdayApplied` sólo pintaba el banner). La persona reclamaba el beneficio, quedaba
registrado en `birthday_promo_claims`, y al staff le llegaba un mensaje idéntico a cualquier
otro: se le cobraba el precio lleno. Ahora va la línea `PROMO CUMPLEAÑOS APLICADA`, que el
parser detecta y deja marcada en el resumen y en las notas de la entrega.

> El plegado de tildes (`foldText`) se subió de `UserSearchSelect` a `src/lib/utils.ts`, que
> ahora lo comparten el buscador y el parser. Usa `\p{M}` y no un rango `[U+0300-U+036F]`
> a propósito: el rango obliga a escribir marcas combinantes en el fuente, que se pegan al
> carácter anterior en cualquier editor.

**v17 — Rechazar una solicitud la borra.** El `status = 'rechazado'` de v16 era un registro
que **ninguna lista mostraba** pero que **sí sumaba en las tarjetas de totales** (el resumen
contaba `rows`, las listas `verified`): el panel decía que había cumpleañeros cargados que no
aparecían en ningún lado. Encima guardaba la foto de una cédula de alguien a quien se le
rechazó la solicitud. Ahora el botón ✕ llama a `deleteBirthday` (fila + foto del documento) y
el resumen cuenta sólo `aprobado`. No se pierde nada: los índices únicos de v16 sólo miran
las pendientes, así que la persona ya podía reenviar una corregida. El estado `rechazado`
salió del `check` de la DB y del tipo `BirthdayStatus`. **La migración incluye un `select`
previo con las rutas de las fotos a borrar a mano en Storage**: borrar la fila no borra el
archivo del bucket.

> **Retención:** las fotos de documento se guardan **sin plazo de borrado**. Fue una decisión
> explícita del autor, tomada después de plantearle un job de limpieza a 30/90 días. Si
> alguna vez se quiere un vencimiento, el molde es el `pg_cron` de `v8_cleanup_unconfirmed`.

---

## 7. Branding / UI

- **Paleta "Minimal Monochrome"** (en `src/index.css`): naranja `#F25C26`
  (token `celeste`, acento), tinta `#141414` (token `tinta`), papel blanco,
  rojo error `#E54B3C` (token `charrua`). Tipografía **Inter Tight**.
- **Mobile first** y responsive (Tailwind).
- **Pop-ups con estética ODÍSEA** (nada de diálogos nativos del navegador):
  - `src/components/ConfirmDialog.tsx` — `ConfirmProvider` + hook `useConfirm()`
    (promesa, `AlertDialog`, variante destructiva en rojo). Usado en Admin
    (borrar evento/usuario) y Profile (quitar foto).
  - **Toasts** (`sonner`) branded en `src/index.css` (bloque "Toasts (sonner)"):
    fondo tinta, texto papel, barra de acento por tipo (verde éxito / charrúa
    error / naranja default). `Toaster` en `src/components/ui/sonner.tsx`.
- Email de confirmación (`supabase/email-confirm-signup.html`): table-based +
  estilos inline, logo hosteado en `https://odiseaoficial.com/email-logo-white.png`.

---

## 8. Convenciones / forma de trabajar

- DB: tablas plural snake_case; PK `tabla_id`.
- Código: `lowerCamelCase`; componentes React en `PascalCase`.
- Ir **paso a paso**, explicar el porqué, mostrar los cambios antes de aplicar y
  confirmar. Después de cada módulo que quede funcionando, **commit** con mensaje
  claro (co-author de Claude). **Push sólo cuando el usuario lo pide.**
- Verificar antes de pushear: `npx tsc --noEmit -p tsconfig.app.json` y `npm run build`.
- Los pasos de dashboard (Supabase/Vercel/Resend) los ejecuta el usuario; Claude
  no tiene acceso a esas consolas.
