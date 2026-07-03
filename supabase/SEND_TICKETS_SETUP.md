# Envío de entradas por email — setup (Edge Function + Resend)

Guía para dejar andando el botón **"Enviar confirmación por email"** del módulo
Entregas. Es trabajo de una sola vez (consola + CLI). Lo corrés vos; Claude no
tiene acceso a tu cuenta.

La función vive en `supabase/functions/send-ticket-confirmation/index.ts`. Envía
un email branded (evento, fecha, cantidad, total) vía **Resend** y marca la
entrega como enviada. Sólo un admin puede invocarla (valida el JWT).

---

## Paso 1 · API key de Resend

Podés **reutilizar la API key que ya tenés** (la misma clave `re_...` sirve para
el SMTP y para la API REST que usa esta función). Si no la tenés a mano:
https://resend.com → **API Keys**. El dominio `odiseaoficial.com` ya está
verificado, así que el remitente `no-reply@odiseaoficial.com` funciona.

## Paso 2 · CLI de Supabase (ya instalada en el proyecto)

La CLI ya quedó como dependencia de desarrollo: se usa con `npx supabase`
(NO se instala global). Primero autorizá tu cuenta:

```bash
npx supabase login        # abre el navegador para autorizar
```

## Paso 3 · Vincular el proyecto

Desde la raíz del repo (`Landing-Odisea`):

```bash
npx supabase link --project-ref <TU_PROJECT_REF>
```

El `project-ref` está en Supabase → Settings → General → *Reference ID*
(o en la URL del dashboard: `.../project/<REF>`).

## Paso 4 · Cargar el secreto y desplegar

```bash
npx supabase secrets set RESEND_API_KEY=re_tu_clave_aca
npx supabase functions deploy send-ticket-confirmation
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
  correr `npx supabase functions deploy send-ticket-confirmation`.
- Ver logs de envíos: Supabase Dashboard → Edge Functions → send-ticket-confirmation → Logs.
- El botón del sobre (Mail) sigue disponible como envío **manual** (abre tu
  cliente de correo), por si preferís mandarlo a mano en algún caso.
