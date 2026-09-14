import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import SpookyEyes from "./SpookyEyes";

/**
 * Capa decorativa del tema Halloween: murciélagos, hojas, niebla y grano.
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
 *
 * **PLANOS.** La versión anterior se veía plana y de calcomanía, y el motivo no
 * era la cantidad de bichos: estaban todos a la MISMA distancia —misma opacidad,
 * mismo foco, velocidades parecidas—, y el ojo lee eso como stickers sobre un
 * color liso. Acá cada elemento se sortea en uno de tres planos:
 *
 *   fondo  → chico, tenue, lento y apenas desenfocado
 *   medio  → nítido, es el plano "real"
 *   frente → grande, rápido y MÁS desenfocado — lo que está muy cerca de una
 *            cámara también sale fuera de foco, y ese detalle es justamente el
 *            que convence de que hay profundidad
 *
 * **Nada está fijo:** cada elemento se sortea al montar y se vuelve a sortear
 * al terminar su vuelta, así no se repite nunca en lugar de ser un bucle.
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ─── Planos ─────────────────────────────────────────────────────────────────

type Plano = "fondo" | "medio" | "frente";

/** Cuántos de cada plano: el medio manda, el frente es un acento. */
const REPARTO: readonly Plano[] = [
  "fondo", "fondo", "fondo",
  "medio", "medio", "medio", "medio",
  "frente",
];

const PLANOS: Record<Plano, {
  escala: [number, number];
  opacidad: [number, number];
  /** Multiplicador de duración: más lejos, más lento. */
  lentitud: [number, number];
  blur: number;
}> = {
  fondo:  { escala: [0.32, 0.5],  opacidad: [0.14, 0.24], lentitud: [1.7, 2.4], blur: 1.4 },
  medio:  { escala: [0.7, 1],     opacidad: [0.34, 0.5],  lentitud: [0.9, 1.3], blur: 0 },
  frente: { escala: [1.5, 2.2],   opacidad: [0.42, 0.6],  lentitud: [0.4, 0.62], blur: 4.5 },
};

// ─── Murciélagos ────────────────────────────────────────────────────────────

interface Bat {
  plano: Plano;
  top: number;
  escala: number;
  opacidad: number;
  blur: number;
  duration: number;
  delay: number;
  /** Cruzan para los dos lados: uno solo se lee como desfile. */
  toLeft: boolean;
  bob: number;
}

const newBat = (firstRun: boolean): Bat => {
  const plano = pick(REPARTO);
  const p = PLANOS[plano];
  const duration = rand(17, 26) * rand(...p.lentitud);
  return {
    plano,
    top: rand(6, 80),
    escala: rand(...p.escala),
    opacidad: rand(...p.opacidad),
    blur: p.blur,
    duration,
    // NEGATIVO a propósito. Con un delay positivo el elemento se queda quieto
    // en su posición natural —el borde izquierdo— hasta que le toca arrancar, y
    // se ve un murciélago estacionado en la esquina. Con uno negativo entra ya
    // a mitad de recorrido, así que al cargar están repartidos.
    delay: firstRun ? -rand(0, duration) : 0,
    toLeft: Math.random() < 0.45,
    bob: rand(12, 46),
  };
};

// ─── Hojas ──────────────────────────────────────────────────────────────────

interface Leaf {
  plano: Plano;
  left: number;
  size: number;
  opacidad: number;
  blur: number;
  duration: number;
  delay: number;
  sway: number;
  swayDuration: number;
  spin: number;
  spinDuration: number;
  tone: "celeste" | "celeste-deep" | "espectro";
  variant: 0 | 1;
}

const LEAF_TONES = ["celeste", "celeste-deep", "celeste", "celeste-deep", "espectro"] as const;

const newLeaf = (firstRun: boolean): Leaf => {
  const plano = pick(REPARTO);
  const p = PLANOS[plano];
  const duration = rand(13, 22) * rand(...p.lentitud);
  return {
    plano,
    left: rand(-2, 100),
    size: rand(17, 27) * rand(...p.escala) * 1.35,
    opacidad: rand(...p.opacidad) + 0.25,
    blur: p.blur,
    duration,
    delay: firstRun ? -rand(0, duration) : 0,
    sway: rand(18, 74),
    swayDuration: rand(2.5, 6),
    spin: Math.random() < 0.5 ? -rand(180, 720) : rand(180, 720),
    spinDuration: rand(4, 11),
    tone: pick(LEAF_TONES),
    variant: Math.random() < 0.5 ? 0 : 1,
  };
};

const BAT_COUNT = 5;
const LEAF_COUNT = 14;

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

/** Dos recortes distintos: uno solo se lee como sello repetido. */
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
          stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.45"
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
          stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.45"
        />
      </>
    )}
  </svg>
);

// ─── Capa ───────────────────────────────────────────────────────────────────

const st = (o: Record<string, string | number>) => o as React.CSSProperties;

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

  const [bats, setBats] = useState<Bat[]>(() =>
    Array.from({ length: BAT_COUNT }, () => newBat(true))
  );
  const [leaves, setLeaves] = useState<Leaf[]>(() =>
    Array.from({ length: LEAF_COUNT }, () => newLeaf(true))
  );

  /**
   * El `target !== currentTarget` NO es de adorno: `animationiteration`
   * BURBUJEA. Las capas de adentro tienen animación propia —las alas aletean
   * cada 0.4s, la hoja zigzaguea y gira— y cada vuelta de ésas sube hasta acá.
   * Sin el filtro, el murciélago se resorteaba dos veces por segundo y se
   * quedaba clavado en el arranque sin cruzar nunca.
   */
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

  if (theme !== "halloween" || reducedMotion) return null;

  return (
    <>
      <div className="spooky-layer" aria-hidden="true">
        {bats.map((bat, i) => (
          <span
            key={`bat-${i}`}
            className={`spooky-bat${bat.toLeft ? " spooky-bat--rtl" : ""}`}
            onAnimationIteration={(e) => onIteration(e, () => respawnBat(i))}
            style={st({
              top: `${bat.top}%`,
              opacity: bat.opacidad,
              animationDuration: `${bat.duration}s`,
              animationDelay: `${bat.delay}s`,
            })}
          >
            <span
              className="spooky-bat-bob"
              style={st({
                animationDuration: `${bat.duration / 5}s`,
                "--spooky-bob": `${bat.bob}px`,
              })}
            >
              <span
                className="spooky-bat-wings"
                style={st({
                  width: `${76 * bat.escala}px`,
                  height: `${30 * bat.escala}px`,
                  // Los chicos aletean más rápido, como los de verdad.
                  animationDuration: `${0.34 + bat.escala * 0.2}s`,
                  filter: bat.blur ? `blur(${bat.blur}px)` : undefined,
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
            style={st({
              left: `${leaf.left}%`,
              opacity: leaf.opacidad,
              animationDuration: `${leaf.duration}s`,
              animationDelay: `${leaf.delay}s`,
            })}
          >
            {/* El vaivén y el giro van en capas propias: así la caída es una
                línea recta y constante, y el zigzag no la acelera ni la frena. */}
            <span
              className="spooky-leaf-sway"
              style={st({
                animationDuration: `${leaf.swayDuration}s`,
                "--spooky-sway": `${leaf.sway}px`,
              })}
            >
              <span
                className={`spooky-leaf-spin spooky-leaf--${leaf.tone}`}
                style={st({
                  width: `${leaf.size}px`,
                  height: `${leaf.size * 1.25}px`,
                  animationDuration: `${leaf.spinDuration}s`,
                  "--spooky-spin": `${leaf.spin}deg`,
                  filter: leaf.blur ? `blur(${leaf.blur}px)` : undefined,
                })}
              >
                <LeafShape variant={leaf.variant} />
              </span>
            </span>
          </span>
        ))}

        {/* Niebla baja: dos bandas que derivan a distinta velocidad. Dos y no
            una porque una sola se lee como un degradado quieto. */}
        <span className="spooky-niebla spooky-niebla--a" />
        <span className="spooky-niebla spooky-niebla--b" />
      </div>

      {/* El grano va aparte y por encima de todo (z-40): es la "película" en la
          que está filmada la escena, no un objeto dentro de ella. */}
      <div className="spooky-grano" aria-hidden="true" />

      <SpookyEyes />
    </>
  );
};

export default SpookyLayer;
