import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Atmósfera del tema Halloween.
 *
 * **Qué pasó acá.** Esto llegó a tener murciélagos, hojas, ojos y una luna,
 * todo dibujado a mano en SVG. No funcionó: se leía como calcomanías pegadas
 * sobre un color liso, iba demasiado rápido y —error de diseño mío— vivía en
 * `z-30`, o sea POR ENCIMA de las cards, cruzándoles por delante.
 *
 * La conclusión no fue ajustar los valores otra vez sino cambiar de enfoque:
 * **una figura dibujada a mano en SVG tiene un techo bajo**, y ninguna
 * cantidad de planos ni de desenfoque la sube. La atmósfera de verdad la da
 * una imagen real de fondo (ver `hero-fondo` en Hero.tsx).
 *
 * Lo único que sobrevive acá es el grano, que no es una figura sino una
 * textura: no tiene forma que pueda verse mal, no se mueve y nadie lo nota
 * conscientemente — sólo hace que el color plano deje de parecer plano.
 *
 * Todo lo demás está en el historial, en el commit `945b51b`, por si alguna
 * vez se quiere rescatar alguna pieza.
 */
const SpookyLayer = () => {
  const { theme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (theme !== "halloween" || reducedMotion) return null;

  // El grano va por encima de todo (z-40, bajo header y modales): es la
  // película en la que está filmada la escena, no un objeto dentro de ella.
  // Como no se mueve ni tiene silueta, estar arriba no molesta a nada.
  return <div className="spooky-grano" aria-hidden="true" />;
};

export default SpookyLayer;
