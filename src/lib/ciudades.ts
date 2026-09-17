/**
 * Ciudades y localidades por departamento (Uruguay).
 *
 * ── Por qué está en su propio archivo y no en `locations.ts` ───────────────
 * `locations.ts` lo importa `PhoneInput`, que sí vive en la cara pública (lo
 * usan el registro y el modal de compra). Metiendo las ~180 localidades ahí
 * viajarían de arrastre con el prefijo telefónico de cada país. Es la misma
 * forma de falla que la trampa de `lucide-react` en `manualChunks`, sólo que a
 * nivel de módulo: acá sólo lo importan el `LocationSelect` y el panel.
 *
 * ── Por qué una lista y no un campo de texto ──────────────────────────────
 * "Nueva Helvecia", "nueva helvecia" y "N. Helvecia" son tres ciudades
 * distintas para un filtro. Los desplegables de la pestaña Usuarios se arman
 * **con los datos que hay** (ver §6.9), así que texto libre los convierte en un
 * puré en pocas semanas — que es justo el bug que se acaba de arreglar en el
 * filtro de departamento.
 *
 * ── Y por qué igual existe "Otra" ─────────────────────────────────────────
 * Esta lista tiene las localidades principales, no las ~1.100 que tiene el
 * país. Sin una salida, alguien de un pueblo chico **no puede terminar de
 * registrarse**, y eso es mucho peor que un dato imperfecto. Lo que se escribe
 * en "Otra" se guarda tal cual y se ve en el panel: si una se repite, se sube
 * a esta lista y listo.
 *
 * Los nombres de los departamentos tienen que coincidir **exactamente** con los
 * de `COUNTRIES` en `locations.ts` (hay una prueba de eso más abajo, en
 * `departamentosSinCiudades`). Si no coinciden, el desplegable queda vacío y no
 * falla nada: es silencioso, así que conviene mirarlo al tocar cualquiera de
 * los dos archivos.
 */

export const CIUDADES_UY: Record<string, string[]> = {
  Artigas: ["Artigas", "Bella Unión", "Tomás Gomensoro", "Baltasar Brum", "Sequeira"],
  Canelones: [
    "Canelones",
    "Ciudad de la Costa",
    "Las Piedras",
    "Pando",
    "La Paz",
    "Progreso",
    "Santa Lucía",
    "Barros Blancos",
    "Toledo",
    "Sauce",
    "Atlántida",
    "Parque del Plata",
    "Salinas",
    "Paso Carrasco",
    "Colonia Nicolich",
    "Empalme Olmos",
    "Joaquín Suárez",
    "San Ramón",
    "Tala",
    "Los Cerrillos",
  ],
  "Cerro Largo": ["Melo", "Río Branco", "Fraile Muerto", "Isidoro Noblía", "Aceguá"],
  Colonia: [
    "Colonia del Sacramento",
    "Carmelo",
    "Juan Lacaze",
    "Nueva Helvecia",
    "Nueva Palmira",
    "Rosario",
    "Tarariras",
    "Ombúes de Lavalle",
    "Colonia Valdense",
    "Florencio Sánchez",
    "Conchillas",
    "Colonia Miguelete",
  ],
  Durazno: ["Durazno", "Sarandí del Yí", "Villa del Carmen", "La Paloma", "Blanquillo"],
  Flores: ["Trinidad", "Ismael Cortinas", "Andresito"],
  Florida: ["Florida", "Sarandí Grande", "Casupá", "25 de Mayo", "Fray Marcos", "Cardal"],
  Lavalleja: ["Minas", "José Pedro Varela", "Solís de Mataojo", "Mariscala", "Batlle y Ordóñez"],
  Maldonado: [
    "Maldonado",
    "Punta del Este",
    "San Carlos",
    "Piriápolis",
    "Pan de Azúcar",
    "Punta Ballena",
    "José Ignacio",
    "Aiguá",
    "Garzón",
  ],
  Montevideo: ["Montevideo"],
  Paysandú: ["Paysandú", "Guichón", "Quebracho", "Porvenir", "Chapicuy", "Piedras Coloradas"],
  "Río Negro": ["Fray Bentos", "Young", "Nuevo Berlín", "San Javier", "Grecco"],
  Rivera: ["Rivera", "Tranqueras", "Vichadero", "Minas de Corrales"],
  Rocha: [
    "Rocha",
    "Chuy",
    "Castillos",
    "La Paloma",
    "La Pedrera",
    "Punta del Diablo",
    "Barra de Valizas",
    "Lascano",
    "Velázquez",
    "Cebollatí",
  ],
  Salto: ["Salto", "Constitución", "Belén", "San Antonio", "Villa Constitución"],
  "San José": [
    "San José de Mayo",
    "Ciudad del Plata",
    "Libertad",
    "Rodríguez",
    "Ecilda Paullier",
    "Rafael Perazza",
  ],
  Soriano: [
    "Mercedes",
    "Dolores",
    "Cardona",
    "Palmitas",
    "José Enrique Rodó",
    "Villa Soriano",
    "Santa Catalina",
  ],
  Tacuarembó: ["Tacuarembó", "Paso de los Toros", "San Gregorio de Polanco", "Ansina"],
  "Treinta y Tres": ["Treinta y Tres", "Vergara", "Santa Clara de Olimar", "Cerro Chato"],
};

/** Marca de "esta ciudad no está en la lista, la escribo yo". */
export const CIUDAD_OTRA = "__otra__";

/**
 * Las ciudades de un departamento, o `[]` si no hay lista para ese lugar.
 *
 * Devuelve vacío para cualquier país que no sea Uruguay: ahí el campo cae a
 * texto libre, igual que ya hace `state` en `LocationSelect`. Hacer el catálogo
 * de todo LatAm sería mantener miles de nombres para un puñado de personas.
 */
export const ciudadesDe = (pais: string | undefined, departamento: string | undefined): string[] => {
  if (pais !== "UY" || !departamento) return [];
  return CIUDADES_UY[departamento] ?? [];
};

/**
 * Departamentos de `COUNTRIES` que se quedaron sin ciudades acá.
 *
 * Existe para la prueba: si alguien renombra un departamento en `locations.ts`
 * —o le pone una tilde distinta— el desplegable de ciudad queda vacío **sin
 * ningún error**, y eso no se nota hasta que alguien no puede registrarse.
 */
export const departamentosSinCiudades = (departamentos: string[]): string[] =>
  departamentos.filter((d) => (CIUDADES_UY[d] ?? []).length === 0);
