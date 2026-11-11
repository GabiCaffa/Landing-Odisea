import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Calendar, Download, FileSpreadsheet, MapPin, RefreshCw, Search, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatEventDate, useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import ModalAdmin from "@/components/admin/ModalAdmin";
import { TicketDelivery, esConfirmada, fetchDeliveries } from "@/lib/deliveries";
import { BirthdaySignup, fetchBirthdays } from "@/lib/birthdays";
import {
  AVISO_V47,
  EventoHistoria,
  borrarDeHistoria,
  fetchCompradoresHistoria,
  fetchHistoria,
  guardarEnHistoria,
  leerPlanillaExcel,
} from "@/lib/historia";
import {
  CompradorGuardado,
  HojaLeida,
  fechaDelNombre,
  normTelefono,
  rankingCompradores,
  resumenDeVentas,
} from "@/lib/historiaCalculo";
import { hoyLocal } from "@/lib/cumplesConEvento";
import { descargarCsv } from "@/lib/csv";
import { formatPhoneDisplay } from "@/lib/validators";
import { foldText } from "@/lib/utils";

/**
 * Historia de ODÍSEA (v47): cada evento con sus números congelados, y el
 * ranking de los que más van.
 *
 * - **Para guardar**: los eventos que ya pasaron y tienen ventas confirmadas
 *   pero no están en la historia. "Guardar en la historia" congela los números
 *   (decisión del autor: con un botón, cuando terminaron las ventas y envíos).
 *   Después las ventas se pueden borrar sin perder nada.
 * - **Importar planilla**: las planillas viejas de Excel (una hoja por fiesta)
 *   entran como eventos de la historia, con sus compradores.
 * - **Ranking**: quiénes compraron para más eventos distintos.
 */

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-UY")}`;

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-black tabular-nums text-tinta">{value}</p>
  </div>
);

const HistoriaAdmin = () => {
  const { events } = useAuth();
  const confirm = useConfirm();
  const [vista, setVista] = useState<"eventos" | "ranking">("eventos");
  const [historia, setHistoria] = useState<EventoHistoria[] | null | undefined>(undefined);
  const [compradores, setCompradores] = useState<CompradorGuardado[]>([]);
  const [ventas, setVentas] = useState<TicketDelivery[]>([]);
  const [cumples, setCumples] = useState<BirthdaySignup[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      const [h, v, c] = await Promise.all([fetchHistoria(), fetchDeliveries(), fetchBirthdays()]);
      setHistoria(h);
      setVentas(v.filter(esConfirmada));
      setCumples(c.filter((b) => b.status === "aprobado"));
      setCompradores(h ? await fetchCompradoresHistoria() : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHistoria((x) => (x === undefined ? [] : x));
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  // Eventos del sitio que ya pasaron, con ventas confirmadas y sin guardar.
  const paraGuardar = useMemo(() => {
    const hoy = hoyLocal();
    const guardados = new Set((historia ?? []).map((h) => h.eventId).filter(Boolean));
    return events
      .filter((e) => !guardados.has(e.id) && (e.date.slice(0, 10) < hoy || e.status === "finalizado"))
      .map((e) => ({ evento: e, ventas: ventas.filter((v) => v.eventId === e.id) }))
      .filter((x) => x.ventas.length > 0)
      .sort((a, b) => b.evento.date.localeCompare(a.evento.date));
  }, [events, ventas, historia]);

  const guardarEvento = async (eventId: string, existenteId?: string) => {
    const e = events.find((x) => x.id === eventId);
    if (!e) return;
    const suyas = ventas.filter((v) => v.eventId === eventId);
    if (existenteId && suyas.length === 0) {
      toast.error("Ese evento ya no tiene ventas cargadas: se mantiene lo que estaba guardado");
      return;
    }
    const resumen = resumenDeVentas(suyas);
    if (existenteId) {
      const ok = await confirm({
        title: "Volver a guardar",
        description: `Se reemplazan los números guardados de ${e.name} por los de las ventas de hoy (${resumen.entradas} entradas, ${plata(resumen.recaudado)}).`,
        confirmText: "Reemplazar",
      });
      if (!ok) return;
    }
    setGuardando(eventId);
    const r = await guardarEnHistoria({
      existenteId,
      eventId,
      name: e.name,
      eventDate: e.date.slice(0, 10),
      location: e.location,
      origin: "panel",
      resumen,
      cumpleaneros: cumples.filter((b) => b.eventId === eventId).length,
    });
    setGuardando(null);
    if (!r.ok) return toast.error(r.error ?? "No se pudo guardar");
    toast.success(`${e.name} quedó en la historia`);
    await cargar();
  };

  const borrar = async (h: EventoHistoria) => {
    const ok = await confirm({
      title: "Sacar de la historia",
      description: `Se borra ${h.name} de la historia con sus ${h.compradores} compradores (las ventas, si siguen cargadas, no se tocan). No se puede deshacer.`,
      confirmText: "Sacar",
      destructive: true,
    });
    if (!ok) return;
    const r = await borrarDeHistoria(h.id);
    if (!r.ok) return toast.error(r.error ?? "No se pudo borrar");
    await cargar();
  };

  const totales = useMemo(() => {
    const h = historia ?? [];
    return {
      eventos: h.length,
      entradas: h.reduce((a, x) => a + x.entradas, 0),
      recaudado: h.reduce((a, x) => a + x.recaudado, 0),
    };
  }, [historia]);

  const ranking = useMemo(
    () => rankingCompradores(compradores, (historia ?? []).map((h) => ({ id: h.id, name: h.name, eventDate: h.eventDate }))),
    [compradores, historia]
  );

  if (historia === undefined) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Cargando la historia…</div>;
  }
  if (historia === null) {
    return (
      <div role="alert" className="rounded-xl border border-charrua/40 bg-charrua/10 p-4 text-sm">
        <p className="font-semibold text-charrua">{AVISO_V47}</p>
        <p className="mt-1 text-muted-foreground">Corré `supabase/v47_historia_odisea.sql` en el SQL Editor y volvé a entrar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg border border-charrua/40 bg-charrua/10 p-3 text-sm text-charrua">
          No se pudo leer todo: {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Eventos guardados" value={String(totales.eventos)} />
        <Stat label="Entradas vendidas" value={totales.entradas.toLocaleString("es-UY")} />
        <Stat label="Recaudado" value={plata(totales.recaudado)} />
        <Stat label="Compradores distintos" value={ranking.length.toLocaleString("es-UY")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(
            [
              ["eventos", "Eventos", <Archive key="a" className="h-4 w-4" />],
              ["ranking", "Ranking", <Trophy key="t" className="h-4 w-4" />],
            ] as const
          ).map(([v, label, icono]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`inline-flex min-h-11 items-center gap-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors ${
                vista === v ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {icono} {label}
            </button>
          ))}
        </div>
        <button onClick={() => setImportando(true)} className="btn-techno-outline ml-auto px-4 sm:px-7">
          <Upload className="h-4 w-4" /> <span>Importar planilla</span>
        </button>
      </div>

      {vista === "eventos" ? (
        <>
          {paraGuardar.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Para guardar</h2>
              <p className="text-xs text-muted-foreground">
                Eventos que ya pasaron, con ventas confirmadas, que todavía no están en la historia. Guardalos cuando
                terminaste de cargar ventas y mandar entradas.
              </p>
              {paraGuardar.map(({ evento, ventas: vs }) => {
                const r = resumenDeVentas(vs);
                return (
                  <div
                    key={evento.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-celeste/40 bg-celeste/5 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{evento.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatEventDate(evento.date)} · {r.entradas} entradas · {plata(r.recaudado)} ·{" "}
                        {r.compradores.length} compradores
                      </p>
                    </div>
                    <button
                      onClick={() => void guardarEvento(evento.id)}
                      disabled={guardando === evento.id}
                      className="btn-celeste px-5 disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4" /> {guardando === evento.id ? "Guardando…" : "Guardar en la historia"}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Historia de ODÍSEA</h2>
            {historia.length === 0 ? (
              <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                Todavía no hay eventos guardados. Guardá uno de arriba o importá una planilla vieja.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {historia.map((h) => {
                  const sigueEnElSitio = h.eventId && events.some((e) => e.id === h.eventId);
                  return (
                    <article key={h.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-bold">
                            <span className="truncate">{h.name}</span>
                            {h.origin === "planilla" && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <FileSpreadsheet className="h-3 w-3" /> Planilla
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                            {h.eventDate && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> {formatEventDate(h.eventDate)}
                              </span>
                            )}
                            {h.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" /> {h.location}
                              </span>
                            )}
                          </p>
                        </div>
                        {sigueEnElSitio && (
                          <button
                            onClick={() => void guardarEvento(h.eventId!, h.id)}
                            disabled={guardando === h.eventId}
                            title="Volver a guardar con las ventas de hoy"
                            aria-label={`Volver a guardar ${h.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                          >
                            <RefreshCw className={`h-4 w-4 ${guardando === h.eventId ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        <button
                          onClick={() => void borrar(h)}
                          title="Sacar de la historia"
                          aria-label={`Sacar ${h.name} de la historia`}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-lg font-black tabular-nums">{h.entradas}</p>
                          <p className="text-[11px] text-muted-foreground">entradas</p>
                        </div>
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-lg font-black tabular-nums">{plata(h.recaudado)}</p>
                          <p className="text-[11px] text-muted-foreground">recaudado</p>
                        </div>
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-lg font-black tabular-nums">{h.compradores}</p>
                          <p className="text-[11px] text-muted-foreground">compradores</p>
                        </div>
                      </div>
                      {h.porTipo.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {h.porTipo.map((t) => (
                            <span key={t.nombre} className="rounded-full border border-border px-2.5 py-1 text-xs">
                              <b>{t.entradas}</b> {t.nombre} · {plata(t.recaudado)}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {h.ventas} ventas
                        {h.cumpleaneros ? ` · ${h.cumpleaneros} cumpleañeros` : ""} · guardado el{" "}
                        {formatEventDate(h.savedAt.slice(0, 10))}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <Ranking ranking={ranking} />
      )}

      {importando && (
        <ImportarPlanillaModal
          existentes={historia}
          onClose={() => setImportando(false)}
          onListo={async () => {
            setImportando(false);
            await cargar();
          }}
        />
      )}
    </div>
  );
};

// ─── Ranking ────────────────────────────────────────────────────────────────

const Ranking = ({ ranking }: { ranking: ReturnType<typeof rankingCompradores> }) => {
  const [q, setQ] = useState("");
  const [cuantos, setCuantos] = useState(50);
  const t = foldText(q.trim().toLowerCase());
  const lista = t
    ? ranking.filter((p) => foldText(`${p.name} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase()).includes(t))
    : ranking;

  const exportar = () =>
    descargarCsv(
      "ranking-odisea",
      ["Puesto", "Nombre", "Mail", "Teléfono", "Documento", "Eventos", "Entradas", "Gastado", "Fiestas"],
      ranking.map((p) => [
        p.puesto,
        p.name,
        p.email ?? "",
        p.phone ?? "",
        p.documentId ?? "",
        p.eventos,
        p.entradas,
        p.monto,
        p.fiestas.map((f) => f.name).join(" | "),
      ])
    );

  if (ranking.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
        El ranking se arma con los eventos guardados en la historia. Guardá eventos o importá planillas viejas.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ordenado por cantidad de eventos distintos en los que compró, después por entradas. Se une a la misma persona
        por mail, teléfono o documento. Cuenta a quien <b>compra</b>: si compró para sus amigos, ellos no aparecen.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el ranking…" className="input-techno pl-10" />
        </div>
        <button onClick={exportar} className="btn-techno-outline px-4 sm:px-7">
          <Download className="h-4 w-4" /> <span>Exportar</span>
        </button>
      </div>
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {lista.slice(0, cuantos).map((p) => (
          <li key={`${p.puesto}-${p.name}-${p.email}-${p.phone}`} className="flex items-start gap-3 p-3 sm:p-4">
            <span
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-black ${
                p.puesto <= 3 ? "bg-celeste text-white" : "bg-secondary text-muted-foreground"
              }`}
            >
              {p.puesto}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name || "Sin nombre"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[p.email, normTelefono(p.phone) && formatPhoneDisplay(`+${normTelefono(p.phone)}`)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.fiestas.map((f) => f.name).join(" · ")}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-lg font-black tabular-nums leading-none">{p.eventos}</p>
              <p className="text-[11px] text-muted-foreground">{p.eventos === 1 ? "evento" : "eventos"}</p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {p.entradas} entr. · {plata(p.monto)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {lista.length > cuantos && (
        <button onClick={() => setCuantos((n) => n + 50)} className="btn-techno-outline mx-auto flex">
          Ver más ({lista.length - cuantos})
        </button>
      )}
    </section>
  );
};

// ─── Importar planilla ──────────────────────────────────────────────────────

interface HojaElegida extends HojaLeida {
  incluir: boolean;
  titulo: string;
  fecha: string;
}

const ImportarPlanillaModal = ({
  existentes,
  onClose,
  onListo,
}: {
  existentes: EventoHistoria[];
  onClose: () => void;
  onListo: () => void | Promise<void>;
}) => {
  const [hojas, setHojas] = useState<HojaElegida[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const leer = async (file: File) => {
    setLeyendo(true);
    try {
      const leidas = await leerPlanillaExcel(file);
      if (leidas.length === 0) {
        toast.error("No encontré hojas de ventas: tiene que haber una fila con \"Nombre del comprador\"");
        return;
      }
      setHojas(leidas.map((h) => ({ ...h, incluir: true, titulo: h.nombre, fecha: fechaDelNombre(h.nombre) })));
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  };

  const cambiar = (i: number, p: Partial<HojaElegida>) => setHojas((hs) => hs!.map((h, j) => (j === i ? { ...h, ...p } : h)));
  const elegidas = (hojas ?? []).filter((h) => h.incluir);
  const repetida = (h: HojaElegida) =>
    existentes.some((e) => foldText(e.name.toLowerCase()) === foldText(h.titulo.trim().toLowerCase()) && (e.eventDate ?? "") === h.fecha);

  const guardar = async () => {
    const sinFecha = elegidas.filter((h) => !h.fecha).length;
    if (elegidas.some((h) => !h.titulo.trim())) return toast.error("Cada hoja necesita un nombre de evento");
    setGuardando(true);
    let bien = 0;
    for (const h of elegidas) {
      const r = await guardarEnHistoria({
        eventId: null,
        name: h.titulo,
        eventDate: h.fecha || null,
        location: null,
        origin: "planilla",
        resumen: resumenDeVentas(h.ventas),
      });
      if (r.ok) bien++;
      else toast.error(`${h.titulo}: ${r.error}`);
    }
    setGuardando(false);
    if (bien) toast.success(`Se importaron ${bien} evento(s)${sinFecha ? ` (${sinFecha} sin fecha)` : ""}`);
    await onListo();
  };

  return (
    <ModalAdmin
      titulo="Importar planilla"
      subtitulo="Una hoja por fiesta, como la planilla de ventas de siempre"
      onClose={onClose}
      ancho="3xl"
      pie={
        hojas ? (
          <>
            <button onClick={onClose} className="btn-techno-outline">
              Cancelar
            </button>
            <button onClick={() => void guardar()} disabled={guardando || elegidas.length === 0} className="btn-celeste disabled:opacity-50">
              {guardando ? "Importando…" : `Importar ${elegidas.length} evento(s)`}
            </button>
          </>
        ) : undefined
      }
    >
      {!hojas ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Elegí el archivo .xlsx (en Google Sheets: Archivo → Descargar → Microsoft Excel). Cada hoja que tenga la
            columna "Nombre del comprador" se toma como un evento; las demás (como "Resumen") se ignoran.
          </p>
          <button
            onClick={() => input.current?.click()}
            disabled={leyendo}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-sm hover:bg-secondary/50"
          >
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
            <span className="font-semibold">{leyendo ? "Leyendo…" : "Elegir planilla"}</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void leer(f);
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Revisá el nombre y la fecha de cada evento (la fecha se toma del nombre de la hoja si la tiene). Destildá
            las hojas que no quieras importar.
          </p>
          {hojas.map((h, i) => {
            const r = resumenDeVentas(h.ventas);
            return (
              <div key={i} className={`rounded-xl border p-3 ${h.incluir ? "border-border" : "border-border opacity-50"}`}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={h.incluir}
                    onChange={(e) => cambiar(i, { incluir: e.target.checked })}
                    className="h-5 w-5 accent-celeste"
                  />
                  Hoja "{h.nombre}"
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px]">
                  <input
                    value={h.titulo}
                    onChange={(e) => cambiar(i, { titulo: e.target.value })}
                    className="input-techno"
                    placeholder="Nombre del evento"
                    aria-label="Nombre del evento"
                  />
                  <input
                    type="date"
                    value={h.fecha}
                    onChange={(e) => cambiar(i, { fecha: e.target.value })}
                    className="input-techno"
                    aria-label="Fecha del evento"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.ventas} ventas · {r.entradas} entradas · {plata(r.recaudado)} · {r.compradores.length} compradores
                  {r.porTipo.length > 0 && ` · ${r.porTipo.map((t) => `${t.entradas} ${t.nombre}`).join(", ")}`}
                </p>
                {h.incluir && repetida(h) && (
                  <p className="mt-1 text-xs font-semibold text-charrua">
                    Ya hay un evento con ese nombre y fecha en la historia: importarlo de nuevo lo duplica.
                  </p>
                )}
                {h.avisos.length > 0 && (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{h.avisos.length} aviso(s)</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {h.avisos.slice(0, 20).map((a, j) => (
                        <li key={j}>{a}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalAdmin>
  );
};

export default HistoriaAdmin;
