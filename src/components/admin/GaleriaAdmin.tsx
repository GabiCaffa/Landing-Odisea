import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Play, Plus, Trash2, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  GaleriaAlbum,
  GaleriaItem,
  VIDEO_MAX_MB,
  VIDEO_RECOMENDADO_MB,
  createAlbum,
  createGaleriaItem,
  deleteAlbum,
  deleteGaleriaItem,
  fetchAlbumes,
  fetchGaleria,
  updateAlbum,
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
  // 42703 = columna inexistente (album_id sin v37). 23505 = dirección repetida.
  if (code === "42703") return "Falta correr la migración v37_galeria_albumes.sql en Supabase.";
  if (code === "23505") return "Ya hay un álbum con ese nombre.";
  // Los errores propios (video muy pesado, tipo de archivo) ya vienen claros.
  const msg = (err as Error | null)?.message;
  if (msg && /MB|foto o un video/.test(msg)) return msg;
  return `No se pudo ${accion}. ¿Seguís con la sesión iniciada?`;
};

const GaleriaAdmin = () => {
  const confirm = useConfirm();
  const [items, setItems] = useState<GaleriaItem[]>([]);
  const [albumes, setAlbumes] = useState<GaleriaAlbum[]>([]);
  const [nuevoAlbum, setNuevoAlbum] = useState("");
  // Qué se ve en la lista: "todos", "sueltas" o el id de un álbum.
  const [filtro, setFiltro] = useState<string>("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "2 de 5" mientras sube varios archivos; null = nada subiendo.
  const [progreso, setProgreso] = useState<string | null>(null);

  const recargar = async () => {
    try {
      setItems(await fetchGaleria());
      // Sin v37 los álbumes fallan: la galería de siempre tiene que seguir andando.
      setAlbumes(await fetchAlbumes().catch(() => []));
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

  const subir = async (files: File[], albumId: string | null = null) => {
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
          ...(albumId ? { albumId } : {}),
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

  const mover = async (item: GaleriaItem, delta: number) => {
    // Con un filtro puesto, el vecino es el de la lista visible, no el de la completa.
    const idx = visibles.findIndex((x) => x.id === item.id);
    const vecino = visibles[idx + delta];
    if (!vecino) return;
    const nuevo = [...items];
    const i = nuevo.findIndex((x) => x.id === item.id);
    const j = nuevo.findIndex((x) => x.id === vecino.id);
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

  const crearAlbum = async () => {
    try {
      await createAlbum(nuevoAlbum, albumes.length);
      setNuevoAlbum("");
      await recargar();
      toast.success("Álbum creado");
    } catch (err) {
      toast.error(mensajeDeError(err, "crear el álbum"));
    }
  };

  const guardarAlbum = async (id: string, cambios: Partial<GaleriaAlbum>) => {
    setAlbumes((prev) => prev.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
    try {
      await updateAlbum(id, cambios);
    } catch (err) {
      toast.error(mensajeDeError(err, "guardar el álbum"));
      await recargar();
    }
  };

  const borrarAlbum = async (album: GaleriaAlbum) => {
    const n = items.filter((i) => i.albumId === album.id).length;
    const ok = await confirm({
      title: `Borrar el álbum "${album.title}"`,
      description: n
        ? `Sus ${n} archivos NO se borran: pasan a la galería general de la home.`
        : "Está vacío.",
      confirmText: "Borrar álbum",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteAlbum(album.id);
      if (filtro === album.id) setFiltro("todos");
      await recargar();
      toast.success("Álbum borrado");
    } catch (err) {
      toast.error(mensajeDeError(err, "borrar el álbum"));
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

  const visibles = items.filter((i) =>
    filtro === "todos" ? true : filtro === "sueltas" ? !i.albumId : i.albumId === filtro
  );
  const accionArchivo = (album: GaleriaAlbum | null) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) void subir(files, album?.id ?? null);
  };

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="mb-6 rounded-xl border border-charrua/40 bg-charrua/[0.06] p-4">
          <p className="text-sm font-semibold text-charrua">{error}</p>
        </div>
      )}

      <h3 className="font-sport text-xl font-black tracking-wide text-tinta">ÁLBUMES POR EVENTO</h3>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-muted-foreground">
        Cada álbum es un banner en la home ("Fotos Halloween Colonia") que abre su propia página con
        todas las fotos. Subí las fotos del evento directo al álbum. Un álbum sin fotos no se muestra.
      </p>
      <div className="mb-4 space-y-3">
        {albumes.map((al) => {
          const n = items.filter((i) => i.albumId === al.id).length;
          return (
            <div key={al.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <label className="label-techno" htmlFor={`alb-${al.id}`}>
                  Nombre (el banner dice "Fotos …")
                </label>
                <input
                  id={`alb-${al.id}`}
                  type="text"
                  maxLength={80}
                  value={al.title}
                  onChange={(e) =>
                    setAlbumes((prev) => prev.map((x) => (x.id === al.id ? { ...x, title: e.target.value } : x)))
                  }
                  onBlur={(e) => e.target.value.trim() && void guardarAlbum(al.id, { title: e.target.value })}
                  className="input-techno w-full"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {n} {n === 1 ? "archivo" : "archivos"} · /fotos/{al.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={al.active}
                    onChange={(e) => void guardarAlbum(al.id, { active: e.target.checked })}
                  />
                  Activo
                </label>
                <label
                  className={`btn-celeste inline-flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-xs ${
                    progreso ? "pointer-events-none opacity-70" : ""
                  }`}
                >
                  <Upload className="h-4 w-4" /> Subir fotos
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    disabled={!!progreso}
                    onChange={accionArchivo(al)}
                  />
                </label>
                <a
                  href={`/fotos/${al.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Ver el álbum"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => void borrarAlbum(al)}
                  aria-label="Borrar álbum"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-charrua/40 text-charrua hover:bg-charrua/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <input
            type="text"
            maxLength={80}
            value={nuevoAlbum}
            onChange={(e) => setNuevoAlbum(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nuevoAlbum.trim() && void crearAlbum()}
            placeholder="Nuevo álbum, ej: Halloween Nueva Helvecia"
            className="input-techno min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => void crearAlbum()}
            disabled={!nuevoAlbum.trim()}
            className="btn-techno-outline inline-flex min-h-[44px] items-center gap-2 px-4 text-xs disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Crear
          </button>
        </div>
      </div>

      <div className="mb-2 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sport text-xl font-black tracking-wide text-tinta">FOTOS Y VIDEOS</h3>
        <label
          className={`btn-celeste inline-flex cursor-pointer items-center gap-2 px-5 py-3 text-xs ${
            progreso ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {progreso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {progreso ? `Subiendo ${progreso}…` : "Agregar sueltas"}
          <input
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="hidden"
            disabled={!!progreso}
            onChange={accionArchivo(null)}
          />
        </label>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        Se pueden elegir varios a la vez. Lo último que subís queda <strong>primero</strong> (es el
        lugar grande de la home). Videos: MP4 o WebM, hasta <strong>{VIDEO_MAX_MB} MB</strong>;
        conviene que pesen menos de <strong>{VIDEO_RECOMENDADO_MB} MB</strong> (1080p o 720p, unos
        20-30 segundos), porque la gente los ve con datos del celular.
      </p>

      <div className="mb-4">
        <label className="label-techno" htmlFor="galeria-filtro">
          Mostrar
        </label>
        <select
          id="galeria-filtro"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="input-techno w-full sm:w-auto"
        >
          <option value="todos">Todo ({items.length})</option>
          <option value="sueltas">Sueltas — galería general ({items.filter((i) => !i.albumId).length})</option>
          {albumes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} ({items.filter((i) => i.albumId === a.id).length})
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay nada. Mientras la galería esté vacía, la sección no se muestra en la web.
        </p>
      ) : (
        <div className="space-y-3">
          {visibles.map((it, i) => {
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

                {albumes.length > 0 && (
                  <div className="sm:w-44">
                    <label className="label-techno" htmlFor={`alb-it-${it.id}`}>
                      Álbum
                    </label>
                    <select
                      id={`alb-it-${it.id}`}
                      value={it.albumId ?? ""}
                      onChange={(e) => void guardarCampo(it.id, { albumId: e.target.value || null })}
                      className="input-techno w-full"
                    >
                      <option value="">Suelta (general)</option>
                      {albumes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
                    onClick={() => void mover(it, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void mover(it, 1)}
                    disabled={i === visibles.length - 1}
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
