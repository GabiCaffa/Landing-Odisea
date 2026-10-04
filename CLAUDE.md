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
`v18_delivery_ticket_types.sql` → `v19_site_settings.sql` →
`v20_birthday_role.sql` → `v21_ticket_promos.sql` → `v22_manager_role.sql` →
`v23_profile_city.sql` → `v24_promo_windows.sql` → `v25_event_slug.sql` →
`v26_event_groups.sql` → `v27_site_banners.sql` → `v28_ticket_abono.sql`.
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

**v19 — Ajustes del sitio + tema estacional.** Para Halloween 2026 la landing cambia de
paleta. La pregunta era dónde vive el interruptor: en el código (deploy para prenderlo y otro
para apagarlo) o en la base (se prende desde el panel). Va en la base, y el motivo es
operativo: el sitio está **vendiendo entradas**, así que si el tema se ve mal en un celular a
las 3 de la mañana se apaga en 5 segundos en vez de esperar un deploy. Tabla `site_settings`
clave/valor — **genérica y no una tabla `theme`** porque cuesta lo mismo y la próxima bandera
global (un banner de aviso, "preventa cerrada") no va a necesitar otra migración. RLS:
**lectura pública** (la landing tiene que saber qué pintar antes de que nadie inicie sesión;
lo que se expone es el nombre de un tema) y **escritura sólo admin** — el operador no toca la
cara pública del sitio. Está en la publicación de realtime: al prender el tema, las pestañas
ya abiertas cambian solas. El valor **no se valida en la DB** a propósito (un CHECK con los
nombres de los temas obligaría a migrar cada vez que se agrega uno, y mete reglas de UN valor
en una tabla genérica): valida el front en `src/lib/siteSettings.ts`, que cae en `base` ante
cualquier valor que no reconoce.

Front: `src/contexts/ThemeContext.tsx` lee el valor, lo escucha por realtime y lo escribe como
`data-theme` en `<html>`, que es donde `index.css` redefine los tokens. Dos detalles que
explican el diseño:

1. **El panel queda afuera.** Los tokens son globales, así que `data-theme` en `<html>` pintaría
   también Admin — que es herramienta de trabajo interna y nadie de afuera ve. La única forma
   de excluirlo es no poner el atributo en esa ruta (`isThemedPath`). Envolver el panel y
   redefinir los tokens ahí **no sirve**: modales y toasts salen por portal, fuera del wrapper.
2. **Anti-flash.** El valor viene por red: sin nada más, cada carga pinta la paleta clara y
   después salta a la oscura. Un script inline en `index.html` aplica el último tema conocido
   (cacheado en `localStorage` por el provider) antes de que React monte.

UI: pestaña **Apariencia** en el panel (`AppearanceAdmin` en `Admin.tsx`), **sólo admin**. Las
muestras de color de esa pestaña están escritas a mano y no salen de los tokens a propósito:
como el panel no se tematiza, `bg-celeste` ahí siempre daría el naranja de siempre.

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

**v20 — Rol `cumples` (encargado de la promo de cumpleaños).** Tercer rol de staff,
al lado de `operador` (v11). Entra al panel y ve **únicamente** la pestaña
Cumpleaños: no ve Entregas —o sea, no ve las ventas, los montos ni los datos de los
compradores—, ni eventos, ni usuarios, ni cuentas de cobro.

> **Por qué NO alcanzaba con sumarlo a `is_staff()`.** Esa función es la que protege
> `ticket_deliveries`: agregarle el rol le abría la recaudación entera de una, que es
> exactamente lo contrario de lo que este rol existe para hacer. Va una función
> aparte y `is_staff()` queda intacta:
>
> - `is_staff()` → admin, operador → **Entregas**
> - `is_birthday_staff()` → admin, operador, cumples → **Cumpleaños + fotos de documento**
>
> El operador queda incluido en la nueva porque **hoy ya ve Cumpleaños**
> (`TABS_POR_ROL` en `Admin.tsx`): la migración no le saca acceso a nadie.

La política del bucket privado `id-photos` también pasa a `is_birthday_staff()`. Sin
eso el rol ve la lista pero no puede abrir la cédula, que es una de las cosas para
las que existe. La lectura de `profiles` se suma con una política **aparte**
(`profiles_select_birthday_staff`) en vez de modificar la de v11: varias políticas
permisivas se combinan con OR, así que agregar una no le saca acceso a nadie ni
depende del orden en que se corran las migraciones.

El candado del admin único (v6) no se toca: `enforce_unique_admin()` sólo reescribe
el rol cuando el email es el del admin oficial o cuando alguien intenta ponerse
`admin`, así que `cumples` pasa sin que lo toque.

**Front.** `TABS_POR_ROL` reemplaza al viejo `OPERATOR_TABS` + `if (!isOperator)`:
con dos roles limitados esa condición ya no alcanzaba y con tres era ilegible. El
sidebar y el ruteo leen la misma tabla, así que no puede aparecer un botón que la
pestaña después rechaza. **Es comodidad, no seguridad** — lo que separa los módulos
de verdad son las políticas RLS.

## 6.7 El aviso de WhatsApp al cumpleañero

Al **aprobar** una solicitud se abre un modal con el mensaje ya armado; el encargado
lo lee, lo edita si quiere y lo manda. **No manda nada solo**, y es a propósito: un
envío automático de verdad necesita la API de WhatsApp Business. Esto abre el chat
con el texto puesto, que es lo que el staff ya hacía a mano.

El modal se abre **después** de que la aprobación quedó guardada. Si el update falla
no tiene que aparecer un mensaje que le diga a la persona que su beneficio está
confirmado cuando en la base no lo está.

**El texto vive en `src/lib/birthdayMessage.ts`** y está calcado del que el staff ya
escribía: no es un texto inventado, el autor pasó la captura de un mensaje real. Por
eso no es un cupón ni un aviso formal sino una **presentación personal** — el
beneficio son regalitos que el encargado entrega en mano durante la noche, así que
lo que importa es que la persona sepa QUIÉN se los va a dar y tenga su número.

> Tres reglas del texto, pedidas explícitamente: **sin emojis** (van signos de
> exclamación en su lugar), **firma con el nombre real del encargado** —sale de su
> perfil; un "somos el equipo de ODÍSEA" impersonal rompe justo lo que el mensaje
> hace— y **que no suene a IA**: nada de viñetas, frases simétricas ni
> "¡Esperamos verte pronto!".

> **El evento es opcional en la ficha** (`event_id` es nullable desde v12), así que el
> mensaje se arma igual sin él: no nombra el evento ni cierra con "nos vemos el N",
> que sería hablar de algo que no existe. El día se saca cortando el string ISO y no
> con `new Date()`, por el mismo motivo que `formatEventDate`: interpretarlo como
> fecha lo pasa a UTC y puede devolver el día anterior.

> **El teléfono también es opcional.** Sin teléfono se aprueba igual, pero el botón
> queda deshabilitado explicando por qué, y queda el de copiar el mensaje. Nunca se
> abre un chat vacío.

> **El mensaje sale del WhatsApp del encargado, o sea de su número personal**, no del
> de ODÍSEA. Es consecuencia de abrir `wa.me` desde su teléfono, y acá es lo buscado:
> el texto justamente dice "te dejo mi número". Si alguna vez tiene que salir del
> número de ODÍSEA, no se arregla con otro link — hay que ir a la API de WhatsApp
> Business.

En las fichas ya aprobadas queda un botón de WhatsApp para reenviar: el mensaje sale
solo al aprobar, pero puede no haberse mandado ahí (sin teléfono en ese momento, o el
encargado cerró el modal). Y el filtro **"A revisar"** es el que abre por defecto para
el rol `cumples`, que es donde empieza su trabajo; admin y operador entran donde
entraban siempre.


**v21 — Promos de entrada (2x1, 2da al 50%, 3x2).** Catálogo `ticket_promos` +
unión `event_ticket_promos`, mismo molde que `ticket_types` ↔
`event_ticket_types` (v15) y por el mismo motivo: **la misma promo se aplica a
varios eventos**.

**Un solo mecanismo, tres números.** `cada N entradas, M con X% de descuento`.
La cuenta vive en `src/lib/ticketPromos.ts`:

    descuento = floor(cantidad / everyN) * discountedUnits * precio * percentOff / 100

| Promo | N | M | X |
|---|---|---|---|
| 2x1 | 2 | 1 | 100% |
| 2da al 50% | 2 | 1 | 50% |
| 3x2 | 3 | 1 | 100% |
| 3 al precio de 1 | 3 | 2 | 100% |
| cada 4, 2 a mitad | 4 | 2 | 50% |

> **El tercer número se agregó después de probarlo.** La primera versión tenía M
> fijo en 1, que alcanza para 2x1 y 3x2 pero **no** para "3 al precio de 1" ni
> "cada 4, dos a mitad de precio" — el autor lo detectó cargando promos reales.
> Un CHECK exige `M < N`: descontar las N sería regalar el grupo entero.

> **Con el doble de entradas la promo entra DOS veces**, a propósito. Si entrara
> una sola vez, premiaría comprar de a dos y castigaría comprar de a cuatro.
> Verificado: 4 entradas de $700 con "2da al 50%" pagan $2100.

> **Los tres números son INTERNOS.** El comprador ve el `name` que escribió el
> admin ("2x1") y el precio ya descontado, nunca la fórmula.

**El formulario se rehízo porque no se entendía.** La primera versión eran cajas
con las etiquetas "CADA N ENTRADAS" y "DESCUENTO EN 1 (%)": correctas y bastante
incomprensibles. Ahora tiene **atajos** (2x1, 3x2, 2da al 50%, 3 al precio de 1)
que cargan los tres números de un click —nadie piensa "cada 2, 1 al 100%", piensa
"2x1"—, la regla escrita como **una frase con los números adentro** ("Cada `3`
entradas, `2` salen con `100`% de descuento"), y el ejemplo en vivo con plata,
que es lo único que de verdad se lee.

> **Apunta al CATÁLOGO `ticket_types`, no a `event_ticket_types`.** Misma lección
> que v18: `saveEventTickets` **borra** filas de esa tabla cuando un evento deja
> de vender un tipo, y una FK ahí haría fallar la edición de las entradas de un
> evento que tenga una promo cargada.

> **Si dos promos vigentes se pisan sobre el mismo tipo, gana la que más
> descuenta.** La tabla permite varias a propósito —es lo que deja programar una
> de preventa y otra después, cada una con su ventana— y elegir la mejor para el
> comprador es la única regla que no necesita explicación. **No se acumulan.**

**Las fechas son inclusivas de los dos lados** y se comparan contra el día local,
armado con los getters de `Date` y **no** con `toISOString()`: ése pasa a UTC y
en Uruguay (UTC−3) devuelve el día siguiente desde las 21:00, así que una promo
que vence hoy se apagaría tres horas antes. Mismo motivo que `formatEventDate`.

**El total se calcula en el sitio** (decisión del autor sobre la alternativa de
mostrarlo informativo): el cliente ve lo que va a pagar y el staff no hace
cuentas. Eso toca el camino de la plata, y por eso:

> **El subtotal de cada línea del mensaje ya viene descontado**, así que **los
> ítems siguen sumando el TOTAL** y el importador del panel no necesita saber
> nada de promos para que la cuenta cierre — en particular, no salta el aviso de
> "no coinciden" de v18. La línea `PROMO:` va aparte y sólo explica por qué el
> total es más bajo que el precio de lista; sin ella, al vendedor le llega un
> número que no le cierra y parece un error de tipeo del cliente. Se toca
> `buildPurchaseMessage` **y** `parsePurchaseMessage` de una vez, que es la regla
> de 6.2.

> **El descuento se calcula UNA vez, en `lineas`.** De ahí salen la pantalla, el
> TOTAL y el mensaje. Antes el total se recalculaba en dos lugares; con
> descuentos de por medio eso es pedir que algún día muestren números distintos.

**UI.** Pestaña **Promos** (sólo admin) para el catálogo, en
`src/components/admin/PromosAdmin.tsx` — **fuera de `Admin.tsx`**, que ya pasa
las 5000 líneas; lo nuevo empieza afuera. Dentro del form de evento,
`EventPromosEditor` va **debajo** de `TicketsEditor` porque una promo se aplica
sobre un tipo de entrada: sólo se ofrecen los tipos que el evento ya vende, y si
se saca un tipo sus promos se caen solas. En la card del evento se muestra un
cartel con la promo —deduplicado por nombre y oculto si está agotado—, porque una
promo escondida detrás de un click no vende nada.

> **Trampa encontrada por TypeScript:** `promos.filter(promoVigente)` le pasa el
> **índice** como segundo argumento, que en esa función es `hoy`. Comparaba las
> fechas contra un número. Va `.filter((p) => promoVigente(p))`.

> **La carrera que hacía parecer que no se guardaba nada.** El autor reportó
> "clickeo la promo, guardo, y no se guarda" — pero en la base estaba bien. El
> realtime **sólo escucha la tabla `events`**: al guardar, `updateEvent` la toca
> y dispara una recarga que corre **antes** de `saveEventTickets` y
> `saveEventPromos`, así que lee el estado anterior. Y como
> `event_ticket_types` y `event_ticket_promos` no tienen suscripción propia,
> nada la vuelve a disparar. Por eso `AuthContext` expone `refreshEvents` y el
> guardado lo llama **al final**. Es el mismo bug latente que tenían las entradas
> desde v15.


**v22 — El operador gestiona el panel casi entero.** Hasta acá veía 2 de 9
pestañas, porque todo lo demás —eventos, entradas, promos, cuentas,
apariencia— colgaba de `is_admin()`. Ahora hace el trabajo del día: crea y
edita eventos, tipos de entrada y promos.

    is_admin()           → sólo lisoftuy@gmail.com
    is_manager()         → admin, operador          ← NUEVA
    is_staff()           → admin, operador          → Entregas          (v11)
    is_birthday_staff()  → admin, operador, cumples → Cumpleaños        (v20)

> **`is_manager()` e `is_staff()` dan hoy el mismo conjunto y aun así son dos
> funciones.** No es duplicación: significan cosas distintas —"puede gestionar
> el contenido del sitio" contra "puede ver la recaudación"— y el día que
> aparezca un rol que sólo cargue eventos se cambia una sin tocar la otra.

**Qué NO puede el operador, y por qué.** `payment_accounts` es a dónde va la
plata; `site_settings` es la cara pública; `profiles` es cambiar roles y dar
de baja gente (la lee entera, no la escribe); y el DELETE de `events`,
`ticket_types` y `ticket_promos`, que no se deshace.

> **El corte de DELETE es por tabla, no por rol.** Las tablas de unión
> (`event_ticket_types`, `event_ticket_promos`) SÍ le dejan borrar, y es
> obligatorio: `saveEventTickets()` y `saveEventPromos()` **borran** las filas
> que salieron antes de insertar las nuevas (v15, v21). Ahí "borrar" es un paso
> de editar un evento, no una baja. Lo que queda cerrado es borrar el EVENTO
> entero o un tipo/promo del CATÁLOGO, que le pega a todos los eventos.

> **El candado de la cuenta de cobro es un trigger, no una política.** Sin él,
> "el operador no toca las cuentas" sería mentira: no puede crear ni editar una,
> pero podría **editar un evento** y apuntarlo a otra. El techo del daño es bajo
> —sólo elige entre cuentas que ya existen— pero la promesa tiene que valer en
> la base y no sólo en la pantalla. `events_payment_account_lock` corre sólo en
> UPDATE: al CREAR hay que poder elegirla, porque `payment_account_id` es
> `not null` (v13).

**Front: `src/lib/adminPermisos.ts`** reemplaza a `TABS_POR_ROL`. Esa era una
lista de pestañas y ya no alcanza: "ve Eventos" y "puede borrar un evento" son
dos preguntas distintas y una lista sólo contesta la primera. Cada permiso tiene
su espejo en la base, anotado en el archivo; si se agrega uno que la base no
tiene, el botón aparece y la acción falla con un error de RLS. El hook
`usePuede("eventos:borrar")` existe para que esconder un botón sea **una línea**:
si cuesta tres, termina no haciéndose.

**v23 — Ciudad en el perfil.** `profiles` guardaba país y departamento (v3) y
eso es demasiado grueso para decidir dónde hacer una fecha: de los eventos
cargados, **dos son en el departamento de Colonia pero en ciudades distintas**
—Colonia del Sacramento y Nueva Helvecia—, y para el filtro del panel eran el
mismo "Colonia".

**La columna es nullable, y no es pereza.** Ponerla `not null` obligaría a
inventarle un valor a todos los perfiles que ya existen, y un `''` o un
"Sin especificar" es **peor que un NULL**: se cuela en los filtros como si fuera
una ciudad de verdad y no hay forma de distinguir "no lo sabemos" de "eligió
eso". Se exige en el **registro nuevo**, que es donde se puede exigir sin
mentirle a nadie.

**El catálogo vive en `src/lib/ciudades.ts`, NO en `locations.ts`.** Ese archivo
lo importa `PhoneInput`, que sí está en la cara pública, así que las 122
localidades viajarían de arrastre con el prefijo telefónico de cada país. Es la
trampa de `manualChunks` (§6.4) a nivel de módulo.

> **Lista y no texto libre.** "Nueva Helvecia", "nueva helvecia" y "N. Helvecia"
> son tres ciudades distintas para un filtro, y los desplegables del panel se
> arman **con los datos que hay** (§6.9): texto libre los convierte en un puré.
> Pero la lista tiene las localidades principales, no las ~1.100 del país, así
> que **siempre hay una opción "Otra"** que deja escribir: sin salida, alguien de
> un pueblo chico no puede terminar de registrarse, y eso es mucho peor que un
> dato imperfecto. Lo que llega por "Otra" se guarda tal cual y se ve en el
> panel; si una se repite, se sube al catálogo.

> **El valor NO se normaliza en la DB.** Un trigger que "arregle" mayúsculas y
> tildes rompe el nombre propio de un pueblo antes de arreglar nada.

> **Sin el cambio al trigger, el campo se perdía en silencio.** El perfil no lo
> crea el front: lo crea `handle_email_confirmed()` al confirmarse el email
> (v7), leyendo la metadata de `auth.users`. Si esa función no copia `city`, el
> registro pide la ciudad, la manda... y nunca llega a `profiles`. La migración
> reescribe la función entera porque no hay forma de agregarle una columna a una
> función; lo único que cambia respecto de v7 son tres líneas.

> **El único backfill posible es Montevideo**, que es el único departamento del
> país con una sola ciudad. Cualquier otra deducción sería inventar el dato.

**Se le pide a los que ya están, sin trabarlos (`AvisoCiudad`).** Una barra
abajo con el desplegable ahí mismo y un "Ahora no" de verdad; quien la cierra no
la vuelve a ver por dos semanas. La alternativa era un modal que no se puede
saltear: llena la base más rápido, pero **si le aparece a alguien que estaba por
comprar una entrada, se pierde la venta** — y es justo la gente que más
interesa. No vuelve "nunca más" a propósito: el dato sigue haciendo falta y la
persona puede estar apurada hoy y no la semana que viene.

> **Son dos archivos (`AvisoCiudad` + `AvisoCiudadBarra`) por dos motivos.** La
> barra importa el catálogo de localidades, así que tiene que ir diferida o entra
> en el bundle de la landing para cualquiera que pase a mirar una fiesta. Y un
> `lazy` suelto que se suspende durante el render inicial —que es síncrono— hace
> que React avise por consola en **cada carga**, aunque el `fallback` sea `null`
> y no se vea nada; un error benigno que aparece siempre es exactamente lo que
> después tapa uno de verdad. Con el chequeo de sesión afuera, la suspensión pasa
> a ocurrir cuando llega `currentUser` —un cambio asincrónico— y no hay aviso. De
> yapa, el chunk **no se descarga** para quien no lo necesita.

> **El campo de ciudad de `LocationSelect` es opt-in por prop.** Ese componente
> lo usa también el formulario de cumpleaños del panel, y `birthday_signups`
> **no tiene columna de ciudad**: si apareciera solo, ahí se completaría para
> nada y encima `required` trabaría un formulario que el staff usa a diario.

> **Si el valor guardado no está en la lista, el campo abre en modo "Otra" con el
> texto puesto.** Sin eso, alguien que escribió "Puerto Gómez" abre su perfil, ve
> el desplegable en "Seleccioná..." y **al guardar pierde su ciudad sin haber
> tocado nada**.

> **Los nombres de los departamentos tienen que coincidir exactamente con los de
> `locations.ts`.** Si no coinciden, el desplegable de ciudad queda vacío y **no
> falla nada**: es silencioso. Por eso `departamentosSinCiudades()` existe y hay
> una prueba que la usa.

**v24 — Promos con vencimiento por evento, cupo y precio especial.** Base de la
sección "PROMOS ACTIVAS" de la home con contador regresivo. Tres cambios:

1. **La ventana pasa a la asignación y lleva hora.** `event_ticket_promos`
   gana `starts_at`/`ends_at` `timestamptz`: el mismo "2x1" puede vencer el
   viernes en una fecha y el sábado en otra, y un contador necesita hora. Las
   ventanas de v21 (`date`, en el catálogo) se copian **una sola vez** —al
   crear las columnas— como 00:00 a 23:59:59 hora de Uruguay. Las columnas del
   catálogo quedan **obsoletas pero no se borran** todavía: el front viejo las
   usa.
2. **Mecanismos nuevos.** "% off en todas" es la fórmula de v21 con N = 1; el
   CHECK de unidades se reescribió para prohibir sólo descontar el 100% de
   todas. "Precio especial" es `kind = 'precio_especial'` con el precio en
   `event_ticket_promos.special_price` (depende del evento y del tipo). Un
   trigger exige precio para ese tipo y lo rechaza para los descuentos, y otro
   impide cambiarle el tipo a una promo que ya está en un evento.
3. **Cupo contado desde las ventas.** `quota` (entradas, las de regalo
   incluidas) en la asignación; lo vendido sale de
   `delivery_ticket_types.promo_id` (nueva, `restrict`), no de un contador a
   mano. La home lo lee con la RPC `promo_cupos_restantes()`
   (`security definer`, sólo devuelve el número restante).

**Front.** `promoVigente` compara instantes (`Date.parse`), no días. El cupo
se aplica sólo a las entradas que quedan (quedan 3 y se compran 4 en 2x1: un
2x1 y dos a precio de lista). Las fechas se **muestran** siempre en hora de
Uruguay (`formatFinPromo`, armado con `formatToParts` porque `format()` cambia
entre motores: salía "11:59 p. m."). `AuthContext.loadEvents` pide
`promo_cupos_restantes` en paralelo y lo cuelga en `EventPromo.remaining`; si
falla, las promos se muestran igual. En el form de evento las fechas se cargan
**una vez por promo** (el editor las copia a todas sus filas) y el cupo y el
precio van por tipo. En Entregas cada tipo tiene "Promo aplicada", que el
importador de WhatsApp completa cruzando la línea `PROMO:` (el parser ahora la
devuelve desarmada en `promoLines`); si no la puede cruzar, avisa.

**Home: `PromosActivasSection`**, entre el hero y los eventos. Una tarjeta es
**una promo en un evento** (el mismo 2x1 sobre General y VIP es una sola que
dice "en General y VIP"), ordenadas por la que vence antes. **Si no hay
ninguna vigente la sección no se renderiza**, ni el título. Con más de
`HORAS_CONTADOR` (72) horas dice "Hasta el vie 12/10, 23:59"; después,
contador de días/hs/min/seg, en rojo en la última hora. El reloj late cada
segundo **sólo** si hay un contador a la vista; si no, cada minuto. El
contador es `role="timer"` sin `aria-live` (anunciar cada segundo es
inusable) y con el dato en el `aria-label`. "Comprar" abre el mismo
`TicketPurchaseModal` del evento, que aplica el descuento con la misma
`promoVigente`.

> **`fetchDeliveries` ahora TIRA si la consulta falla.** La v18 nunca se había
> corrido en producción: el embed fallaba, devolvía `[]` y la pestaña Entregas
> se veía vacía sin ningún error. Ahora el panel muestra el error.

> **Ojo en la transición:** `saveEventPromos` borra y reinserta las filas de
> `event_ticket_promos` **cada vez que se guarda un evento**, aunque no se
> toquen sus promos. Con el front anterior a v24 eso **borra las ventanas
> migradas**. Entre correr la migración y el deploy, no guardar ningún evento.

**v25 — URL propia por evento.** `odiseaoficial.com/evento/halloween-colonia`.
Nace de dos necesidades que se pedían juntas: **poner una fecha en un anuncio** y
**que compartirla por WhatsApp muestre el flyer de esa fiesta** y no el logo.
Estaba propuesto desde el 16/09/2026 y pospuesto a propósito.

**Son dos mitades con costos muy distintos, y conviene no confundirlas.**

1. **La página funciona al instante.** La arma React leyendo Supabase, igual que
   todo el resto: una fecha creada hace cinco minutos ya tiene URL. Para un
   anuncio esto alcanza — el creativo se sube a Meta, no sale del `og:image`.
2. **El preview del link NO se actualiza solo.** WhatsApp, Instagram y Facebook
   **no ejecutan JavaScript**: leen el HTML crudo. Por eso se hornea un archivo
   real por evento en el build, y por eso el panel tiene el botón
   **"Actualizar páginas"** (dispara un Deploy Hook de Vercel, guardado en
   `admin_settings`).

> **El botón no "publica" el evento, que ya está publicado.** Pone al día el
> preview y el sitemap. Por eso dice lo que dice y no "Publicar".

**El slug es una COLUMNA, no algo que se calcula del nombre al vuelo.** Si se
derivara, cambiarle una tilde a un evento rompería todos los anuncios que estén
corriendo. Y lo garantiza un **trigger** y no un `not null`: el `not null`
obligaría al front a inventarlo y haría fallar cualquier insert hecho a mano.
El trigger además **normaliza** el que se manda, así que el panel no puede
guardar una URL inválida ni escribiéndola con espacios y tildes.

> **El backfill va fila por fila y no en un solo UPDATE.** En una sola
> sentencia, el trigger de cada fila lee el snapshot del inicio: dos eventos con
> el mismo nombre no se ven entre sí, calculan el mismo slug y el índice único
> revienta.

> **`slugify` usa `translate` y no la extensión `unaccent`**, que hay que
> instalar y no está en todos los proyectos. El mapeo tiene que tener **el mismo
> largo de los dos lados** o Postgres borra los sobrantes en silencio (hay una
> verificación de eso).

**El carrusel: la tarjeta entera lleva a la página**, botón de comprar incluido.
Va con un *stretched link* —un `::after` del `<Link>` del título que cubre la
tarjeta— y **no** envolviendo todo en un `<a>`: adentro hay otros dos links
(Comprar e Instagram) y **un `<a>` dentro de otro `<a>` es HTML inválido**, el
navegador rompe el árbol y el de adentro deja de andar.

> **`eventsLoaded` en `AuthContext`** distingue "la consulta todavía no volvió"
> de "no existe". `loading` es de la SESIÓN y se apaga mucho antes; sin esta
> bandera, quien llega desde un anuncio pagado ve "no encontramos esa fecha"
> medio segundo y se va.

**El horneado vive en `vite/paginasEvento.ts`, fuera de `vite.config.ts`.** No es
sólo por tamaño: así `htmlDeEvento` se puede **importar y probar**
(`scripts/probar-paginas-evento.mjs`, 31 chequeos contra el `dist` real). Corre
en `closeBundle` y parte del `dist/index.html` **terminado** —con el tema, el CSS
crítico y los scripts con hash—, en vez de engancharse a `transformIndexHtml` y
depender del orden de los plugins.

> **La prueba ya encontró un bug, y del tipo que no se ve.** La primera versión
> reemplazaba el **primer `<noscript>`** del documento… que no es el de contenido
> sino **el de la hoja de estilos** para quien tiene JavaScript apagado (§6.6).
> Dejaba a ese visitante sin estilos y metía un `<h1>` dentro del `<head>`. El
> archivo se veía perfecto. Ahora se ancla a `#root`. Es la misma forma de falla
> que el `.replace("<body>", …)` de §6.8.

> **Los datos estructurados se REEMPLAZAN, no se agregan.** `bakeEventos` dejó en
> el HTML un `Event` por cada fecha; en la página de UNA fecha, tener las cuatro
> le dice a Google que la página habla de las cuatro.

> **Se sacan `og:image:width/height/type`.** Los de la home (1200×630) son de una
> imagen apaisada hecha a propósito; los flyers son verticales, y declarar una
> medida que no es la real hace que WhatsApp recorte mal.

> **Se publica página para TODOS los eventos, también los que pasaron.** Un link
> repartido no deja de existir porque la fiesta terminó. Lo que sí queda afuera
> del **sitemap** es lo viejo.

**Falla en silencio, como `bakeTheme`.** Si Supabase no contesta durante el build
no se emite ninguna página: las URLs siguen andando por el rewrite, sin preview
propio. El **sitemap base sobrevive** porque se reescribe encima del que emitió
`seoEstatico` en vez de moverse ahí.

> **PENDIENTE DE VERIFICAR EN PRODUCCIÓN:** que Vercel resuelva
> `/evento/<slug>` (sin barra final) al archivo
> `evento/<slug>/index.html` **antes** de aplicar el rewrite de la SPA. El
> proyecto ya depende de que un archivo real le gane al rewrite (`sitemap.xml`,
> §6.8), pero eso es una ruta exacta y esto necesita además resolución de
> índice de directorio. **`vite preview` NO lo hace** —con barra final sí sirve
> el horneado, sin barra gana su fallback— así que localmente no se puede
> comprobar. Si en producción fallara, lo que se pierde es sólo el preview: la
> página se ve igual porque la arma React.

**Un solo camino a la compra: `CompraEntradas`.** El componente que era
`TicketPurchaseModal` toma un `modo`:

- `modal` — sobre el sitio, con velo y botón de cerrar. Lo usan las dos
  secciones de promos de la home.
- `pagina` — dentro de la página del evento, **sin cáscara y sin botón que lo
  abra**: el formulario está puesto. Un modal encima de una página que ya es de
  ese evento es un paso de más, y a esa página se llega desde un anuncio.

> **Es un parámetro y no dos componentes**, y el motivo es el camino de la
> plata: las cantidades, los descuentos, el total y el armado del mensaje tienen
> que salir del MISMO código. Dos copias que algún día muestran números
> distintos es exactamente lo que no puede pasar.

> **En la página se entra derecho al formulario.** El paso de "iniciá sesión o
> seguí como invitado" es un empujón a registrarse, y en el modal está bien
> porque ahí la persona ya decidió comprar; en la página del evento es una pared
> antes de ver siquiera el precio. El empujón queda como una línea arriba del
> formulario. **Ojo:** no alcanzaba con el valor inicial del `useState` — hay un
> efecto que vuelve a `auth-prompt` cuando no hay sesión, y pisaba el valor.

> **El pie fijo es del modal, no de la página.** Se intentó con
> `sticky bottom-0` y **no funciona**: el pie es el último hijo de su
> contenedor, así que no hay rango donde pegarse —sticky necesita contenido
> debajo dentro del mismo contenedor—; medido, quedaba 47 px por debajo del
> viewport. Y `fixed` sería peor, porque chocaría con la barra de
> `AvisoCiudad` (v23), que también es fija abajo. Igual acá no hace falta: el
> problema de §6.5 era de una **hoja de alto fijo** donde el cuerpo scrollea
> adentro, no de una página.

**El flujo de la página, medido y acortado.** La primera versión se veía bien
y funcionaba mal. Los números, en un teléfono de 375×812:

| | antes | después |
|---|---:|---:|
| Scroll hasta ver el primer precio | 845 px | **en pantalla** |
| Vacío a la izquierda en escritorio (1440×900) | 520 px | **0** |
| Por qué el botón está apagado | no se decía | se dice |

**El precio estaba a una pantalla de distancia.** "Seleccionar entradas"
arrancaba a los 845 px con una ventana de 812: había que scrollear más que el
alto del teléfono para ver cuánto salía. Ahora hay un "Desde $X" arriba, junto a
la fecha y el lugar.

**El flyer se capa al 45 % de la pantalla en celular** (`object-contain`, así se
sigue viendo entero) y **tocarlo lo abre a tamaño real** en una pestaña, donde el
navegador da zoom con los dedos — mejor que cualquier visor propio.

> **Capar el flyer solo no alcanzaba:** se midió después del cambio y había
> ahorrado 31 px. El espacio se iba en partes iguales entre el flyer (367),
> el título que se parte en tres líneas (86) y el bloque de fecha/lugar/precio
> (128). Vale la pena medir el reparto antes de tocar una sola cosa.

**En escritorio la columna del flyer va `sticky`.** La columna derecha mide el
doble que la izquierda (1172 contra 583), así que al bajar quedaban 520 px de
nada. Pegado, el flyer acompaña toda la compra. Verificado: con 300 px de scroll
el flyer queda clavado en `top-6`.

**La descripción pasó DEBAJO de las entradas** (decisión del autor): primero el
precio y el contador, después el texto.

**Con sesión, "Tus datos" se muestra resumido.** Tres campos grandes con datos
que ya tenemos del perfil es pedirle a la persona que revise algo que no tiene
que tocar. Queda una línea con nombre, email y teléfono más un "Editar"; los que
FALTAN sí aparecen como campo, ahí mismo.

> **El caso que lo destapó:** una cuenta **sin teléfono en el perfil**. Los otros
> dos campos venían llenos, así que el formulario se veía completo, el botón
> estaba gris y **la pantalla no decía nada**. Ahora debajo del botón se lee
> "Falta tu teléfono" y el campo aparece suelto, sin tener que entrar a "Editar"
> por un solo dato.

> **El `useState` de "estoy editando" va arriba del `if (!isOpen) return null`.**
> Puesto donde se usa, quedaba después de un return temprano y cambiaba el orden
> de los hooks entre renders. Lo cazó el lint; es la segunda vez en el proyecto
> que aparece esta misma forma de falla.

**Todo el flujo entra en UNA pantalla, sin scroll.** Es lo que pidió el autor,
sobre la alternativa de hacerlo en pasos. La cuenta, en un teléfono de 375×812
(quedan 743 px bajo el header): el layout anterior sumaba **~1400 px**.

| | ¿entra sin scroll? | |
|---|---|---|
| Celular (375×812) | **sí** | 0 px de scroll |
| Tablet (768×1024) | **sí** | 0 |
| Escritorio (1440×900) | **sí** | 0 |
| Portátil bajo (1440×768) | no | 123 px de scroll |
| Celular chico (375×667, tipo SE) | no | 136 px |

Medido **con entradas elegidas**, que es el caso largo: ahí aparecen los tres
campos de datos.

> **La página del evento NO lleva `<Footer />`.** Pedido explícito del autor:
> tiene que ser una pantalla y nada más. Los links de Términos y Privacidad
> siguen en el footer de la home. Si alguna vez una plataforma de anuncios los
> exige en la página de destino, es acá donde hay que volver a ponerlos.

> **El flyer no lleva marco.** Tenía `border border-border bg-papel`; el fondo
> estaba para que un PNG con transparencia no quedara flotando, pero con
> `object-contain` lo que hace es pintar de claro las franjas que sobran — o
> sea, un marco alrededor del arte. Sin fondo, esas franjas muestran el fondo
> de la página y desaparecen.

> **El `<Header>` es `fixed top-0 z-50` y mide 69 px en celular y 85 en
> escritorio: flota SOBRE el contenido.** El resto de las páginas lo compensan
> con `pt-24 md:pt-32` en su `<main>`; la home no lo necesita porque el `<Hero>`
> está hecho para pasar por debajo. **La página del evento no tenía ninguno de
> los dos**, así que el link de "Todas las fechas" quedaba tapado y —peor— el
> click se lo comía el header: `elementFromPoint` sobre el link devolvía un
> `div` del header. El bug estuvo desde que se creó la página y recién se hizo
> visible al apretar los márgenes.

> **El link de volver se sacó en vez de moverse.** Era justo el que quedaba
> debajo del header, y el header ya lleva a la home por dos lados: el logo
> (`/`) y "Eventos" (`/#eventos`, que además cae directo en la sección). Entre
> eso y el `pt` que ahora despeja el header, el saldo de píxeles queda parejo.

**En escritorio lo que más pesaba no era el formulario sino el TÍTULO.** Con
`max-w-5xl` la columna de texto queda en 470 px y un nombre como "ODISEA x
OVERSIZE HALLOWEEN PAYSANDU" se parte en **cuatro líneas (~230 px)**. Pasando a
`max-w-6xl` entra en dos (80 px) — ensanchar no agranda los campos, que son de
ancho completo igual. Eso solo se llevó 130 de los 149 px que faltaban; el resto
salieron de separaciones `sm:` que estaban generosas. **El flyer se capa también
en escritorio** (`md:max-h-[72vh]`): al ensanchar el contenedor su columna crecía
y pasaba a ser ella la que no entraba.

> **El techo de esta decisión.** Entra con **dos o tres** tipos de entrada; con
> más, vuelve a scrollear. Hacerlo en pasos escalaba sin límite y se descartó a
> propósito. Si algún día una fecha vende cinco tipos, esto es lo primero que
> se cae.

Lo que se recortó: filas de entrada en **una sola línea** con el nombre truncado
(§6.5 las apilaba en celular para que un nombre largo no se partiera contra el
contador; truncar cuesta 0 px de alto), campos más bajos, la descripción del
tipo de entrada fuera, el aviso de sesión en una línea y **los datos de la
transferencia plegados** — ese bloque mide ~230 px y aparece justo al final,
cuando menos lugar queda; el mensaje de WhatsApp los lleva igual.

**El flyer pasa a miniatura en celular** (96 px, flotando a la izquierda del
título) y sigue grande en escritorio. Tocarlo lo abre a tamaño real.

> **Dos trampas de CSS, las dos del mismo tipo: `float` no funciona contra un
> contenedor que crea su propio contexto de formato.**
>
> 1. El contenedor era `grid gap-6 md:grid-cols-2` — o sea **grid también en
>    celular**, de una columna. Dentro de un grid el `float` no hace nada: el
>    flyer y el texto quedaban apilados. Va `md:grid`, sin `grid` a secas.
> 2. La columna del contenido era `flex flex-col`. **Un contenedor flex no se
>    superpone a un float: se encoge al lado.** La columna entera quedó de
>    235 px y los nombres de las entradas se truncaban a "G...". Va
>    `md:flex md:flex-col`, y el bloque de compra lleva `clear-both`.

> **Ninguna de las dos daba error ni se veía rota a simple vista** — se veían
> como un problema de diseño. Las encontró medir el ancho de la fila (235 px
> donde debía haber 343).

**La tarjeta del carrusel perdió el botón de comprar.** La tarjeta entera ya es
el link a la página, así que un botón al lado era una segunda llamada a la
acción compitiendo con ella, en una tarjeta que ya tiene flyer, fecha, lugar y
cartel de promo. Queda una pista —"VER Y COMPRAR →"; sin algo, nada dice que la
tarjeta lleva a algún lado— y el acceso a Instagram, que va a otro destino y por
eso sigue siendo un botón de verdad.

> **Lo que se paga:** desde la home ahora hay un toque más para comprar. Es la
> decisión del autor y tiene sentido —la página del evento convierte mejor que
> una tarjeta— pero si alguna vez se mide una caída en las ventas que vienen de
> la home, acá está el cambio que la explica.

> **`admin_settings` es una tabla aparte y no `site_settings`.** Esa es de
> **lectura pública** a propósito (la landing tiene que saber qué tema pintar
> antes de que nadie inicie sesión). El Deploy Hook no expone datos, pero quien
> lo tenga puede hacer que el sitio se reconstruya en loop y quemar la cuota de
> builds.

> **El botón dispara el hook en `no-cors`, así que NO se puede saber si salió
> bien.** Los deploy hooks de Vercel están pensados para llamarse desde un
> servidor y no mandan cabeceras CORS: el navegador deja salir el POST pero no
> deja leer la respuesta. Por eso el cartel dice "pedido enviado" y no "listo" —
> confirmarlo pedía un proxy, o sea el primer pedazo de backend del proyecto.

**v26 — Fiestas de varios días (selector de día).** Una fecha que dura tres
días son **tres eventos separados**: cada día tiene sus entradas, sus precios,
su venta y su URL, y **se compra por separado** (decisión del autor: quien va
viernes y domingo hace dos compras). Lo único que faltaba era que el sitio
supiera que van juntos.

**Dos columnas en `events` (`group_key`, `group_name`), no una tabla
`event_groups`.** El proyecto viene eligiendo tablas de catálogo (v13 cuentas,
v15 tipos, v21 promos) y acá **no corresponde**, porque el motivo de aquéllas no
se cumple: una cuenta o un tipo de entrada **se reusan entre eventos distintos**
y por eso conviene tenerlos una sola vez. Un grupo lo usan exactamente sus
propios días. Sería una fila con un solo campo útil, más su CRUD, más una
pestaña, para algo que el autor avisó que "seguramente no usemos más allá de
esto".

> **Lo que se paga:** `group_name` queda repetido en los días. Si no coinciden
> gana el del día más temprano. Renombrar un grupo es editar sus eventos de a
> uno.

> **El grupo NO tiene slug propio**, y es a propósito: sería un segundo espacio
> de nombres que podría chocar con `events.slug` (v25) sin que ningún índice lo
> impida. No hace falta — **cada día ya tiene su URL**, y la página de cualquier
> día muestra el selector con todo el grupo. Un anuncio apunta al día que se
> quiera.

> **El `group_key` se normaliza con un trigger** (`slugify()` de v25). Es lo
> que une a los días: sin eso, "Halloween XXL" y "halloween-xxl" serían dos
> fiestas de un día cada una. El panel igual ofrece los grupos que ya existen en
> un desplegable —armado **con los datos que hay**, como los filtros de §6.9—
> así que esto es el cinturón para lo que se cargue a mano por SQL.

**Front.** Todo es derivación en memoria (`src/lib/grupos.ts`): no hay ninguna
consulta nueva, los eventos ya venían todos.

- **La home colapsa el grupo en UNA tarjeta** (`agruparEventos`), ubicada donde
  está su primer día. Muestra el nombre de la fiesta, el rango de fechas y la
  pista "Elegí tu día (3)". **Sin ningún evento agrupado la función es la
  identidad**, así que no cambia nada de lo que ya existe.
- **Agotado sólo si lo están TODOS los días**, y la tarjeta entra por el primer
  día que todavía venda: mandar a alguien a un día agotado cuando los otros dos
  tienen entradas es perder la venta. Por eso `soldOut` y `tickets` se le dan
  resueltos a `EventCard` y **no** se le pasa `saleEndsAt` — el cierre de un
  día no cierra la fiesta.
- **El lugar se omite si los días no coinciden.** Decir "Ruta 90 km 6" cuando
  dos de los tres días son en otro lado es peor que no decir dónde: el que lee
  no vuelve a mirar.
- **El selector son `<Link>`, no botones con estado.** Cada día es una página
  propia (v25), así que elegir un día es navegar — y por eso el día elegido se
  puede compartir, abrir en otra pestaña y deshacer con el botón de atrás. Va
  **arriba** de las promos y las entradas porque lo que se elija ahí cambia los
  precios, las promos y el cupo de todo lo que está debajo.
- **El H1 es el nombre de la FIESTA**, que es el que dice el anuncio por el que
  llegó la persona; el nombre propio del día va debajo del selector si difiere
  (tres días pueden tener line-ups distintos y ese dato no está en ningún otro
  lado). **El día agotado se muestra igual, apagado**: sacarlo deja a alguien
  buscando una fecha que vio en el anuncio.

> **Las fechas se arman cortando el string ISO**, y el día de la semana sale de
> `Date.UTC` + `getUTCDay`. Con `new Date(iso)` + `getDay()` en Uruguay
> (UTC−3) un evento del sábado se anuncia como viernes. Es la misma trampa de
> `formatEventDate` y de §6.9.

> **Un solo día sigue saliendo con `formatEventDate` ("31 OCTUBRE 2026").** El
> rango abrevia los meses ("31 OCT – 1 NOV 2026") porque el nombre completo dos
> veces no entra en la píldora, pero cambiar el formato de lo que ya existía
> habría sido un cambio visual que nadie pidió.

**Medido con dos días agrupados: la página sigue entrando sin scroll** en
375×812 y en 1440×900, que es el techo que fijó v25. El selector cuesta ~56 px y
todavía hay margen; con 5 días en una fila angosta vuelve a scrollear.

> **Lo que NO se tocó:** `PromosActivasSection` sigue mostrando **una tarjeta
> por promo y por día**. Es discutible, pero es lo correcto hoy: cada día tiene
> su propia ventana, su cupo y su precio, así que colapsarlas escondería que
> vencen en momentos distintos.

**v27 — Banners del hero (slider de la home).** El hero pasa a poder ser un
slider de banners que carga el staff. Hoy son 3, de **1920×600**.

**Sí una tabla, cuando el cartel de §6.0 fue una clave suelta.** Un banner no
es un valor: son varias filas, con orden entre ellas, cada una con su imagen,
su texto alternativo y su link. La regla que viene siguiendo el proyecto se
mantiene — **un valor global va a `site_settings` (v19), una lista ordenada va
a su tabla**.

**El interruptor sí va a `site_settings`** (clave `hero` = `clasico` |
`banners`), y no es "¿hay banners activos?", por el mismo motivo operativo de
v19: se cargan los tres, se miran, y recién ahí se prende; y si a las 3 de la
mañana se ve mal se apaga en 5 segundos sin borrar nada. **Sin la fila cae en
`clasico`**, así que correr la migración no cambia la home por sí sola.

**Escritura sólo admin**, con el criterio de v22: el operador gestiona el
contenido (eventos, entradas, promos) pero no la cara pública. El hero es LO
PRIMERO que ve cualquiera. Para abrirlo al operador se cambia la política a
`is_manager()` y la línea del permiso en `adminPermisos.ts`; no hay nada más.

**Las imágenes van al bucket que ya existe** (`event-images`, bajo `banners/`):
un bucket nuevo son políticas nuevas de `storage.objects` para ganar nada, que
un banner es tan público como un flyer.

### El problema del 1920×600 en un celular

**3,2:1 en un teléfono de 375 px son 117 px de alto.** Donde había un hero de
pantalla completa queda una franja fina, y el 99% del tráfico entra desde el
teléfono. No se resuelve recortando a ciegas —eso corta justo lo que el
diseñador puso en los costados— así que cada banner acepta una **versión
vertical opcional** (1080×1350). El panel avisa cuántos banners activos no la
tienen, con la medida exacta para pedírsela al diseñador.

> **La proporción es UNA para todo el carrusel**, decidida por el conjunto:
> vertical sólo si **todos** los banners tienen versión vertical. Mezclar no es
> una opción y no por prolijidad: las diapositivas son items de un flex, así
> que **se estiran a la más alta** — medido, con un 4:5 al lado de dos 16:5 los
> tres quedaban en 469 px y a los apaisados les entraba `object-cover` y se
> les comía los costados. En silencio, que es exactamente lo que se quería
> evitar.

> **El header fijo tapaba el 59% del banner.** `<Header>` es `fixed top-0` y
> mide 69/85 px: medido, de los 117 px de la franja tapaba 69, y el click de
> arriba se lo comía (`elementFromPoint` devolvía un div suyo). El hero
> clásico no lo sufre porque está hecho para pasarle por debajo. **Van tres
> veces en el proyecto** —la página del evento en v25 fue la anterior—, así
> que: contenido nuevo arriba de todo = acordarse del `pt`.

### Sin librería de carrusel

`manualChunks` manda cualquier dependencia nueva al chunk `vendor`, que **sí
se precarga en la landing** (§6.9): serían 40-200 KB que baja todo el que entra
a mirar una fiesta, para algo que el navegador ya trae. El deslizar con el dedo
lo hace `scroll-snap` nativo, igual que el carrusel de eventos. Verificado:
`vendor` quedó en 137,19 KB, sin moverse.

- **La primera imagen va `eager` + `fetchpriority="high"`**: con el slider
  prendido el banner ES el LCP de la home. Las demás van `lazy`.
- **El avance automático se detiene** con la pestaña en segundo plano o el hero
  fuera de pantalla (misma lección que los Lottie de §6.4), y **no corre con
  `prefers-reduced-motion`**.
- **La proporción la fija el contenedor, no la imagen**, para que el navegador
  reserve el espacio antes de que la foto llegue — el mismo salto de layout que
  §6.4 arregló en las tarjetas.

> **`fetchpriority` va en MINÚSCULAS y por spread.** React 18.3.1 —el que usa
> el proyecto— **no conoce la prop camelCase `fetchPriority`**: avisa por
> consola y **no la escribe en el DOM**, o sea que la prioridad del LCP se
> perdía en silencio. Lo cazó leer la consola, no el typecheck. Con React 19
> puede volver a ser una prop normal.

> **El puntito se marca al hacer click, sin esperar al evento de scroll.** El
> click se siente inmediato y el estado no queda colgado de un evento que el
> navegador puede no despachar.

> **Lo que NO se pudo verificar acá:** el avance automático y la sincronía de
> los puntitos al deslizar. El panel del navegador reporta `document.hidden =
> true`, y con el documento oculto Chrome **no despacha eventos de scroll** ni
> anima `scrollTo({behavior:"smooth"})` — comprobado: con `behavior:"auto"` el
> scroll salta a 1425 px y con `"smooth"` se queda en 0. Es la misma familia
> que la trampa del `requestAnimationFrame` de §6.6. El código está bien; el
> entorno no puede ejercitarlo.

> **El slider viaja en el bundle de la landing aunque esté apagado** (~6 KB,
> ~2 KB en brotli). Diferirlo sería peor: es el LCP, y un `lazy` ahí mete un
> salto justo en la métrica que §6.6 se dedicó a arreglar.
### Crear una fiesta de varios días en una sola pantalla

v26 modeló la fiesta de tres días como **tres eventos unidos por un campo**, y
eso está bien **en la base**: cada día tiene su fecha, sus entradas, su venta y
su URL de verdad. Lo que estaba mal era **obligar a quien carga la fiesta a
entender ese modelo**.

> **Cómo se vio que estaba mal.** El autor abrió "Nuevo evento", vio el campo
> "Fiesta de varios días" y escribió ahí **el día** —`16 de Octubre` primero,
> `OCTUBRE 16` después—, esperando agregar los otros dos desde esa misma
> pantalla. No es que no leyera: desde el formulario de UN evento **no hay
> forma de adivinar** que la respuesta es crear tres. Dos intentos fallidos y
> un "NO ENTIENDO" son suficiente evidencia de que el problema era la pantalla.

**`FiestaFormModal` invierte el orden**: se describe la fiesta una vez (nombre,
lugar, flyer, cuenta, Instagram) y después se agregan los días, cada uno con su
fecha, su line-up y sus entradas. Por abajo sigue creando N eventos agrupados —
**el modelo no cambió, cambió quién tiene que conocerlo**.

- **Dos botones y no un paso previo que pregunte "¿uno o varios?".** Casi todas
  las fechas son de un día: cobrarle un click extra a todas para el caso raro
  es al revés de lo que conviene.
- **Arranca con dos días**, porque una fiesta de uno se carga con "Nuevo
  evento".
- **"Copiar las entradas del primer día a todos"**: en la práctica los precios
  se repiten, y cargar lo mismo tres veces es donde la gente abandona.
- **El nombre de cada día se arma solo** (`EXPO FIESTA OCTUBRE — VIE 16`) y se
  puede pisar.

> **El riesgo real son N inserts sin transacción.** Si el tercer día falla, los
> dos primeros ya existen, y dejar a alguien sin saber qué quedó creado es peor
> que el error. Se crean **en orden**, se corta en el primer fallo, y el
> mensaje dice cuántos quedaron y cómo completar el resto.

> **Quedan afuera a propósito** las promos (se cargan editando cada día:
> meterlas acá multiplica el formulario por N) y reposicionar el flyer.

> **`TicketsEditor` y `FormField` salieron de `Admin.tsx` a
> `components/admin/CamposEvento.tsx`.** No es prolijidad: si el modal nuevo
> las importara de `Admin.tsx` quedaría un **import circular** —Admin importa
> el modal, el modal importa Admin—. Rollup hoy lo resuelve, pero sólo mientras
> nadie use esos valores durante la evaluación del módulo, y eso es una promesa
> que nadie puede sostener.

> **Falta el ABONO**, igual que antes: un pase para toda la fiesta no tiene
> dónde vivir en un modelo donde cada día se compra por separado.

**v28 — El ABONO: una entrada que vale para todos los días.** Lo que faltaba
de la fiesta de varios días (v26): un pase para toda la fiesta, como el que
ofrece cualquier ticketera.

**Es una BANDERA en el catálogo, no una tabla.** El abono no necesita
estructura nueva: es un tipo de entrada más, con su precio en
`event_ticket_types` como todos. Lo único que le faltaba al modelo es **saber
que vale para todos los días**, y eso es un booleano (`ticket_types.is_abono`).

> **Por qué una bandera y no una convención de nombres.** Buscar "ABONO" en el
> nombre es exactamente la clase de regla que se rompe el día que alguien lo
> escribe "Abono 3 días". Con la bandera: el comprador ve **"Vale para los 3
> días"** al lado del precio, el formulario de fiesta lo ofrece en su propia
> sección, y el panel puede distinguir una venta de abono de tres sueltas.

**Se asigna a TODOS los días, no a uno.** Se podría haber colgado del primer
día y mostrarlo en los otros, pero eso obliga a que cada página vaya a buscar
entradas de OTRO evento y rompe la regla de que lo que se vende en una página
sale de su propio evento. Puesto en los tres, cada página lo ofrece con su
propia relación y **el camino de la compra no cambia en nada** — que es lo que
no se quiere tocar.

> **Lo que se paga:** la venta queda registrada en el día desde el que se
> compró. Para el staff no cambia nada, porque el mensaje de WhatsApp dice
> ABONO.

**En el formulario de fiesta va en su propia sección**, y los abonos **se
sacan de la lista de entradas de cada día**: si estuvieran ahí, invitarían a
cargarlos tres veces y nada impediría ponerle tres precios distintos al mismo
pase. Por abajo el guardado se los suma a los tres días igual.

> **El rótulo no aparece con un solo día.** Ahí "abono" no significa nada
> distinto de una entrada, y un cartel que dice "vale para 1 día" es ruido.

### La fiesta también se EDITA como una sola cosa

La primera versión de `FiestaFormModal` sólo creaba, y el agujero se vio en el
mismo día: el autor cargó los tres días de la Expo y después quiso sumarles el
ABONO. Con la fiesta ya creada eso era **editar tres eventos a mano**, tildando
el mismo tipo y escribiendo el mismo precio tres veces, sin nada que garantice
que quedaran iguales. Terminó borrando los tres para rehacerlos.

> **Una pantalla que sólo sirve para crear deja el problema donde estaba.**
> Todo lo que es "de la fiesta" —el nombre, el flyer, el lugar, la cuenta, el
> abono— nace compartido y se mantiene compartido; que se pueda definir de una
> vez pero no corregir de una vez es una asimetría que no tiene defensa.

La misma pantalla toma ahora un grupo opcional y, si viene, **actualiza** en
vez de crear. Lo compartido se escribe en todos los días; lo de cada día
—fecha, line-up, entradas— sigue siendo suyo.

- **Un solo estado (`fiesta`) para las dos cosas**: `true` = crear, un array =
  editar ese grupo. Con dos banderas sueltas queda la puerta abierta a que las
  dos estén prendidas y no se sepa cuál gana.
- **Día existente → `updateEvent`; día nuevo → `createEvent`.** Así se le
  pueden agregar días a una fiesta que ya existe sin elegir antes qué se va a
  hacer.
- **Los abonos se filtran de la lista de entradas de cada día también al
  editar**: si quedaran ahí se verían dos veces y se podrían cambiar por dos
  lados.
- **No se pueden quitar días desde acá.** Borrar un día es borrar un evento,
  que puede tener entregas cargadas (FK `restrict`) y es sólo del admin. Se
  hace desde la lista, donde el borrado ya avisa lo que corresponde. Agregar
  días sí.

**En la lista de eventos, un día agrupado tiene dos botones**: "Editar" (ese
día) y "Editar fiesta" (los N días). Sin esa distinción a la vista, cualquiera
entra por el primero y vuelve a hacer el trabajo tres veces.

### Las sugerencias se aceptan con Tab

Varios campos del panel proponen un valor y lo muestran en gris —el nombre de
cada día de una fiesta, la dirección de la página del evento—. Eso era
**decorativo**: para usarlo había que retipearlo entero. Pedido del autor: que
se complete con **Tab**, como en una terminal.

`useAceptarConTab` (en `components/admin/CamposEvento.tsx`) **sólo secuestra
Tab cuando hay algo que completar**: campo vacío y sugerencia disponible. En
cualquier otro caso Tab navega como siempre, que es lo que espera quien se
mueve por el formulario con el teclado, y **`Shift+Tab` nunca se toca** —va
hacia atrás, ahí completar no tiene sentido—.

Después de aceptar **el foco se queda en el campo**: lo normal es querer
ajustar lo que acaba de entrar, y un segundo Tab ya navega porque el campo dejó
de estar vacío. Verificado con teclas reales: primer Tab completa y retiene el
foco, segundo Tab pasa al campo siguiente con el valor intacto, `Shift+Tab`
navega sin completar.

> **La pista ("apretá Tab para completar") aparece sólo donde aplica.** Una
> leyenda permanente al lado de un campo ya lleno es ruido; con tres días en
> pantalla serían tres.

> **En la dirección de la página el placeholder pasó a mostrar la dirección
> REAL** que va a quedar (`expo-fiesta-octubre-vie-16`) en vez de describirla
> ("se arma sola con el nombre"). Se calcula con `claveDeGrupo`, el espejo en
> JS de `slugify()` (v25). **La corrección no depende de que coincidan**: si no
> se acepta la sugerencia, el trigger la arma igual.

> **El campo del nombre del día tuvo que salir a su propio componente**, porque
> `useAceptarConTab` es un hook y no se puede llamar dentro del `.map()` de los
> días. Es la tercera vez en el proyecto que la regla de los hooks empuja a
> separar un pedazo de formulario.

### Dos asperezas del formulario de compra y del de evento

**El bloque de la transferencia saltaba 337 px bajo el dedo.** Estaba
condicionado a `isFormValid` y además abierto en el modal, así que para quien
NO tiene cuenta aparecía justo al escribir el **primer dígito del teléfono**
—el último campo que le queda—: medido, el cuerpo del modal pasaba de 576 a
913 px de golpe. En un celular, con el teclado abierto y el navegador
reacomodando el scroll, eso se siente como que el campo "te cortó", que fue
exactamente como lo reportó el autor. Ahora va **siempre presente y plegado**:
medido después, 0 px de crecimiento. De yapa, el comprador puede ver a dónde
transfiere antes de cargar sus datos.

> **No se pudo reproducir la pérdida de foco en sí.** Se probó en la página y
> en el modal, con eventos sintéticos y con teclado real, midiendo
> `document.activeElement` y la identidad del nodo tecla por tecla: el foco
> nunca se perdió y el input nunca se remontó. Lo que sí se midió es el salto
> de 337 px. Si con esto sigue pasando, el siguiente sospechoso es el teclado
> del teléfono real, que no se puede emular acá.

**El campo "Fiesta de varios días" no explicaba el modelo.** El autor cargó un
evento y escribió **"16 de Octubre"** como nombre de la fiesta, esperando
agregar los otros días desde ahí. Es un error razonable: el campo está al lado
de la fecha y la pantalla habla de días. Tres cambios:

- **La explicación va ARRIBA del campo**, no debajo. Debajo no se leyó.
- El nombre pide ser **"el de la fiesta, no el del día"**, con
  `EXPO FIESTA OCTUBRE` de ejemplo en vez de un placeholder genérico.
- **Si lo que se escribe parece una fecha, avisa** ("16 de Octubre", "17/10",
  "24 de Agosto"). Avisa y no bloquea: un nombre es libre.

> **Falta el ABONO.** RedTickets, que es el modelo que pidió el autor, ofrece
> además de los días sueltos un pase para toda la fiesta. En este modelo —cada
> día es un evento y se compra por separado— un pase de 3 días no tiene dónde
> vivir. Se puede resolver sin código cargándolo como un **tipo de entrada
> "ABONO" en uno de los días**; si alguna vez tiene que ser de verdad, hay que
> decidir a qué evento pertenece la venta.

## 6.0 El cartel de las tarjetas (sin migración)

"15% OFF en todas las tarjetas de eventos activos". Lo primero que hay que
entender es lo que **no** es:

> **Es una ETIQUETA, no un descuento.** El precio que se carga en el evento ya
> viene con el 15% aplicado. Si esto se cargara como una promo de verdad (v21),
> el sitio restaría el porcentaje **otra vez** sobre un precio que ya lo tiene:
> una entrada de $1.000 se vendería a $850. El autor lo aclaró justo a tiempo;
> la primera lectura fue tratarlo como una promo, que era el camino equivocado.

Por eso vive en `site_settings` (v19) y no en `ticket_promos`: son dos cosas
que se parecen en la pantalla y no tienen nada que ver abajo — **una pinta, la
otra cobra**. Y por eso no hizo falta ninguna migración, que es exactamente lo
que v19 anticipó ("la próxima bandera global no va a necesitar otra
migración").

- Clave `cartel_eventos`, texto libre de hasta 24 caracteres. Vacío = sin
  cartel. **Es texto y no un booleano de "15%"**: mañana es "2x1",
  "ÚLTIMAS ENTRADAS" o "PREVENTA" sin tocar una línea.
- Se muestra en la **misma pila** que las promos, arriba de todo y hasta tres
  carteles. Para el comprador son lo mismo —una oferta— y distinguirlos
  visualmente sería resolver en la cara pública un problema que es interno.
  Donde sí se dice fuerte es en el panel.
- Sólo en eventos **a la venta**: con el evento agotado el velo tapa todo igual.
- **Lectura pública y escritura sólo admin**, como todo `site_settings`: el
  operador no toca la cara pública del sitio (v22).

**`ThemeContext` pasó a ser el lector de `site_settings`**, no sólo del tema.
El archivo se sigue llamando así porque el tema sigue siendo su trabajo
principal y renombrarlo tocaba siete imports sin cambiar nada. Dos detalles:

1. **Una sola suscripción de realtime para toda la tabla**, repartida por clave.
   El filtro era `key=eq.theme`; con dos claves, un segundo canal sobre la misma
   tabla sería gastar una conexión por cada bandera que se agregue.
2. **El `DELETE` deja `new` vacío y la clave viene en `old`.** Sin mirar los
   dos, borrar la fila del cartel lo dejaría puesto en las pestañas abiertas
   hasta que alguien recargue.
3. **`loading` es del TEMA y no espera al cartel.** Una tarjeta sin su etiqueta
   medio segundo no se nota; el sitio entero sin color, sí.

### El precio tachado = la comisión de ticketera

Al lado de cada precio va tachado **lo que esa entrada costaría en una
ticketera**. Clave `comision_ticketera` en `site_settings`, un solo número
para todo el sitio.

> **Qué es el 15%, porque el nombre decide el diseño.** No es un descuento que
> ODÍSEA hace: es el **cargo por servicio que cobran las plataformas de venta**
> (MiEntrada, RedTickets). Una entrada de $600 allá sale $690 porque le suman
> su 15%; acá sale $600 porque se vende directo. Eso es lo que dice "15% OFF",
> y por eso **es el mismo porcentaje en todos los eventos**: la comisión no
> depende de la fecha.

De ahí salen tres cosas que de otro modo parecen arbitrarias:

- **La cuenta es `precio × 1,15`**, no `precio ÷ 0,85`. No es la fórmula de un
  descuento mal aplicada: es literalmente cómo la ticketera calcula lo que
  cobra.
- **El número tachado es un precio REAL**, el de la competencia, no un "precio
  de lista" inflado para que la rebaja parezca más grande. Esa distinción es
  justo la que mira la ley de relaciones de consumo.
- **Vive en los ajustes del sitio y no en cada evento**, porque es uno solo
  para todos.

> **Esto se entendió mal la primera vez y conviene dejarlo escrito.** Leí el
> "15% OFF" como un descuento nuestro, calculé que de $690 a $600 el cliente
> "sólo" lee 13% y llegué a poner en el panel un botón que ofrecía subir el
> recargo a 18% para que el 15% fuera "verdadero". **Eso habría inflado el
> precio de comparación por encima de lo que una ticketera cobra**, que es
> exactamente el problema legal que se quería evitar. El botón se sacó. La
> lección: cuando un número de la cara pública no cierra, la explicación puede
> estar en el negocio y no en la aritmética.

**Es COSMÉTICO y eso es una invariante, no un detalle.** `conComision` y
`totalConComision` existen sólo para pintar: el TOTAL, el bloque de la
transferencia y el mensaje de WhatsApp siguen saliendo de `subtotal` y
`total`, que no se tocaron. Si alguna vez el tachado se cuela en el mensaje,
el vendedor cobra de más.

- **Por unidad y después multiplicado** (y no al revés): redondear la suma
  puede dar un peso de diferencia con la suma de los redondeos, y entonces el
  total no coincidiría con lo que dice cada fila.
- **El tachado del total ya cubre las dos cosas**, porque sale del bruto con
  la comisión encima: la comisión que acá no se cobra y las promos de v21. Sin
  comisión configurada se cae al comportamiento anterior —tachar sólo cuando
  hay promo— así que no cambia nada de lo que ya existía.
- Va en **los cuatro lugares donde se muestra un precio**: las filas de
  entrada, el total, el "Desde $X" de la página del evento y el selector de
  "Compra Directa". Ese último se había pasado por alto en la primera vuelta y
  apareció probando el flujo entero en el navegador.

> **"Ahorrás $X" pasó a la misma línea que "Total" en la página.** Apilado
> costaba 16 px, y medido, eso era exactamente lo que había agregado de scroll
> a una pantalla que v25 dejó justa. En el modal sigue apilado: ahí el cuerpo
> scrollea y los 16 px no se pagan. Medido antes y después: 22 px de scroll
> con el tachado apagado, 22 con el tachado prendido.

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

**La promo de cumpleaños NO viaja en este mensaje, y es la única asimetría entre
`buildPurchaseMessage` y `parsePurchaseMessage`.** El modal de compra tenía un botón
"Aplicar promo cumpleaños" que insertaba en `birthday_promo_claims` y escribía la línea
`PROMO CUMPLEAÑOS APLICADA` en el texto. **Se sacó entero** —botón, banner, chequeo de
elegibilidad y las funciones `checkBirthdayPromo`/`claimBirthdayPromo` de `AuthContext`,
que no las usaba nadie más—. El motivo es de negocio y no de código: el beneficio se
reclama **sólo** desde la sección Promociones, con la foto del documento, y queda
`pendiente` hasta que el staff lo apruebe (6.1 y v16). El botón del modal salteaba esa
aprobación: cualquiera con la fecha de nacimiento a mano le mandaba al vendedor un
mensaje afirmando un descuento que nadie había validado.

> **Sacar sólo la línea del texto habría sido peor que dejarla.** Ese es exactamente el
> bug que había antes de esto (el banner decía "aplicada" y el mensaje no decía nada, así
> que se cobraba el precio lleno). O va el camino entero o no va ninguno.

> El **parser sigue detectando** la etiqueta aunque el sitio ya no la escriba. Puede quedar
> algún mensaje viejo sin mandar en el teléfono de alguien; si el staff lo pega, el dato se
> ve en el resumen en vez de perderse en silencio. La tabla `birthday_promo_claims` queda
> en la base con lo ya reclamado: no se borra nada, sólo dejó de escribirse.

> El plegado de tildes (`foldText`) se subió de `UserSearchSelect` a `src/lib/utils.ts`, que
> ahora lo comparten el buscador y el parser. Usa `\p{M}` y no un rango `[U+0300-U+036F]`
> a propósito: el rango obliga a escribir marcas combinantes en el fuente, que se pegan al
> carácter anterior en cualquier editor.

## 6.3 Tema Halloween (sin migración)

El tema que prende el interruptor de v19. Vive entero en `[data-theme="halloween"]`
dentro de `src/index.css`: **ningún componente sabe que este tema existe**, sólo se
redefinen tokens. Con el tema apagado el sitio queda exactamente como estaba —
verificado: fondo blanco, Inter Tight, logo negro, cero nodos de decoración.

**Paleta** (del flyer de "Halloween Colonia" y de la referencia de la calabaza): noche
verde azulada `#0B1D22` de fondo, hueso `#E8EFEE` de texto, calabaza `#FA7A1E` de acento
y un verde espectral `#4FD1B3` como secundario. El acento casi no se mueve porque **el
naranja de ODÍSEA ya era el de la calabaza**: lo que cambia es el fondo, y por eso el tema
no se lee como un disfraz pegado encima. El rojo de error se **aclara** a `#FF5A47`:
`#E54B3C` se lee bien sobre blanco pero queda apagado sobre la noche.

**Contraste:** `--accent-foreground` pasa a tinta oscura y `.btn-celeste` dejó de usar
`text-white`. Blanco sobre `#FA7A1E` da **2.7:1** y no pasa; la tinta da 7:1. El mismo
cambio en el badge de fecha de `EventCard`. En la paleta base el token sigue siendo
blanco, así que ahí no cambia nada.

**Tipografía — Creepster, pero sólo en la vidriera.** `--font-scream` es un token aparte
de `--font-display` y se define **únicamente** bajo `[data-surface="vidriera"]`, que
ThemeContext pone sólo en `/`. El motivo es concreto: `.title-sport` lo usan **todas** las
páginas —"INICIAR SESIÓN", los encabezados de Términos, los números del dashboard—, así
que ponerlo en la raíz del tema metía una tipografía de terror justo donde la persona
tiene algo que completar. El color del tema sí llega a registro, login y perfil; la
tipografía no. Creepster trae un solo peso, así que el `font-black` y el tracking negativo
que le sientan a Inter Tight se corrigen en el mismo selector. (Se verificó que la fuente
trae los acentos del español: sin eso, la Í de "ODÍSEA" caía a Inter Tight y se veía rota.)

**Vista previa por URL:** `?tema=halloween` fuerza un tema sólo para quien abre ese link,
sin escribir en la DB ni en el cache. Sin esto, la única forma de ver cómo quedó era
prenderlo **para todos** — que es exactamente la prueba que uno quiere hacer antes de
prenderlo. El panel sigue mostrando el tema guardado (`siteTheme`), no el de la vista previa.

**Decoración: qué se intentó y por qué se sacó.** `SpookyLayer` llegó a tener murciélagos
cruzando, hojas cayendo, ojos que seguían el cursor y una luna, todo dibujado a mano en SVG y
repartido en tres planos de profundidad. **No funcionó y se quitó entero** (queda en el commit
`945b51b`). Tres motivos, y el tercero es el que importa para el futuro:

1. **Tapaba las cards.** La capa estaba en `z-30`, o sea por encima del contenido, así que los
   bichos cruzaban por delante de las tarjetas de evento. Error de diseño, no de ajuste.
2. **Iba demasiado rápido.** El plano "frente" cruzaba la pantalla en ~7 segundos y las hojas
   giraban 720° en 4.
3. **Una figura dibujada a mano en SVG tiene un techo bajo.** Se probó agregando planos,
   desenfoque, dos recortes de hoja, velocidades y direcciones distintas: seguía leyéndose como
   calcomanías sobre un color liso. No es un problema de cantidad ni de parámetros. **Si alguna
   vez se quiere atmósfera, va por una imagen real de fondo, no por más SVG.**

Queda sólo el **grano** de película (`.spooky-grano`, `z-40`, estático, `mix-blend-mode:
overlay` para conservar los negros). Sobrevive porque no es una figura sino una textura: no
tiene silueta que pueda verse mal, no se mueve, y estar por encima del contenido no molesta
porque no tapa nada. No se anima a propósito — obligaría a repintar la pantalla entera 60 veces
por segundo por algo que nadie nota conscientemente.

> **Dos trampas encontradas por el camino, por si se vuelve a animar algo.**
>
> `animationiteration` **burbujea**: las capas internas con animación propia (unas alas que
> aletean cada 0.4s) suben su evento al contenedor, y un handler que resortea al recibirlo se
> dispara dos veces por segundo, dejando al elemento clavado en el arranque. Hay que filtrar
> con `e.target !== e.currentTarget`.
>
> Un `animation-delay` **positivo** deja al elemento visible y quieto en su posición natural
> —el borde de la pantalla— hasta que le toca arrancar. Eso es lo que hacía que "aparecieran
> todos en el borde". Se resuelve con retrasos **negativos** (entra ya a mitad de recorrido) y
> `animation-fill-mode: backwards`.

**Animaciones con Lottie (`SpookyLottie`).** Después de que la decoración en SVG a mano
fracasara, la conclusión fue que **el dibujo no puede salir de acá**. Lottie reproduce
animaciones exportadas de After Effects por ilustradores; el componente sólo las pone en
pantalla. Las dos las eligió el autor en LottieFiles (filtro **Free** = *Lottie Simple License*:
uso comercial permitido, sin atribución obligatoria).

**Bandada de murciélagos (`SpookyBats`, en el hero).** Cuatro, a distintas alturas, tamaños,
velocidades y direcciones — uno solo y quieto en un rincón se lee como un sticker pegado, que
fue el primer intento. **Van lentos**: el más rápido tarda ~38s en cruzar (la decoración vieja
lo hacía en 7 y se sentía agresiva). Los **tres tonos** —negro, gris y blanco— salen de pisar
por CSS los rellenos que Lottie escribe en el SVG, así no hace falta un `.json` por color; el
negro va más grande y más opaco porque sobre la noche casi no se ve. El ancho llega por
variable (`--bat-ancho`) y el CSS lo acota con `min(..., 38vw)`: responsivo sin un `@media`
aparte.

**Arañas (`SpookySpiders`, en la sección de eventos).** Dos grupos con reglas distintas:

- **Una cuelga del título** "PRÓXIMOS EVENTOS", cambiando de letra en cada ciclo. Es la única que
  se muda. Antes también se anclaba a las tarjetas y quedaba en lugares raros — el autor lo
  describió como que "hacía lo que quería".
- **Tres cuelgan por DEBAJO de las tarjetas**, quietas, en colores distintos y a alturas
  escalonadas. El hilo nace detrás de la card (van en `z-0`) y sólo asoma la araña por abajo, así
  que no tapan nada.

> **La caja de la animación NO es el bicho, y el bicho se mueve.** Ésta es la trampa del archivo
> y costó tres intentos. Primero: el dibujo ocupa sólo del 5% al 23% de su contenedor y el 77% de
> abajo está vacío, porque la telaraña cuelga muy por encima del viewBox — calcular el alto del
> contenedor para "llegar" a un punto deja la araña flotando. Segundo, y menos obvio: **la araña
> sube y baja por el hilo durante el ciclo**, así que medir un solo fotograma da un valor que no
> vale para el resto y la deja colgando lejísimos del anclaje.
>
> La solución es recorrer el ciclo con `goToAndStop` (16 muestras) y quedarse con **los dos
> extremos**, porque cada grupo necesita uno distinto: la del título se ancla al **promedio** —así
> oscila alrededor del borde de las letras— y las de abajo al **mínimo**, que es su punto más
> alto, para no meterse nunca detrás de la tarjeta.
>
> La medición va sobre los `path` y **no** sobre `getBBox()`: los rects de los `path` llevan
> aplicadas las transformaciones de Lottie, mientras que `getBBox()` devuelve coordenadas sin
> transformar, fuera del viewBox.

> **Se observa la sección con `ResizeObserver`, no la ventana.** Las tarjetas llegan de Supabase
> **después** de que la araña termina de cargar (su `.json` es local e instantáneo), así que en la
> primera medición no hay ninguna card y las de abajo se quedaban sin posición, fuera de pantalla.
> Cuando los eventos aparecen, la sección cambia de alto y el observer dispara el recálculo. De
> paso cubre el redimensionado y el apilado en celular, así que reemplaza al listener de `resize`.

> **Cuidado con el "negro".** Los colores se pisan por CSS sobre los rellenos del SVG (igual que
> los murciélagos: una silueta plana por variante, sin un `.json` por color). El primer intento
> usó `#071A21`, que sobre el fondo del tema (`#0B1D22`) da contraste **1.05**: invisible. El tono
> oscuro es un gris azulado `#2C4B55` — contraste 1.85, se lee como araña oscura de verdad.

Medir el DOM resuelve la responsividad sola: en celular las tarjetas se apilan y todo se
recalcula, sin un `@media` que mantener. Se recalcula también al cambiar el tamaño de ventana.

**Iconos monocromos sobre botón claro.** El logo de WhatsApp es un PNG **blanco** (medido:
`rgb(254,254,254)`). En la paleta base el botón `btn-techno` es tinta oscura y se lee perfecto;
con el tema, "tinta" es el hueso y el botón queda claro, así que el icono **desaparecía**. Se
invierte por CSS, acotado a `.btn-techno`: el mismo logo en el footer sí está sobre fondo oscuro
y ahí tiene que seguir blanco.

**La regla que todas respetan, y que la decoración anterior no respetaba: van DETRÁS del
contenido.** Los murciélagos viven en `z-0` dentro del hero —la única sección sin tarjetas—. La
araña va en `z-0` contra el `z-10` del contenedor de eventos: cuando le queda una tarjeta
delante, **gana la tarjeta**. Verificado forzándola encima de una card: los cuatro puntos de
muestra resuelven a la tarjeta.

**Peso.** El runtime va en su propio chunk y se consulta **primero el JSON**: si no está, la
función retorna **antes** del `import`, así esos 300 KB no se descargan nunca. Con brotli —lo
que sirve Vercel— el total agregado es ~82 KB: murciélago 2, araña 16 (ese JSON es repetitivo y
comprime ×25), runtime 64.

> **Para cambiar una animación:** bajar el `.json` de lottiefiles.com y reemplazar el archivo en
> `public/`. Si distrae, lo primero que se toca es la **opacidad**, después la velocidad (prop
> `speed`). El `fetch` **no** usa `cache: "force-cache"`: el navegador se quedaría con la
> animación vieja al cambiarla. Y el `catch` **avisa por consola en desarrollo** — un catch mudo
> acá ya costó un rato de no entender por qué el contenedor quedaba vacío.

**Sonido (`src/lib/spookySound.ts` + `SoundToggle`):** apagado por defecto, con la
preferencia guardada. Tres restricciones lo definen: el navegador **bloquea el audio
automático** (por eso el AudioContext se crea recién al tocar el altavoz, que es el gesto
que lo habilita); nadie quiere sonido que no pidió en un sitio que **vende entradas**; y
los sonidos cortos se **sintetizan con Web Audio**, sin archivos ni licencias. Al restaurar
la preferencia de una visita anterior se arma un escuchador de un solo uso para el primer
gesto —si no, el botón diría "prendido" y no sonaría nada— y ahí no suena el golpe de
confirmación, que salido de la nada sobresalta.

> **El ambiente necesita un archivo y es opcional.** `public/halloween-ambiente.mp3`
> (viento, aullido lejano). Sintetizarlo con osciladores suena a módem, así que tiene que
> ser un audio real **libre de derechos**. Si el archivo no está, el `error` del elemento
> `<audio>` apaga esa parte y **no se vuelve a intentar**: los sonidos de interacción andan
> igual. Hoy no está puesto.

**Las cards en el tema.** Se encienden por dentro con un `box-shadow` **inset** y no con una
capa `::after` encima: una sombra interior se pinta sobre el fondo pero DEBAJO del contenido,
así que no le tira naranja al texto ni a los botones. Queda algo prendida siempre, porque en
celular no hay hover y si el efecto dependiera sólo de él desde un teléfono no existiría; se
intensifica con `:hover`, `:focus-within` y `:active`. La foto lleva viñeteado para que deje de
ser un rectángulo pegado sobre la noche (en `z-1`; la fecha y el sello van en `z-2` o quedarían
tapados). El CSS se engancha de clases propias (`.evento-card`, `.evento-media`, `.evento-fecha`,
`.evento-agotado`, `.promo-card--destacada`) y **nunca de utilidades de Tailwind**: esas clases
existen para pintar, no para identificar una variante, y usar `:not(.bg-celeste)` para detectar
la promo destacada ya generó selectores raros en el build.

**Barrido de contraste.** `--accent-foreground` existe para esto: blanco sobre el naranja del
tema da **2,7:1**. Se reemplazó `text-white` por `text-accent-foreground` en los seis lugares que
lo tenían junto a `bg-celeste` (header, footer, promos, ErrorBoundary, botones) — quedan en 7:1.
En la paleta base el token sigue siendo blanco, así que ahí no cambió nada. El sello AGOTADO usa
un rojo propio y profundo, porque el `--charrua` del tema es claro a propósito (para que un error
grite sobre la noche) y con blanco encima no se leería.

**Sin parpadeo al cargar: dos arreglos, dos causas.** (1) El `data-theme` se ponía al
instante pero el CSS de la app no estaba en el primer cuadro —en dev Vite lo inyecta por JS,
y aun en producción React tiene que montar—, así que el navegador pintaba su blanco por
defecto. Hay un `<style>` **crítico** en `index.html` con el fondo del tema; es el único lugar
donde `--papel` y `--tinta` están duplicados como hex, porque tiene que funcionar antes de que
exista la hoja que define los tokens. (2) Para el visitante **nuevo** el valor tardaba ~600ms
en llegar (medido) y ningún truco de cliente lo evita: el dato no está. El plugin `bakeTheme`
de `vite.config.ts` lo lee **en tiempo de build** y lo escribe en el `<html>`, así el primer
cuadro sale correcto sin depender de la red. Falla en silencio: si Supabase no contesta
durante el build no inyecta nada y el sitio se comporta como antes — un deploy no se cae
porque no se pudo averiguar un color. En ejecución `localStorage` y la consulta lo siguen
pisando, así que cambiar el tema sin redeployar sigue andando. Por esto el script inline ahora
también **quita** el atributo (antes sólo lo ponía): hace falta en `/admin` y para cuando la
base dice `base` pero el build trae otro tema.

**El sonido viene PRENDIDO** (decisión del autor). El navegador igual no deja sonar nada hasta
el primer gesto —Chrome y Safari lo prohíben—, así que el altavoz aparece prendido y el audio
arranca cuando la persona toca algo. Se escuchan tres tipos de gesto porque un scroll con la
rueda **no** cuenta como activación. Quien lo apaga (se guarda un `"0"`) no se lo vuelve a
encontrar prendido.

**Tipografía en las pantallas de entrada.** `ENTRADA_PATHS` (en `ThemeContext`) es la lista
explícita de rutas que llevan Creepster: la home, login, registro, recuperar y reset. Es una
lista y no "todo menos el panel" porque en esas pantallas `.title-sport` marca **un solo
título corto**, mientras que en Términos, Privacidad y Perfil marca **cada encabezado de
sección** — ahí una tipografía de terror vuelve ilegible un texto legal. Los formularios no se
tocan: etiquetas, campos y errores siguen en Inter Tight, que es donde la legibilidad decide
si alguien termina de registrarse. **La misma lista está duplicada en el script de
`index.html`**: si no coinciden, el título parpadea de Inter Tight a Creepster al montar React.

**Bloques que se invierten (`.bloque-invertido`).** El footer y la tarjeta de "Hablá con
nosotros" usan `bg-tinta text-papel` a propósito: en la paleta base son una banda oscura sobre
papel blanco. Con el tema, invertir daba una banda **clara** sobre la noche — un slab blanco
enorme al pie. Se arregla intercambiando los dos tokens **sólo dentro del bloque**: el markup
no cambia, cambia qué significan esas palabras ahí adentro. Por lo mismo, el velo de
**AGOTADO** pasó de `bg-tinta/65` a `bg-velo/70`: tiene que oscurecer la foto siempre, y con
el tema "tinta" es el hueso, así que la aclaraba.

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
## 6.4 Rendimiento de la landing

PageSpeed (móvil) daba **66/100**. Todo lo de abajo se midió sobre el sitio real antes y
después; ningún número es estimado.

**Imágenes: 990 KB → 277 KB (−72%).** Los flyers se suben a Supabase Storage tal como los manda
el diseñador —hasta 533 KB— y se muestran a 318 px. Supabase tiene habilitado el endpoint de
transformación (`/storage/v1/render/image/public/…?width=&quality=`), que redimensiona al vuelo y
**negocia WebP por el `Accept` del navegador**. `src/lib/imagenes.ts` arma esa URL más un `srcset`
de 320/480/640/960 con `sizes`, así el celular baja la variante chica. No hay que resubir nada.

> **`resize=contain` no es opcional: sin eso el servidor RECORTA.** El modo por defecto de
> Supabase es `cover`, que rellena la caja pedida cortando lo que sobra. Con `?width=480` a
> secas sobre un flyer vertical de 800×1000 **no escala**: devuelve `480×1000`, o sea le corta
> los dos costados al dibujo, y después el CSS lo recorta otra vez contra el 4:3 de la tarjeta.
> Se veía un pedazo del medio del flyer. Sólo se salvaban los **cuadrados**, porque ahí el
> ancho pedido ya era mayor que el original y no había nada que recortar — por eso mirando una
> sola imagen el problema puede no aparecer. Medido con `contain`: proporción intacta y **menos
> peso** (70 KB contra 134), porque el recorte conservaba el alto completo de 1000 px. Los
> cuatro flyers a 480w pasan de 277 a **151 KB**. Verificado por píxeles: el encuadre recortado
> se desviaba 29/255 del original y con el arreglo se desvía 2 (ruido de recompresión).

> El `<img>` lleva `width`/`height` explícitos. **No fijan el tamaño** —de eso se encarga el CSS—
> sino la proporción, para que el navegador reserve el espacio antes de que llegue la foto. Sin
> eso la tarjeta salta al cargar, que era el "salto de layout" que marcaba PageSpeed. Son la
> proporción de la **caja** (4:3, la del `aspect-[4/3]` del contenedor), no la del flyer: el
> encuadre lo decide `object-fit`/`object-position`, que es donde el admin lo ajusta.

**Iconos: −82 KB.** El logo de WhatsApp eran dos PNG de 360×360 mostrados a **16×16**. Ahora es
`WhatsAppIcon`, un SVG en línea con `currentColor`. De paso resolvió solo un parche: el PNG blanco
desaparecía sobre el botón claro del tema y había un `filter: invert(1)` para taparlo. Un icono
que hereda el color del texto no puede volver a tener ese problema.

**Fuentes.** Los imports genéricos de `@fontsource` traen los **seis** subsets (cirílico, griego,
vietnamita…): 43 bloques `@font-face`, 14,8 KB del CSS que bloquea el render, en un sitio en
español. Pasan a `latin-NNN.css`: **43 → 7** bloques, el CSS baja de 102,9 a 89,8 KB.

> **No se sacó el peso 800** aunque no tenga usos como clase de Tailwind (sí lo usa la regla base
> de los `h1..h6`). El navegador **sólo descarga las fuentes que efectivamente usa**, así que ese
> archivo nunca se bajaba: quitarlo ahorraba 300 bytes de CSS y arriesgaba cambiar el grosor de
> los títulos. `font-display: swap` ya estaba — lo pone `@fontsource`.

**Caché.** Los archivos de `/assets/` llevan hash de contenido en el nombre y Vercel los servía
con `max-age=0, must-revalidate`: cada visita repetida revalidaba el bundle entero. El bloque
`headers` de `vercel.json` los pasa a un año + `immutable`. Los de `/public/` **no** llevan hash,
así que van a una semana con `stale-while-revalidate` — un año ahí sería una trampa: cambiar la
animación o el audio no llegaría nunca. `index.html` sigue sin cachearse: lleva el tema escrito
por `bakeTheme` y es lo que apunta a los assets con hash.

**JS de la carga inicial: 297 KB → 173 KB (−42%).** `manualChunks` parte el bundle por librería —
hacía falta para diagnosticar (con 741 KB en un archivo no se ve qué pesa) y ayuda al caché, ya
que el código de terceros deja de invalidarse cada vez que se toca una línea del sitio. Con la
división a la vista aparecieron dos cosas que no tenían por qué estar en la carga inicial:

- **libphonenumber (35 KB).** `EventCard` ya difería `TicketPurchaseModal`, pero `PromosSection`
  lo importaba **directo** para la card "Precio Directo", así que la cadena entraba igual. Los dos
  modales pasan a `lazy` + `Suspense`.
- **lottie-web (77 KB).** Es decoración y arrancaba a los 33 ms. Ahora espera a
  `requestIdleCallback`: medido, llega a los **4741 ms**, con la página ya usable.

> **Trampa de `manualChunks`:** no alcanza con quitarle el nombre a un chunk dinámico. Sin un
> `return` explícito, `lottie-web` caía en el `return 'vendor'` final — y `vendor` **sí** se
> precarga, así que la decoración se colaba en la carga inicial escondida ahí (medido: vendor pasó
> de 49 a 128 KB antes de que me diera cuenta).

**Hilo principal.** Dos cosas nuestras lo estaban cargando:

- **El grano tenía `mix-blend-mode: overlay`.** Conservaba mejor los negros, pero un blend sobre
  una capa fija a pantalla completa obliga al navegador a recomponer **todo lo que hay debajo** en
  una sola capa, en cada pintado — carísimo para una textura que casi no se nota. Ahora es
  opacidad plana (0.035); sobre fondo oscuro el resultado es prácticamente igual.
- **Los ocho Lottie corrían siempre.** Lottie dibuja cada cuadro desde JavaScript, así que cada
  instancia cuesta hilo principal esté o no en pantalla — y las ocho nunca se ven juntas.
  `SpookyLottie` ahora las pausa con un `IntersectionObserver` (margen de 200 px para que no se
  vea "arrancar" al entrar) y con la pestaña en segundo plano. Medido en el hero: **3 de 4 arañas
  pausadas**; al bajar a eventos se invierte.

> **Las imágenes de 5-11 MB de `src/assets/` NO se publican.** Vite sólo empaqueta lo que se
> importa, y de esa carpeta se importan cuatro archivos. El resto (`sunset.png`, `saltocarru.png`,
> las fotos de carrusel…) son ~59 MB de peso muerto **del repo**, no del sitio: molestan al clonar,
> no al visitante. Se pueden borrar, pero no cambian el rendimiento.



## 6.5 Los modales del sitio público (`ModalShell`)

Los tres modales de la cara pública —compra de entradas, promo de cumpleaños y el
selector de evento de "Compra Directa"— repetían a mano su propio `fixed inset-0
z-50`. Ahora comparten `src/components/ModalShell.tsx`, y el motivo no es el
ahorro de líneas.

**El bug: el modal de compra se abría DENTRO del carrusel.** El velo oscurecía
sólo la franja de las tarjetas y el panel quedaba, medido, a **935 px del borde
de arriba** en un celular de 360×740 — o sea fuera de la pantalla. La causa no
está en el modal sino arriba: las secciones aparecen al hacer scroll con
`opacity-0 translate-y-12`, y **un ancestro con `transform` deja de ser el
viewport para el `position: fixed` de sus hijos**; `inset-0` se resolvía contra la
tarjeta del evento. Es una regla del CSS y no un detalle de Tailwind: vale igual
para `filter`, `perspective`, `backdrop-filter`, `contain` y `will-change`, así
que **cualquier animación que se agregue mañana lo vuelve a romper**. La única
solución estable es sacar el modal del árbol: va por `createPortal` a
`document.body`, donde no hay ancestros transformados.

> **Regla:** un modal nuevo va por `ModalShell`. Nunca un `fixed inset-0` suelto
> dentro del árbol de la página.

Lo que la cáscara resuelve de una vez para los tres:

- **Hoja completa en celular, diálogo centrado de `sm:` para arriba.** El 99% del
  tráfico entra desde el teléfono; ahí un diálogo flotante con márgenes
  desperdicia pantalla y deja el contenido apretado.
- **`h-[100dvh]` y no `100vh`.** En Safari de iOS `100vh` cuenta la barra de
  direcciones que está tapando la pantalla, así que el borde de abajo —donde vive
  el botón de enviar— queda debajo de ella. En un navegador sin `dvh` la
  declaración se descarta y el `items-stretch` del padre lo estira igual: se
  degrada solo, sin `@supports`.
- **Se traba el scroll del fondo** mientras está abierto, y se restaura lo que
  había (no "auto"): si alguna vez hay dos modales encadenados, el de adentro no
  tiene por qué devolverle el scroll a la página al cerrarse.
- **Cierra con Escape y tocando el velo.** El cierre por velo escucha `mousedown`
  y compara `e.target === e.currentTarget`: con `click`, seleccionar texto adentro
  y soltar afuera cerraba el modal.

**Encabezado fijo, cuerpo que scrollea.** El panel es `flex-col` + `overflow-hidden`
y **el que scrollea es el cuerpo**, no el panel. El encabezado era `sticky` con
`p-6` y el título en `text-2xl`: medido en 360 px se comía **157 px, el 23% del
modal**, y un nombre de evento largo lo hacía crecer todavía más. Ahora son 76 px.

**El total y el botón de comprar van en un pie fijo.** Vivían al final del
contenido que scrollea, así que en un celular quedaban debajo del pliegue: había
que bajar hasta el fondo para ver cuánto se estaba por pagar y para poder enviar.
En un flujo que cobra plata eso tiene que estar siempre a la vista. Lleva
`env(safe-area-inset-bottom)` para despegarse de la barra de gestos del iPhone.

> **Ningún campo de formulario baja de 16px en celular.** Safari de iOS hace
> **zoom** sobre cualquier `input`/`textarea`/`select` con fuente menor, y ese zoom
> descoloca la pantalla entera. `.input-techno` pasó a `text-base sm:text-sm`, así
> que el arreglo alcanza a **todos** los formularios del sitio (registro, login,
> perfil), no sólo al modal; en escritorio el tamaño no cambia. `ui/input.tsx` ya
> lo hacía —viene así de shadcn, por este mismo motivo— y `ui/textarea.tsx` se
> alineó.

**Objetivos táctiles de 44×44.** Los botones de cerrar (40×40) y los de cantidad
(32×32) quedaban por debajo del mínimo de las guías de accesibilidad; con el pulgar
se fallan. Verificado por DOM: cero controles por debajo de 44 px en los tres
modales.

**En celular la fila de cada entrada se apila.** Nombre y precio arriba, el
contador abajo: con los dos en la misma fila, un nombre como "Backstage +23" se
partía en dos líneas contra el contador. De `sm:` para arriba vuelven a ir en
línea. Mismo criterio en el selector de evento.


## 6.6 Arranque en celular: pantalla vacía y hilo trabado

La queja fue concreta: *"abre primero la web en blanco y está 10 segundos para
cambiar al estilo halloween, todo trabado al principio"*. Lo primero que se
descartó es lo que parecía: **el tema NO llega tarde**. Medido en producción, el
HTML sale en 252 ms ya con `data-theme="halloween"` escrito por `bakeTheme`, y el
`<style>` crítico pinta el fondo oscuro en el primer cuadro. También se verificó
que `odiseaoficial.com` y `www.` sirven el mismo build (hay **dos proyectos de
Vercel** apuntando al mismo repo, así que valía la pena mirarlo).

La causa real es estructural: **el HTML no tiene nada que pintar**. Es
`<div id="root"></div>` vacío, así que hasta que no se bajan, parsean y
**ejecutan** ~574 KB de JavaScript (react 139 + vendor 157 + supabase 156 +
radix 45 + router 12 + app ~64) no existe el sitio. Más 90 KB de CSS que bloquea
el render. En una conexión de escritorio eso son 1,3 s; en un celular con datos
móviles y CPU lenta, los 10 s que reportó el autor.

**Pantalla de arranque (`#arranque` en `index.html` + `OcultarArranque`).** No
acelera la carga: hace que lo primero que se vea sea la marca sobre el fondo del
tema en vez del vacío. Se pinta apenas el navegador lee el `<body>` porque no
depende ni del CSS de la app ni de una línea de JavaScript — el logo va como
`background-image` desde el `<style>` crítico, y así además se baja **sólo la
variante del tema activo** (los `email-logo-*.png` de `/public` son byte a byte
los mismos que `src/assets/odisea-logo-*.png`).

> **Va FUERA de `#root`, y eso no es un detalle.** Adentro, React lo borra de
> golpe al montar; y como el hero arranca en `opacity 0` con un fundido de 700 ms,
> entre una cosa y la otra queda un parpadeo de pantalla vacía. Superpuesto y con
> su propio fundido de 600 ms, los dos se cruzan.

> **Nada de `requestAnimationFrame` para destaparlo.** Fue el primer intento,
> buscando la garantía de que el navegador hubiera pintado. Se rompía: los `rAF`
> **no corren en una pestaña en segundo plano**, así que quien abriera el sitio en
> una pestaña de fondo se encontraba el telón tapando todo al volver. Se detectó
> probando el build real: el telón quedaba sin la clase, en `opacity 0.55`, encima
> del contenido. Un `useEffect` solo alcanza —corre después del commit, o sea con
> el DOM real ya escrito— y no tiene ese modo de falla.

> **Tiene un seguro de 15 s en CSS puro.** Si el JavaScript nunca llega a correr
> (bundle caído, red cortada a la mitad), el telón se destapa solo en vez de dejar
> la pantalla tapada para siempre. En una carga normal no se ve nunca.

**El blanco que seguía apareciendo: la hoja de estilos bloqueaba al propio telón.**
Un `<link rel="stylesheet">` en el `<head>` **bloquea el render**: el navegador no
pinta NADA hasta tenerlo. Eso incluía al `<style>` crítico y a `#arranque`, que
existen justamente para que se vea algo enseguida — o sea que la pantalla quedaba
en blanco durante toda la descarga de 91 KB de CSS. Rápido en escritorio, lento en
un celular con datos móviles: exactamente la diferencia que se reportó.

> **La pista que lo confirmó.** El logo del telón es un `background-image` del CSS
> crítico, y se pedía recién a los **240 ms**, después de que la hoja externa
> terminara a los 211. Si el CSS inline hubiera podido pintar por su cuenta, ese
> pedido habría salido con el parseo del HTML.

`cssNoBloqueante` (en `vite.config.ts`) reescribe esa etiqueta a `media="print"`
con `onload="this.media='all'"`: el navegador la baja sin bloquear y la aplica al
terminar. Medido después del cambio: el logo pasa a pedirse a los **19 ms**, en
paralelo con el CSS en vez de después.

> **Tres cosas lo hacen seguro, y ninguna sobra.** (1) El telón tapa la pantalla
> hasta que React monta. (2) `OcultarArranque` **espera explícitamente** a que la
> hoja esté aplicada antes de levantarlo —mientras no cargó queda en
> `media="print"`—, con un respaldo por tiempo para que un error de red en el CSS
> no deje el telón puesto. (3) El `<noscript>` deja la etiqueta bloqueante de
> siempre para quien tenga JavaScript apagado, que es para quien el `onload` nunca
> corre. Hay margen de sobra igual: la hoja son 91 KB contra ~574 KB de JavaScript.
> Verificado también que el sitio **no tiene CSP**, que es lo que rompería un
> `onload` en línea.

**`bakeTheme` aprovecha que conoce el tema para dos cosas más.** Escribe
`<meta name="theme-color">` —en Android, Chrome pinta su propia barra con ese
valor, y sin él queda clara aunque el sitio sea oscuro, que también se lee como
"aparece blanco"— y un `<link rel="preload" as="image">` del logo del telón, que si
no el navegador recién descubre al calcular estilos.


**Los ocho Lottie parseaban 1660 KB de JSON.** Cada instancia hacía su propio
`fetch` + `json()`: cuatro murciélagos (16 KB) y cuatro arañas, y el `.json` de la
araña pesa **399 KB**. El `fetch` lo deduplicaba el caché HTTP, pero el **parseo**
—que es lo caro y corre en el hilo principal— se pagaba entero las ocho veces. Eso
era buena parte del "todo trabado". Ahora se baja y se parsea **una vez por
archivo** (`cacheAnimaciones` en `SpookyLottie`): medido, **1660 KB → 415 KB** y 8
pedidos → 2.

> **Cada instancia recibe una COPIA (`structuredClone`).** Lottie escribe estado
> interno dentro del objeto que se le pasa, así que compartir el mismo entre cuatro
> reproductores es justo la clase de bug que aparece en el segundo y el tercero.
> Clonar sigue siendo mucho más barato que volver a parsear. Verificado en el build:
> las ocho animaciones renderizan.

> **Un fallo de red no queda cacheado.** Si se cayó la red un segundo, la próxima
> instancia tiene que poder reintentar; por eso el `catch` borra la entrada.

**La decoración espera al evento `load`, no sólo al idle.** El `timeout: 4000` del
`requestIdleCallback` es un piso, no un techo: en un celular lento la página
todavía se está montando a los 4 s, así que la decoración arrancaba **encima** del
trabajo crítico. Medido en producción: los ocho `.json` empezaban a los 856 ms, no
"con la página ya usable" como pretendía 6.4.

> **Lo que NO se tocó, y por qué.** Sacar `supabase` (156 KB) del arranque es lo
> siguiente en la lista, pero `AuthContext` lo necesita al montar y diferirlo
> significa renderizar la app sin estado de sesión: es un cambio de arquitectura, no
> un ajuste. Y en `vendor` (160 KB) no hay una ganancia fácil: se revisó si
> `react-hook-form` y `zod` se estaban colando —el molde de la trampa de `lottie`—
> y no, porque el único que los importa es `src/components/ui/form.tsx`, que **no lo
> usa nadie** y por lo tanto nunca entra al bundle.


## 6.8 SEO

**El punto de partida, medido en Google real, no supuesto.** El sitio ya salía
**primero** en "odisea fiesta" y "odisea oficial". Posicionar nunca fue el
problema; el problema era qué decía el resultado y qué NO aportaba el sitio:

> **ODÍSEA**
> ODÍSEA es una productora de eventos de música en Uruguay.

Y algo peor, visible en la misma búsqueda: el resumen de IA de Google armaba las
"Próximas Fechas" de ODÍSEA citando **Instagram y MiEntrada**, y MiEntrada salía
segunda mostrando fecha, hora y lugar. **Google ya sabía las fechas, pero las
aprendía de terceros**, porque el `<body>` que recibe un bot es
`<div id="root">` vacío.

**Título y descripción.** El título nombra la categoría ("fiestas", "música
electrónica") porque nadie busca la marca sin conocerla, y la descripción nombra
las ciudades donde hay fechas, que es como busca alguien de la zona. Se cortan
cerca de los 60 y 160 caracteres: más largo, Google trunca. Se **borró**
`<meta name="keywords">`: Google la ignora desde 2009 y encima nombraba
Montevideo, que no es donde ODÍSEA hace fechas.

> **`document.title` en `Index.tsx` pisaba todo.** Había un
> `document.title = "ODÍSEA WEB"` en un efecto: el título escrito para Google
> duraba hasta el primer render de React. Google ejecuta JavaScript, así que
> podía quedarse con el pisado. **El título de la home vive en `index.html` y en
> ningún otro lado.**

**Open Graph.** Faltaba `og:image` entera, y el sitio se comparte por WhatsApp:
cada link salía pelado. WhatsApp, Instagram y Facebook **no ejecutan
JavaScript**, así que las meta tags son todo lo que reciben. Hoy apunta al logo
cuadrado (360×360); con un archivo de 1200×630 se cambia esa URL y las dos
medidas de al lado.

**Datos estructurados horneados en el build (`bakeEventos` en `vite.config.ts`).**
Mismo molde que `bakeTheme` —consultar Supabase en tiempo de build— porque ya
estaba resuelto. Inyecta un `Organization` y un `Event` por evento vigente, más
un `<noscript>` con la lista de fechas en texto plano. Se hornea y **no** se
inyecta desde React justamente porque React no lo ven ni WhatsApp ni Instagram.
Falla en silencio como `bakeTheme`: un deploy no se cae porque no se pudo listar
una fiesta.

> **El precio: los datos son del último deploy.** Los eventos se editan desde el
> panel sin redeployar, así que uno nuevo no aparece hasta el próximo push. Es
> aceptable —las fechas se cargan con semanas de anticipación— y la alternativa
> no la verían los que comparten el link.

> **Sólo se listan los eventos que no pasaron y no están finalizados.** Un evento
> viejo en los datos estructurados es peor que no tener nada: Google muestra una
> fecha pasada como si fuera la próxima.

> **`eventStatus` NO es donde va "agotado".** Ese campo es para cancelado,
> pospuesto o movido. Un evento agotado sigue programado; que no queden entradas
> se dice en `offers.availability` con `SoldOut`.

> **Hay que escapar `</` dentro del JSON-LD.** Esa secuencia cierra la etiqueta
> `<script>` aunque esté dentro de un string JSON.

**El sitemap no existía.** `/sitemap.xml` devolvía `text/html`: el rewrite de la
SPA (`vercel.json`) le sirve el index a cualquier ruta que no sea un archivo
real. Ahora `seoEstatico` lo emite en el build —un archivo de verdad le gana al
rewrite, igual que `robots.txt`, que funcionaba porque está en `public/`— y
`robots.txt` lo declara y bloquea `/admin`, `/perfil` y `/auth/`.

**Los comentarios del HTML se publicaban.** Vite no los borra, así que los
bloques que explican el telón de arranque y el script del tema viajaban en cada
carga — y como el `<body>` es una SPA vacía, esos comentarios eran literalmente
**el único texto** que un extractor encontraba en la home. Se borran del build
(HTML de 16,4 a 10,8 KB); en el fuente quedan, que es donde sirven.

> **Trampa al inyectar en el HTML: `String.replace` reemplaza la PRIMERA
> ocurrencia.** El primer intento usaba `.replace("<body>", …)` y la primera
> `<body>` del fuente está **dentro de un comentario** (el que explica el telón).
> El `<noscript>` terminaba adentro del comentario y después el limpiador lo
> borraba junto con él: no fallaba, simplemente no aparecía. Se ancla a
> `<div id="root"></div>`, que no puede estar duplicado, y se avisa por consola
> si un ancla no está.


## 6.9 El panel en el celular

El panel se hizo pensando en una pantalla grande y se notaba. Con el operador
viendo 2 pestañas se toleraba; desde v22 ve 7 y el admin 9, así que lo que antes
era incómodo pasó a ser inusable.

**La navegación va en un `Sheet`, no en una tira.** El sidebar era
`flex md:flex-col` con `overflow-x-auto`: en el teléfono quedaba una fila de
botones con scroll horizontal, donde no se ve dónde termina ni dónde estás
parado. Ahora en celular hay una barra superior **`sticky`** —con listas largas,
tener que subir hasta arriba para cambiar de pestaña era la mitad del problema—
y el menú se desliza desde el costado con las 9 verticales. De `md:` para
arriba no cambió nada.

> **No se agregó ninguna librería.** `sheet.tsx`, `drawer.tsx`,
> `dropdown-menu` y `tabs` ya estaban instalados de shadcn y sin usar. Y hay un
> motivo más fuerte que el ahorro: `manualChunks` manda cualquier dependencia
> nueva al chunk `vendor`, que **sí se precarga en la landing** — una librería
> de tablas serían 40-200 KB que baja todo el que entra a ver una fiesta.

**Tarjetas en celular, tabla en escritorio.** Eventos y Usuarios eran tablas con
`min-w-[720px]`, o sea scroll lateral. Ahora siguen el patrón que Entregas y
Cumpleaños ya usaban.

**Los modales.** Tres de los nueve (tipo de entrada, cuenta y evento) se abrían
como un diálogo flotante con `p-4` **también en el teléfono**, desperdiciando
pantalla. Pasan a hoja completa con `h-[100dvh]`, y el encabezado baja de
`p-6`/`text-2xl` a `px-4 py-3`/`text-lg` en celular: medido en la cara pública,
esa combinación se comía 157 px, el 23 % del modal. Los botones de cerrar pasan
de 40 a 44 px, el mínimo táctil.

> **`ModalAdmin` envuelve a `ModalShell`, no lo copia.** El panel no tiene el
> problema del ancestro con `transform` que obligó a portar los modales públicos
> (§6.5), pero todo lo demás que ModalShell resuelve —`100dvh` en iOS, trabar el
> scroll del fondo, cerrar con Escape y con el velo— hace falta igual. Un segundo
> shell era garantizar que uno de los dos se quedara atrás. **Los 6 modales
> restantes todavía no se migraron**: mover el botón de guardar a un pie fijo lo
> saca del `<form>` y hay que engancharlo con `form="id"`. Es su propio PR.

**Usuarios: filtros, ficha y export.** Era un buscador de texto y 7 columnas, y
mostraba menos de la mitad de lo que la base guarda (faltaban teléfono, país,
departamento y foto). Ahora hay 10 filtros —rol, país, departamento, con o sin
teléfono, edad, mes de cumpleaños, antigüedad, si compró, estado de la promo de
cumpleaños y si tiene foto—, cinco ordenamientos y export CSV de lo filtrado.

> **`profiles` es la única tabla del panel que se cruza con las otras dos**
> (`ticket_deliveries.user_id`, `birthday_signups.user_id`) y ese cruce no se
> usaba en ningún lado: "¿este tipo ya compró alguna vez?" no tenía dónde
> contestarse. La ficha ahora muestra qué compró, cuánto gastó y en qué quedó su
> promo de cumpleaños. **Los cruces se piden aparte y si fallan la lista se
> muestra igual**: son datos de adorno para esta pantalla, y romper la pestaña
> entera sería cambiar un problema chico por uno grande.

> **Los desplegables de ubicación se arman con los usuarios que hay, no con el
> catálogo.** La primera versión usaba `getCountry(f.pais)?.states`, y
> `getCountry("")` devuelve `undefined`: **mientras no eligieras un país la
> lista de departamentos quedaba vacía**. Abrías "Departamento", veías sólo
> "Todos" y parecía roto — así lo reportó el autor. Y para un panel donde
> prácticamente todos son de Uruguay, obligar a elegir "Uruguay" antes de poder
> elegir "Colonia" es un paso escondido que nadie adivina. Armarlos desde los
> datos arregla eso y dos cosas más: **ninguna opción ofrecida puede dar cero**
> —el catálogo trae 19 países de los que se usan dos o tres— y los perfiles
> anteriores a v3, que tienen `country` y `state` en NULL, dejan de ser
> **imposibles de listar**: van bajo "Sin país cargado", que necesita un valor
> centinela porque en un `<select>` el string vacío ya significa "Todos".
> **La foto del documento NO se muestra en la ficha**, a propósito. Vive en un
> bucket privado y se abre sólo desde la pestaña Cumpleaños con una URL firmada
> de 5 minutos (v12). Una cédula no se muestra "de paso".

> **La edad se calcula cortando el string ISO.** El `calcAge` viejo hacía
> `new Date("1990-05-15")`, que se parsea como medianoche **UTC**: con los
> getters locales en Uruguay (UTC−3) devolvía el 14. Es el mismo motivo por el
> que `formatEventDate` corta el string, y acá importa el doble — una edad
> corrida un día puede marcar mayor a un menor.

**`lucide-react` salió de `vendor`, y es la misma trampa que `lottie-web`.**
Cada icono es un módulo suelto; cayendo en el `return 'vendor'` final se
juntaban todos ahí, así que **los ~40 que usa sólo el panel los descargaba
cualquiera que entrara a ver una fiesta**, aunque `/admin` esté en un chunk
lazy. Sin agrupar, Rollup pone cada icono donde se usa. Medido:
`vendor` 162 → 137 KB (−25 KB; −5,2 KB en brotli), `index` +5 KB, y el resto se
va al chunk de Admin, que sólo baja el staff.

**El CSV vive en `src/lib/csv.ts`.** El mismo bloque —escape, BOM y el baile del
`<a>` temporal— estaba copiado en Entregas y Cumpleaños; con Usuarios iban a ser
tres. El BOM se escribe como `\uFEFF` y no como carácter literal: escrito a mano
deja un byte invisible en el fuente que dispara `no-irregular-whitespace`.

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
