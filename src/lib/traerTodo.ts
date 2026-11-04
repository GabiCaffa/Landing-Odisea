/**
 * Trae TODAS las filas de una consulta, de a páginas.
 *
 * Supabase (PostgREST) corta cada respuesta en **1000 filas** sin avisar: no
 * hay error, la lista simplemente termina ahí. Así fue como el contador de
 * usuarios del panel se quedó clavado en 1000 mientras la gente se seguía
 * registrando, y la pestaña Usuarios dejaba afuera a todos los nuevos. Con
 * las ventas iba a pasar lo mismo en la primera venta masiva grande.
 *
 * Se avanza por lo que efectivamente llegó y se corta con una página vacía,
 * no cuando llega "menos de 1000": si el tope del proyecto se cambia a otro
 * número, esto sigue trayendo todo igual. Cuesta una consulta más, vacía.
 *
 * `pedir` recibe el rango y tiene que devolver la consulta con un orden
 * ESTABLE (por fecha y después por id): sin orden, dos páginas pueden repetir
 * o saltearse filas.
 */
export async function traerTodo<T>(
  pedir: (
    desde: number,
    hasta: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pagina = 1000
): Promise<T[]> {
  const todo: T[] = [];
  // Tope de vueltas por las dudas: 200 páginas son 200.000 filas.
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const { data, error } = await pedir(todo.length, todo.length + pagina - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return todo;
    todo.push(...data);
  }
  return todo;
}
