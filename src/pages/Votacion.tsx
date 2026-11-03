import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Visor } from "@/components/GaleriaAnteriores";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { GaleriaItem } from "@/lib/galeria";
import { imagenRedimensionada, srcSetRedimensionado } from "@/lib/imagenes";
import {
  Concurso,
  Participante,
  estaAbierto,
  fetchConcursoPorClave,
  fetchConcursosVisibles,
  rutaDeConcurso,
  fetchConteos,
  fetchMiVoto,
  fetchParticipantes,
  mensajeDeVoto,
  votar,
} from "@/lib/votacion";

/**
 * Votación de disfraces (v35): las fotos de la gente disfrazada y un voto por
 * persona, con cuenta. Los conteos se ven en vivo.
 *
 * El voto NO lo valida esta pantalla sino la base (`cast_vote()`): acá sólo se
 * decide qué mostrar. Si la pantalla dijera "abierta" y la base "cerrada", gana
 * la base y el error se traduce (`mensajeDeVoto`).
 */

const REFRESCO_MS = 20_000;
/** Cuántas van en "Los más votados". */
const TOP = 4;

const formatoCierre = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Montevideo",
  }).format(new Date(iso));

type Fuente = "top" | "todas";

const aItem = (p: Participante): GaleriaItem => ({
  id: p.id,
  kind: "image",
  url: p.photoUrl,
  posterUrl: "",
  caption: p.label,
  sortOrder: p.sortOrder,
  active: true,
  albumId: null,
});

const Votacion = () => {
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { clave } = useParams();
  // Para volver acá después de ingresar: con varias votaciones, cada una tiene su ruta.
  const aqui = useLocation().pathname;
  // Sin `clave` (/votacion) y con VARIAS votaciones abiertas: se elige cuál.
  const [lista, setLista] = useState<Concurso[] | null>(null);

  // undefined = cargando; null = no hay ninguna votación.
  const [concurso, setConcurso] = useState<Concurso | null | undefined>(undefined);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [miVoto, setMiVoto] = useState<string | null>(null);
  const [votando, setVotando] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ fuente: Fuente; i: number } | null>(null);
  const [error, setError] = useState(false);
  // Aviso de "hace falta cuenta" que salta al tocar Votar sin sesión.
  const [pideCuenta, setPideCuenta] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const previo = document.title;
    document.title = `${concurso?.title ?? "Votación"} · ODÍSEA`;
    return () => {
      document.title = previo;
    };
  }, [concurso?.title]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let c: Concurso | null;
        if (clave) {
          c = await fetchConcursoPorClave(clave);
        } else {
          // /votacion a secas: con una sola votación se abre directo (así siguen
          // andando los links de antes); con varias se muestra el listado.
          const todas = await fetchConcursosVisibles();
          if (!vivo) return;
          if (todas.length > 1) {
            setLista(todas);
            return setConcurso(null);
          }
          c = todas[0] ?? null;
        }
        if (!vivo) return;
        if (!c) return setConcurso(null);
        const [ps, cs] = await Promise.all([fetchParticipantes(c.id), fetchConteos(c.id)]);
        if (!vivo) return;
        setParticipantes(ps);
        setConteos(cs);
        setConcurso(c);
      } catch {
        if (vivo) {
          setError(true);
          setConcurso(null);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  // Mi voto, cuando hay sesión.
  useEffect(() => {
    if (!concurso || !currentUser) return setMiVoto(null);
    let vivo = true;
    fetchMiVoto(concurso.id, currentUser.id)
      .then((v) => vivo && setMiVoto(v))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [concurso, currentUser]);

  const abierto = !!concurso && estaAbierto(concurso, ahora);

  // Conteos en vivo mientras está abierta; pestaña en segundo plano, no se consulta.
  useEffect(() => {
    if (!concurso || !abierto) return;
    const id = window.setInterval(() => {
      setAhora(Date.now());
      if (document.hidden) return;
      fetchConteos(concurso.id)
        .then(setConteos)
        .catch(() => undefined);
    }, REFRESCO_MS);
    return () => window.clearInterval(id);
  }, [concurso, abierto]);

  const alVotar = useCallback(
    async (p: Participante) => {
      if (!concurso) return;
      if (!currentUser) {
        // Antes se mandaba directo al login, sin explicar nada: quien tocaba
        // "Votar" aparecía de golpe en otra pantalla. Ahora salta un aviso que
        // dice por qué, y de ahí elige ingresar o crear cuenta.
        setPideCuenta(true);
        return;
      }
      if (miVoto === p.id) return;
      if (miVoto) {
        const ok = await confirm({
          title: "Cambiar tu voto",
          description: `Tu voto va a pasar a ${p.label || "este disfraz"}. Cada persona tiene un solo voto.`,
          confirmText: "Cambiar voto",
        });
        if (!ok) return;
      }
      setVotando(p.id);
      try {
        await votar(p.id);
        setMiVoto(p.id);
        setConteos(await fetchConteos(concurso.id));
        toast.success("¡Voto registrado!");
      } catch (err) {
        toast.error(mensajeDeVoto(err));
        // Si la base dice que cerró, la pantalla se pone al día.
        fetchConcursoPorClave(concurso.id)
          .then((c) => c && setConcurso(c))
          .catch(() => undefined);
      } finally {
        setVotando(null);
      }
    },
    [concurso, currentUser, miVoto, confirm]
  );

  // Cerrada: ordenadas por votos para mostrar el podio. Abierta: siempre en el
  // orden cargado, para que las fotos no salten de lugar mientras se vota.
  const ordenadas = useMemo(
    () =>
      abierto
        ? participantes
        : [...participantes].sort((a, b) => (conteos[b.id] ?? 0) - (conteos[a.id] ?? 0)),
    [abierto, participantes, conteos]
  );
  const items = useMemo(() => ordenadas.map(aItem), [ordenadas]);

  // "Los más votados": las 4 con más votos, sólo mientras se vota (cerrada, la
  // grilla entera ya va ordenada con su podio) y sólo las que tienen algún voto:
  // un "top" de fotos con cero votos sería puro azar. Desempata el orden cargado.
  const masVotadas = useMemo(
    () =>
      abierto
        ? participantes
            .map((p, orden) => ({ p, orden, votos: conteos[p.id] ?? 0 }))
            .filter((x) => x.votos > 0)
            .sort((a, b) => b.votos - a.votos || a.orden - b.orden)
            .slice(0, TOP)
            .map((x) => x.p)
        : [],
    [abierto, participantes, conteos]
  );
  const itemsTop = useMemo(() => masVotadas.map(aItem), [masVotadas]);
  const totalVotos = Object.values(conteos).reduce((a, b) => a + b, 0);

  /**
   * Una tarjeta de foto. Es la misma en "Los más votados" y en la grilla, y el
   * botón de votar de las dos hace lo mismo: se puede votar desde cualquiera.
   * `fuente` dice de qué lista se abre el visor.
   */
  const renderTarjeta = (p: Participante, i: number, fuente: Fuente, puestoTop?: number) => {
    const votos = conteos[p.id] ?? 0;
    const esMio = miVoto === p.id;
    // Cerrada: podio de 3 en la grilla. Abierta: el puesto sólo se marca en "Los más votados".
    const puesto = puestoTop ?? (!abierto && i < 3 && votos > 0 ? i + 1 : 0);
    return (
      <article
        key={`${fuente}-${p.id}`}
        className={`flex flex-col overflow-hidden rounded-2xl border bg-card ${
          esMio ? "border-celeste ring-2 ring-celeste" : "border-border"
        }`}
      >
        <button
          type="button"
          onClick={() => setVisor({ fuente, i })}
          aria-label={`Ver foto${p.label ? `: ${p.label}` : ""}`}
          className="group relative block aspect-[4/5] overflow-hidden bg-secondary"
        >
          <img
            src={imagenRedimensionada(p.photoUrl, 480)}
            srcSet={srcSetRedimensionado(p.photoUrl) || undefined}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            alt={p.label || "Disfraz"}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="absolute right-2 top-2 rounded-full bg-black/80 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-white/25">
            {votos} {votos === 1 ? "voto" : "votos"}
          </span>
          {puesto > 0 && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-celeste px-2.5 py-1 text-xs font-black text-accent-foreground">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {puesto}°
            </span>
          )}
          {p.label && (
            <span className="absolute bottom-0 left-0 right-0 p-3 text-left text-xs font-semibold uppercase leading-tight tracking-wide text-white">
              {p.label}
            </span>
          )}
        </button>

        {abierto && (
          <button
            type="button"
            onClick={() => void alVotar(p)}
            disabled={votando !== null || esMio}
            className={`flex min-h-[48px] items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide transition-colors ${
              esMio
                ? "bg-celeste/15 text-celeste-deep"
                : "bg-celeste text-accent-foreground hover:bg-celeste-deep"
            } disabled:cursor-default`}
          >
            {votando === p.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : esMio ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Tu voto
              </>
            ) : miVoto ? (
              "Cambiar mi voto"
            ) : (
              // Sin sesión también dice "Votar": el aviso de arriba ya
              // explica que hace falta cuenta, y el botón lleva al login.
              "Votar"
            )}
          </button>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-28 md:pt-36">
        <div className="container-odisea">
          {concurso === undefined ? (
            <p className="py-20 text-center text-muted-foreground">Cargando…</p>
          ) : concurso === null && lista ? (
            // Varias votaciones abiertas a la vez: se elige una.
            <div className="mx-auto max-w-xl">
              <div className="mb-6 text-center">
                <p className="eyebrow mb-2">Votaciones</p>
                <h1 className="title-sport text-4xl text-tinta sm:text-5xl">Elegí dónde votar</h1>
              </div>
              <div className="space-y-3">
                {lista.map((c) => {
                  const abierta = estaAbierto(c, ahora);
                  return (
                    <Link
                      key={c.id}
                      to={rutaDeConcurso(c)}
                      className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-celeste"
                    >
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-accent-foreground">
                        <Trophy className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-sport text-xl font-black uppercase leading-tight tracking-wide text-tinta">
                          {c.title}
                        </span>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-celeste-deep">
                          {abierta
                            ? c.closesAt
                              ? `Abierta · hasta el ${formatoCierre(c.closesAt)}`
                              : "Abierta"
                            : "Cerrada · ver resultados"}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : concurso === null ? (
            <div className="mx-auto max-w-md py-20 text-center">
              <Trophy className="mx-auto mb-4 h-10 w-10 text-celeste-deep" aria-hidden="true" />
              <h1 className="title-sport mb-3 text-3xl text-tinta">
                {error ? "No se pudo cargar" : "Todavía no hay votación"}
              </h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {error ? "Probá de nuevo en un rato." : "Cuando haya un concurso abierto lo vas a ver acá."}
              </p>
              <Link to="/" className="btn-celeste px-6 py-3 text-xs">
                Volver al inicio
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center md:mb-8">
                <p className="eyebrow mb-2">{abierto ? "Votación abierta" : "Votación cerrada"}</p>
                <h1 className="title-sport text-4xl text-tinta sm:text-5xl md:text-6xl">
                  {concurso.title}
                </h1>
                {concurso.description && (
                  <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                    {concurso.description}
                  </p>
                )}
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-celeste-deep">
                  {abierto
                    ? concurso.closesAt
                      ? `Se puede votar hasta el ${formatoCierre(concurso.closesAt)}`
                      : "Un voto por persona"
                    : `${totalVotos} ${totalVotos === 1 ? "voto" : "votos"} en total`}
                </p>
              </div>

              {abierto && (
                <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-border bg-secondary/40 p-4 text-center text-sm">
                  {!currentUser ? (
                    <>
                      <p className="mb-3">
                        Para votar necesitás una cuenta. Es <b>un voto por persona</b>.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link to="/login" state={{ from: aqui }} className="btn-celeste min-h-[44px] px-5 text-xs">
                          Ingresar
                        </Link>
                        <Link to="/registro" className="btn-techno-outline min-h-[44px] px-5 text-xs">
                          Crear cuenta
                        </Link>
                      </div>
                    </>
                  ) : miVoto ? (
                    <p>
                      <b>Ya votaste.</b> Podés cambiar tu voto hasta que cierre la votación.
                    </p>
                  ) : (
                    <p>Elegí tu disfraz favorito. Tocá la foto para verla más grande.</p>
                  )}
                </div>
              )}

              {masVotadas.length > 0 && (
                <section className="mb-10" aria-labelledby="mas-votados">
                  <h2
                    id="mas-votados"
                    className="title-sport mb-3 flex items-center justify-center gap-2 text-2xl text-tinta sm:text-3xl"
                  >
                    <Trophy className="h-6 w-6 text-celeste-deep" aria-hidden="true" />
                    LOS MÁS <span className="highlight-celeste">VOTADOS</span>
                  </h2>
                  <p className="mb-4 text-center text-xs text-muted-foreground">
                    Se actualiza en vivo. Podés votar por el que quieras, también desde acá.
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                    {masVotadas.map((p, i) => renderTarjeta(p, i, "top", i + 1))}
                  </div>
                </section>
              )}

              {masVotadas.length > 0 && (
                <h2 className="title-sport mb-4 text-center text-2xl text-tinta sm:text-3xl">
                  TODOS LOS <span className="highlight-celeste">DISFRACES</span>
                </h2>
              )}

              {participantes.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  Todavía no hay fotos cargadas.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                  {ordenadas.map((p, i) => renderTarjeta(p, i, "todas"))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />

      <AlertDialog open={pideCuenta} onOpenChange={setPideCuenta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Trophy className="mx-auto h-8 w-8 text-celeste-deep sm:mx-0" aria-hidden="true" />
            <AlertDialogTitle>Tenés que tener una cuenta para votar</AlertDialogTitle>
            <AlertDialogDescription>
              Es <b>un voto por persona</b> y solo cuentan los votos de cuentas registradas con el
              email confirmado. Ingresá o creá tu cuenta (tarda un minuto) y volvés a la votación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setPideCuenta(false)}
              className="btn-techno-outline min-h-[44px] px-5 text-xs"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={() => navigate("/registro", { state: { from: aqui } })}
              className="btn-techno-outline min-h-[44px] px-5 text-xs"
            >
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => navigate("/login", { state: { from: aqui } })}
              className="btn-celeste min-h-[44px] px-5 text-xs"
            >
              Ingresar
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {visor !== null && (
        <Visor
          items={visor.fuente === "top" ? itemsTop : items}
          indice={visor.i}
          onCambiar={(i) => setVisor({ fuente: visor.fuente, i })}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  );
};

export default Votacion;
