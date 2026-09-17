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
`v20_birthday_role.sql` → `v21_ticket_promos.sql`.
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
