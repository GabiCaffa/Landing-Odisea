/**
 * Bajar una tabla como CSV que Excel abra bien.
 *
 * El panel exporta desde tres pestañas (Entregas, Cumpleaños y Usuarios) y el
 * bloque estaba copiado tal cual en cada una: el mismo escape, el mismo BOM y
 * el mismo baile del `<a>` temporal. Copiado tres veces, el día que una tenga
 * un bug las otras dos lo tienen y no se entera nadie.
 */

/**
 * Escapa un valor para CSV.
 *
 * Se comillan también los `;` porque Excel en configuración regional española
 * usa el punto y coma como separador de columnas: sin comillas, un campo con
 * un `;` adentro parte la fila.
 */
const esc = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const armarCsv = (headers: string[], filas: unknown[][]): string => {
  const lineas = filas.map((f) => f.map(esc).join(","));
  /*
   * El BOM va sí o sí: sin él Excel abre el archivo con la
   * codificación del sistema y los acentos salen rotos ("MartÃ­nez"). Se
   * escribe como escape y no como carácter literal para que no quede un byte
   * invisible en el fuente — eso ya dispara `no-irregular-whitespace` en el
   * lint donde está escrito a mano.
   *
   * Y los saltos de línea son CRLF porque es lo que pide el RFC del formato y
   * lo que el Excel viejo espera.
   */
  return "﻿" + [headers.join(","), ...lineas].join("\r\n");
};

/** Arma el CSV y dispara la descarga. `nombre` va sin la extensión. */
export const descargarCsv = (
  nombre: string,
  headers: string[],
  filas: unknown[][]
): void => {
  const blob = new Blob([armarCsv(headers, filas)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  // Sin esto el blob queda en memoria hasta que se recarga la página.
  URL.revokeObjectURL(url);
};
