import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ojos en la oscuridad: pares de ojos que se abren despacio en algún lugar de
 * la pantalla, parpadean, **siguen al cursor** y se desvanecen.
 *
 * Es lo único de la decoración que reacciona a la persona. El resto (hojas,
 * murciélagos, niebla) pasa igual esté quien esté del otro lado; esto mira.
 *
 * Detalles que lo hacen funcionar:
 *
 *  · **La mirada es una sola cuenta para todos.** Un `pointermove` escribe dos
 *    custom properties en el contenedor y las pupilas las leen desde el CSS.
 *    Un estado de React por par haría re-renderizar en cada píxel del mouse.
 *  · **Se lee con rAF.** `pointermove` dispara decenas de veces por cuadro; sin
 *    limitarlo se escribe en el DOM mucho más de lo que la pantalla puede
 *    mostrar.
 *  · **En celular no hay cursor**, así que las pupilas quedan con su deriva
 *    lenta propia (animación CSS) en vez de quietas.
 *
 * Lo monta `SpookyLayer`, que ya se encarga de no existir con el tema apagado
 * ni con `prefers-reduced-motion`.
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Par {
  top: number;
  left: number;
  /** Tamaño del ojo en px. */
  size: number;
  /** Separación entre los dos ojos, en múltiplos del tamaño. */
  separacion: number;
  /** Inclinación de la cabeza imaginaria. */
  tilt: number;
  opacidad: number;
  /** Cuánto dura el ciclo completo: abrir, mirar, cerrar. */
  vida: number;
  delay: number;
  blinkDuration: number;
  espectral: boolean;
}

const newPar = (firstRun: boolean): Par => {
  const vida = rand(9, 17);
  return {
    // Se evita la franja del header y el borde inferior, donde está el altavoz.
    top: rand(12, 82),
    left: rand(4, 92),
    // A 7-15px la pupila queda en 3px y el par se lee como dos puntitos
    // naranjas. Desde ~16px se distingue que están mirando, que es todo el
    // punto del efecto.
    size: rand(16, 28),
    separacion: rand(1.35, 2),
    tilt: rand(-12, 12),
    opacidad: rand(0.55, 0.95),
    vida,
    // Negativo al montar para que no aparezcan los tres a la vez ni haya que
    // esperar a que arranquen (mismo criterio que los murciélagos).
    delay: firstRun ? -rand(0, vida) : -rand(0, 2),
    blinkDuration: rand(3.5, 7),
    // El verde espectral sale poco: la mayoría son ámbar, como corresponde.
    espectral: Math.random() < 0.25,
  };
};

const PAIR_COUNT = 3;

const SpookyEyes = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [pares, setPares] = useState<Par[]>(() =>
    Array.from({ length: PAIR_COUNT }, () => newPar(true))
  );

  // ── La mirada ──
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pendiente = 0;
    let x = 0;
    let y = 0;

    const escribir = () => {
      pendiente = 0;
      el.style.setProperty("--mirada-x", x.toFixed(3));
      el.style.setProperty("--mirada-y", y.toFixed(3));
    };

    const onMove = (e: PointerEvent) => {
      // -1..1 respecto del centro de la ventana. Las pupilas multiplican esto
      // por su propio radio, así un ojo grande mueve más la pupila que uno
      // chico y los dos miran al mismo punto.
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      el.dataset.mirando = "1";
      if (!pendiente) pendiente = requestAnimationFrame(escribir);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);

  /** `animationiteration` burbujea: el parpadeo de cada ojo llegaría acá. */
  const onIteration = useCallback(
    (e: React.AnimationEvent<HTMLElement>, i: number) => {
      if (e.target !== e.currentTarget) return;
      setPares((prev) => prev.map((p, j) => (j === i ? newPar(false) : p)));
    },
    []
  );

  return (
    <div className="spooky-ojos" ref={ref} aria-hidden="true">
      {pares.map((p, i) => (
        <span
          key={`ojos-${i}`}
          className="spooky-ojos-par"
          onAnimationIteration={(e) => onIteration(e, i)}
          style={
            {
              top: `${p.top}%`,
              left: `${p.left}%`,
              gap: `${p.size * p.separacion}px`,
              transform: `rotate(${p.tilt}deg)`,
              animationDuration: `${p.vida}s`,
              animationDelay: `${p.delay}s`,
              "--ojo-opacidad": p.opacidad,
            } as React.CSSProperties
          }
        >
          {[0, 1].map((n) => (
            <span
              key={n}
              className={`spooky-ojo${p.espectral ? " spooky-ojo--espectral" : ""}`}
              style={
                {
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  animationDuration: `${p.blinkDuration}s`,
                  // Desfase mínimo entre ojo y ojo: dos párpados perfectamente
                  // sincronizados se ven mecánicos.
                  animationDelay: `${n * 0.04}s`,
                  "--ojo-radio": `${p.size * 0.22}px`,
                } as React.CSSProperties
              }
            >
              <i className="spooky-pupila" />
            </span>
          ))}
        </span>
      ))}
    </div>
  );
};

export default SpookyEyes;
