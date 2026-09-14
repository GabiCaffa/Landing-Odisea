import { useCallback, useState } from "react";
import SpookyLottie from "./SpookyLottie";

/**
 * Bandada de murciélagos cruzando el hero.
 *
 * Uno solo y quieto en un rincón se lee como un sticker pegado — que fue
 * exactamente lo que pasó con el primer intento. Acá son varios, a distintas
 * alturas, tamaños, velocidades y direcciones.
 *
 * **Van lentos a propósito.** La decoración anterior cruzaba la pantalla en
 * ~7 segundos y se sentía agresiva; acá el más rápido tarda casi un minuto.
 *
 * Tres trampas que ya costaron caro y están resueltas:
 *
 * · **Retrasos NEGATIVOS.** Con un delay positivo, el elemento se queda quieto
 *   y VISIBLE en su posición natural —el borde— hasta que le toca arrancar.
 *   Eso era lo que hacía que "aparecieran todos en el borde".
 * · **`animationiteration` burbujea:** el aleteo de adentro sube su evento al
 *   contenedor. Sin el filtro `target !== currentTarget`, cada murciélago se
 *   resorteaba varias veces por segundo y nunca llegaba a cruzar.
 * · **Van DETRÁS del contenido** (`z-0` dentro del hero, que no tiene tarjetas).
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Los tres tonos que pidió el autor. El negro casi no se ve sobre la noche:
 *  va poco y grande, para que se lea como una sombra que pasa. */
const TONOS = ["negro", "gris", "gris", "blanco", "blanco"] as const;

interface Bat {
  top: number;
  /** Ancho en px a 1x; el CSS lo acota en pantallas chicas. */
  ancho: number;
  duracion: number;
  delay: number;
  opacidad: number;
  haciaIzquierda: boolean;
  /** Cuánto sube y baja mientras cruza. */
  vaiven: number;
  tono: (typeof TONOS)[number];
}

const nuevoBat = (primeraVez: boolean): Bat => {
  const tono = pick(TONOS);
  // Lento. El más rápido tarda ~38s en cruzar; el más lento, más de un minuto.
  const duracion = rand(38, 78);
  return {
    top: rand(4, 62),
    // El negro va más grande: es el que menos se ve sobre el fondo oscuro.
    ancho: tono === "negro" ? rand(120, 190) : rand(55, 130),
    duracion,
    // Negativo: entra ya a mitad de recorrido en vez de esperar quieto en el borde.
    delay: primeraVez ? -rand(0, duracion) : 0,
    opacidad: tono === "negro" ? rand(0.5, 0.75) : rand(0.16, 0.34),
    haciaIzquierda: Math.random() < 0.45,
    vaiven: rand(14, 52),
    tono,
  };
};

const CANTIDAD = 4;

const SpookyBats = () => {
  const [bats, setBats] = useState<Bat[]>(() =>
    Array.from({ length: CANTIDAD }, () => nuevoBat(true))
  );

  const alCompletarVuelta = useCallback(
    (e: React.AnimationEvent<HTMLElement>, i: number) => {
      // Sin esto, el aleteo de adentro dispara el resorteo varias veces por
      // segundo y el murciélago se queda clavado en el arranque.
      if (e.target !== e.currentTarget) return;
      setBats((prev) => prev.map((b, j) => (j === i ? nuevoBat(false) : b)));
    },
    []
  );

  return (
    <div className="spooky-bats" aria-hidden="true">
      {bats.map((b, i) => (
        <span
          key={`bat-${i}`}
          className={`spooky-bat-vuelo${b.haciaIzquierda ? " spooky-bat-vuelo--rtl" : ""}`}
          onAnimationIteration={(e) => alCompletarVuelta(e, i)}
          style={
            {
              top: `${b.top}%`,
              opacity: b.opacidad,
              animationDuration: `${b.duracion}s`,
              animationDelay: `${b.delay}s`,
              // Por variable y no como ancho directo: así el CSS puede
              // acotarlo en pantallas chicas sin pelearse con un style inline.
              "--bat-ancho": `${b.ancho}px`,
            } as React.CSSProperties
          }
        >
          {/* El vaivén va en su propia capa: si compartiera transform con el
              avance, uno pisaría al otro. */}
          <span
            className="spooky-bat-vaiven"
            style={
              {
                animationDuration: `${b.duracion / 6}s`,
                "--vaiven": `${b.vaiven}px`,
              } as React.CSSProperties
            }
          >
            <SpookyLottie
              src="/halloween-bat.json"
              className={`spooky-bat-dibujo spooky-bat-dibujo--${b.tono}`}
              speed={0.55}
            />
          </span>
        </span>
      ))}
    </div>
  );
};

export default SpookyBats;
