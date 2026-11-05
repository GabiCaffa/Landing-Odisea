import { useEffect, useRef, useState } from "react";

/**
 * Guirnalda de lamparitas colgando del borde del menú (Navidad y Año Nuevo).
 *
 * Son círculos con un halo, no figuras dibujadas: lo que hundió la decoración
 * de Halloween fueron las siluetas hechas a mano, y una lamparita es un punto
 * de luz. El cable cae en curvas entre cada tramo, como una guirnalda colgada.
 *
 * Cada lamparita titila con su propio ritmo (sólo `opacity`, lo más barato de
 * animar). Con `prefers-reduced-motion` quedan prendidas y quietas.
 *
 * Se arma con la medida real del ancho: tramos de ~90 px en escritorio y ~70
 * en celular, así no hay lamparitas estiradas ni cortadas.
 */
const COLORES = {
  navidad: ["#FF4A43", "#FFCF4A", "#3FD18B", "#5AA9FF", "#FF8AD8"],
  "anio-nuevo": ["#FFE7A6", "#FFF6DC", "#E3B34C", "#FFD27A"],
} as const;

const ALTO = 34;

const Guirnalda = ({ modo }: { modo: keyof typeof COLORES }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // La medida de entrada va directo: el ResizeObserver avisa recién en el
    // próximo pintado, y en una pestaña de fondo eso puede no llegar nunca.
    setAncho(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colores = COLORES[modo];
  const tramo = ancho < 640 ? 70 : 90;
  const tramos = Math.max(1, Math.ceil(ancho / tramo));
  const largo = ancho / tramos;

  // Curva de cada tramo: cuelga 14 px en el medio.
  const punto = (i: number, t: number) => {
    const x0 = i * largo;
    const x1 = x0 + largo;
    const cx = x0 + largo / 2;
    const y0 = 3;
    const cy = 22;
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y0;
    return { x, y };
  };

  const lamparitas: { x: number; y: number; color: string; demora: number; duracion: number }[] = [];
  for (let i = 0; i < tramos; i++) {
    for (const t of [0.25, 0.5, 0.75]) {
      const { x, y } = punto(i, t);
      const n = lamparitas.length;
      lamparitas.push({
        x,
        y,
        color: colores[n % colores.length],
        // Determinista por posición: no cambia entre renders.
        demora: -((n * 0.37) % 2.4),
        duracion: 1.6 + ((n * 0.53) % 1.4),
      });
    }
  }

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="guirnalda pointer-events-none absolute left-0 right-0 top-full"
      style={{ height: ALTO }}
    >
      {ancho > 0 && (
        <svg width={ancho} height={ALTO} viewBox={`0 0 ${ancho} ${ALTO}`} className="block overflow-visible">
          <defs>
            {colores.map((c, i) => (
              <radialGradient key={c} id={`halo-${modo}-${i}`}>
                <stop offset="0%" stopColor={c} stopOpacity="0.9" />
                <stop offset="100%" stopColor={c} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          <path
            d={Array.from({ length: tramos }, (_, i) => {
              const x0 = i * largo;
              return `M${x0},3 Q${x0 + largo / 2},22 ${x0 + largo},3`;
            }).join(" ")}
            fill="none"
            stroke="rgba(10,25,18,0.85)"
            strokeWidth="1.6"
          />
          {lamparitas.map((l, i) => {
            const idx = colores.indexOf(l.color as never);
            return (
              <g key={i} transform={`translate(${l.x},${l.y})`}>
                <circle
                  className="guirnalda__halo"
                  r="11"
                  cy="7"
                  fill={`url(#halo-${modo}-${idx})`}
                  style={{ animationDelay: `${l.demora}s`, animationDuration: `${l.duracion}s` }}
                />
                <rect x="-1.8" y="-1" width="3.6" height="3.4" rx="0.8" fill="#1d2b24" />
                <ellipse
                  className="guirnalda__foco"
                  cx="0"
                  cy="7"
                  rx="3.2"
                  ry="4.8"
                  fill={l.color}
                  style={{ animationDelay: `${l.demora}s`, animationDuration: `${l.duracion}s` }}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};

export default Guirnalda;
