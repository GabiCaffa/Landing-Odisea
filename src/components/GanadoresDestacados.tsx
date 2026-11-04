import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { imagenRedimensionada } from "@/lib/imagenes";
import { playThud } from "@/lib/spookySound";
import { Ganador, fetchGanadores, rutaDeConcurso, useConcursosHome } from "@/lib/votacion";
import type { Concurso } from "@/lib/votacion";

/**
 * Destacado de la home con los ganadores de cada votación terminada (v42). Reemplaza
 * al aviso de "votación abierta" apenas pasa la hora de cierre: la transición es
 * automática (`useConcursosHome` agenda el momento del cierre).
 *
 * Sin votaciones terminadas, o sin votos cargados todavía, no se renderiza nada.
 * Para sacarlo de la home basta con pasar la votación a "Borrador" en el panel.
 */
const MAX = 2;

const Tarjeta = ({ concurso }: { concurso: Concurso }) => {
  const [ganadores, setGanadores] = useState<Ganador[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchGanadores(concurso)
      .then((g) => vivo && setGanadores(g))
      .catch(() => vivo && setGanadores([]));
    return () => {
      vivo = false;
    };
  }, [concurso]);

  // Sin datos (o sin ningún voto) no hay nada que festejar: no se muestra.
  if (!ganadores || ganadores.length === 0) return null;

  return (
    <Link
      to={rutaDeConcurso(concurso)}
      onClick={playThud}
      className="mx-auto mb-3 block w-full max-w-md rounded-2xl bg-black p-4 text-white shadow-lg ring-2 ring-celeste transition-transform active:scale-[0.99]"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
            {ganadores.length === 1 ? "Ganador" : `Los ${ganadores.length} ganadores`}
          </span>
          <span className="line-clamp-2 block font-sport text-lg font-black uppercase leading-[1.05] tracking-wide">
            {concurso.title}
          </span>
        </span>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <ol
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${ganadores.length}, minmax(0, 1fr))` }}
      >
        {ganadores.map(({ participante, votos }, i) => (
          <li key={participante.id} className="min-w-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-secondary">
              <img
                src={imagenRedimensionada(participante.photoUrl, 360)}
                alt={participante.label || `Puesto ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute left-1 top-1 rounded-full bg-celeste px-2 py-0.5 text-[11px] font-black text-accent-foreground">
                {i + 1}°
              </span>
            </div>
            <p className="mt-1 truncate text-center text-[11px] font-semibold uppercase tracking-wide">
              {participante.label || `Disfraz`}
            </p>
            <p className="text-center text-[10px] opacity-60">
              {votos} {votos === 1 ? "voto" : "votos"}
            </p>
          </li>
        ))}
      </ol>
    </Link>
  );
};

const GanadoresDestacados = () => {
  const { terminados } = useConcursosHome();
  if (terminados.length === 0) return null;
  return (
    <>
      {terminados.slice(0, MAX).map((c) => (
        <Tarjeta key={c.id} concurso={c} />
      ))}
    </>
  );
};

export default GanadoresDestacados;
