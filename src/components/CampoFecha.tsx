import { useEffect, useRef, useState } from "react";

/**
 * Fecha escrita a mano como "dd/mm/aaaa", con teclado numérico.
 *
 * Reemplaza al `<input type="date">` en las fechas de nacimiento. El nativo
 * tomaba el formato del idioma del navegador —en un Chrome en inglés pedía
 * "mm/dd/yyyy", al revés de como se escribe acá— y para una fecha de 1995 el
 * calendario obliga a ir para atrás mes por mes. Escribir ocho números es más
 * rápido que cualquier calendario, y no suma ninguna librería.
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

  return (
    <>
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
        className={`${className}${invalida ? " border-charrua" : ""}`}
      />
      {invalida && <p className="mt-1 text-xs text-charrua">Esa fecha no existe. Revisá día y mes.</p>}
    </>
  );
};

export default CampoFecha;
