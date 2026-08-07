import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { User } from "@/contexts/AuthContext";

/**
 * Selector de usuario registrado con buscador (typeahead).
 *
 * Reemplaza al <select> nativo: con muchos usuarios cargados, buscar a mano en
 * una lista desplegable es imposible en celular. Acá se escribe y se filtra por
 * nombre, apellido, email o documento, ignorando tildes y mayúsculas.
 *
 * Una vez elegido se muestra una tarjeta con el usuario y un botón para
 * cambiarlo: así el texto escrito nunca queda "desincronizado" de la selección.
 */

/** Marcas de acento que deja NFD al separar la letra de su tilde. */
const DIACRITICS = new RegExp("[\u0300-\u036f]", "g");

/**
 * Pasa una letra a minúscula y sin tilde. Devuelve SIEMPRE un carácter por
 * carácter (si el plegado no dejara ninguno, se queda el original): así los
 * índices del texto buscable coinciden con los del original y podemos resaltar
 * exactamente lo que coincidió.
 */
const foldChar = (ch: string) => {
  const folded = ch.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
  return folded.length === 1 ? folded : ch.toLowerCase();
};

/** "Pérez" → "perez", "Ñandú" → "nandu". */
const norm = (s: string) => Array.from(s).map(foldChar).join("");

/** Parte lo escrito en palabras sueltas, ya normalizadas. */
const termsOf = (query: string) => norm(query).split(/\s+/).filter(Boolean);

const MAX_VISIBLE = 50;

/**
 * Muestra un texto resaltando los pedazos que coinciden con lo buscado.
 * Marcamos por posición sobre la versión normalizada (misma longitud que el
 * original) y después cortamos el original.
 */
const Highlight = ({ text, terms }: { text: string; terms: string[] }) => {
  if (terms.length === 0 || !text) return <>{text}</>;

  const hay = norm(text);
  const hit = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(term, from);
      if (at === -1) break;
      for (let k = at; k < at + term.length; k++) hit[k] = true;
      from = at + term.length;
    }
  }
  if (!hit.some(Boolean)) return <>{text}</>;

  // Agrupamos caracteres consecutivos con el mismo estado en tramos.
  const chunks: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = chunks[chunks.length - 1];
    if (last && last.on === hit[i]) last.text += text[i];
    else chunks.push({ text: text[i], on: hit[i] });
  }

  return (
    <>
      {chunks.map((c, i) =>
        c.on ? (
          <mark key={i} className="bg-celeste/25 text-inherit font-bold">
            {c.text}
          </mark>
        ) : (
          <span key={i}>{c.text}</span>
        )
      )}
    </>
  );
};

interface Props {
  users: User[];
  /** Id del usuario elegido ("" = ninguno). */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Texto cuando la lista de usuarios está vacía. */
  emptyLabel?: string;
}

const UserSearchSelect = ({
  users,
  value,
  onChange,
  placeholder = "Buscá por nombre, email o documento...",
  emptyLabel = "No hay usuarios registrados todavía.",
}: Props) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => users.find((u) => u.id === value) ?? null, [users, value]);

  // Indexamos una vez por usuario para no normalizar en cada tecla.
  const indexed = useMemo(
    () =>
      [...users]
        .sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        )
        .map((u) => ({
          user: u,
          haystack: norm(
            [u.firstName, u.lastName, u.email, u.documentId ?? "", u.phone ?? ""].join(" ")
          ),
        })),
    [users]
  );

  const terms = useMemo(() => termsOf(query), [query]);

  // Cada palabra escrita tiene que aparecer en algún lado: "juan gm" encuentra
  // a "Juan Pérez — juan@gmail.com".
  const matches = useMemo(() => {
    if (terms.length === 0) return indexed.map((i) => i.user);
    return indexed.filter((i) => terms.every((t) => i.haystack.includes(t))).map((i) => i.user);
  }, [indexed, terms]);

  const visible = matches.slice(0, MAX_VISIBLE);

  useEffect(() => setHighlight(0), [query]);

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Mantener a la vista la opción resaltada al navegar con las flechas.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return Math.min(Math.max(next, 0), Math.max(visible.length - 1, 0));
      });
      return;
    }
    if (e.key === "Enter") {
      // No dejamos que el Enter del buscador mande el formulario.
      e.preventDefault();
      if (open && visible[highlight]) pick(visible[highlight].id);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all">{selected.email}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            // Devolvemos el foco al buscador para poder seguir escribiendo.
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" /> Cambiar
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={users.length === 0 ? emptyLabel : placeholder}
          disabled={users.length === 0}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="input-techno pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && users.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
        >
          {/* Cuántos entraron en el filtro, para saber si vale la pena afinar. */}
          <li className="sticky top-0 bg-background border-b border-border px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {matches.length === 0
              ? "Sin resultados"
              : `${matches.length} de ${users.length} usuario${users.length === 1 ? "" : "s"}`}
          </li>

          {visible.length === 0 && (
            <li className="px-3 py-3 text-xs text-muted-foreground">
              Nadie coincide con “{query}”. Probá con menos palabras o usá “Carga manual”.
            </li>
          )}

          {visible.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === highlight} data-index={i}>
              <button
                type="button"
                // onMouseDown: elegimos antes de que el input pierda el foco.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u.id)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  i === highlight ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
              >
                <span className="block text-sm font-semibold truncate">
                  <Highlight text={`${u.firstName} ${u.lastName}`} terms={terms} />
                </span>
                <span className="block text-xs font-mono text-muted-foreground truncate">
                  <Highlight text={u.email} terms={terms} />
                  {u.documentId && (
                    <>
                      {" · "}
                      <Highlight text={u.documentId} terms={terms} />
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}

          {matches.length > MAX_VISIBLE && (
            <li className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
              +{matches.length - MAX_VISIBLE} más. Afiná la búsqueda.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default UserSearchSelect;
