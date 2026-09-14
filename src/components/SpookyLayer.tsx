import { useCallback, useEffect, useMemo, useState } from "react";
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
 *
 * **Nada está fijo.** La primera versión tenía las posiciones escritas a mano
 * y se notaba: las hojas caían siempre por las mismas columnas y los
 * murciélagos siempre a la misma altura, así que el conjunto se leía como un
 * patrón pegado en los bordes. Acá cada elemento se sortea al montar y **se
 * vuelve a sortear cada vez que termina su vuelta** (`onAnimationIteration`),
 * que es lo que hace que no se repita nunca en lugar de ser un loop.
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ─── Murciélagos ────────────────────────────────────────────────────────────

interface Bat {
  /** % de la altura de la ventana. Se evita la franja del header. */
  top: number;
  scale: number;
  duration: number;
  delay: number;
  opacity: number;
  /** Cruzan para los dos lados: uno solo se lee como desfile. */
  toLeft: boolean;
  /** Cuánto sube y baja mientras cruza. */
  bob: number;
}

const newBat = (firstRun: boolean): Bat => {
  const duration = rand(15, 30);
  return {
    top: rand(8, 78),
    scale: rand(0.55, 1.05),
    duration,
    // NEGATIVO a propósito. Con un delay positivo el elemento se queda quieto en
    // su posición natural —el borde izquierdo— hasta que le toca arrancar, y se
    // ve un murciélago estacionado en la esquina. Con uno negativo entra ya a
    // mitad de recorrido, así que al cargar la página están repartidos.
    // Al respawnear va en 0: el elemento viene de terminar la vuelta y arranca
    // de nuevo desde fuera de pantalla.
    delay: firstRun ? -rand(0, duration) : 0,
    opacity: rand(0.32, 0.6),
    toLeft: Math.random() < 0.4,
    bob: rand(14, 42),
  };
};

// ─── Hojas ──────────────────────────────────────────────────────────────────

interface Leaf {
  /** % del ancho. */
  left: number;
  size: number;
  duration: number;
  delay: number;
  /** Cuánto se desplaza de lado mientras cae. */
  sway: number;
  swayDuration: number;
    spin: number;
  spinDuration: number;
  tone: "celeste" | "celeste-deep" | "espectro";
  variant: 0 | 1;
}

const LEAF_TONES = ["celeste", "celeste-deep", "celeste", "celeste-deep", "espectro"] as const;

const newLeaf = (firstRun: boolean): Leaf => {
  const duration = rand(12, 26);
  return {
    left: rand(2, 96),
    size: rand(16, 30),
    duration,
    // Negativo, por lo mismo que el murciélago: si no, la hoja espera arriba a
    // la izquierda, visible y quieta, hasta que le llega el turno.
    delay: firstRun ? -rand(0, duration) : 0,
    sway: rand(18, 70),
    swayDuration: rand(2.5, 6),
    // El giro va para los dos lados.
  spin: rand(-1, 1) < 0 ? -rand(180, 720) : rand(180, 720),
    spinDuration: rand(4, 11),
    // El verde espectral aparece poco: es el acento raro, no un color más.
    tone: pick(LEAF_TONES),
    variant: Math.random() < 0.5 ? 0 : 1,
  };
};

const BAT_COUNT = 3;
const LEAF_COUNT = 11;

// ─── Dibujos ────────────────────────────────────────────────────────────────

const BatShape = () => (
  <svg viewBox="0 0 100 40" width="100%" height="100%" fill="currentColor">
    {/* orejas */}
    <path d="M45 14 L42 3 L48 10 Z" />
    <path d="M55 14 L58 3 L52 10 Z" />
    {/* cuerpo */}
    <path d="M50 8c-3 0-5 3-5 7v11c0 5 2 8 5 10 3-2 5-5 5-10V15c0-4-2-7-5-7z" />
    {/* ala izquierda, con el festón del borde de salida */}
    <path d="M46 14C40 10 32 5 22 4 14 3 7 5 2 9c6 2 9 6 8 11 5-3 9-1 11 4 3-4 7-5 11-3 4-3 9-3 14 1z" />
    {/* ala derecha: la misma, espejada, para que la simetría sea exacta */}
    <g transform="translate(100,0) scale(-1,1)">
      <path d="M46 14C40 10 32 5 22 4 14 3 7 5 2 9c6 2 9 6 8 11 5-3 9-1 11 4 3-4 7-5 11-3 4-3 9-3 14 1z" />
    </g>
  </svg>
);

/**
 * Dos hojas distintas: la 0 es ancha y lobulada, la 1 más fina y curvada. Que
 * no sean todas el mismo recorte es la mitad de lo que hace que el conjunto no
 * se lea como un sello repetido.
 */
const LeafShape = ({ variant }: { variant: 0 | 1 }) => (
  <svg viewBox="0 0 24 30" width="100%" height="100%">
    {variant === 0 ? (
      <>
        <path
          d="M12 2c4.2 3.4 8 8 7.4 12.6C18.8 19.2 15.6 22.4 12 24c-3.6-1.6-6.8-4.8-7.4-9.4C4 10 7.8 5.4 12 2z"
          fill="currentColor"
        />
        <path
          d="M12 4.5v19M12 11l4.6-3.2M12 11L7.4 7.8M12 16.5l5-3.4M12 16.5l-5-3.4M12 24v4.5"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
      </>
    ) : (
      <>
        <path
          d="M13.4 2c2.2 4.6 5.6 8.4 4.4 13.2-1.1 4.4-4.6 7.3-8.4 8.3C7 19.2 5.4 14.6 6.6 10.4 7.7 6.5 10.4 3.6 13.4 2z"
          fill="currentColor"
        />
        <path
          d="M13.4 3.6C11.6 9 10.2 15.6 9.4 23.5M12 10.6l4.6-1.6M10.6 16l4.8-2.2M9.4 23.5l-2.6 4"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
      </>
    )}
  </svg>
);

// ─── Capa ───────────────────────────────────────────────────────────────────

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

  // Se sortea una vez al montar: cada carga de la página es distinta.
  const [bats, setBats] = useState<Bat[]>(() =>
    Array.from({ length: BAT_COUNT }, () => newBat(true))
  );
  const [leaves, setLeaves] = useState<Leaf[]>(() =>
    Array.from({ length: LEAF_COUNT }, () => newLeaf(true))
  );

  // Al terminar una vuelta, ese elemento se vuelve a sortear. Es lo que evita
  // que a los 30 segundos se note el bucle.
  //
  // El `target !== currentTarget` NO es de adorno: `animationiteration`
  // BURBUJEA. Las capas de adentro tienen animación propia —las alas aletean
  // cada 0.4s, la hoja zigzaguea y gira— y cada vuelta de ésas sube hasta acá.
  // Sin el filtro, el murciélago se resorteaba dos veces por segundo y se
  // quedaba clavado en el arranque sin cruzar nunca.
  const onIteration = useCallback(
    (e: React.AnimationEvent<HTMLElement>, respawn: () => void) => {
      if (e.target !== e.currentTarget) return;
      respawn();
    },
    []
  );

  const respawnBat = useCallback((i: number) => {
    setBats((prev) => prev.map((b, j) => (j === i ? newBat(false) : b)));
  }, []);
  const respawnLeaf = useCallback((i: number) => {
    setLeaves((prev) => prev.map((l, j) => (j === i ? newLeaf(false) : l)));
  }, []);

  const style = useMemo(
    () => (extra: Record<string, string | number>) => extra as React.CSSProperties,
    []
  );

  if (theme !== "halloween" || reducedMotion) return null;

  return (
    <div className="spooky-layer" aria-hidden="true">
      {bats.map((bat, i) => (
        <span
          key={`bat-${i}`}
          className={`spooky-bat${bat.toLeft ? " spooky-bat--rtl" : ""}`}
          onAnimationIteration={(e) => onIteration(e, () => respawnBat(i))}
          style={style({
            top: `${bat.top}%`,
            opacity: bat.opacity,
            animationDuration: `${bat.duration}s`,
            animationDelay: `${bat.delay}s`,
          })}
        >
          <span
            className="spooky-bat-bob"
            style={style({
              animationDuration: `${bat.duration / 5}s`,
              "--spooky-bob": `${bat.bob}px`,
            })}
          >
            <span
              className="spooky-bat-wings"
              style={style({
                width: `${76 * bat.scale}px`,
                height: `${30 * bat.scale}px`,
                // Los chicos aletean más rápido, como los de verdad.
                animationDuration: `${0.36 + bat.scale * 0.22}s`,
              })}
            >
              <BatShape />
            </span>
          </span>
        </span>
      ))}

      {leaves.map((leaf, i) => (
        <span
          key={`leaf-${i}`}
          className="spooky-leaf"
          onAnimationIteration={(e) => onIteration(e, () => respawnLeaf(i))}
          style={style({
            left: `${leaf.left}%`,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
          })}
        >
          {/* El vaivén y el giro van en capas propias: así la caída es una
              línea recta y constante, y el zigzag no la acelera ni la frena. */}
          <span
            className="spooky-leaf-sway"
            style={style({
              animationDuration: `${leaf.swayDuration}s`,
              "--spooky-sway": `${leaf.sway}px`,
            })}
          >
            <span
              className={`spooky-leaf-spin spooky-leaf--${leaf.tone}`}
              style={style({
                width: `${leaf.size}px`,
                height: `${leaf.size * 1.25}px`,
                animationDuration: `${leaf.spinDuration}s`,
                "--spooky-spin": `${leaf.spin}deg`,
              })}
            >
              <LeafShape variant={leaf.variant} />
            </span>
          </span>
        </span>
      ))}
    </div>
  );
};

export default SpookyLayer;
