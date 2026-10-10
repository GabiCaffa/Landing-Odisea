/**
 * El mosaico de la galería: qué tamaño tiene cada foto.
 *
 * Cada 7 fotos una es grande (`g`, 2×2) y otra es alta (`a`, 1×2); el resto
 * son chicas (`p`, 1×1). `grid-auto-flow: dense` rellena los huecos con las
 * chicas que siguen, y eso se ve bien… salvo **al final**: si la última foto
 * es grande y no quedan más para rellenar a su lado, queda un hueco de 2×2
 * (se vio en producción con 8 fotos: la octava era grande y quedó sola).
 *
 * La solución es mirar el mosaico terminado: se simula cómo acomoda las fotos
 * el navegador y, mientras el borde de abajo quede desparejo (más de una fila
 * de diferencia entre columnas), la última foto grande o alta se vuelve chica.
 * Se prueba con las dos grillas de la galería —2 columnas en celular, 4 desde
 * `md:`— y se verificó que para cualquier cantidad de 1 a 40 hay solución.
 */

export type TamanoMosaico = "g" | "a" | "p";

const MEDIDAS: Record<TamanoMosaico, [ancho: number, alto: number]> = {
  g: [2, 2],
  a: [1, 2],
  p: [1, 1],
};

/** Alto que alcanza cada columna al acomodar las fotos como lo hace CSS `dense`. */
const alturasPorColumna = (tamanos: TamanoMosaico[], columnas: number): number[] => {
  const ocupado: boolean[][] = [];
  const alturas = new Array<number>(columnas).fill(0);
  const entra = (f: number, c: number, w: number, h: number) => {
    if (c + w > columnas) return false;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (ocupado[f + i]?.[c + j]) return false;
    return true;
  };
  for (const t of tamanos) {
    const [ancho, alto] = MEDIDAS[t];
    const w = Math.min(ancho, columnas);
    let puesto = false;
    for (let f = 0; !puesto; f++) {
      for (let c = 0; c < columnas && !puesto; c++) {
        if (!entra(f, c, w, alto)) continue;
        for (let i = 0; i < alto; i++) {
          for (let j = 0; j < w; j++) {
            (ocupado[f + i] ??= [])[c + j] = true;
            alturas[c + j] = Math.max(alturas[c + j], f + i + 1);
          }
        }
        puesto = true;
      }
    }
  }
  return alturas;
};

const bordeParejo = (tamanos: TamanoMosaico[]) =>
  [2, 4].every((columnas) => {
    const a = alturasPorColumna(tamanos, columnas);
    return Math.max(...a) - Math.min(...a) <= 1;
  });

export const tamanosDeMosaico = (cantidad: number): TamanoMosaico[] => {
  const t: TamanoMosaico[] = Array.from({ length: cantidad }, (_, i) =>
    i % 7 === 0 ? "g" : i % 7 === 4 ? "a" : "p"
  );
  while (!bordeParejo(t)) {
    let i = t.length - 1;
    while (i >= 0 && t[i] === "p") i--;
    if (i < 0) break;
    t[i] = "p";
  }
  return t;
};

/**
 * Las chicas y las grandes llevan `aspect-square` (en la grande, 2 columnas de
 * ancho dan justo 2 filas de alto). **La alta NO**: un ítem de grilla con
 * `aspect-ratio` y alto automático no se estira, así que con `aspect-square`
 * medía una sola fila aunque ocupara dos y dejaba un hueco debajo.
 */
export const claseDeMosaico = (t: TamanoMosaico) =>
  t === "g"
    ? "aspect-square col-span-2 row-span-2"
    : t === "a"
      ? "row-span-2"
      : "aspect-square";
