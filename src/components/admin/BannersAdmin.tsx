import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  BANNER_ALTO,
  BANNER_ANCHO,
  BANNER_MOVIL_ALTO,
  BANNER_MOVIL_ANCHO,
  SiteBanner,
  createBanner,
  deleteBanner,
  fetchBanners,
  updateBanner,
  uploadBanner,
} from "@/lib/banners";

/**
 * Pestaña Banners: el slider del hero (v27).
 *
 * Va **fuera de `Admin.tsx`**, que ya pasa las 5000 líneas — misma regla que
 * `PromosAdmin` desde v21: lo nuevo empieza afuera.
 *
 * Los banners activos SON el hero de la home: ya no hay un interruptor ni un
 * hero alternativo. Sin ningún banner activo la home muestra sólo los botones
 * a eventos y promociones.
 */

const ERRORES_DE_MIGRACION = ["PGRST205", "42P01"];

const mensajeDeError = (err: unknown, accion: string) => {
  const code = (err as { code?: string } | null)?.code;
  return ERRORES_DE_MIGRACION.includes(code ?? "")
    ? "Falta correr la migración v27_site_banners.sql en Supabase."
    : `No se pudo ${accion}. ¿Seguís con la sesión iniciada?`;
};

/**
 * Un botón de texto que abre el explorador de archivos. Es un `<label>` con el
 * `<input type="file">` escondido adentro, el mismo patrón que el "Agregar
 * banner" de arriba. Después de elegir se vacía el input: si no, volver a
 * elegir el MISMO archivo no dispararía nada.
 */
const BotonImagen = ({
  texto,
  ocupado,
  onFile,
}: {
  texto: string;
  ocupado: boolean;
  onFile: (f: File) => void;
}) => (
  <label
    className={`mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 text-xs font-semibold text-celeste-deep underline ${
      ocupado ? "pointer-events-none opacity-60" : ""
    }`}
  >
    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
    {ocupado ? "Subiendo…" : texto}
    <input
      type="file"
      accept="image/*"
      className="hidden"
      disabled={ocupado}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }}
    />
  </label>
);

const BannersAdmin = () => {
  const confirm = useConfirm();
  const [banners, setBanners] = useState<SiteBanner[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  // Qué imagen se está cambiando (`<id>:escritorio` o `<id>:movil`), para mostrar
  // "Subiendo…" sólo en ese botón y no dejar tocar dos veces.
  const [cambiando, setCambiando] = useState<string | null>(null);
  const inputNuevo = useRef<HTMLInputElement>(null);

  const recargar = async () => {
    try {
      setBanners(await fetchBanners());
      setError(null);
    } catch (err) {
      // Acá SÍ se muestra el error. Una lista vacía que en realidad es una
      // consulta fallida fue el bug de v24 con `fetchDeliveries`: la pestaña
      // se veía vacía y nadie se enteraba de nada.
      setError(mensajeDeError(err, "cargar los banners"));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void recargar();
  }, []);

  const subirNuevo = async (file: File) => {
    setSubiendo(true);
    try {
      const url = await uploadBanner(file, "escritorio");
      await createBanner({
        imageUrl: url,
        imageUrlMobile: "",
        alt: "",
        linkUrl: "",
        // Al final de la lista: el orden lo decide quien lo sube, después.
        sortOrder: banners.length,
        active: true,
      });
      await recargar();
      toast.success("Banner agregado");
    } catch (err) {
      toast.error(mensajeDeError(err, "subir el banner"));
    } finally {
      setSubiendo(false);
      if (inputNuevo.current) inputNuevo.current.value = "";
    }
  };

  const guardarCampo = async (id: string, campo: Partial<SiteBanner>) => {
    // Optimista: escribir en un campo de texto y esperar a la red para ver la
    // letra es inusable. Si falla se recarga y se avisa.
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, ...campo } : b)));
    try {
      await updateBanner(id, campo);
    } catch (err) {
      toast.error(mensajeDeError(err, "guardar el cambio"));
      await recargar();
    }
  };

  const mover = async (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= banners.length) return;
    const nuevo = [...banners];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setBanners(nuevo);
    try {
      // Se reescribe el orden de TODOS y no sólo de los dos que se tocaron:
      // si alguna vez quedaron con `sort_order` repetido (dos insert en
      // paralelo), intercambiar los dos valores no arregla nada.
      await Promise.all(nuevo.map((b, k) => updateBanner(b.id, { sortOrder: k })));
    } catch (err) {
      toast.error(mensajeDeError(err, "reordenar"));
      await recargar();
    }
  };

  const borrar = async (b: SiteBanner) => {
    const ok = await confirm({
      title: "Borrar este banner",
      description:
        "Se saca del slider para siempre. La imagen queda en el storage, así que si estaba en algún otro lado no se rompe.",
      confirmText: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteBanner(b.id);
      await recargar();
      toast.success("Banner borrado");
    } catch (err) {
      toast.error(mensajeDeError(err, "borrar el banner"));
    }
  };

  /**
   * Cambia la imagen de un banner que ya existe, sin perder su lugar en el
   * orden ni su texto, link y estado. Sirve para las dos versiones.
   *
   * Sube un archivo NUEVO y apunta el banner a él: la imagen anterior queda en
   * el storage (un bucket público de flyers, no estorba) pero deja de usarse. Y
   * como la URL cambia, ningún navegador ni CDN muestra la imagen vieja.
   */
  const cambiarImagen = async (id: string, file: File, variante: "escritorio" | "movil") => {
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo tiene que ser una imagen");
      return;
    }
    setCambiando(`${id}:${variante}`);
    try {
      const url = await uploadBanner(file, variante);
      await updateBanner(id, variante === "movil" ? { imageUrlMobile: url } : { imageUrl: url });
      await recargar();
      toast.success(
        variante === "movil" ? "Versión de celular actualizada" : "Imagen actualizada"
      );
    } catch (err) {
      toast.error(mensajeDeError(err, "cambiar la imagen"));
    } finally {
      setCambiando(null);
    }
  };

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const activos = banners.filter((b) => b.active).length;
  const sinMovil = banners.filter((b) => b.active && !b.imageUrlMobile).length;

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="mb-6 border border-charrua/40 bg-charrua/[0.06] rounded-xl p-4">
          <p className="text-sm font-semibold text-charrua">{error}</p>
        </div>
      )}

      {/* ─── La lista ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="font-sport text-xl font-black tracking-wide text-tinta">LOS BANNERS</h3>
        <label className="btn-celeste px-5 py-3 text-xs cursor-pointer inline-flex items-center gap-2">
          {subiendo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {subiendo ? "Subiendo…" : "Agregar banner"}
          <input
            ref={inputNuevo}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subirNuevo(f);
            }}
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
        Medida: <strong>{BANNER_ANCHO}×{BANNER_ALTO}</strong>.
      </p>

      {/*
        El aviso del celular. No es un detalle de diseño: un 1920×600 en un
        teléfono de 375 px mide 117 px de alto, o sea una franja fina donde
        antes había un hero de pantalla completa — y el 99% del tráfico entra
        desde el teléfono. Se avisa sólo si hay banners sin versión vertical,
        para que no sea ruido permanente.
      */}
      {sinMovil > 0 && (
        <div className="mb-5 border border-border bg-secondary/40 rounded-xl p-4">
          <p className="text-sm">
            {sinMovil === 1
              ? "Hay 1 banner activo sin versión de celular."
              : `Hay ${sinMovil} banners activos sin versión de celular.`}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            En un teléfono, un banner de {BANNER_ANCHO}×{BANNER_ALTO} se ve como una franja
            de poco más de 100 px de alto. Pedile al diseñador una versión vertical de{" "}
            <strong>
              {BANNER_MOVIL_ANCHO}×{BANNER_MOVIL_ALTO}
            </strong>{" "}
            y subila en cada banner. Mientras tanto se muestra el de escritorio entero, sin
            recortar.
          </p>
        </div>
      )}

      {banners.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-8 text-center">
          Todavía no hay banners. Subí el primero con el botón de arriba.
        </p>
      ) : (
        <div className="space-y-4">
          {banners.map((b, i) => (
            <div key={b.id} className="border border-border rounded-xl p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Las dos versiones, cada una con su medida y su botón para cambiarla */}
                <div className="sm:w-56 flex-shrink-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Escritorio · {BANNER_ANCHO}×{BANNER_ALTO}
                  </p>
                  <img
                    src={b.imageUrl}
                    alt=""
                    className="w-full aspect-[16/5] object-cover rounded-lg border border-border"
                  />
                  <BotonImagen
                    texto="Cambiar imagen"
                    ocupado={cambiando === `${b.id}:escritorio`}
                    onFile={(f) => void cambiarImagen(b.id, f, "escritorio")}
                  />

                  <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Celular · {BANNER_MOVIL_ANCHO}×{BANNER_MOVIL_ALTO}
                  </p>
                  {b.imageUrlMobile ? (
                    <div className="flex items-start gap-3">
                      <img
                        src={b.imageUrlMobile}
                        alt=""
                        className="h-16 w-[51px] flex-shrink-0 object-cover rounded border border-border"
                      />
                      <div className="flex flex-col">
                        <BotonImagen
                          texto="Cambiar imagen"
                          ocupado={cambiando === `${b.id}:movil`}
                          onFile={(f) => void cambiarImagen(b.id, f, "movil")}
                        />
                        <button
                          type="button"
                          onClick={() => void guardarCampo(b.id, { imageUrlMobile: "" })}
                          className="min-h-[44px] text-left text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Quitar la de celular
                        </button>
                      </div>
                    </div>
                  ) : (
                    <BotonImagen
                      texto="Subir versión de celular"
                      ocupado={cambiando === `${b.id}:movil`}
                      onFile={(f) => void cambiarImagen(b.id, f, "movil")}
                    />
                  )}
                </div>

                {/* Los campos */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <label className="label-techno" htmlFor={`alt-${b.id}`}>
                      Qué muestra (texto alternativo)
                    </label>
                    <input
                      id={`alt-${b.id}`}
                      type="text"
                      value={b.alt}
                      onChange={(e) =>
                        setBanners((prev) =>
                          prev.map((x) => (x.id === b.id ? { ...x, alt: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => void guardarCampo(b.id, { alt: e.target.value })}
                      placeholder="Halloween XXL — 31 de octubre en Colonia"
                      className="input-techno w-full"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Lo lee quien usa lector de pantalla, y se ve si la imagen no carga.
                    </p>
                  </div>

                  <div>
                    <label className="label-techno" htmlFor={`link-${b.id}`}>
                      A dónde lleva (opcional)
                    </label>
                    <input
                      id={`link-${b.id}`}
                      type="text"
                      value={b.linkUrl}
                      onChange={(e) =>
                        setBanners((prev) =>
                          prev.map((x) =>
                            x.id === b.id ? { ...x, linkUrl: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) => void guardarCampo(b.id, { linkUrl: e.target.value })}
                      placeholder="/evento/halloween-colonia"
                      className="input-techno w-full"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Vacío = el banner no es un link.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={b.active}
                        onChange={(e) => void guardarCampo(b.id, { active: e.target.checked })}
                      />
                      Activo
                    </label>

                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() => void mover(i, -1)}
                        disabled={i === 0}
                        aria-label="Subir"
                        className="flex h-11 w-11 items-center justify-center border border-border rounded-lg disabled:opacity-30 hover:bg-muted"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void mover(i, 1)}
                        disabled={i === banners.length - 1}
                        aria-label="Bajar"
                        className="flex h-11 w-11 items-center justify-center border border-border rounded-lg disabled:opacity-30 hover:bg-muted"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void borrar(b)}
                        aria-label="Borrar"
                        className="flex h-11 w-11 items-center justify-center border border-charrua/40 text-charrua rounded-lg hover:bg-charrua/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BannersAdmin;
