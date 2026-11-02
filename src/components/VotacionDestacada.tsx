import { ArrowRight, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useConcursoAbierto } from "@/lib/votacion";
import { playThud } from "@/lib/spookySound";

/**
 * Aviso en la primera pantalla cuando hay una votación abierta (v35). Sin
 * votación abierta no se renderiza nada. En negro con borde de acento y no en
 * naranja, para distinguirlo de las promos (que venden entradas): esto invita a
 * participar, no a comprar.
 */
const VotacionDestacada = () => {
  const concurso = useConcursoAbierto();
  if (!concurso) return null;

  const hasta = concurso.closesAt
    ? new Intl.DateTimeFormat("es-UY", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Montevideo",
      }).format(new Date(concurso.closesAt))
    : null;

  return (
    <Link
      to="/votacion"
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
          {concurso.title}
        </span>
        {hasta && <span className="block text-xs font-bold">Hasta el {hasta}</span>}
      </span>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
};

export default VotacionDestacada;
