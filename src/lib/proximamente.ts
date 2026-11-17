import { useEffect, useState } from "react";

/**
 * Eventos "próximamente" (v49): un evento con `revealAt` en el futuro se muestra
 * como teaser (flyer borroso, contador, sin compra) y se desbloquea solo al llegar
 * esa hora.
 */

/** ¿Todavía no se reveló? Sin fecha, o con la fecha ya pasada, es un evento normal. */
export const esProximamente = (revealAt?: string, ahora = Date.now()): boolean =>
  !!revealAt && Date.parse(revealAt) > ahora;

/**
 * `Date.now()` que se refresca **justo cuando pasa la próxima de estas fechas**:
 * quien lo use se vuelve a renderizar en el momento exacto del desbloqueo, sin
 * recargar y sin un reloj latiendo cada segundo. Sin fechas futuras no agenda nada.
 */
export const useAhora = (fechas: (string | undefined)[]): number => {
  const [ahora, setAhora] = useState(() => Date.now());
  const clave = fechas.join("|");

  useEffect(() => {
    const ahoraMismo = Date.now();
    const futuras = clave
      .split("|")
      .map((f) => (f ? Date.parse(f) : NaN))
      .filter((t) => t > ahoraMismo);
    if (futuras.length === 0) return;
    // setTimeout no acepta más de ~24 días: con una fecha más lejana se reagenda.
    const espera = Math.min(Math.min(...futuras) - ahoraMismo + 300, 2_000_000_000);
    const id = window.setTimeout(() => setAhora(Date.now()), espera);
    return () => window.clearTimeout(id);
  }, [clave, ahora]);

  return ahora;
};
