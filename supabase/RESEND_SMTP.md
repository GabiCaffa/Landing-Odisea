# Configurar Resend como SMTP propio de Supabase Auth

Guía paso a paso para que los mails de Supabase (confirmación de cuenta, reseteo de
contraseña, etc.) salgan por **Resend** en vez del SMTP de prueba de Supabase.

- **Dominio:** `odiseaoficial.com`
- **Remitente:** `no-reply@odiseaoficial.com`
- **DNS:** administrado en **Vercel** (Vercel → Domains)
- **Por qué:** el SMTP integrado de Supabase es sólo para pruebas (límite ~2-4
  mails/hora). Con registros reales se cae. Resend (plan free: 100 mails/día,
  3.000/mes) alcanza de sobra para la landing.

> Todo esto se hace en **dashboards** (Resend, Vercel, Supabase). No hay cambios de
> código: el front ya usa Supabase Auth; sólo cambia el "cartero" que envía.

---

## Paso 1 · Crear cuenta y agregar el dominio en Resend

1. Entrar a https://resend.com y crear cuenta (o loguearse).
2. **Domains → Add Domain** → escribir `odiseaoficial.com` → Add.
3. Resend muestra una lista de **registros DNS** a cargar (SPF, DKIM y un MX de
   bounce). Son **generados por tu cuenta** (la clave DKIM es única), así que hay
   que **copiarlos de ahí**. Tendrán esta forma (los valores exactos los da Resend):

   | Tipo | Nombre (host)              | Valor (ejemplo — usar el REAL de Resend)        | Prioridad |
   |------|----------------------------|-------------------------------------------------|-----------|
   | MX   | `send`                     | `feedback-smtp.us-east-1.amazonses.com`         | 10        |
   | TXT  | `send`                     | `v=spf1 include:amazonses.com ~all`             | —         |
   | TXT  | `resend._domainkey`        | `p=MIGf...` (clave DKIM larga)                  | —         |

   (Opcional pero recomendado, DMARC — sólo si Resend/te lo sugiere:)
   | TXT | `_dmarc` | `v=DMARC1; p=none;` | — |

   Dejá esta pantalla de Resend abierta para copiar los valores en el Paso 2.

---

## Paso 2 · Cargar los registros DNS en Vercel

> Requiere que `odiseaoficial.com` use los **nameservers de Vercel**. Si el dominio
> apunta a Vercel sólo con A/CNAME desde otro registrador, los registros van en ese
> otro proveedor, no en Vercel.

1. Vercel → **Domains** (o Project → Settings → Domains) → elegir `odiseaoficial.com`
   → sección **DNS Records**.
2. Por cada fila del Paso 1, **Add Record**:
   - **Type:** MX / TXT según corresponda.
   - **Name:** el "Nombre (host)" tal cual (`send`, `resend._domainkey`, `_dmarc`).
     En Vercel el `@` = raíz; acá van subdominios, así que se escribe el prefijo
     (ej. `send`), NO el dominio completo.
   - **Value:** pegar el valor exacto de Resend.
   - **Priority:** sólo para el MX → `10`.
3. Guardar todos.
4. Volver a Resend → **Verify** (o esperar; se verifica solo). La propagación suele
   tardar de minutos a un par de horas. Estado objetivo: **Verified** ✅.

---

## Paso 3 · Crear la API key en Resend

1. Resend → **API Keys → Create API Key**.
2. Nombre: `supabase-smtp` · Permiso: **Sending access** (con eso alcanza).
3. Copiar la key (empieza con `re_...`). **Se muestra una sola vez** → guardala.

---

## Paso 4 · Cargar el SMTP en Supabase

Supabase → **Authentication → Emails → SMTP Settings** → activar **Enable Custom SMTP**:

| Campo          | Valor                          |
|----------------|--------------------------------|
| Host           | `smtp.resend.com`              |
| Port           | `465`                          |
| Username       | `resend`                       |
| Password       | la API key `re_...` (Paso 3)   |
| Sender email   | `no-reply@odiseaoficial.com`   |
| Sender name    | `ODÍSEA`                       |

Guardar. (Si 465 diera problemas, probar `587`.)

---

## Paso 5 · Subir el límite de envío

Con SMTP propio ya se pueden mandar muchos más mails. Supabase → **Authentication →
Rate Limits** → subir **"Emails per hour"** a un valor cómodo (ej. 100). El default
bajo es porque asume el SMTP de prueba.

---

## Paso 6 · Probar

1. Modo incógnito → `https://odiseaoficial.com/registro` → registrarse con un email
   nuevo real (truco: `tucorreo+resend1@gmail.com`).
2. Debe llegar el mail de confirmación **enviado por Resend** desde
   `no-reply@odiseaoficial.com`, con el template ODÍSEA (logo, etc.).
3. Confirmar → "¡BIENVENIDO, {NOMBRE}!".
4. Chequear en **Resend → Emails** que aparezca el envío como *Delivered*.

### Si algo falla
- **No llega / rebota:** revisar que el dominio esté **Verified** en Resend y que el
  `Sender email` sea del dominio verificado.
- **Error de auth SMTP en Supabase:** password mal pegada (usar la API key completa,
  user literal `resend`).
- **Cae en spam:** agregar el registro **DMARC** (Paso 1) y verificar que SPF+DKIM
  estén OK en Resend.
