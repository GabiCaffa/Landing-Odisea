// ════════════════════════════════════════════════════════════════════════════
// ODÍSEA · Edge Function: send-ticket-confirmation
// ════════════════════════════════════════════════════════════════════════════
// Envía por email (vía Resend API) la confirmación de compra de entradas a un
// cliente cargado en el módulo Entregas, y marca la entrega como "enviada".
//
// Seguridad: sólo un usuario con rol admin puede invocarla (se valida el JWT).
//
// Requiere el secreto RESEND_API_KEY. Deploy y setup: ver
// supabase/SEND_TICKETS_SETUP.md
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

function fmtMoney(n: number): string {
  return `$${Number(n).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildHtml(opts: {
  firstName: string;
  eventName: string;
  eventDate: string;
  quantity: number;
  value: number;
}): string {
  const { firstName, eventName, eventDate, quantity, value } = opts;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#141414;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#141414;padding:28px 32px;text-align:center;">
          <img src="https://odiseaoficial.com/email-logo-white.png" alt="ODÍSEA" width="150" style="display:inline-block;max-width:150px;height:auto;">
        </td></tr>
        <tr><td style="height:4px;background:#F25C26;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;color:#141414;">¡Gracias por tu compra${firstName ? ", " + firstName : ""}!</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444;">
            Confirmamos tus entradas para el evento. Te esperamos.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #eee;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;">Evento</span><br>
              <strong style="font-size:16px;color:#141414;">${eventName}</strong>
            </td></tr>
            ${eventDate ? `<tr><td style="padding:16px 20px;border-bottom:1px solid #eee;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;">Fecha</span><br>
              <strong style="font-size:16px;color:#141414;">${eventDate}</strong>
            </td></tr>` : ""}
            <tr><td style="padding:16px 20px;border-bottom:1px solid #eee;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;">Entradas</span><br>
              <strong style="font-size:16px;color:#141414;">${quantity}</strong>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;">Total</span><br>
              <strong style="font-size:16px;color:#F25C26;">${fmtMoney(value)}</strong>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777;">
            Si tenés alguna duda, respondé este correo o escribinos a
            <a href="mailto:odiseaoficialcolonia@gmail.com" style="color:#F25C26;">odiseaoficialcolonia@gmail.com</a>.
          </p>
        </td></tr>
        <tr><td style="background:#f7f7f7;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#999;">ODÍSEA · Colonia del Sacramento, Uruguay</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ ok: false, error: "Falta configurar RESEND_API_KEY" });

    // 1) Validar que quien llama sea admin (por su JWT).
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ ok: false, error: "No autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ ok: false, error: "Solo un admin puede enviar" }, 403);

    // 2) Traer la entrega + evento (con service role, no confiamos en el cliente).
    const { deliveryId } = await req.json();
    if (!deliveryId) return json({ ok: false, error: "Falta deliveryId" });

    const { data: d } = await admin
      .from("ticket_deliveries").select("*").eq("id", deliveryId).maybeSingle();
    if (!d) return json({ ok: false, error: "Entrega no encontrada" });

    const { data: ev } = await admin
      .from("events").select("name,date").eq("id", d.event_id).maybeSingle();

    // 3) Enviar el email por Resend.
    const html = buildHtml({
      firstName: d.first_name ?? "",
      eventName: ev?.name ?? "ODÍSEA",
      eventDate: fmtDate(ev?.date ?? null),
      quantity: d.quantity,
      value: Number(d.value),
    });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ODÍSEA <no-reply@odiseaoficial.com>",
        to: [d.email],
        subject: `Tus entradas · ${ev?.name ?? "ODÍSEA"}`,
        html,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ ok: false, error: `Resend rechazó el envío: ${detail}` });
    }

    // 4) Marcar la entrega como enviada.
    await admin
      .from("ticket_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", deliveryId);

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
