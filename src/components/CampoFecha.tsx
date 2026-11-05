import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

/**
 * Fecha escrita a mano como "dd/mm/aaaa", con teclado numérico, **y además el
 * calendario** del botón de la derecha.
 *
 * Reemplaza al `<input type="date">` en las fechas de nacimiento. El nativo
 * tomaba el formato del idioma del navegador —en un Chrome en inglés pedía
 * "mm/dd/yyyy", al revés de como se escribe acá—. Se puede escribir o elegir:
 * el calendario es el del propio navegador (un `type="date"` invisible encima
 * del botón), así en el celular abre la rueda del sistema y no suma ninguna
 * librería. Pedido del autor: el calendario tiene que estar.
 *
 * Por fuera habla en ISO ("1995-05-13"), igual que el input nativo: quien lo
 * usa no cambia nada. Mientras la fecha está incompleta o no existe (31/02)
 * devuelve "" y el campo queda inválido para el navegador, así un `required`
 * frena el envío como antes.
 */
interface Props {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
}

const aTexto = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/** "13051995" → "13/05/1995". La barra aparece recién con el dígito siguiente,
 *  así borrar hacia atrás nunca se traba en una barra. */
const conBarras = (digitos: string) =>
  digitos.length <= 2
    ? digitos
    : digitos.length <= 4
      ? `${digitos.slice(0, 2)}/${digitos.slice(2)}`
      : `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;

/** ISO si los ocho dígitos son una fecha real, pasada y desde 1900. */
const aIso = (digitos: string): string => {
  if (digitos.length !== 8) return "";
  const d = Number(digitos.slice(0, 2));
  const m = Number(digitos.slice(2, 4));
  const a = Number(digitos.slice(4));
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const existe =
    fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
  if (!existe || a < 1900 || fecha.getTime() > Date.now()) return "";
  return `${digitos.slice(4)}-${digitos.slice(2, 4)}-${digitos.slice(0, 2)}`;
};

const CampoFecha = ({ value, onChange, id, className = "input-techno", required }: Props) => {
  const [texto, setTexto] = useState(() => aTexto(value));
  const ultimo = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // El valor cambió desde afuera (el perfil terminó de cargar, se limpió el
  // formulario): se muestra ése. Lo que emitió este mismo campo no cuenta.
  useEffect(() => {
    if (value !== ultimo.current) {
      ultimo.current = value;
      setTexto(aTexto(value));
    }
  }, [value]);

  const digitos = texto.replace(/\D/g, "");
  const completa = digitos.length === 8;
  const invalida = completa && !aIso(digitos);

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      invalida ? "Esa fecha no existe" : texto && !completa ? "Completá la fecha: dd/mm/aaaa" : ""
    );
  }, [invalida, completa, texto]);

  const hoy = new Date();
  const max = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  /** Lo elegido en el calendario entra como si se hubiera escrito. */
  const elegir = (iso: string) => {
    ultimo.current = iso;
    setTexto(aTexto(iso));
    onChange(iso);
  };

  return (
    <>
      <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        required={required}
        value={texto}
        aria-invalid={invalida || undefined}
        onChange={(e) => {
          const nuevos = e.target.value.replace(/\D/g, "").slice(0, 8);
          setTexto(conBarras(nuevos));
          const iso = aIso(nuevos);
          ultimo.current = iso;
          onChange(iso);
        }}
        className={`${className} pr-12${invalida ? " border-charrua" : ""}`}
      />
      {/* El calendario: un date nativo transparente sobre el ícono. Tocarlo
          directo es lo que abre el selector en iOS; en escritorio, además,
          showPicker() lo abre desde cualquier punto del botón. */}
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </span>
      <input
        type="date"
        tabIndex={-1}
        aria-label="Elegir la fecha en el calendario"
        min="1900-01-01"
        max={max}
        value={aIso(digitos) || ""}
        onChange={(e) => e.target.value && elegir(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Navegador viejo sin showPicker: el toque directo ya lo abre.
          }
        }}
        className="absolute inset-y-0 right-0 w-11 cursor-pointer opacity-0"
      />
      </div>
      {invalida &&<p className="mt-1 text-xs text-charrua">Esa fecha no existe. Revisá día y mes.</p>}
    </>
  );
};

export default CampoFecha;
