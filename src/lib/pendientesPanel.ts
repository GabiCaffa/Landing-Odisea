import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AdminTab } from "@/lib/adminPermisos";

/**
 * Lo que espera a alguien en el panel: el número rojo del menú y las tareas
 * del día del inicio.
 *
 * Son conteos (`head: true`), no listas: el menú tiene que saber CUÁNTOS, no
 * cuáles, y una consulta de conteo no baja ninguna fila. Cada uno se pide sólo
 * si el rol ve esa pestaña: la base igual lo rechazaría por RLS, y el rol
 * `cumples` no tiene por qué consultar ventas.
 *
 * Se refresca solo con realtime de las dos tablas y, por las dudas, cada dos
 * minutos. Si una consulta falla, ese número no se muestra: un cero inventado
 * diría "no hay nada" cuando no se sabe.
 */
export interface Pendientes {
  /** Pedidos de la web sin confirmar el pago (v40). */
  porConfirmar: number | null;
  /** Pagos confirmados con las entradas sin mandar. */
  porEnviar: number | null;
  /** Solicitudes de cumpleaños sin revisar (v16). */
  cumplesARevisar: number | null;
  /** Ventas confirmadas de los últimos 7 días. */
  semana: { ventas: number; entradas: number; plata: number } | null;
}

const VACIO: Pendientes = { porConfirmar: null, porEnviar: null, cumplesARevisar: null, semana: null };

async function contar(tabla: string, columna: string, valor: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq(columna, valor);
  return error ? null : count ?? 0;
}

async function ventasDeLaSemana(): Promise<Pendientes["semana"]> {
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ticket_deliveries")
    .select("quantity, value")
    .in("status", ["pending", "sent"])
    .gte("created_at", desde)
    .limit(5000);
  if (error || !data) return null;
  return {
    ventas: data.length,
    entradas: data.reduce((a, d) => a + (d.quantity ?? 0), 0),
    plata: data.reduce((a, d) => a + Number(d.value ?? 0), 0),
  };
}

export function usePendientesPanel(tabs: AdminTab[]): Pendientes {
  const [p, setP] = useState<Pendientes>(VACIO);
  const veVentas = tabs.includes("deliveries");
  const veCumples = tabs.includes("birthdays");

  const cargar = useCallback(async () => {
    const [porConfirmar, porEnviar, cumplesARevisar, semana] = await Promise.all([
      veVentas ? contar("ticket_deliveries", "status", "por_confirmar") : null,
      veVentas ? contar("ticket_deliveries", "status", "pending") : null,
      veCumples ? contar("birthday_signups", "status", "pendiente") : null,
      veVentas ? ventasDeLaSemana() : null,
    ]);
    setP({ porConfirmar, porEnviar, cumplesARevisar, semana });
  }, [veVentas, veCumples]);

  // En plena venta llegan muchos cambios seguidos: se junta todo en uno.
  const espera = useRef<number>();
  useEffect(() => {
    void cargar();
    const pronto = () => {
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => void cargar(), 1500);
    };
    const canal = supabase.channel("panel-pendientes");
    if (veVentas) canal.on("postgres_changes", { event: "*", schema: "public", table: "ticket_deliveries" }, pronto);
    if (veCumples) canal.on("postgres_changes", { event: "*", schema: "public", table: "birthday_signups" }, pronto);
    canal.subscribe();
    const cada = window.setInterval(() => void cargar(), 120_000);
    return () => {
      window.clearTimeout(espera.current);
      window.clearInterval(cada);
      void supabase.removeChannel(canal);
    };
  }, [cargar, veVentas, veCumples]);

  return p;
}

/** El número del menú para cada pestaña (sólo las que tienen algo esperando). */
export function insigniasDe(p: Pendientes): Partial<Record<AdminTab, number>> {
  const out: Partial<Record<AdminTab, number>> = {};
  const ventas = (p.porConfirmar ?? 0) + (p.porEnviar ?? 0);
  if (ventas > 0) out.deliveries = ventas;
  if (p.cumplesARevisar) out.birthdays = p.cumplesARevisar;
  return out;
}
