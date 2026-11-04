import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Receipt, Upload, X } from "lucide-react";
import { toast } from "sonner";
import ModalAdmin from "@/components/admin/ModalAdmin";
import {
  esComprobanteValido,
  esPdf,
  getComprobanteUrl,
  hashArchivo,
  uploadComprobante,
} from "@/lib/comprobantes";

/**
 * El comprobante de la transferencia, adjunto a una venta (v35).
 *
 * `CampoComprobante` es la única vía de carga y acepta tres gestos, porque
 * quien carga ventas viene de WhatsApp Web con el comprobante a la vista:
 * **Ctrl+V** (click derecho en la imagen → Copiar imagen), arrastrar el
 * archivo, o elegirlo del explorador. Mismo molde que la foto de la cédula en
 * Cumpleaños.
 *
 * Sube al elegir —no al guardar— para tener la ruta lista; si la venta no se
 * guarda, quien usa el campo borra lo que quedó huérfano.
 */

export interface ComprobanteValor {
  path: string;
  hash?: string;
  /** URL local (objectURL) para ver lo recién pegado sin pedir una firmada. */
  previewUrl?: string;
  /** Nombre o tipo del archivo, para saber si es PDF. */
  tipo: string;
}

export function CampoComprobante({
  valor,
  onChange,
  onVer,
}: {
  valor: ComprobanteValor | null;
  /** Se llama con el archivo YA subido, o con `null` al quitarlo. */
  onChange: (valor: ComprobanteValor | null) => void;
  /** Ver uno ya guardado (sin preview local): abre el visor con URL firmada. */
  onVer?: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = async (file: File) => {
    if (!esComprobanteValido(file)) return toast.error("Tiene que ser una imagen o un PDF");
    if (file.size > 10 * 1024 * 1024) return toast.error("El archivo pesa más de 10 MB");
    setSubiendo(true);
    try {
      // El hash va sobre el ORIGINAL (ver hashArchivo). Si el navegador no lo
      // puede calcular, se sube igual: sin hash sólo se pierde el aviso.
      const hash = await hashArchivo(file).catch(() => undefined);
      const subida = await uploadComprobante(file);
      if (!subida.ok || !subida.path) {
        toast.error(subida.error ?? "No se pudo subir el comprobante");
        return;
      }
      onChange({
        path: subida.path,
        hash,
        previewUrl: URL.createObjectURL(file),
        tipo: file.type,
      });
    } finally {
      setSubiendo(false);
    }
  };

  // Ctrl+V en cualquier parte del modal. Sólo se queda con el pegado si trae un
  // ARCHIVO: pegar texto en el cuadro del mensaje sigue funcionando normal.
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find(esComprobanteValido);
      if (!file) return;
      e.preventDefault();
      void cargarRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pdf = valor ? esPdf(valor.tipo) || esPdf(valor.path) : false;

  return (
    <div>
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Comprobante
      </span>

      {valor ? (
        <div className="flex items-center gap-3 border border-border p-2">
          {valor.previewUrl && !pdf ? (
            <a href={valor.previewUrl} target="_blank" rel="noopener noreferrer" title="Ver grande">
              <img
                src={valor.previewUrl}
                alt="Comprobante"
                className="h-20 w-20 border border-border bg-secondary object-cover"
              />
            </a>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center border border-border bg-secondary">
              {pdf ? <FileText className="h-7 w-7" /> : <Receipt className="h-7 w-7" />}
            </div>
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{pdf ? "PDF adjunto" : "Comprobante adjunto"}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {valor.previewUrl ? (
                <a
                  href={valor.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ver grande
                </a>
              ) : (
                onVer && (
                  <button type="button" onClick={onVer} className="underline underline-offset-2">
                    Ver
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="underline underline-offset-2"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-charrua underline underline-offset-2"
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const file = Array.from(e.dataTransfer.files).find(esComprobanteValido);
            if (file) void cargar(file);
            else toast.error("Soltá una imagen o un PDF");
          }}
          disabled={subiendo}
          className={`flex w-full flex-col items-center justify-center gap-1 border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${
            arrastrando ? "border-celeste bg-celeste/10" : "border-border hover:bg-secondary/50"
          }`}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">
            {subiendo ? "Subiendo…" : "Pegá el comprobante con Ctrl+V"}
          </span>
          <span className="text-xs text-muted-foreground">
            En WhatsApp Web: click derecho en la imagen → Copiar imagen. También podés arrastrarlo
            o tocar acá para elegirlo.
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // permite volver a elegir el mismo archivo
          if (file) void cargar(file);
        }}
      />
    </div>
  );
}

/**
 * Ver un comprobante ya guardado. El bucket es privado: la URL firmada vence a
 * los 5 minutos y sólo la puede pedir el staff.
 */
export function VerComprobanteModal({
  path,
  titulo,
  onClose,
}: {
  path: string;
  titulo: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void getComprobanteUrl(path).then((r) => {
      if (!vivo) return;
      if (r.ok && r.url) setUrl(r.url);
      else setError(r.error ?? "No se pudo abrir el comprobante");
    });
    return () => {
      vivo = false;
    };
  }, [path]);

  const pdf = esPdf(path);

  return (
    <ModalAdmin
      titulo="Comprobante"
      subtitulo={titulo}
      onClose={onClose}
      pie={
        <>
          <button type="button" onClick={onClose} className="btn-techno-outline inline-flex items-center justify-center gap-2">
            <X className="h-4 w-4" /> Cerrar
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-celeste inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="h-4 w-4" /> Abrir en pestaña nueva
            </a>
          )}
        </>
      }
    >
      {error ? (
        <p className="text-sm text-charrua">{error}</p>
      ) : !url ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Abriendo comprobante…</p>
      ) : pdf ? (
        <iframe src={url} title="Comprobante" className="h-[65vh] w-full border border-border" />
      ) : (
        <img
          src={url}
          alt="Comprobante"
          className="mx-auto h-auto max-h-[65vh] w-full border border-border bg-secondary object-contain"
        />
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        El link es temporal (5 minutos) y sólo lo puede abrir el staff.
      </p>
    </ModalAdmin>
  );
}
