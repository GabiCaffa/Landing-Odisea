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
`v12_birthday_signups.sql`.
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
`gift_given` + `gift_given_at`. **Mayoría de edad (18+) validada dos veces:** en el form
y con un trigger en la DB (`enforce_birthday_signup_adult`; trigger y no CHECK porque
`current_date` no es inmutable). Otro trigger mantiene coherente `gift_given_at`.
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
