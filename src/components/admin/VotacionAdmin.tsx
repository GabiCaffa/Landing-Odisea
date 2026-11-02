import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trash2, Trophy, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { claveDeGrupo } from "@/lib/grupos";
import {
  Concurso,
  EstadoConcurso,
  Participante,
  createConcurso,
  createParticipante,
  deleteParticipante,
  fetchConcursos,
  fetchConteos,
  fetchTodosLosParticipantes,
  updateConcurso,
  updateParticipante,
  uploadParticipante,
} from "@/lib/votacion";

/**
 * Pestaña Votación: el concurso de disfraces (v35).
 *
 * Flujo: se crea el concurso (queda en BORRADOR, que sólo ve el staff), se
 * cargan las fotos, se revisa cómo se ve y recién ahí se pasa a ABIERTA. Al
 * cerrarla, la web muestra el podio. Se puede volver atrás (reabrir) mientras
 * no haya premios entregados.
 */

const ERRORES_DE_MIGRACION = ["PGRST205", "42P01"];

const mensajeDeError = (err: unknown, accion: string) => {
  const code = (err as { code?: string } | null)?.code;
  if (ERRORES_DE_MIGRACION.includes(code ?? "")) {
    return "Falta correr la migración v35_votacion_disfraces.sql en Supabase.";
  }
  // 42703 = la columna no existe; 23505 = la dirección ya la usa otra votación.
  if (code === "42703") return "Falta correr la migración v36_votacion_slug.sql en Supabase.";
  if (code === "23505") return "Esa dirección ya la usa otra votación. Probá con otra.";
  const msg = (err as Error | null)?.message;
  if (msg && /foto/.test(msg)) return msg;
  return `No se pudo ${accion}. ¿Seguís con la sesión iniciada?`;
};

const ESTADOS: Array<{ valor: EstadoConcurso; rotulo: string; ayuda: string }> = [
  { valor: "draft", rotulo: "Borrador", ayuda: "Sólo lo ves vos. No aparece en la web." },
  { valor: "open", rotulo: "Abierta", ayuda: "La gente vota. Aparece un aviso en la home." },
  { valor: "closed", rotulo: "Cerrada", ayuda: "No se acepta ningún voto más y se muestra el podio." },
];

/** ISO → valor de `datetime-local` en hora local. */
const aInputLocal = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const VotacionAdmin = () => {
  const confirm = useConfirm();
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("Mejor disfraz de Halloween");
  const [descripcion, setDescripcion] = useState("");
  const [direccion, setDireccion] = useState("");

  const concurso = concursos.find((c) => c.id === elegido) ?? null;

  const recargarConcursos = useCallback(async () => {
    try {
      const cs = await fetchConcursos();
      setConcursos(cs);
      setElegido((prev) => (prev && cs.some((c) => c.id === prev) ? prev : cs[0]?.id ?? null));
      setError(null);
    } catch (err) {
      // Acá SÍ se muestra el error (la lección de v24: una lista vacía que en
      // realidad es una consulta fallida no se nota).
      setError(mensajeDeError(err, "cargar la votación"));
    } finally {
      setCargando(false);
    }
  }, []);

  const recargarParticipantes = useCallback(async (id: string) => {
    try {
      const [ps, cs] = await Promise.all([fetchTodosLosParticipantes(id), fetchConteos(id)]);
      setParticipantes(ps);
      setConteos(cs);
    } catch (err) {
      toast.error(mensajeDeError(err, "cargar las fotos"));
    }
  }, []);

  useEffect(() => {
    void recargarConcursos();
  }, [recargarConcursos]);

  useEffect(() => {
    if (!elegido) return setParticipantes([]);
    void recargarParticipantes(elegido);
  }, [elegido, recargarParticipantes]);

  // Mientras está abierta, los votos se refrescan solos para mirarlos en vivo.
  useEffect(() => {
    if (!elegido || concurso?.status !== "open") return;
    const id = window.setInterval(() => {
      fetchConteos(elegido).then(setConteos).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [elegido, concurso?.status]);

  const crear = async () => {
    if (!titulo.trim()) return toast.error("Poné un título");
    try {
      const id = await createConcurso({
        title: titulo.trim(),
        description: descripcion.trim(),
        slug: claveDeGrupo(direccion) || undefined,
      });
      await recargarConcursos();
      setElegido(id);
      toast.success("Votación creada en borrador");
    } catch (err) {
      toast.error(mensajeDeError(err, "crear la votación"));
    }
  };

  const cambiarEstado = async (estado: EstadoConcurso) => {
    if (!concurso || concurso.status === estado) return;
    if (estado === "open" && participantes.filter((p) => p.active).length < 2) {
      return toast.error("Cargá al menos 2 fotos antes de abrir la votación");
    }
    if (estado === "closed") {
      const ok = await confirm({
        title: "Cerrar la votación",
        description: "Nadie va a poder votar más y la web va a mostrar el podio. Podés volver a abrirla después.",
        confirmText: "Cerrar votación",
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      await updateConcurso(concurso.id, { status: estado });
      await recargarConcursos();
      toast.success(estado === "open" ? "Votación abierta" : estado === "closed" ? "Votación cerrada" : "Vuelve a borrador");
    } catch (err) {
      toast.error(mensajeDeError(err, "cambiar el estado"));
    }
  };

  const guardarConcurso = async (campos: Parameters<typeof updateConcurso>[1]) => {
    if (!concurso) return;
    setConcursos((prev) =>
      prev.map((c) =>
        c.id === concurso.id
          ? {
              ...c,
              ...(campos.title !== undefined && { title: campos.title }),
              ...(campos.description !== undefined && { description: campos.description }),
              ...(campos.closesAt !== undefined && { closesAt: campos.closesAt || undefined }),
              ...(campos.slug !== undefined && { slug: campos.slug || undefined }),
            }
          : c
      )
    );
    try {
      await updateConcurso(concurso.id, campos);
    } catch (err) {
      toast.error(mensajeDeError(err, "guardar el cambio"));
      await recargarConcursos();
    }
  };

  const subir = async (files: File[]) => {
    if (!concurso) return;
    const base = participantes.length ? Math.max(...participantes.map((p) => p.sortOrder)) + 1 : 0;
    let subidas = 0;
    for (const [n, file] of files.entries()) {
      setProgreso(`${n + 1} de ${files.length}`);
      try {
        const photoUrl = await uploadParticipante(file);
        await createParticipante({
          contestId: concurso.id,
          photoUrl,
          label: "",
          sortOrder: base + n,
          active: true,
        });
        subidas++;
      } catch (err) {
        toast.error(`${file.name}: ${mensajeDeError(err, "subirla")}`);
      }
    }
    setProgreso(null);
    await recargarParticipantes(concurso.id);
    if (subidas) toast.success(subidas === 1 ? "Foto agregada" : `${subidas} fotos agregadas`);
  };

  const guardarCampo = async (id: string, campo: Partial<Pick<Participante, "label" | "active">>) => {
    setParticipantes((prev) => prev.map((p) => (p.id === id ? { ...p, ...campo } : p)));
    try {
      await updateParticipante(id, campo);
    } catch (err) {
      toast.error(mensajeDeError(err, "guardar el cambio"));
      if (elegido) await recargarParticipantes(elegido);
    }
  };

  const mover = async (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= participantes.length) return;
    const nuevo = [...participantes];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setParticipantes(nuevo);
    try {
      await Promise.all(nuevo.map((p, k) => updateParticipante(p.id, { sortOrder: k })));
    } catch (err) {
      toast.error(mensajeDeError(err, "reordenar"));
      if (elegido) await recargarParticipantes(elegido);
    }
  };

  const borrar = async (p: Participante) => {
    const votos = conteos[p.id] ?? 0;
    const ok = await confirm({
      title: "Borrar esta foto",
      description:
        votos > 0
          ? `Tiene ${votos} ${votos === 1 ? "voto" : "votos"} y se van a borrar con ella. Quienes votaron podrán votar de nuevo. No se puede deshacer.`
          : "Se borra la foto del concurso. No se puede deshacer.",
      confirmText: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteParticipante(p);
      if (elegido) await recargarParticipantes(elegido);
      toast.success("Borrada");
    } catch (err) {
      toast.error(mensajeDeError(err, "borrar"));
    }
  };

  const podio = useMemo(
    () =>
      [...participantes]
        .filter((p) => p.active && (conteos[p.id] ?? 0) > 0)
        .sort((a, b) => (conteos[b.id] ?? 0) - (conteos[a.id] ?? 0))
        .slice(0, 3),
    [participantes, conteos]
  );
  const totalVotos = Object.values(conteos).reduce((a, b) => a + b, 0);

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="mb-6 rounded-xl border border-charrua/40 bg-charrua/[0.06] p-4">
          <p className="text-sm font-semibold text-charrua">{error}</p>
        </div>
      )}

      {/* ─── Crear ─── */}
      {!error && (
        <details className="mb-6 rounded-xl border border-border p-4" open={concursos.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">Nueva votación</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label-techno" htmlFor="v-titulo">Título</label>
              <input id="v-titulo" className="input-techno w-full" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <label className="label-techno" htmlFor="v-desc">Texto bajo el título (opcional)</label>
              <input
                id="v-desc"
                className="input-techno w-full"
                value={descripcion}
                maxLength={160}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="El más votado se lleva el premio. Un voto por persona."
              />
            </div>
            <div>
              <label className="label-techno" htmlFor="v-dir">Dirección (opcional)</label>
              <input
                id="v-dir"
                className="input-techno w-full"
                value={direccion}
                maxLength={40}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="colonia"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Para el link: odiseaoficial.com/votacion/<b>{claveDeGrupo(direccion) || "colonia"}</b>. Si hay
                más de una votación a la vez, ponele una a cada una.
              </p>
            </div>
            <button type="button" onClick={() => void crear()} className="btn-celeste px-5 py-3 text-xs">
              Crear en borrador
            </button>
          </div>
        </details>
      )}

      {concursos.length > 1 && (
        <div className="mb-4">
          <label className="label-techno" htmlFor="v-elegir">Votación</label>
          <select id="v-elegir" className="input-techno w-full" value={elegido ?? ""} onChange={(e) => setElegido(e.target.value)}>
            {concursos.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      )}

      {concurso && (
        <>
          {/* ─── Estado y datos ─── */}
          <div className="mb-6 space-y-4 rounded-xl border border-border p-4">
            <div>
              <p className="label-techno mb-1">Estado</p>
              <div className="flex flex-wrap gap-2">
                {ESTADOS.map((e) => (
                  <button
                    key={e.valor}
                    type="button"
                    onClick={() => void cambiarEstado(e.valor)}
                    className={`min-h-[44px] rounded-full border px-4 text-xs font-bold uppercase tracking-wide ${
                      concurso.status === e.valor ? "border-celeste bg-celeste text-accent-foreground" : "border-border hover:bg-muted"
                    }`}
                  >
                    {e.rotulo}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {ESTADOS.find((e) => e.valor === concurso.status)?.ayuda}
              </p>
            </div>

            <div>
              <label className="label-techno" htmlFor="v-titulo-e">Título</label>
              <input
                id="v-titulo-e"
                className="input-techno w-full"
                defaultValue={concurso.title}
                key={`t-${concurso.id}`}
                maxLength={80}
                onBlur={(e) => e.target.value.trim() && void guardarConcurso({ title: e.target.value.trim() })}
              />
            </div>
            <div>
              <label className="label-techno" htmlFor="v-desc-e">Texto bajo el título</label>
              <input
                id="v-desc-e"
                className="input-techno w-full"
                defaultValue={concurso.description}
                key={`d-${concurso.id}`}
                maxLength={160}
                onBlur={(e) => void guardarConcurso({ description: e.target.value.trim() })}
              />
            </div>
            <div>
              <label className="label-techno" htmlFor="v-dir-e">Dirección del link</label>
              <input
                id="v-dir-e"
                className="input-techno w-full"
                defaultValue={concurso.slug ?? ""}
                key={`s-${concurso.id}`}
                maxLength={40}
                placeholder="colonia"
                onBlur={(e) => void guardarConcurso({ slug: claveDeGrupo(e.target.value) })}
              />
              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                Link para compartir:{" "}
                <b>odiseaoficial.com/votacion/{concurso.slug || concurso.id}</b>
              </p>
            </div>
            <div>
              <label className="label-techno" htmlFor="v-cierre">Cierra automáticamente (opcional)</label>
              <input
                id="v-cierre"
                type="datetime-local"
                className="input-techno"
                defaultValue={aInputLocal(concurso.closesAt)}
                key={`c-${concurso.id}`}
                onBlur={(e) =>
                  void guardarConcurso({ closesAt: e.target.value ? new Date(e.target.value).toISOString() : "" })
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Pasada esta hora no se acepta ningún voto, aunque el estado siga en “Abierta”. Vacío = cierra
                cuando vos la cierres.
              </p>
            </div>
          </div>

          {/* ─── Podio en vivo ─── */}
          <div className="mb-6 rounded-xl border border-border p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-celeste-deep" aria-hidden="true" />
              Va ganando · {totalVotos} {totalVotos === 1 ? "voto" : "votos"} en total
            </p>
            {podio.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no hay votos.</p>
            ) : (
              <ol className="space-y-2">
                {podio.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="w-6 text-center font-black">{i + 1}°</span>
                    <img src={p.photoUrl} alt="" className="h-12 w-10 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.label || "Sin nombre"}</span>
                    <b className="text-sm">{conteos[p.id]}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ─── Fotos ─── */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-sport text-xl font-black tracking-wide text-tinta">FOTOS ({participantes.length})</h3>
            <label className={`btn-celeste inline-flex cursor-pointer items-center gap-2 px-5 py-3 text-xs ${progreso ? "pointer-events-none opacity-70" : ""}`}>
              {progreso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {progreso ? `Subiendo ${progreso}…` : "Agregar fotos"}
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                disabled={!!progreso}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void subir(files);
                }}
              />
            </label>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Se pueden elegir varias a la vez. Poné en el nombre algo con lo que la gente identifique el
            disfraz (el @ de Instagram, solo si la persona está de acuerdo, o “Disfraz #12”). Las fotos
            nuevas van al final. Una foto desactivada no se ve ni se puede votar.
          </p>

          {participantes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Todavía no hay fotos.
            </p>
          ) : (
            <div className="space-y-3">
              {participantes.map((p, i) => (
                <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
                  <img src={p.photoUrl} alt="" className="h-28 w-24 flex-shrink-0 rounded-lg border border-border object-cover" />
                  <div className="min-w-0 flex-1">
                    <label className="label-techno" htmlFor={`pl-${p.id}`}>Nombre o @ (opcional)</label>
                    <input
                      id={`pl-${p.id}`}
                      className="input-techno w-full"
                      maxLength={60}
                      value={p.label}
                      onChange={(e) =>
                        setParticipantes((prev) => prev.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)))
                      }
                      onBlur={(e) => void guardarCampo(p.id, { label: e.target.value })}
                      placeholder="Disfraz #12"
                    />
                    <p className="mt-1 text-xs font-semibold text-celeste-deep">
                      {conteos[p.id] ?? 0} {(conteos[p.id] ?? 0) === 1 ? "voto" : "votos"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <label className="mr-1 flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={p.active} onChange={(e) => void guardarCampo(p.id, { active: e.target.checked })} />
                      Activa
                    </label>
                    <button type="button" onClick={() => void mover(i, -1)} disabled={i === 0} aria-label="Subir" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void mover(i, 1)} disabled={i === participantes.length - 1} aria-label="Bajar" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void borrar(p)} aria-label="Borrar" className="flex h-11 w-11 items-center justify-center rounded-lg border border-charrua/40 text-charrua hover:bg-charrua/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VotacionAdmin;
