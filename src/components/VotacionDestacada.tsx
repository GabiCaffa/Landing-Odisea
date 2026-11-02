import { ArrowRight, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { rutaDeConcurso, useConcursosAbiertos } from "@/lib/votacion";
import { playThud } from "@/lib/spookySound";

/**
 * Aviso en la primera pantalla por cada votación abierta (v35; hasta `MAX`, que
 * puede haber una por ciudad). Sin votaciones abiertas no se renderiza nada. En
 * negro con borde de acento y no en naranja, para distinguirlo de las promos
 * (que venden entradas): esto invita a participar, no a comprar.
 */
const MAX = 2;

const formatoHasta = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Montevideo",
  }).format(new Date(iso));

const VotacionDestacada = () => {
  const concursos = useConcursosAbiertos();
  if (concursos.length === 0) return null;

  return (
    <>
      {concursos.slice(0, MAX).map((c) => (
        <Link
          key={c.id}
          to={rutaDeConcurso(c)}
          onClick={playThud}
          className="mx-auto mb-3 flex min-h-[64px] w-full max-w-md items-center gap-3 rounded-2xl bg-black px-4 py-3 text-left text-white shadow-lg ring-2 ring-celeste transition-transform active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
              Votación abierta
            </span>
            <span className="line-clamp-2 block font-sport text-xl font-black uppercase leading-[1.05] tracking-wide">
              {c.title}
            </span>
            {c.closesAt && <span className="block text-xs font-bold">Hasta el {formatoHasta(c.closesAt)}</span>}
          </span>
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ))}
    </>
  );
};

export default VotacionDestacada;
