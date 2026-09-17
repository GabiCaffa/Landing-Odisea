import { useAuth, type UserRole } from "@/contexts/AuthContext";

/**
 * Quién puede hacer qué dentro del panel (v22).
 *
 * Reemplaza a `TABS_POR_ROL`, que era una lista de pestañas y ya no alcanza:
 * desde v22 el operador **entra** a casi todas las pestañas pero adentro no
 * puede hacer todo. "Ve Eventos" y "puede borrar un evento" son dos preguntas
 * distintas, y una lista de pestañas sólo contesta la primera.
 *
 * **Esto es comodidad, no seguridad.** Lo que separa de verdad son las
 * políticas RLS, y cada permiso de acá tiene su espejo en la base:
 *
 *   eventos          → events_insert/update_manager        (v22)
 *   eventos:borrar   → events_delete_admin                 (v22)
 *   cuentas          → payment_accounts_*_admin            (v13)
 *   usuarios:editar  → profiles_update/delete_admin        (schema)
 *   apariencia       → site_settings_*_admin               (v19)
 *   entregas         → is_staff()                          (v11)
 *   cumples          → is_birthday_staff()                 (v20)
 *   evento:cuenta    → trigger events_payment_account_lock (v22)
 *
 * Si acá se agrega un permiso que la base no tiene, el botón aparece y la
 * acción falla con un error de RLS. Al tocar esta tabla, mirar la migración.
 */

export type AdminTab =
  | "dashboard"
  | "events"
  | "tickets"
  | "promos"
  | "accounts"
  | "users"
  | "appearance"
  | "deliveries"
  | "birthdays";

export type Permiso =
  /** Ver el resumen general. */
  | "dashboard"
  /** Crear y editar eventos. */
  | "eventos"
  /** Borrar un evento entero. */
  | "eventos:borrar"
  /** Crear y editar el catálogo de tipos de entrada. */
  | "entradas"
  /** Borrar un tipo del catálogo (le pega a todos los eventos que lo usan). */
  | "entradas:borrar"
  /** Crear y editar promos. */
  | "promos"
  /** Borrar una promo del catálogo. */
  | "promos:borrar"
  /** Cuentas de cobro: a dónde va la plata. */
  | "cuentas"
  /** Reasignar la cuenta de cobro de un evento que ya existe. */
  | "evento:cuenta"
  /** Ver la lista de usuarios. */
  | "usuarios"
  /** Cambiar roles y dar de baja usuarios. */
  | "usuarios:editar"
  /** Cambiar el tema del sitio público. */
  | "apariencia"
  /** Entregas de entradas (incluye ver la recaudación). */
  | "entregas"
  /** Promo de cumpleaños. */
  | "cumples";

const TODOS: readonly Permiso[] = [
  "dashboard",
  "eventos",
  "eventos:borrar",
  "entradas",
  "entradas:borrar",
  "promos",
  "promos:borrar",
  "cuentas",
  "evento:cuenta",
  "usuarios",
  "usuarios:editar",
  "apariencia",
  "entregas",
  "cumples",
];

const PERMISOS: Record<UserRole, readonly Permiso[]> = {
  admin: TODOS,

  /**
   * El operador hace el trabajo del día. Lo que le falta contra el admin:
   * los tres borrados, las cuentas de cobro, la apariencia del sitio y
   * escribir sobre usuarios (la lista la ve entera, en modo lectura).
   */
  operador: [
    "dashboard",
    "eventos",
    "entradas",
    "promos",
    "usuarios",
    "entregas",
    "cumples",
  ],

  /** Sólo la promo de cumpleaños. Sin dashboard: no ve ventas ni montos. */
  cumples: ["cumples"],

  user: [],
};

export const puede = (role: UserRole | undefined | null, permiso: Permiso): boolean =>
  role ? PERMISOS[role]?.includes(permiso) ?? false : false;

/**
 * El mismo chequeo, para componentes: `const puedeBorrar = usePuede("eventos:borrar")`.
 *
 * Existe para que esconder un botón sea una línea. Si cuesta tres, termina no
 * haciéndose — y un botón que la base va a rechazar con un error de RLS es
 * peor que no tenerlo.
 */
export const usePuede = (permiso: Permiso): boolean => {
  const { currentUser } = useAuth();
  return puede(currentUser?.role, permiso);
};

/**
 * Qué permiso hace falta para entrar a cada pestaña.
 *
 * El sidebar y el ruteo leen los dos de acá, así que no puede pasar que
 * aparezca un botón que la pestaña después rechaza.
 */
export const PERMISO_DE_TAB: Record<AdminTab, Permiso> = {
  dashboard: "dashboard",
  events: "eventos",
  tickets: "entradas",
  promos: "promos",
  accounts: "cuentas",
  users: "usuarios",
  appearance: "apariencia",
  deliveries: "entregas",
  birthdays: "cumples",
};

/** Orden en que se muestran, de lo más usado a lo más administrativo. */
export const ORDEN_TABS: readonly AdminTab[] = [
  "dashboard",
  "events",
  "tickets",
  "promos",
  "deliveries",
  "birthdays",
  "accounts",
  "users",
  "appearance",
];

export const tabsDe = (role: UserRole | undefined | null): AdminTab[] =>
  ORDEN_TABS.filter((t) => puede(role, PERMISO_DE_TAB[t]));

/**
 * El rótulo del panel sigue al rol: a quien sólo gestiona cumpleaños decirle
 * "Panel Admin" es confuso, porque no es admin de nada.
 */
export const rotuloDePanel = (role: UserRole | undefined | null): string => {
  if (role === "cumples") return "Panel Cumpleaños";
  if (role === "operador") return "Panel Operador";
  return "Panel Admin";
};
