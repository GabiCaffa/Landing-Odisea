# Envío de entradas por email — setup (Edge Function + Resend)

Guía para dejar andando el botón **"Enviar confirmación por email"** del módulo
Entregas. Es trabajo de una sola vez (consola + CLI). Lo corrés vos; Claude no
tiene acceso a tu cuenta.

La función vive en `supabase/functions/send-ticket-confirmation/index.ts`. Envía
un email branded (evento, fecha, cantidad, total) vía **Resend** y marca la
entrega como enviada. Sólo un admin puede invocarla (valida el JWT).

---

## Paso 1 · API key de Resend

1. Entrá a https://resend.com → **API Keys** → **Create API Key** (permiso de
   envío alcanza). Copiá la clave (empieza con `re_...`).
2. El dominio `odiseaoficial.com` ya está verificado en Resend (lo hiciste para
   el SMTP), así que el remitente `no-reply@odiseaoficial.com` funciona. Si no,
   verificá el dominio primero.

> La **API key** es distinta de las credenciales SMTP. Acá se usa la API key.

## Paso 2 · Instalar la CLI de Supabase (si no la tenés)

```bash
npm install -g supabase
supabase login        # abre el navegador para autorizar
```

## Paso 3 · Vincular el proyecto

Desde la raíz del repo (`Landing-Odisea`):

```bash
supabase link --project-ref <TU_PROJECT_REF>
```

El `project-ref` está en Supabase → Settings → General → *Reference ID*
(o en la URL del dashboard).

## Paso 4 · Cargar el secreto y desplegar

```bash
supabase secrets set RESEND_API_KEY=re_tu_clave_aca
supabase functions deploy send-ticket-confirmation
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen
inyectadas en las Edge Functions: no hay que setearlas.

## Paso 5 · Probar

En el panel admin → Entregas → en un cliente **pendiente** tocá el botón del
avión (Enviar confirmación). Debería llegar el mail y la entrega pasar a
"Enviadas". Si falla, el toast muestra el motivo (p. ej. dominio no verificado
o key inválida).

---

## Notas

- Cambiar el diseño del mail: editar `buildHtml()` en la función y volver a
  correr `supabase functions deploy send-ticket-confirmation`.
- Ver logs de envíos: Supabase Dashboard → Edge Functions → send-ticket-confirmation → Logs.
- El botón del sobre (Mail) sigue disponible como envío **manual** (abre tu
  cliente de correo), por si preferís mandarlo a mano en algún caso.
