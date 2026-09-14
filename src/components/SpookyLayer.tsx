import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Capa decorativa del tema Halloween: murciélagos cruzando y hojas cayendo,
 * tomados de la imagen de referencia (calabaza, luna, murciélagos).
 *
 * Tres reglas que la mantienen inofensiva:
 *
 *  · Sólo existe con el tema prendido. Apagado no monta ni un nodo.
 *  · `pointer-events: none` y `aria-hidden`: no se puede tocar y no la lee un
 *    lector de pantalla. Es adorno, no contenido.
 *  · Se apaga con `prefers-reduced-motion`. Cosas cruzando la pantalla es
 *    justo lo que esa preferencia existe para evitar; y como acá la animación
 *    ES el elemento, se deja de renderizar en vez de congelarlo.
 *
 * Va en z-30: por encima del contenido (z-10/z-20) y por debajo del header y
 * los modales (z-50), así nunca tapa nada con lo que haya que interactuar.
 * Todo se anima con `transform` y `opacity` — nada que obligue al navegador a
 * recalcular layout en cada cuadro.
 */

/** Cada murciélago: altura, tamaño, cuánto tarda en cruzar y cuándo arranca. */
const BATS = [
  { top: "14%", scale: 1, duration: 17, delay: 0, opacity: 0.58 },
  { top: "38%", scale: 0.6, duration: 25, delay: 7, opacity: 0.4 },
  { top: "68%", scale: 0.8, duration: 21, delay: 13, opacity: 0.5 },
];

/** Las hojas van escalonadas para que no caigan todas juntas y en fila. */
const LEAVES = [
  { left: "6%", size: 26, duration: 14, delay: 0, drift: "7vw", tilt: -18, tone: "celeste" },
  { left: "21%", size: 19, duration: 19, delay: 5, drift: "-5vw", tilt: 24, tone: "celeste-deep" },
  { left: "37%", size: 28, duration: 16, delay: 9, drift: "9vw", tilt: 8, tone: "celeste" },
  { left: "52%", size: 21, duration: 22, delay: 3, drift: "-8vw", tilt: -30, tone: "celeste-deep" },
  { left: "68%", size: 25, duration: 15, delay: 12, drift: "6vw", tilt: 15, tone: "celeste" },
  { left: "83%", size: 18, duration: 20, delay: 7, drift: "-6vw", tilt: -10, tone: "celeste-deep" },
  { left: "94%", size: 23, duration: 18, delay: 16, drift: "-10vw", tilt: 20, tone: "celeste" },
] as const;

const BatShape = () => (
  <svg viewBox="0 0 100 40" width="100%" height="100%" fill="currentColor">
    {/* orejas */}
    <path d="M45 14 L42 3 L48 10 Z" />
    <path d="M55 14 L58 3 L52 10 Z" />
    {/* cuerpo */}
    <path d="M50 8c-3 0-5 3-5 7v11c0 5 2 8 5 10 3-2 5-5 5-10V15c0-4-2-7-5-7z" />
    {/* ala izquierda */}
    <path d="M46 14C40 10 32 5 22 4 14 3 7 5 2 9c6 2 9 6 8 11 5-3 9-1 11 4 3-4 7-5 11-3 4-3 9-3 14 1z" />
    {/* ala derecha: la misma, espejada */}
    <g transform="translate(100,0) scale(-1,1)">
      <path d="M46 14C40 10 32 5 22 4 14 3 7 5 2 9c6 2 9 6 8 11 5-3 9-1 11 4 3-4 7-5 11-3 4-3 9-3 14 1z" />
    </g>
  </svg>
);

const LeafShape = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%">
    <path d="M12 1c8 6 11 14 0 22C1 15 4 7 12 1z" fill="currentColor" opacity="0.92" />
    <path d="M12 5v14M12 10l4-3M12 14l-4-3" stroke="currentColor" strokeWidth="1.1"
          opacity="0.4" fill="none" strokeLinecap="round" />
  </svg>
);

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

  return (
    <div className="spooky-layer" aria-hidden="true">
      {BATS.map((bat, i) => (
        <span
          key={`bat-${i}`}
          className="spooky-bat"
          style={{
            top: bat.top,
            opacity: bat.opacity,
            animationDuration: `${bat.duration}s`,
            animationDelay: `${bat.delay}s`,
          }}
        >
          <span className="spooky-bat-bob" style={{ animationDuration: `${bat.duration / 6}s` }}>
            <span
              className="spooky-bat-wings"
              style={{ width: `${76 * bat.scale}px`, height: `${30 * bat.scale}px` }}
            >
              <BatShape />
            </span>
          </span>
        </span>
      ))}

      {LEAVES.map((leaf, i) => (
        <span
          key={`leaf-${i}`}
          className={`spooky-leaf spooky-leaf--${leaf.tone}`}
          style={{
            left: leaf.left,
            width: `${leaf.size}px`,
            height: `${leaf.size}px`,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
            ["--spooky-drift" as string]: leaf.drift,
            ["--spooky-tilt" as string]: `${leaf.tilt}deg`,
          }}
        >
          <LeafShape />
        </span>
      ))}
    </div>
  );
};

export default SpookyLayer;
