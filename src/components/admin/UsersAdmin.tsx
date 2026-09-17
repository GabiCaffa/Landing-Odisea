import { useEffect, useMemo, useState } from "react";
import {
  Cake,
  Download,
  Filter,
  Gift,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import ModalAdmin from "@/components/admin/ModalAdmin";
import {
  useAuth,
  formatEventDate,
  isOfficialAdmin,
  type User,
  type UserRole,
} from "@/contexts/AuthContext";
import { usePuede } from "@/lib/adminPermisos";
import { fetchDeliveries, type TicketDelivery } from "@/lib/deliveries";
import { fetchBirthdays, type BirthdaySignup } from "@/lib/birthdays";
import { getCountry } from "@/lib/locations";
import { formatPhoneDisplay } from "@/lib/validators";
import { SIN_DATO, contarPorValor, foldText } from "@/lib/utils";
import { descargarCsv } from "@/lib/csv";

/**
 * Pestaña Usuarios: la comunidad entera, con filtros y ficha completa.
 *
 * Antes era un buscador de texto y una tabla de 7 columnas con `min-w-[720px]`
 * —o sea, scroll horizontal en el teléfono—, y mostraba **menos de la mitad**
 * de lo que la base guarda de cada persona: faltaban teléfono, país,
 * departamento y foto. Encima `profiles` es la única tabla del panel que se
 * cruza con las otras dos (`ticket_deliveries.user_id` y
 * `birthday_signups.user_id`) y ese cruce no se usaba en ningún lado: la
 * pregunta "¿este tipo ya compró alguna vez?" no tenía dónde contestarse.
 *
 * Va en archivo propio y no dentro de `Admin.tsx`, que ya pasa las 5000 líneas.
 *
 * **Escribir sobre usuarios es sólo del admin** (cambiar roles y dar de baja):
 * el operador ve la lista entera pero sin los controles. Lo de verdad lo
 * frenan `profiles_update_admin` y `profiles_delete_admin`; esconderlos es para
 * que no le aparezca un botón que la base va a rechazar.
 */

// ─── Fechas: siempre cortando el string ISO ─────────────────────────────────
// `new Date("1990-05-15")` se parsea como MEDIANOCHE UTC, así que en Uruguay
// (UTC−3) los getters locales devuelven el 14. Es el mismo motivo por el que
// `formatEventDate` corta el string en vez de construir un Date, y acá importa
// el doble: una edad mal calculada por un día puede marcar mayor a un menor.

const partes = (iso?: string): [number, number, number] | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? [y, m, d] : null;
};

const edadDe = (iso?: string): number | null => {
  const p = partes(iso);
  if (!p) return null;
  const [y, m, d] = p;
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  const difMes = hoy.getMonth() + 1 - m;
  if (difMes < 0 || (difMes === 0 && hoy.getDate() < d)) edad--;
  return edad;
};

/** Días que faltan para el próximo cumpleaños (0 = es hoy). */
const diasAlCumple = (iso?: string): number | null => {
  const p = partes(iso);
  if (!p) return null;
  const [, m, d] = p;
  const hoy = new Date();
  const cero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let prox = new Date(hoy.getFullYear(), m - 1, d);
  if (prox < cero) prox = new Date(hoy.getFullYear() + 1, m - 1, d);
  return Math.round((prox.getTime() - cero.getTime()) / 86400000);
};

/** Días desde una fecha ISO con hora (created_at). */
const diasDesde = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const plata = (n: number) => `$${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;

// ─── La ficha: el perfil más lo que se le cruza ─────────────────────────────

interface Ficha {
  u: User;
  edad: number | null;
  diasCumple: number | null;
  /** Entregas cargadas a nombre de este perfil. */
  compras: TicketDelivery[];
  entradas: number;
  gastado: number;
  ultimaCompra?: string;
  /** Solicitud de promo de cumpleaños más reciente, si pidió alguna. */
  cumple?: BirthdaySignup;
}

// ─── Filtros ────────────────────────────────────────────────────────────────

interface Filtros {
  texto: string;
  rol: "todos" | UserRole;
  pais: string;
  depto: string;
  telefono: "todos" | "con" | "sin";
  edad: "todas" | "menores" | "18-24" | "25-34" | "35+";
  mesCumple: string;
  alta: "todas" | "7" | "30" | "90";
  compras: "todas" | "con" | "sin";
  promoCumple: "todas" | "pidio" | "pendiente" | "aprobada" | "regalo" | "nunca";
  foto: "todas" | "con" | "sin";
}

const VACIOS: Filtros = {
  texto: "",
  rol: "todos",
  pais: "",
  depto: "",
  telefono: "todos",
  edad: "todas",
  mesCumple: "",
  alta: "todas",
  compras: "todas",
  promoCumple: "todas",
  foto: "todas",
};

type Orden = "nombre" | "nuevos" | "viejos" | "gastado" | "cumple";

const ORDENES: Array<{ v: Orden; label: string }> = [
  { v: "nombre", label: "Nombre (A-Z)" },
  { v: "nuevos", label: "Más nuevos" },
  { v: "viejos", label: "Más antiguos" },
  { v: "gastado", label: "Más gastaron" },
  { v: "cumple", label: "Cumple más próximo" },
];

const ROLES: Array<{ v: Filtros["rol"]; label: string }> = [
  { v: "todos", label: "Todos los roles" },
  { v: "user", label: "Usuario" },
  { v: "operador", label: "Operador" },
  { v: "cumples", label: "Encargado de cumples" },
  { v: "admin", label: "Admin" },
];

// ─── Piezas chicas de UI ────────────────────────────────────────────────────

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    {children}
  </label>
);

const Sel = ({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    // text-base en celular: con menos de 16px Safari de iOS hace zoom al
    // enfocar y descoloca la pantalla entera.
    className="h-11 w-full border border-border bg-background px-2 text-base sm:text-sm"
  >
    {children}
  </select>
);

const Avatar = ({ u, size = "h-10 w-10" }: { u: User; size?: string }) =>
  u.avatarUrl ? (
    <img
      src={u.avatarUrl}
      alt=""
      className={`${size} flex-shrink-0 rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${size} flex flex-shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background`}
    >
      {u.firstName[0]}
      {u.lastName[0]}
    </div>
  );

const RolBadge = ({ role }: { role: UserRole }) => {
  if (role === "user") return null;
  const txt = role === "cumples" ? "cumples" : role;
  return (
    <span className="border border-celeste px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-celeste-deep">
      {txt}
    </span>
  );
};

const Dato = ({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <p className="flex items-start gap-2 text-xs text-muted-foreground">
    <span className="mt-0.5 flex-shrink-0">{icon}</span>
    <span className="min-w-0 break-words">{children}</span>
  </p>
);

// ─── Componente ─────────────────────────────────────────────────────────────

const UsersAdmin = () => {
  const { users, events, deleteUser, promoteUser, currentUser } = useAuth();
  const confirm = useConfirm();
  const puedeEditar = usePuede("usuarios:editar");

  const [deliveries, setDeliveries] = useState<TicketDelivery[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdaySignup[]>([]);
  const [f, setF] = useState<Filtros>(VACIOS);
  const [orden, setOrden] = useState<Orden>("nombre");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [viendo, setViendo] = useState<Ficha | null>(null);

  /**
   * Los cruces se piden aparte y **si fallan, la lista igual se muestra**.
   *
   * Son datos de adorno para esta pantalla: si `ticket_deliveries` no contesta,
   * romper la pestaña Usuarios entera sería cambiar un problema chico por uno
   * grande.
   */
  useEffect(() => {
    let vivo = true;
    fetchDeliveries()
      .then((d) => vivo && setDeliveries(d))
      .catch(() => {});
    fetchBirthdays()
      .then((b) => vivo && setBirthdays(b))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const eventoPorId = useMemo(
    () => new Map(events.map((e) => [e.id, e.name])),
    [events]
  );

  const fichas = useMemo<Ficha[]>(() => {
    const porUsuario = new Map<string, TicketDelivery[]>();
    for (const d of deliveries) {
      if (!d.userId) continue;
      const lista = porUsuario.get(d.userId);
      if (lista) lista.push(d);
      else porUsuario.set(d.userId, [d]);
    }
    const cumplePorUsuario = new Map<string, BirthdaySignup>();
    for (const b of birthdays) {
      if (!b.userId) continue;
      const previo = cumplePorUsuario.get(b.userId);
      // La más reciente: una persona puede pedir el beneficio todos los años.
      if (!previo || b.createdAt > previo.createdAt) cumplePorUsuario.set(b.userId, b);
    }

    return users.map((u) => {
      const compras = porUsuario.get(u.id) ?? [];
      return {
        u,
        edad: edadDe(u.birthDate),
        diasCumple: diasAlCumple(u.birthDate),
        compras,
        entradas: compras.reduce((a, d) => a + d.quantity, 0),
        gastado: compras.reduce((a, d) => a + d.value, 0),
        ultimaCompra: compras
          .map((d) => d.createdAt)
          .sort()
          .at(-1),
        cumple: cumplePorUsuario.get(u.id),
      };
    });
  }, [users, deliveries, birthdays]);

  const filtradas = useMemo(() => {
    const texto = foldText(f.texto.trim().toLowerCase());

    const pasa = (x: Ficha): boolean => {
      const { u } = x;

      if (texto) {
        const heno = foldText(
          `${u.firstName} ${u.lastName} ${u.email} ${u.documentId} ${u.phone ?? ""}`.toLowerCase()
        );
        if (!heno.includes(texto)) return false;
      }
      if (f.rol !== "todos" && u.role !== f.rol) return false;
      if (f.pais && (u.country || SIN_DATO) !== f.pais) return false;
      if (f.depto && (u.state || SIN_DATO) !== f.depto) return false;
      if (f.telefono === "con" && !u.phone) return false;
      if (f.telefono === "sin" && u.phone) return false;
      if (f.foto === "con" && !u.avatarUrl) return false;
      if (f.foto === "sin" && u.avatarUrl) return false;

      if (f.edad !== "todas") {
        const e = x.edad;
        if (e === null) return false;
        if (f.edad === "menores" && e >= 18) return false;
        if (f.edad === "18-24" && (e < 18 || e > 24)) return false;
        if (f.edad === "25-34" && (e < 25 || e > 34)) return false;
        if (f.edad === "35+" && e < 35) return false;
      }

      if (f.mesCumple) {
        const p = partes(u.birthDate);
        if (!p || p[1] !== Number(f.mesCumple)) return false;
      }

      if (f.alta !== "todas") {
        const d = diasDesde(u.createdAt);
        if (d === null || d > Number(f.alta)) return false;
      }

      if (f.compras === "con" && x.compras.length === 0) return false;
      if (f.compras === "sin" && x.compras.length > 0) return false;

      if (f.promoCumple !== "todas") {
        const c = x.cumple;
        if (f.promoCumple === "nunca" && c) return false;
        if (f.promoCumple === "pidio" && !c) return false;
        if (f.promoCumple === "pendiente" && c?.status !== "pendiente") return false;
        if (f.promoCumple === "aprobada" && c?.status !== "aprobado") return false;
        if (f.promoCumple === "regalo" && !c?.giftGiven) return false;
      }

      return true;
    };

    const out = fichas.filter(pasa);

    out.sort((a, b) => {
      switch (orden) {
        case "nuevos":
          return b.u.createdAt.localeCompare(a.u.createdAt);
        case "viejos":
          return a.u.createdAt.localeCompare(b.u.createdAt);
        case "gastado":
          return b.gastado - a.gastado;
        case "cumple":
          // Los que no tienen fecha válida van al final, no al principio.
          return (a.diasCumple ?? 9999) - (b.diasCumple ?? 9999);
        default:
          return `${a.u.firstName} ${a.u.lastName}`.localeCompare(
            `${b.u.firstName} ${b.u.lastName}`,
            "es"
          );
      }
    });

    return out;
  }, [fichas, f, orden]);

  const activos = useMemo(
    () =>
      (Object.keys(VACIOS) as Array<keyof Filtros>).filter(
        (k) => k !== "texto" && f[k] !== VACIOS[k]
      ).length,
    [f]
  );

  /**
   * Los dos desplegables de ubicación se arman con **los usuarios que hay**, no
   * con el catálogo de `locations.ts`.
   *
   * Antes la lista de departamentos era `getCountry(f.pais)?.states`, y
   * `getCountry("")` devuelve `undefined`: mientras no eligieras un país el
   * desplegable quedaba **vacío**. Abrías "Departamento", veías sólo "Todos" y
   * parecía roto. Y para un panel donde prácticamente todos son de Uruguay,
   * obligar a elegir "Uruguay" antes de poder elegir "Colonia" es un paso
   * escondido que nadie adivina.
   *
   * Armarlos desde los datos arregla eso y dos cosas más: **no se ofrece una
   * opción que va a dar cero** —el catálogo trae 19 países y 19 departamentos,
   * de los que se usan dos o tres— y los perfiles sin ubicación cargada dejan
   * de ser invisibles. De paso el conteo al lado dice dónde está la gente sin
   * tener que ir probando.
   */
  const paises = useMemo(() => contarPorValor(users.map((u) => u.country)), [users]);

  // El departamento se acota al país elegido, pero **sin país muestra todos**:
  // ése era justamente el caso que no andaba.
  const deptos = useMemo(
    () =>
      contarPorValor(
        users
          .filter((u) => !f.pais || (u.country || SIN_DATO) === f.pais)
          .map((u) => u.state)
      ),
    [users, f.pais]
  );

  const resumen = useMemo(
    () => ({
      staff: filtradas.filter((x) => x.u.role !== "user").length,
      compradores: filtradas.filter((x) => x.compras.length > 0).length,
      recaudado: filtradas.reduce((a, x) => a + x.gastado, 0),
    }),
    [filtradas]
  );

  const handleDelete = async (u: User) => {
    if (u.id === currentUser?.id) {
      toast.error("No podés eliminar tu propia cuenta");
      return;
    }
    const ok = await confirm({
      title: "Eliminar usuario",
      description: `¿Seguro que querés eliminar a ${u.firstName} ${u.lastName}? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const r = await deleteUser(u.id);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Usuario eliminado");
    setViendo(null);
  };

  const handleRol = async (u: User, role: UserRole) => {
    if (role === u.role) return;
    const ok = await confirm({
      title: "Cambiar rol",
      description: `¿Cambiar el rol de ${u.firstName} ${u.lastName} a "${role}"?`,
      confirmText: "Cambiar rol",
    });
    if (!ok) return; // el select vuelve solo a su valor al re-render
    const r = await promoteUser(u.id, role);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo actualizar");
      return;
    }
    toast.success("Rol actualizado");
  };

  const exportar = () => {
    if (filtradas.length === 0) {
      toast.error("No hay usuarios para exportar");
      return;
    }
    descargarCsv(
      "odisea-usuarios",
      [
        "Nombre", "Apellido", "Email", "Cédula", "Teléfono", "Nacimiento", "Edad",
        "País", "Departamento", "Rol", "Alta", "Compras", "Entradas", "Gastado",
        "Promo cumple", "Regalo entregado",
      ],
      filtradas.map((x) => [
        x.u.firstName,
        x.u.lastName,
        x.u.email,
        x.u.documentId,
        x.u.phone ? formatPhoneDisplay(x.u.phone) : "",
        x.u.birthDate,
        x.edad ?? "",
        getCountry(x.u.country)?.name ?? x.u.country ?? "",
        x.u.state ?? "",
        x.u.role,
        x.u.createdAt.slice(0, 10),
        x.compras.length,
        x.entradas,
        x.gastado,
        x.cumple?.status ?? "",
        x.cumple?.giftGiven ? "Sí" : "",
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Buscador + acciones ──────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={f.texto}
            onChange={(e) => setF({ ...f, texto: e.target.value })}
            placeholder="Nombre, email, cédula o teléfono..."
            className="input-techno pl-10"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPanelAbierto((v) => !v)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 border px-4 text-xs uppercase tracking-wide transition-colors sm:flex-none ${
              activos > 0
                ? "border-celeste bg-celeste/10 font-semibold text-celeste-deep"
                : "border-border hover:bg-muted"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activos > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-celeste px-1 text-[11px] text-accent-foreground">
                {activos}
              </span>
            )}
          </button>
          <button
            onClick={exportar}
            aria-label="Exportar CSV"
            className="inline-flex min-h-11 w-11 items-center justify-center border border-border transition-colors hover:bg-muted sm:w-auto sm:gap-2 sm:px-4 sm:text-xs sm:uppercase sm:tracking-wide"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* ── Panel de filtros ─────────────────────────────────────────── */}
      {/* Colapsado por defecto: son 10 filtros y desplegados se comen la
          pantalla del teléfono antes de mostrar un solo usuario. */}
      {panelAbierto && (
        <div className="space-y-3 border border-border bg-card p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Rol">
              <Sel value={f.rol} onChange={(v) => setF({ ...f, rol: v as Filtros["rol"] })}>
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </Sel>
            </Campo>

            <Campo label="País">
              {/* Al cambiar de país se limpia el departamento: si no, queda un
                  filtro invisible por un departamento que ese país no tiene y
                  la lista sale vacía sin explicación. */}
              <Sel value={f.pais} onChange={(v) => setF({ ...f, pais: v, depto: "" })}>
                <option value="">Todos</option>
                {paises.map(([code, n]) => (
                  <option key={code} value={code}>
                    {code === SIN_DATO
                      ? `Sin país cargado (${n})`
                      : `${getCountry(code)?.flag ?? ""} ${getCountry(code)?.name ?? code} (${n})`}
                  </option>
                ))}
              </Sel>
            </Campo>

            <Campo label="Departamento">
              <Sel value={f.depto} onChange={(v) => setF({ ...f, depto: v })}>
                <option value="">Todos</option>
                {deptos.map(([d, n]) => (
                  <option key={d} value={d}>
                    {d === SIN_DATO ? `Sin departamento cargado (${n})` : `${d} (${n})`}
                  </option>
                ))}
              </Sel>
            </Campo>

            <Campo label="Teléfono">
              <Sel
                value={f.telefono}
                onChange={(v) => setF({ ...f, telefono: v as Filtros["telefono"] })}
              >
                <option value="todos">Todos</option>
                <option value="con">Con teléfono</option>
                <option value="sin">Sin teléfono</option>
              </Sel>
            </Campo>

            <Campo label="Edad">
              <Sel value={f.edad} onChange={(v) => setF({ ...f, edad: v as Filtros["edad"] })}>
                <option value="todas">Todas</option>
                <option value="menores">Menores de 18</option>
                <option value="18-24">18 a 24</option>
                <option value="25-34">25 a 34</option>
                <option value="35+">35 o más</option>
              </Sel>
            </Campo>

            <Campo label="Cumple en">
              <Sel value={f.mesCumple} onChange={(v) => setF({ ...f, mesCumple: v })}>
                <option value="">Cualquier mes</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Sel>
            </Campo>

            <Campo label="Se registró">
              <Sel value={f.alta} onChange={(v) => setF({ ...f, alta: v as Filtros["alta"] })}>
                <option value="todas">Cuando sea</option>
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
              </Sel>
            </Campo>

            <Campo label="Compras">
              <Sel
                value={f.compras}
                onChange={(v) => setF({ ...f, compras: v as Filtros["compras"] })}
              >
                <option value="todas">Todos</option>
                <option value="con">Ya compró</option>
                <option value="sin">Nunca compró</option>
              </Sel>
            </Campo>

            <Campo label="Promo cumpleaños">
              <Sel
                value={f.promoCumple}
                onChange={(v) => setF({ ...f, promoCumple: v as Filtros["promoCumple"] })}
              >
                <option value="todas">Todos</option>
                <option value="pidio">La pidió alguna vez</option>
                <option value="pendiente">A revisar</option>
                <option value="aprobada">Aprobada</option>
                <option value="regalo">Regalo entregado</option>
                <option value="nunca">Nunca la pidió</option>
              </Sel>
            </Campo>

            <Campo label="Foto de perfil">
              <Sel value={f.foto} onChange={(v) => setF({ ...f, foto: v as Filtros["foto"] })}>
                <option value="todas">Todos</option>
                <option value="con">Con foto</option>
                <option value="sin">Sin foto</option>
              </Sel>
            </Campo>

            <Campo label="Ordenar por">
              <Sel value={orden} onChange={(v) => setOrden(v as Orden)}>
                {ORDENES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </Sel>
            </Campo>
          </div>

          {activos > 0 && (
            <button
              onClick={() => setF({ ...VACIOS, texto: f.texto })}
              className="inline-flex min-h-11 items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* ── Resumen de lo que se está viendo ─────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{filtradas.length}</b>
          {filtradas.length !== users.length && ` de ${users.length}`} usuarios
        </span>
        <span>
          <b className="text-foreground">{resumen.compradores}</b> compraron
        </span>
        <span>
          <b className="text-foreground">{resumen.staff}</b> con rol de staff
        </span>
        {resumen.recaudado > 0 && (
          <span>
            <b className="text-foreground">{plata(resumen.recaudado)}</b> en compras
          </span>
        )}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────── */}
      <div className="border border-border bg-card">
        {filtradas.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Ningún usuario coincide con los filtros
          </p>
        ) : (
          <>
            {/* Celular: tarjetas. La tabla de 7 columnas de antes obligaba a
                scrollear de costado para llegar a las acciones. */}
            <div className="divide-y divide-border md:hidden">
              {filtradas.map((x) => (
                <button
                  key={x.u.id}
                  onClick={() => setViendo(x)}
                  className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-secondary/30"
                >
                  <Avatar u={x.u} size="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold leading-tight">
                        {x.u.firstName} {x.u.lastName}
                      </p>
                      <RolBadge role={x.u.role} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{x.u.email}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {x.edad !== null && <span>{x.edad} años</span>}
                      {x.u.state && <span>{x.u.state}</span>}
                      {x.compras.length > 0 && (
                        <span className="text-foreground">
                          {x.entradas} entradas · {plata(x.gastado)}
                        </span>
                      )}
                      {!x.u.phone && <span className="text-charrua">Sin teléfono</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left">
                    <Th>Usuario</Th>
                    <Th>Contacto</Th>
                    <Th>Cédula</Th>
                    <Th>Edad</Th>
                    <Th>Ubicación</Th>
                    <Th>Compras</Th>
                    <Th>Cumple</Th>
                    <Th>Rol</Th>
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((x) => {
                    const bloqueado = isOfficialAdmin(x.u.email);
                    return (
                      <tr
                        key={x.u.id}
                        className="border-b border-border/50 hover:bg-secondary/30"
                      >
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar u={x.u} />
                            <div>
                              <p className="font-semibold">
                                {x.u.firstName} {x.u.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Desde {formatEventDate(x.u.createdAt.slice(0, 10))}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <p className="font-mono text-xs">{x.u.email}</p>
                          {x.u.phone ? (
                            <p className="font-mono text-xs text-muted-foreground">
                              {formatPhoneDisplay(x.u.phone)}
                            </p>
                          ) : (
                            <p className="text-xs text-charrua">Sin teléfono</p>
                          )}
                        </Td>
                        <Td className="font-mono text-xs">{x.u.documentId}</Td>
                        <Td>
                          {x.edad ?? "—"}
                          <p className="text-[11px] text-muted-foreground">
                            {formatEventDate(x.u.birthDate)}
                          </p>
                        </Td>
                        <Td className="text-xs">
                          {x.u.state ?? "—"}
                          {x.u.country && (
                            <p className="text-[11px] text-muted-foreground">
                              {getCountry(x.u.country)?.name ?? x.u.country}
                            </p>
                          )}
                        </Td>
                        <Td>
                          {x.compras.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="text-xs">
                              <p className="font-semibold">{plata(x.gastado)}</p>
                              <p className="text-muted-foreground">
                                {x.entradas} entradas · {x.compras.length} compras
                              </p>
                            </div>
                          )}
                        </Td>
                        <Td>
                          {x.cumple ? (
                            <span
                              className={`text-xs ${
                                x.cumple.giftGiven
                                  ? "text-foreground"
                                  : x.cumple.status === "pendiente"
                                    ? "text-charrua"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {x.cumple.giftGiven
                                ? "Regalo dado"
                                : x.cumple.status === "pendiente"
                                  ? "A revisar"
                                  : "Aprobada"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </Td>
                        <Td>
                          {bloqueado ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                              title="Admin oficial · no se puede modificar"
                            >
                              <Lock className="h-3 w-3" /> admin
                            </span>
                          ) : puedeEditar ? (
                            <select
                              value={x.u.role}
                              onChange={(e) => handleRol(x.u, e.target.value as UserRole)}
                              className="border border-border bg-background px-2 py-1 text-xs"
                            >
                              <option value="user">user</option>
                              <option value="operador">operador</option>
                              <option value="cumples">cumples</option>
                            </select>
                          ) : (
                            <span className="text-xs uppercase tracking-wider text-muted-foreground">
                              {x.u.role}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setViendo(x)}
                              className="border border-border px-2 py-1 text-xs uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
                            >
                              Ver
                            </button>
                            {puedeEditar && !bloqueado && (
                              <button
                                onClick={() => handleDelete(x.u)}
                                aria-label="Eliminar"
                                className="p-2 transition-colors hover:bg-destructive hover:text-destructive-foreground"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {viendo && (
        <FichaModal
          x={viendo}
          eventoPorId={eventoPorId}
          puedeEditar={puedeEditar}
          onRol={handleRol}
          onDelete={handleDelete}
          onClose={() => setViendo(null)}
        />
      )}
    </div>
  );
};

// Los mismos Th/Td del resto del panel, repetidos acá para no exportarlos desde
// `Admin.tsx` — que es justo el archivo del que este módulo se está separando.
const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </th>
);

const Td = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;

// ─── Ficha completa ─────────────────────────────────────────────────────────

const FichaModal = ({
  x,
  eventoPorId,
  puedeEditar,
  onRol,
  onDelete,
  onClose,
}: {
  x: Ficha;
  eventoPorId: Map<string, string>;
  puedeEditar: boolean;
  onRol: (u: User, r: UserRole) => void;
  onDelete: (u: User) => void;
  onClose: () => void;
}) => {
  const { u } = x;
  const bloqueado = isOfficialAdmin(u.email);
  const pais = getCountry(u.country);

  return (
    <ModalAdmin
      titulo={`${u.firstName} ${u.lastName}`}
      subtitulo={u.email}
      ancho="2xl"
      onClose={onClose}
      pie={
        <>
          <button
            onClick={onClose}
            className="min-h-11 border border-border px-4 text-xs uppercase tracking-wide transition-colors hover:bg-muted"
          >
            Cerrar
          </button>
          {puedeEditar && !bloqueado && (
            <button
              onClick={() => onDelete(u)}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-destructive px-4 text-xs uppercase tracking-wide text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar usuario
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar u={u} size="h-16 w-16" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">
                {u.firstName} {u.lastName}
              </p>
              <RolBadge role={u.role} />
              {bloqueado && (
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Lock className="h-3 w-3" /> cuenta protegida
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Registrado el {formatEventDate(u.createdAt.slice(0, 10))}
            </p>
          </div>
        </div>

        {/* ── Datos del perfil ─────────────────────────────────────── */}
        <section className="space-y-2 border border-border p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider">Perfil</h3>
          <Dato icon={<Mail className="h-3.5 w-3.5" />}>{u.email}</Dato>
          <Dato icon={<Phone className="h-3.5 w-3.5" />}>
            {u.phone ? (
              <a href={`tel:${u.phone}`} className="underline underline-offset-2">
                {formatPhoneDisplay(u.phone)}
              </a>
            ) : (
              <span className="text-charrua">Sin teléfono cargado</span>
            )}
          </Dato>
          <Dato icon={<MapPin className="h-3.5 w-3.5" />}>
            {[u.state, pais ? `${pais.flag} ${pais.name}` : u.country]
              .filter(Boolean)
              .join(" · ") || "Sin ubicación"}
          </Dato>
          <Dato icon={<Cake className="h-3.5 w-3.5" />}>
            {formatEventDate(u.birthDate)}
            {x.edad !== null && ` · ${x.edad} años`}
            {x.diasCumple !== null &&
              ` · ${x.diasCumple === 0 ? "cumple hoy" : `cumple en ${x.diasCumple} días`}`}
          </Dato>
          <Dato icon={<span className="text-[10px] font-bold">CI</span>}>{u.documentId}</Dato>
        </section>

        {/* ── Compras ──────────────────────────────────────────────── */}
        <section className="space-y-2 border border-border p-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <ShoppingBag className="h-3.5 w-3.5" /> Compras
          </h3>
          {x.compras.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todavía no tiene ninguna entrega cargada a su nombre.
            </p>
          ) : (
            <>
              <p className="text-sm">
                <b>{plata(x.gastado)}</b>{" "}
                <span className="text-muted-foreground">
                  en {x.entradas} entradas · {x.compras.length} compras
                </span>
              </p>
              <ul className="space-y-1">
                {[...x.compras]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-border/50 pt-1 text-xs"
                    >
                      <span className="font-medium">
                        {eventoPorId.get(d.eventId) ?? "Evento eliminado"}
                      </span>
                      <span className="text-muted-foreground">
                        {d.quantity} × · {plata(d.value)} ·{" "}
                        {d.status === "sent" ? "enviada" : "pendiente"}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Promo de cumpleaños ──────────────────────────────────── */}
        <section className="space-y-2 border border-border p-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <Gift className="h-3.5 w-3.5" /> Promo de cumpleaños
          </h3>
          {!x.cumple ? (
            <p className="text-xs text-muted-foreground">Nunca la pidió.</p>
          ) : (
            <div className="space-y-1 text-xs">
              <p>
                Última solicitud del {formatEventDate(x.cumple.createdAt.slice(0, 10))} ·{" "}
                <b>{x.cumple.status === "pendiente" ? "A revisar" : "Aprobada"}</b>
              </p>
              <p className="text-muted-foreground">
                {x.cumple.giftGiven
                  ? `Regalo entregado${
                      x.cumple.giftGivenAt
                        ? ` el ${formatEventDate(x.cumple.giftGivenAt.slice(0, 10))}`
                        : ""
                    }`
                  : "Regalo todavía no entregado"}
                {x.cumple.eventId &&
                  ` · ${eventoPorId.get(x.cumple.eventId) ?? "evento eliminado"}`}
              </p>
              {/* La foto del documento NO se muestra acá a propósito: vive en un
                  bucket privado y se abre sólo desde la pestaña Cumpleaños, con
                  una URL firmada de 5 minutos (v12). */}
            </div>
          )}
        </section>

        {/* ── Rol ──────────────────────────────────────────────────── */}
        {puedeEditar && !bloqueado && (
          <section className="space-y-2 border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider">Rol</h3>
            <select
              value={u.role}
              onChange={(e) => onRol(u, e.target.value as UserRole)}
              className="h-11 w-full border border-border bg-background px-2 text-base sm:text-sm"
            >
              <option value="user">user · sólo el sitio público</option>
              <option value="operador">operador · panel sin cuentas, usuarios ni borrados</option>
              <option value="cumples">cumples · sólo la pestaña Cumpleaños</option>
            </select>
          </section>
        )}
      </div>
    </ModalAdmin>
  );
};

export default UsersAdmin;
