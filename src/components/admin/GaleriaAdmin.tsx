import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Play, Trash2, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  GaleriaItem,
  VIDEO_MAX_MB,
  VIDEO_RECOMENDADO_MB,
  createGaleriaItem,
  deleteGaleriaItem,
  fetchGaleria,
  updateGaleriaItem,
  uploadGaleria,
} from "@/lib/galeria";

/**
 * Pestaña Galería: fotos y videos de eventos anteriores (v33).
 *
 * Va fuera de `Admin.tsx` por la misma regla que `BannersAdmin` y `PromosAdmin`.
 * Lo que se carga acá aparece en la home bajo Promociones, y el botón
 * "Eventos anteriores" del header aparece solo cuando hay algo activo.
 */

const ERRORES_DE_MIGRACION = ["PGRST205", "42P01"];

const mensajeDeError = (err: unknown, accion: string) => {
  const code = (err as { code?: string } | null)?.code;
  if (ERRORES_DE_MIGRACION.includes(code ?? "")) {
    return "Falta correr la migración v33_galeria_eventos_anteriores.sql en Supabase.";
  }
  // Los errores propios (video muy pesado, tipo de archivo) ya vienen claros.
  const msg = (err as Error | null)?.message;
  if (msg && /MB|foto o un video/.test(msg)) return msg;
  return `No se pudo ${accion}. ¿Seguís con la sesión iniciada?`;
};

const GaleriaAdmin = () => {
  const confirm = useConfirm();
  const [items, setItems] = useState<GaleriaItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "2 de 5" mientras sube varios archivos; null = nada subiendo.
  const [progreso, setProgreso] = useState<string | null>(null);

  const recargar = async () => {
    try {
      setItems(await fetchGaleria());
      setError(null);
    } catch (err) {
      // Acá SÍ se muestra: una lista vacía que en realidad es una consulta
      // fallida es el bug de v24 (`fetchDeliveries`).
      setError(mensajeDeError(err, "cargar la galería"));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void recargar();
  }, []);

  const subir = async (files: File[]) => {
    // Lo nuevo va ARRIBA (y por lo tanto en el lugar protagonista de la home):
    // casi siempre se sube lo último que pasó, y con 40 fotos mover una a mano
    // hasta el principio con flechas es inusable.
    const base = items.length ? Math.min(...items.map((i) => i.sortOrder)) : 0;
    let subidos = 0;
    for (const [n, file] of files.entries()) {
      setProgreso(`${n + 1} de ${files.length}`);
      try {
        const res = await uploadGaleria(file);
        await createGaleriaItem({
          kind: res.kind,
          url: res.url,
          posterUrl: res.posterUrl,
          caption: "",
          sortOrder: base - (files.length - n),
          active: true,
        });
        subidos++;
      } catch (err) {
        // Un archivo malo no frena el resto, pero se avisa cuál.
        toast.error(`${file.name}: ${mensajeDeError(err, "subirlo")}`);
      }
    }
    setProgreso(null);
    await recargar();
    if (subidos > 0) toast.success(subidos === 1 ? "Archivo agregado" : `${subidos} archivos agregados`);
  };

  const guardarCampo = async (id: string, campo: Partial<GaleriaItem>) => {
    // Optimista, como en banners: escribir un epígrafe esperando a la red es inusable.
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...campo } : i)));
    try {
      await updateGaleriaItem(id, campo);
    } catch (err) {
      toast.error(mensajeDeError(err, "guardar el cambio"));
      await recargar();
    }
  };

  const mover = async (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const nuevo = [...items];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setItems(nuevo);
    try {
      // Se reescribe el orden de TODOS (misma razón que los banners: con
      // `sort_order` repetido, intercambiar dos valores no arregla nada).
      await Promise.all(nuevo.map((it, k) => updateGaleriaItem(it.id, { sortOrder: k })));
    } catch (err) {
      toast.error(mensajeDeError(err, "reordenar"));
      await recargar();
    }
  };

  const borrar = async (item: GaleriaItem) => {
    const ok = await confirm({
      title: item.kind === "video" ? "Borrar este video" : "Borrar esta foto",
      description: "Se saca de la galería y se borra el archivo. No se puede deshacer.",
      confirmText: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteGaleriaItem(item);
      await recargar();
      toast.success("Borrado");
    } catch (err) {
      toast.error(mensajeDeError(err, "borrar"));
    }
  };

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="mb-6 rounded-xl border border-charrua/40 bg-charrua/[0.06] p-4">
          <p className="text-sm font-semibold text-charrua">{error}</p>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sport text-xl font-black tracking-wide text-tinta">FOTOS Y VIDEOS</h3>
        <label
          className={`btn-celeste inline-flex cursor-pointer items-center gap-2 px-5 py-3 text-xs ${
            progreso ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {progreso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {progreso ? `Subiendo ${progreso}…` : "Agregar fotos o videos"}
          <input
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
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

      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        Se pueden elegir varios a la vez. Lo último que subís queda <strong>primero</strong> (es el
        lugar grande de la home). Videos: MP4 o WebM, hasta <strong>{VIDEO_MAX_MB} MB</strong>;
        conviene que pesen menos de <strong>{VIDEO_RECOMENDADO_MB} MB</strong> (1080p o 720p, unos
        20-30 segundos), porque la gente los ve con datos del celular.
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay nada. Mientras la galería esté vacía, la sección no se muestra en la web.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => {
            const miniatura = it.kind === "video" ? it.posterUrl : it.url;
            return (
              <div key={it.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
                <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                  {miniatura ? (
                    <img src={miniatura} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={`${it.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  )}
                  {it.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <Play className="h-6 w-6 fill-white text-white" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <label className="label-techno" htmlFor={`cap-${it.id}`}>
                    Epígrafe (opcional)
                  </label>
                  <input
                    id={`cap-${it.id}`}
                    type="text"
                    maxLength={60}
                    value={it.caption}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, caption: e.target.value } : x)))
                    }
                    onBlur={(e) => void guardarCampo(it.id, { caption: e.target.value })}
                    placeholder="Halloween 2025 · Colonia"
                    className="input-techno w-full"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <label className="mr-1 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={it.active}
                      onChange={(e) => void guardarCampo(it.id, { active: e.target.checked })}
                    />
                    Activo
                  </label>
                  <button
                    type="button"
                    onClick={() => void mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void mover(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Bajar"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void borrar(it)}
                    aria-label="Borrar"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-charrua/40 text-charrua hover:bg-charrua/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GaleriaAdmin;
