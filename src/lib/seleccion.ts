import { useMemo, useState } from "react";

/**
 * Selección múltiple de filas para borrar varias de una (Entregas y Cumpleaños).
 *
 * Se entra con "Seleccionar" y aparecen las casillas. La barra de abajo tiene
 * "Todas" (todo lo que se está viendo), "Ninguna" y "Borrar". El flujo pedido
 * es "seleccionar todo y después destildar los que no".
 *
 * **Sólo se borra lo que se está VIENDO.** Si se tilda algo y después se cambia
 * de pestaña o de filtro, lo que quedó escondido no se borra aunque siga
 * tildado: nadie tiene que borrar algo que no tiene adelante.
 */
export function useSeleccion(visibles: string[]) {
  const [activo, setActivo] = useState(false);
  const [tildadas, setTildadas] = useState<Set<string>>(new Set());

  const visiblesSet = useMemo(() => new Set(visibles), [visibles]);
  const elegidas = useMemo(() => [...tildadas].filter((id) => visiblesSet.has(id)), [tildadas, visiblesSet]);

  return {
    activo,
    entrar: () => setActivo(true),
    salir: () => {
      setActivo(false);
      setTildadas(new Set());
    },
    tildada: (id: string) => tildadas.has(id),
    alternar: (id: string) =>
      setTildadas((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return s;
      }),
    /** Tilda o destilda un grupo entero (la casilla del encabezado de la tabla). */
    grupo: (ids: string[], tildar: boolean) =>
      setTildadas((prev) => {
        const s = new Set(prev);
        for (const id of ids) {
          if (tildar) s.add(id);
          else s.delete(id);
        }
        return s;
      }),
    todas: () => setTildadas(new Set(visibles)),
    ninguna: () => setTildadas(new Set()),
    /** Las tildadas que se están viendo: las únicas que se borran. */
    elegidas,
  };
}

export type Seleccion = ReturnType<typeof useSeleccion>;
