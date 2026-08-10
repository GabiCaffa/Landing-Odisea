import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Search,
  ShieldCheck,
  TrendingUp,
  Ticket,
  UserPlus,
  X,
  Upload,
  ExternalLink,
  Image as ImageIcon,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crop,
  Move,
  Lock,
  Send,
  Mail,
  CheckCircle2,
  Undo2,
  Calendar,
  Download,
  DollarSign,
  MapPin,
  Cake,
  Gift,
  Eye,
  CreditCard,
  Star,
} from "lucide-react";
import odiseaLogo from "@/assets/odisea-logo-black.png";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useConfirm } from "@/components/ConfirmDialog";
import LoadingScreen from "@/components/LoadingScreen";
import {
  useAuth,
  AdminEvent,
  User,
  ImageTransform,
  DEFAULT_IMAGE_TRANSFORM,
  formatEventDate,
  isOfficialAdmin,
  isStaffRole,
} from "@/contexts/AuthContext";
import PhoneInput from "@/components/PhoneInput";
import LocationSelect from "@/components/LocationSelect";
import UserSearchSelect from "@/components/UserSearchSelect";
import {
  normalizePhone,
  formatPhoneDisplay,
  validateDocumentByCountry,
  documentLabelByCountry,
  documentPlaceholderByCountry,
  formatUruguayCedula,
  calcAge as ageFromBirthDate,
} from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import {
  TicketDelivery,
  DeliveryInput,
  fetchDeliveries,
  createDelivery,
  updateDelivery,
  deleteDelivery,
  setDeliveryStatus,
} from "@/lib/deliveries";
import {
  BirthdaySignup,
  BirthdayInput,
  fetchBirthdays,
  createBirthday,
  updateBirthday,
  deleteBirthday,
  setGiftGiven,
  setBirthdayStatus,
  uploadIdPhoto,
  removeIdPhoto,
  getIdPhotoUrl,
} from "@/lib/birthdays";
import {
  PaymentAccount,
  PaymentAccountInput,
  fetchPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  setDefaultAccount,
  accountSummary,
} from "@/lib/paymentAccounts";
import {
  TicketType,
  TicketTypeInput,
  EventTicket,
  fetchTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  saveEventTickets,
  sortEventTickets,
} from "@/lib/ticketTypes";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type Tab =
  | "dashboard"
  | "events"
  | "tickets"
  | "accounts"
  | "users"
  | "deliveries"
  | "birthdays";

/** Pestañas que puede usar el operador (el resto es sólo del admin). */
const OPERATOR_TABS: Tab[] = ["deliveries", "birthdays"];

const Admin = () => {
  const { currentUser, logout, users, events, loading } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (loading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!isStaffRole(currentUser.role)) return <Navigate to="/" replace />;

  // El operador sólo ve Entregas y Cumpleaños: cualquier otra pestaña cae en Entregas.
  const isOperator = currentUser.role === "operador";
  const activeTab: Tab = isOperator && !OPERATOR_TABS.includes(tab) ? "deliveries" : tab;

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Cerrar sesión",
      description: "¿Querés cerrar tu sesión de administrador?",
      confirmText: "Cerrar sesión",
    });
    if (!ok) return;
    await logout();
    toast.success("Sesión cerrada");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-secondary/20 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-foreground text-background md:min-h-screen flex md:flex-col">
        <div className="p-6 border-b border-background/10 flex items-center gap-3 md:block">
          <img
            src={odiseaLogo}
            alt="Odísea"
            className="h-8 md:h-10 w-auto object-contain invert"
          />
          <p className="hidden md:block text-xs tracking-[0.3em] uppercase text-background/60 mt-3">
            Panel Admin
          </p>
        </div>

        <nav className="flex md:flex-col md:flex-1 p-3 md:p-4 gap-1 overflow-x-auto md:overflow-visible">
          {!isOperator && (
            <>
              <SidebarLink
                icon={<LayoutDashboard className="w-4 h-4" />}
                label="Dashboard"
                active={activeTab === "dashboard"}
                onClick={() => setTab("dashboard")}
              />
              <SidebarLink
                icon={<CalendarDays className="w-4 h-4" />}
                label="Eventos"
                active={activeTab === "events"}
                onClick={() => setTab("events")}
              />
              <SidebarLink
                icon={<Ticket className="w-4 h-4" />}
                label="Entradas"
                active={activeTab === "tickets"}
                onClick={() => setTab("tickets")}
              />
              <SidebarLink
                icon={<CreditCard className="w-4 h-4" />}
                label="Cuentas"
                active={activeTab === "accounts"}
                onClick={() => setTab("accounts")}
              />
              <SidebarLink
                icon={<Users className="w-4 h-4" />}
                label="Usuarios"
                active={activeTab === "users"}
                onClick={() => setTab("users")}
              />
            </>
          )}
          <SidebarLink
            icon={<Send className="w-4 h-4" />}
            label="Entregas"
            active={activeTab === "deliveries"}
            onClick={() => setTab("deliveries")}
          />
          <SidebarLink
            icon={<Cake className="w-4 h-4" />}
            label="Cumpleaños"
            active={activeTab === "birthdays"}
            onClick={() => setTab("birthdays")}
          />

          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 text-sm tracking-wide uppercase transition-colors whitespace-nowrap text-background/70 hover:text-background hover:bg-background/10 md:mt-auto"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Ver sitio</span>
          </Link>
        </nav>

        <div className="hidden md:block p-4 border-t border-background/10">
          <p className="text-xs text-background/60 mb-1">Conectado como</p>
          <p className="text-sm font-semibold truncate">{currentUser.firstName} {currentUser.lastName}</p>
          <p className="text-xs text-background/60 truncate mb-3">{currentUser.email}</p>
          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 border border-background/30 hover:bg-background hover:text-foreground transition-colors px-3 py-2 text-xs tracking-wide uppercase"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 md:p-8 max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
              {activeTab === "dashboard" && "Resumen general"}
              {activeTab === "events" && "Gestión"}
              {activeTab === "tickets" && "Tipos de entrada"}
              {activeTab === "accounts" && "Cobros"}
              {activeTab === "users" && "Comunidad"}
              {activeTab === "deliveries" && "Envío de entradas"}
              {activeTab === "birthdays" && "Promo cumpleaños"}
            </p>
            <h1 className="title-sport text-3xl md:text-4xl tracking-wide font-black text-tinta">
              {activeTab === "dashboard" && "DASHBOARD"}
              {activeTab === "events" && "EVENTOS"}
              {activeTab === "tickets" && "ENTRADAS"}
              {activeTab === "accounts" && "CUENTAS"}
              {activeTab === "users" && "USUARIOS"}
              {activeTab === "deliveries" && "ENTREGAS"}
              {activeTab === "birthdays" && "CUMPLEAÑOS"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden md:inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-3 py-2 hover:bg-foreground hover:text-background transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver sitio
            </Link>
            <button
              onClick={handleLogout}
              className="md:hidden p-2 border border-border"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === "dashboard" && <Dashboard users={users} events={events} onGo={setTab} />}
        {activeTab === "events" && <EventsAdmin />}
        {activeTab === "tickets" && <TicketTypesAdmin />}
        {activeTab === "accounts" && <AccountsAdmin />}
        {activeTab === "users" && <UsersAdmin />}
        {activeTab === "deliveries" && <DeliveriesAdmin />}
        {activeTab === "birthdays" && <BirthdaysAdmin />}
      </main>
    </div>
  );
};

const SidebarLink = ({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 text-sm tracking-wide uppercase transition-colors whitespace-nowrap ${
      active
        ? "bg-background text-foreground"
        : "text-background/70 hover:text-background hover:bg-background/10"
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ────────────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────────────
const Dashboard = ({
  users,
  events,
  onGo,
}: {
  users: User[];
  events: AdminEvent[];
  onGo: (t: Tab) => void;
}) => {
  const activeEvents = events.filter((e) => e.status === "activo").length;
  const totalCapacity = events.reduce((acc, e) => acc + e.capacity, 0);
  // El evento ya no tiene precio propio: e.price es el tipo de entrada más
  // barato (lo deriva la DB), así que esto es el promedio de esos mínimos.
  const avgEntryPrice = events.length
    ? Math.round(events.reduce((acc, e) => acc + e.price, 0) / events.length)
    : 0;
  const newThisMonth = users.filter((u) => {
    const created = new Date(u.createdAt);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Usuarios"
          value={users.length}
          hint={`${newThisMonth} este mes`}
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Eventos activos"
          value={activeEvents}
          hint={`${events.length} totales`}
        />
        <StatCard
          icon={<Ticket className="w-5 h-5" />}
          label="Capacidad total"
          value={totalCapacity.toLocaleString()}
          hint="entradas disponibles"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Entrada más barata"
          value={`$${avgEntryPrice}`}
          hint="promedio entre eventos"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="title-sport text-2xl font-black tracking-wide">PRÓXIMOS EVENTOS</h3>
            <button
              onClick={() => onGo("events")}
              className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground"
            >
              Ver todos →
            </button>
          </div>
          <ul className="space-y-3">
            {events.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 border border-border flex-shrink-0 overflow-hidden bg-white">
                    <img
                      src={e.image}
                      alt={e.name}
                      className="w-full h-full"
                      style={{
                        objectFit: e.imagePosition.fit,
                        objectPosition: `${e.imagePosition.x}% ${e.imagePosition.y}%`,
                        transform: `scale(${e.imagePosition.scale})`,
                        transformOrigin: `${e.imagePosition.x}% ${e.imagePosition.y}%`,
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{formatEventDate(e.date)} · {e.location}</p>
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-sm text-muted-foreground">Sin eventos cargados</li>
            )}
          </ul>
        </div>

        <div className="bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="title-sport text-2xl font-black tracking-wide">ÚLTIMOS USUARIOS</h3>
            <button
              onClick={() => onGo("users")}
              className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground"
            >
              Ver todos →
            </button>
          </div>
          <ul className="space-y-3">
            {[...users]
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .slice(0, 4)
              .map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  {u.role === "admin" && (
                    <span className="inline-flex items-center gap-1 text-xs tracking-wider uppercase border border-foreground px-2 py-0.5">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <div className="bg-card border border-border p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">{icon}</span>
    </div>
    <p className="title-sport text-3xl md:text-4xl font-black tracking-wide leading-none">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
  </div>
);

const StatusBadge = ({ status }: { status: AdminEvent["status"] }) => {
  const styles = {
    activo: "border-foreground text-foreground",
    agotado: "border-destructive text-destructive",
    finalizado: "border-muted-foreground text-muted-foreground",
  } as const;
  return (
    <span
      className={`inline-flex text-xs tracking-wider uppercase border px-2 py-0.5 ${styles[status]}`}
    >
      {status}
    </span>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Events admin
// ────────────────────────────────────────────────────────────────────────────
const EventsAdmin = () => {
  const { events, createEvent, updateEvent, deleteEvent } = useAuth();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  // Cuentas de cobro: para el selector del form y la columna "Cuenta".
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  // Catálogo de tipos de entrada, para armar las entradas de cada evento.
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  useEffect(() => {
    fetchPaymentAccounts().then(setAccounts);
    fetchTicketTypes().then(setTicketTypes);
  }, []);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.location.toLowerCase().includes(search.toLowerCase())
      ),
    [events, search]
  );

  const handleSave = async (data: Omit<AdminEvent, "id" | "createdAt">) => {
    let eventId: string | undefined;
    if (editing) {
      const result = await updateEvent(editing.id, data);
      if (!result.ok) {
        toast.error(result.error ?? "No se pudo guardar el evento");
        return;
      }
      eventId = editing.id;
    } else {
      const result = await createEvent(data);
      if (!result.ok) {
        toast.error(result.error ?? "No se pudo guardar el evento");
        return;
      }
      eventId = result.id;
    }

    // Las entradas van en su propia tabla, así que se guardan aparte. Si esto
    // falla el evento igual quedó guardado: avisamos para que se reintente
    // editándolo, en vez de dar por buena una fecha sin nada que vender.
    if (eventId) {
      const ticketsResult = await saveEventTickets(eventId, data.tickets);
      if (!ticketsResult.ok) {
        toast.error(
          `Evento guardado, pero las entradas no: ${ticketsResult.error ?? "error desconocido"}`
        );
        return;
      }
    }

    toast.success(editing ? "Evento actualizado" : "Evento creado");
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (e: AdminEvent) => {
    const ok = await confirm({
      title: "Eliminar evento",
      description: `¿Seguro que querés eliminar el evento "${e.name}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteEvent(e.id);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Evento eliminado");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="input-techno pl-10"
          />
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-techno text-xs py-3 px-5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo evento
        </button>
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-secondary/50 border-b border-border text-left">
              <Th>Imagen</Th>
              <Th>Evento</Th>
              <Th>Fecha</Th>
              <Th>Lugar</Th>
              <Th>Entradas</Th>
              <Th>Cuenta</Th>
              <Th>Capacidad</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/30">
                <Td>
                  <div className="w-14 h-14 border border-border overflow-hidden bg-white">
                    <img
                      src={e.image}
                      alt={e.name}
                      className="w-full h-full"
                      style={{
                        objectFit: e.imagePosition.fit,
                        objectPosition: `${e.imagePosition.x}% ${e.imagePosition.y}%`,
                        transform: `scale(${e.imagePosition.scale})`,
                        transformOrigin: `${e.imagePosition.x}% ${e.imagePosition.y}%`,
                      }}
                    />
                  </div>
                </Td>
                <Td>
                  <div>
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{e.description}</p>
                  </div>
                </Td>
                <Td>{formatEventDate(e.date)}</Td>
                <Td>{e.location}</Td>
                <Td>
                  {e.tickets.length === 0 ? (
                    <span className="text-xs text-charrua">Sin entradas</span>
                  ) : (
                    <div className="space-y-0.5">
                      {e.tickets.map((t) => (
                        <p
                          key={t.ticketTypeId}
                          className={`text-xs ${t.active ? "" : "text-muted-foreground line-through"}`}
                        >
                          {t.name} <span className="text-muted-foreground">${t.price}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </Td>
                <Td>
                  {accountById.has(e.paymentAccountId) ? (
                    <div>
                      <p className="text-xs font-medium">
                        {accountById.get(e.paymentAccountId)!.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {accountSummary(accountById.get(e.paymentAccountId)!)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td>{e.capacity}</Td>
                <Td><StatusBadge status={e.status} /></Td>
                <Td>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(e);
                        setShowForm(true);
                      }}
                      className="p-2 hover:bg-foreground hover:text-background transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  Sin eventos para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <EventFormModal
          initial={editing}
          accounts={accounts}
          ticketTypes={ticketTypes}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Tipos de entrada (ABM) — el catálogo; el precio se pone en cada evento
// ────────────────────────────────────────────────────────────────────────────
const TicketTypesAdmin = () => {
  const confirm = useConfirm();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    setLoading(true);
    setTypes(await fetchTicketTypes());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSave = async (data: TicketTypeInput) => {
    const result = editing
      ? await updateTicketType(editing.id, data)
      : await createTicketType(data);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar el tipo de entrada");
      return;
    }
    toast.success(editing ? "Tipo actualizado" : "Tipo creado");
    setShowForm(false);
    setEditing(null);
    reload();
  };

  const handleToggleActive = async (t: TicketType) => {
    const result = await updateTicketType(t.id, { active: !t.active });
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo cambiar el estado");
      return;
    }
    toast.success(t.active ? "Tipo desactivado" : "Tipo activado");
    reload();
  };

  const handleDelete = async (t: TicketType) => {
    const ok = await confirm({
      title: "Eliminar tipo de entrada",
      description: `¿Seguro que querés eliminar "${t.name}"? Si algún evento lo vende, no se va a poder borrar: desactivalo en ese caso.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteTicketType(t.id);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Tipo eliminado");
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground max-w-xl">
          Los tipos de entrada que existen (General, VIP, Backstage…). El{" "}
          <strong>precio no va acá</strong>: se define en cada evento, porque el mismo tipo
          vale distinto según la fecha.
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-techno text-xs py-3 px-5 self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nuevo tipo
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Cargando tipos...</p>
      ) : types.length === 0 ? (
        <div className="bg-card border border-border py-12 text-center">
          <Ticket className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay tipos de entrada. Creá al menos uno para poder vender.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {types.map((t) => (
            <div
              key={t.id}
              className={`bg-card border p-4 space-y-3 ${
                t.active ? "border-border" : "border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{t.name}</p>
                    {!t.active && (
                      <span className="text-[10px] tracking-wider uppercase border border-border px-1.5 py-0.5 text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">Orden: {t.sortOrder}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditing(t);
                      setShowForm(true);
                    }}
                    className="p-2 hover:bg-foreground hover:text-background transition-colors"
                    aria-label="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => handleToggleActive(t)}
                className="inline-flex items-center gap-1.5 text-[11px] tracking-wider uppercase border border-border px-2.5 py-1.5 hover:bg-foreground hover:text-background transition-colors"
              >
                {t.active ? <Undo2 className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {t.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TicketTypeFormModal
          initial={editing}
          nextOrder={types.length + 1}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

const TicketTypeFormModal = ({
  initial,
  nextOrder,
  onClose,
  onSave,
}: {
  initial: TicketType | null;
  nextOrder: number;
  onClose: () => void;
  onSave: (data: TicketTypeInput) => void | Promise<void>;
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TicketTypeInput>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    sortOrder: initial?.sortOrder ?? nextOrder,
    active: initial?.active ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Indicá el nombre del tipo de entrada");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-background border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="title-sport text-2xl font-black tracking-wide">
            {initial ? "EDITAR TIPO" : "NUEVO TIPO"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <FormField label="Nombre">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-techno"
              placeholder="VIP"
            />
          </FormField>

          <FormField label="Qué incluye (opcional)">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-techno min-h-[70px]"
              placeholder="Acceso general + backstage y meet & greet"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se le muestra al comprador debajo del nombre, en el modal de compra.
            </p>
          </FormField>

          <FormField label="Orden">
            <input
              type="number"
              min={0}
              value={form.sortOrder ?? 0}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="input-techno"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              De menor a mayor: define en qué orden se listan las entradas.
            </p>
          </FormField>

          <label className="flex items-center gap-2 text-sm cursor-pointer border-t border-border pt-4">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="accent-foreground"
            />
            Activo (se ofrece al armar un evento)
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-techno-outline flex-1" disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-techno flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear tipo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Cuentas de cobro (ABM) — a qué cuenta transfiere la gente en cada evento
// ────────────────────────────────────────────────────────────────────────────
const AccountsAdmin = () => {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    setLoading(true);
    setAccounts(await fetchPaymentAccounts());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSave = async (data: PaymentAccountInput) => {
    const result = editing
      ? await updatePaymentAccount(editing.id, data)
      : await createPaymentAccount(data);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar la cuenta");
      return;
    }
    toast.success(editing ? "Cuenta actualizada" : "Cuenta creada");
    setShowForm(false);
    setEditing(null);
    reload();
  };

  const handleToggleActive = async (a: PaymentAccount) => {
    if (a.isDefault && a.active) {
      toast.error("No podés desactivar la cuenta por defecto. Marcá otra primero.");
      return;
    }
    const result = await updatePaymentAccount(a.id, { active: !a.active });
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo cambiar el estado");
      return;
    }
    toast.success(a.active ? "Cuenta desactivada" : "Cuenta activada");
    reload();
  };

  const handleSetDefault = async (a: PaymentAccount) => {
    const result = await setDefaultAccount(a.id);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo marcar por defecto");
      return;
    }
    toast.success(`"${a.label}" queda como cuenta por defecto`);
    reload();
  };

  const handleDelete = async (a: PaymentAccount) => {
    const ok = await confirm({
      title: "Eliminar cuenta",
      description: `¿Seguro que querés eliminar "${a.label}"? Si algún evento la usa, no se va a poder borrar: desactivala en ese caso.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deletePaymentAccount(a.id);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Cuenta eliminada");
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground max-w-xl">
          Cuentas a las que la gente transfiere. Cada evento usa una: es la que se muestra
          en el modal de compra y se copia al mensaje de WhatsApp.
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-techno text-xs py-3 px-5 self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nueva cuenta
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Cargando cuentas...</p>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-border py-12 text-center">
          <CreditCard className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay cuentas cargadas. Creá la primera para poder publicar eventos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`bg-card border p-4 space-y-3 ${
                a.active ? "border-border" : "border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{a.label}</p>
                    {a.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase border border-foreground px-1.5 py-0.5">
                        <Star className="w-3 h-3" /> Por defecto
                      </span>
                    )}
                    {!a.active && (
                      <span className="text-[10px] tracking-wider uppercase border border-border px-1.5 py-0.5 text-muted-foreground">
                        Inactiva
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{accountSummary(a)}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditing(a);
                      setShowForm(true);
                    }}
                    className="p-2 hover:bg-foreground hover:text-background transition-colors"
                    aria-label="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="text-sm space-y-0.5 border-t border-border/50 pt-3">
                <p className="font-medium">{a.holderName}</p>
                <p className="text-muted-foreground">Nro de cuenta {a.accountNumber}</p>
                {a.accountType && <p className="text-muted-foreground">{a.accountType}</p>}
                {a.documentId && (
                  <p className="text-muted-foreground">Documento {a.documentId}</p>
                )}
                {a.notes && <p className="text-muted-foreground pt-1">{a.notes}</p>}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {!a.isDefault && (
                  <button
                    onClick={() => handleSetDefault(a)}
                    className="inline-flex items-center gap-1.5 text-[11px] tracking-wider uppercase border border-border px-2.5 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                  >
                    <Star className="w-3 h-3" /> Marcar por defecto
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(a)}
                  className="inline-flex items-center gap-1.5 text-[11px] tracking-wider uppercase border border-border px-2.5 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                >
                  {a.active ? <Undo2 className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  {a.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AccountFormModal
          initial={editing}
          isFirst={accounts.length === 0}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

const AccountFormModal = ({
  initial,
  isFirst,
  onClose,
  onSave,
}: {
  initial: PaymentAccount | null;
  /** La primera cuenta del sistema arranca marcada por defecto. */
  isFirst: boolean;
  onClose: () => void;
  onSave: (data: PaymentAccountInput) => void | Promise<void>;
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentAccountInput>({
    label: initial?.label ?? "",
    holderName: initial?.holderName ?? "",
    bank: initial?.bank ?? "",
    accountType: initial?.accountType ?? "",
    accountNumber: initial?.accountNumber ?? "",
    documentId: initial?.documentId ?? "",
    notes: initial?.notes ?? "",
    active: initial?.active ?? true,
    isDefault: initial?.isDefault ?? isFirst,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim() || !form.holderName.trim() || !form.bank.trim() || !form.accountNumber.trim()) {
      toast.error("Completá nombre, titular, banco y número de cuenta");
      return;
    }
    if (form.isDefault && !form.active) {
      toast.error("La cuenta por defecto no puede estar inactiva");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        label: form.label.trim(),
        holderName: form.holderName.trim(),
        bank: form.bank.trim(),
        accountNumber: form.accountNumber.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-background border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="title-sport text-2xl font-black tracking-wide">
            {initial ? "EDITAR CUENTA" : "NUEVA CUENTA"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <FormField label="Nombre interno">
            <input
              type="text"
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="input-techno"
              placeholder="Itaú Gabriel"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sólo lo ves vos en el panel, para reconocer la cuenta.
            </p>
          </FormField>

          <FormField label="Titular">
            <input
              type="text"
              required
              value={form.holderName}
              onChange={(e) => setForm({ ...form, holderName: e.target.value })}
              className="input-techno"
              placeholder="GABRIEL CAFFAREL DALMAU"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Banco">
              <input
                type="text"
                required
                value={form.bank}
                onChange={(e) => setForm({ ...form, bank: e.target.value })}
                className="input-techno"
                placeholder="ITAÚ"
              />
            </FormField>
            <FormField label="Nro de cuenta">
              <input
                type="text"
                required
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                className="input-techno"
                placeholder="3483509"
              />
            </FormField>
          </div>

          <FormField label="Tipo de cuenta (opcional)">
            <input
              type="text"
              value={form.accountType ?? ""}
              onChange={(e) => setForm({ ...form, accountType: e.target.value })}
              className="input-techno"
              placeholder="CAJA DE AHORRO PESOS (UYU)"
            />
          </FormField>

          <FormField label="Documento del titular (opcional)">
            <input
              type="text"
              value={form.documentId ?? ""}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
              className="input-techno"
              placeholder="1.234.567-8"
            />
          </FormField>

          <FormField label="Nota para el comprador (opcional)">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-techno min-h-[70px]"
              placeholder="Ej: poner el nombre del evento en el concepto"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se muestra debajo de los datos en el modal de compra.
            </p>
          </FormField>

          <div className="space-y-2 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault ?? false}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="accent-foreground"
              />
              Cuenta por defecto (se propone al crear un evento)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="accent-foreground"
              />
              Activa (se ofrece al crear eventos)
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-techno-outline flex-1" disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-techno flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Event form modal with image upload, positioning & live preview
// ────────────────────────────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.1;

const EventFormModal = ({
  initial,
  accounts,
  ticketTypes,
  onClose,
  onSave,
}: {
  initial: AdminEvent | null;
  /** Cuentas de cobro disponibles (las carga EventsAdmin una sola vez). */
  accounts: PaymentAccount[];
  /** Catálogo de tipos de entrada, para elegir cuáles vende este evento. */
  ticketTypes: TicketType[];
  onClose: () => void;
  onSave: (data: Omit<AdminEvent, "id" | "createdAt">) => void | Promise<void>;
}) => {
  const { uploadEventImage } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // ISO (UTC) → valor para <input type="datetime-local"> en hora local
  const isoToLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [form, setForm] = useState<Omit<AdminEvent, "id" | "createdAt">>({
    name: initial?.name ?? "",
    date: initial?.date ?? "",
    location: initial?.location ?? "",
    description: initial?.description ?? "",
    price: initial?.price ?? 0,
    capacity: initial?.capacity ?? 0,
    status: initial?.status ?? "activo",
    saleEndsAt: isoToLocalInput(initial?.saleEndsAt),
    // Al crear, se propone la cuenta marcada por defecto.
    paymentAccountId:
      initial?.paymentAccountId ?? accounts.find((a) => a.isDefault)?.id ?? "",
    tickets: initial?.tickets ?? [],
    image: initial?.image ?? "",
    imagePosition: initial?.imagePosition ?? { ...DEFAULT_IMAGE_TRANSFORM },
    instagramUrl: initial?.instagramUrl ?? "https://www.instagram.com/odisea.uy/",
  });

  // Sólo se ofrecen cuentas activas, pero si el evento ya usaba una que se
  // desactivó la seguimos mostrando: si no, al guardar se perdería sin aviso.
  const accountOptions = useMemo(
    () => accounts.filter((a) => a.active || a.id === form.paymentAccountId),
    [accounts, form.paymentAccountId]
  );

  // El "desde $X" del preview: el tipo de entrada más barato a la venta. Es lo
  // mismo que la DB va a dejar en events.price al guardar.
  const minTicketPrice = useMemo(() => {
    const active = form.tickets.filter((t) => t.active);
    return active.length ? Math.min(...active.map((t) => t.price)) : 0;
  }, [form.tickets]);

  const setImagePosition = (updater: (p: ImageTransform) => ImageTransform) =>
    setForm((prev) => ({ ...prev, imagePosition: updater(prev.imagePosition) }));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen es muy grande (máx 10MB)");
      return;
    }
    setUploading(true);
    const result = await uploadEventImage(file);
    setUploading(false);
    if (!result.ok || !result.url) {
      toast.error(result.error ?? "No se pudo subir la imagen");
      return;
    }
    setForm((prev) => ({
      ...prev,
      image: result.url!,
      imagePosition: { ...DEFAULT_IMAGE_TRANSFORM },
    }));
    toast.success("Imagen subida");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.location) {
      toast.error("Completá nombre, fecha y lugar");
      return;
    }
    if (!form.image) {
      toast.error("Subí una imagen para el evento");
      return;
    }
    if (!form.paymentAccountId) {
      toast.error("Elegí a qué cuenta se cobra este evento");
      return;
    }
    if (form.tickets.length === 0) {
      toast.error("Agregá al menos un tipo de entrada");
      return;
    }
    if (form.tickets.some((t) => !(t.price > 0))) {
      toast.error("Poné el precio de cada tipo de entrada");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        // datetime-local (hora local) → ISO UTC; vacío → "" (se guarda null)
        saleEndsAt: form.saleEndsAt ? new Date(form.saleEndsAt).toISOString() : "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl bg-background border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="title-sport text-2xl font-black tracking-wide">
            {initial ? "EDITAR EVENTO" : "NUEVO EVENTO"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          {/* Form fields */}
          <div className="space-y-4 order-2 lg:order-1">
            <FormField label="Imagen del evento">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border p-4 space-y-3"
              >
                {form.image ? (
                  <ImageEditorControls
                    transform={form.imagePosition}
                    setTransform={setImagePosition}
                    onChangeImage={() => fileInputRef.current?.click()}
                    uploading={uploading}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-10 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="w-8 h-8" />
                    <span className="text-sm tracking-wide uppercase">
                      {uploading ? "Procesando imagen..." : "Subir imagen"}
                    </span>
                    <span className="text-xs">o arrastrá un archivo acá</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
              </div>
            </FormField>

            <FormField label="Nombre">
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-techno"
                placeholder="ODISEA CIUDAD"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Fecha">
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input-techno"
                />
              </FormField>
              <FormField label="Lugar">
                <input
                  type="text"
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="input-techno"
                  placeholder="Club..."
                />
              </FormField>
            </div>

            <FormField label="Descripción">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-techno min-h-[80px]"
                placeholder="Detalles del evento..."
              />
            </FormField>

            <FormField label="Entradas a la venta">
              <TicketsEditor
                catalog={ticketTypes}
                value={form.tickets}
                onChange={(tickets) => setForm((p) => ({ ...p, tickets }))}
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Capacidad">
                <input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="input-techno"
                />
              </FormField>
              <FormField label="Estado">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AdminEvent["status"] })}
                  className="input-techno"
                >
                  <option value="activo">Activo</option>
                  <option value="agotado">Agotado</option>
                  <option value="finalizado">Finalizado</option>
                </select>
              </FormField>
            </div>

            <FormField label="Cuenta de cobro">
              <select
                required
                value={form.paymentAccountId}
                onChange={(e) => setForm({ ...form, paymentAccountId: e.target.value })}
                className="input-techno"
              >
                <option value="">Elegí una cuenta...</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {accountSummary(a)}
                    {a.active ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {accountOptions.length === 0
                  ? "No hay cuentas cargadas. Creá una en la pestaña Cuentas."
                  : "Es la cuenta que ve el comprador en el modal de compra y en el mensaje de WhatsApp."}
              </p>
            </FormField>

            <FormField label="Cierre de venta (opcional)">
              <input
                type="datetime-local"
                value={form.saleEndsAt ?? ""}
                onChange={(e) => setForm({ ...form, saleEndsAt: e.target.value })}
                className="input-techno"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Pasada esta fecha y hora, el card se muestra “Agotado” y se deshabilita la compra automáticamente.
              </p>
            </FormField>

            <FormField label="Instagram (opcional)">
              <input
                type="url"
                value={form.instagramUrl ?? ""}
                onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                className="input-techno"
                placeholder="https://instagram.com/..."
              />
            </FormField>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-techno-outline flex-1" disabled={saving}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="btn-techno flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear evento"}
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-24 self-start space-y-3">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground text-center">
              Vista previa del card
            </p>
            <EventCardPreview
              image={form.image}
              imagePosition={form.imagePosition}
              setImagePosition={setImagePosition}
              name={form.name || "NOMBRE DEL EVENTO"}
              date={form.date ? formatEventDate(form.date) : "FECHA"}
              location={form.location || "Lugar del evento"}
              description={form.description || "Descripción del evento..."}
              price={minTicketPrice}
              status={form.status}
            />
            <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
              Arrastrá la imagen para reposicionarla · rueda del mouse para zoom
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Elegir qué tipos vende el evento y a qué precio. El precio vive acá y no en
 * el catálogo porque el mismo "VIP" vale distinto en cada fecha.
 */
const TicketsEditor = ({
  catalog,
  value,
  onChange,
}: {
  catalog: TicketType[];
  value: EventTicket[];
  onChange: (tickets: EventTicket[]) => void;
}) => {
  const selected = useMemo(
    () => new Map(value.map((t) => [t.ticketTypeId, t])),
    [value]
  );

  // Se ofrecen los tipos activos; los inactivos sólo si el evento ya los vendía
  // (si no, al editar un evento viejo se le borraría una entrada sin avisar).
  const options = useMemo(
    () => catalog.filter((t) => t.active || selected.has(t.id)),
    [catalog, selected]
  );

  const toggle = (type: TicketType) => {
    if (selected.has(type.id)) {
      onChange(value.filter((t) => t.ticketTypeId !== type.id));
      return;
    }
    onChange(
      sortEventTickets([
        ...value,
        {
          ticketTypeId: type.id,
          name: type.name,
          description: type.description,
          price: 0,
          active: true,
          sortOrder: type.sortOrder,
        },
      ])
    );
  };

  const setPrice = (typeId: string, price: number) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, price } : t)));

  const setActive = (typeId: string, active: boolean) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, active } : t)));

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground border border-dashed border-border p-4">
        No hay tipos de entrada cargados. Creá al menos uno en la pestaña{" "}
        <strong>Entradas</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((type) => {
        const row = selected.get(type.id);
        return (
          <div
            key={type.id}
            className={`border p-3 ${row ? "border-foreground" : "border-border"}`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!row}
                onChange={() => toggle(type)}
                className="accent-foreground flex-shrink-0"
                aria-label={`Vender ${type.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {type.name}
                  {!type.active && (
                    <span className="ml-2 text-[10px] tracking-wider uppercase text-muted-foreground">
                      (tipo inactivo)
                    </span>
                  )}
                </p>
                {type.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {type.description}
                  </p>
                )}
              </div>
              {row && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    value={row.price || ""}
                    onChange={(e) => setPrice(type.id, Number(e.target.value))}
                    className="input-techno w-24 text-right"
                    placeholder="0"
                    aria-label={`Precio de ${type.name}`}
                  />
                </div>
              )}
            </div>

            {row && (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2 ml-7 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(e) => setActive(type.id, e.target.checked)}
                  className="accent-foreground"
                />
                A la venta (destildá para ocultarla sin perder el precio)
              </label>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        El evento no tiene precio propio: el comprador elige cuántas de cada tipo y el
        total se calcula solo.
      </p>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Controles dedicados (sliders X/Y/zoom + botones)
// ────────────────────────────────────────────────────────────────────────────
const ImageEditorControls = ({
  transform,
  setTransform,
  onChangeImage,
  uploading,
}: {
  transform: ImageTransform;
  setTransform: (updater: (p: ImageTransform) => ImageTransform) => void;
  onChangeImage: () => void;
  uploading: boolean;
}) => {
  const zoomIn = () =>
    setTransform((p) => ({ ...p, scale: clamp(p.scale + SCALE_STEP, MIN_SCALE, MAX_SCALE) }));
  const zoomOut = () =>
    setTransform((p) => ({ ...p, scale: clamp(p.scale - SCALE_STEP, MIN_SCALE, MAX_SCALE) }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Move className="w-3.5 h-3.5" />
        Arrastrá sobre el preview o usá los controles
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Pos X · {Math.round(transform.x)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={transform.x}
            onChange={(e) => setTransform((p) => ({ ...p, x: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Pos Y · {Math.round(transform.y)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={transform.y}
            onChange={(e) => setTransform((p) => ({ ...p, y: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Zoom · {transform.scale.toFixed(1)}x
          </span>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={SCALE_STEP}
            value={transform.scale}
            onChange={(e) => setTransform((p) => ({ ...p, scale: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={zoomOut}
          className="p-2 border border-border hover:bg-secondary transition-colors"
          aria-label="Reducir zoom"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="p-2 border border-border hover:bg-secondary transition-colors"
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            setTransform((p) => ({ ...p, fit: p.fit === "cover" ? "contain" : "cover" }))
          }
          className={`inline-flex items-center gap-2 text-xs tracking-wider uppercase border px-3 py-2 transition-colors ${
            transform.fit === "contain"
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-secondary"
          }`}
        >
          {transform.fit === "contain" ? (
            <>
              <Maximize2 className="w-3.5 h-3.5" /> Ver entera
            </>
          ) : (
            <>
              <Crop className="w-3.5 h-3.5" /> Llenar card
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTransform(() => ({ ...DEFAULT_IMAGE_TRANSFORM }))}
          className="inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-3 py-2 hover:bg-secondary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button
          type="button"
          onClick={onChangeImage}
          disabled={uploading}
          className="ml-auto inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-3 py-2 hover:bg-foreground hover:text-background transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Cargando..." : "Cambiar"}
        </button>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Card preview interactivo (drag + wheel zoom)
// ────────────────────────────────────────────────────────────────────────────
const EventCardPreview = ({
  image,
  imagePosition,
  setImagePosition,
  name,
  date,
  location,
  description,
  price,
  status,
}: {
  image: string;
  imagePosition: ImageTransform;
  setImagePosition: (updater: (p: ImageTransform) => ImageTransform) => void;
  name: string;
  date: string;
  location: string;
  description: string;
  price: number;
  status: AdminEvent["status"];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Wheel zoom (non-passive listener so preventDefault funciona)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !image) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setImagePosition((p) => ({
        ...p,
        scale: clamp(+(p.scale + delta).toFixed(2), MIN_SCALE, MAX_SCALE),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, setImagePosition]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: imagePosition.x,
      origY: imagePosition.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    // Drag → desplaza el foco. Sensibilidad ajustada por zoom y modo de fit.
    const sensitivity = imagePosition.fit === "contain" ? 1 : Math.max(imagePosition.scale, 1);
    const newX = clamp(
      dragState.current.origX - (dx / rect.width) * 100 / sensitivity,
      0,
      100
    );
    const newY = clamp(
      dragState.current.origY - (dy / rect.height) * 100 / sensitivity,
      0,
      100
    );
    setImagePosition((p) => ({ ...p, x: newX, y: newY }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    dragState.current = null;
    setDragging(false);
  };

  return (
    <article className="card-techno overflow-hidden flex flex-col w-full max-w-[320px] mx-auto shadow-lg">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative aspect-[4/3] bg-secondary overflow-hidden select-none touch-none ${
          image ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        style={
          imagePosition.fit === "contain"
            ? { backgroundImage: "linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0" }
            : undefined
        }
      >
        {image ? (
          <img
            src={image}
            alt={name}
            draggable={false}
            className="w-full h-full pointer-events-none transition-transform duration-100"
            style={{
              objectFit: imagePosition.fit,
              objectPosition: `${imagePosition.x}% ${imagePosition.y}%`,
              transform: `scale(${imagePosition.scale})`,
              transformOrigin: `${imagePosition.x}% ${imagePosition.y}%`,
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-12 h-12" />
          </div>
        )}

        {/* Grid guide al arrastrar */}
        {dragging && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 border border-white/30" />
            <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
            <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
          </div>
        )}

        <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm px-3 py-1.5 pointer-events-none">
          <span className="text-xs tracking-wider uppercase">{date}</span>
        </div>

        {status === "agotado" && (
          <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center pointer-events-none">
            <span className="title-sport text-2xl font-black tracking-widest text-background border-2 border-background px-3 py-1 -rotate-6">
              AGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3 className="text-xl md:text-2xl tracking-wide mb-2">{name}</h3>
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm">{location}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-4 flex-1">
          {description}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="btn-techno flex-1 text-xs py-2 px-3 opacity-90 cursor-default"
          >
            <img src={whatsappLogo} alt="WhatsApp" className="w-4 h-4" />
            <span>{status === "agotado" ? "Agotado" : `Comprar · desde $${price}`}</span>
          </button>
        </div>
      </div>
    </article>
  );
};

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {label}
    </span>
    {children}
  </label>
);

// ────────────────────────────────────────────────────────────────────────────
// Users admin
// ────────────────────────────────────────────────────────────────────────────
const UsersAdmin = () => {
  const { users, deleteUser, promoteUser, currentUser } = useAuth();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const haystack = `${u.firstName} ${u.lastName} ${u.email} ${u.documentId}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [users, search]
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
    const result = await deleteUser(u.id);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Usuario eliminado");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o cédula..."
            className="input-techno pl-10"
          />
        </div>
        <div className="flex items-center gap-2 text-xs tracking-wider uppercase text-muted-foreground">
          <UserPlus className="w-4 h-4" />
          {users.length} usuarios totales
        </div>
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-secondary/50 border-b border-border text-left">
              <Th>Usuario</Th>
              <Th>Email</Th>
              <Th>Cédula</Th>
              <Th>Nacimiento</Th>
              <Th>Edad</Th>
              <Th>Rol</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const locked = isOfficialAdmin(u.email);
              return (
              <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-xs">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div>
                      <p className="font-semibold">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        Desde {formatEventDate(u.createdAt.slice(0, 10))}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td className="font-mono text-xs">{u.email}</Td>
                <Td className="font-mono text-xs">{u.documentId}</Td>
                <Td>{formatEventDate(u.birthDate)}</Td>
                <Td>{calcAge(u.birthDate)}</Td>
                <Td>
                  {locked ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground"
                      title="Admin oficial · no se puede modificar"
                    >
                      <Lock className="w-3 h-3" /> admin
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        const newRole = e.target.value as User["role"];
                        if (newRole === u.role) return;
                        const ok = await confirm({
                          title: "Cambiar rol",
                          description: `¿Cambiar el rol de ${u.firstName} ${u.lastName} a "${newRole}"?`,
                          confirmText: "Cambiar rol",
                        });
                        if (!ok) return; // el select vuelve solo a su valor al re-render
                        const result = await promoteUser(u.id, newRole);
                        if (!result.ok) {
                          toast.error(result.error ?? "No se pudo actualizar");
                          return;
                        }
                        toast.success("Rol actualizado");
                      }}
                      className="border border-border px-2 py-1 text-xs bg-background disabled:opacity-50"
                    >
                      <option value="user">user</option>
                      <option value="operador">operador</option>
                    </select>
                  )}
                </Td>
                <Td>
                  {locked ? (
                    <span
                      className="inline-flex p-2 text-muted-foreground/50 cursor-not-allowed"
                      title="La cuenta admin oficial no se puede eliminar"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDelete(u)}
                      className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </Td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  Sin usuarios para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Entregas de entradas (carga manual, agrupadas por evento)
// ────────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  `$${n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ¿La entrega matchea el término de búsqueda? (nombre, email, documento, teléfono)
const deliveryMatches = (d: TicketDelivery, term: string) => {
  if (!term) return true;
  const hay = `${d.firstName} ${d.lastName} ${d.email} ${d.documentId ?? ""} ${d.phone ?? ""}`.toLowerCase();
  return hay.includes(term);
};

// Tarjeta compacta de estadística para el resumen de Entregas.
const MiniStat = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="bg-card border border-border p-3 md:p-4">
    <div className="flex items-center gap-2 text-muted-foreground mb-1">
      {icon}
      <span className="text-[11px] tracking-wider uppercase truncate">{label}</span>
    </div>
    <p className="text-lg md:text-2xl font-black text-tinta truncate">{value}</p>
  </div>
);

// Badge para marcar que la entrega es de un cliente registrado (datos del perfil).
const RegBadge = () => (
  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-celeste-deep bg-celeste/10 border border-celeste/30 rounded-full px-1.5 py-0.5 whitespace-nowrap">
    Registrado
  </span>
);

/** Solicitud que cargó el propio cliente y todavía nadie verificó. */
const PendingBadge = () => (
  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-charrua bg-charrua/10 border border-charrua/30 rounded-full px-1.5 py-0.5 whitespace-nowrap">
    A revisar
  </span>
);

// Botonera de acciones de una entrega. Compartida por las tarjetas (mobile) y la
// tabla (desktop) para no duplicar la lógica.
const DeliveryActions = ({
  d,
  eventName,
  onSent,
  onPending,
  onEdit,
  onDelete,
}: {
  d: TicketDelivery;
  eventName: string;
  onSent: (d: TicketDelivery) => void;
  onPending: (d: TicketDelivery) => void;
  onEdit: (d: TicketDelivery) => void;
  onDelete: (d: TicketDelivery) => void;
}) => (
  <div className="flex items-center gap-1">
    {d.status === "pending" ? (
      <button
        onClick={() => onSent(d)}
        className="p-2 hover:bg-green-600 hover:text-white transition-colors"
        title="Marcar como enviada"
        aria-label="Marcar como enviada"
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>
    ) : (
      <button
        onClick={() => onPending(d)}
        className="p-2 hover:bg-secondary transition-colors"
        title="Volver a pendientes"
        aria-label="Volver a pendientes"
      >
        <Undo2 className="w-4 h-4" />
      </button>
    )}
    <a
      href={`mailto:${d.email}?subject=${encodeURIComponent(`Tus entradas · ${eventName}`)}`}
      className="p-2 hover:bg-secondary transition-colors"
      title="Escribir email a mano"
      aria-label="Escribir email a mano"
    >
      <Mail className="w-4 h-4" />
    </a>
    <button
      onClick={() => onEdit(d)}
      className="p-2 hover:bg-secondary transition-colors"
      title="Editar"
      aria-label="Editar"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button
      onClick={() => onDelete(d)}
      className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
      title="Eliminar"
      aria-label="Eliminar"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);

const DeliveriesAdmin = () => {
  const { events, users } = useAuth();
  const confirm = useConfirm();
  const [deliveries, setDeliveries] = useState<TicketDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "sent">("pending");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TicketDelivery | null>(null);

  const reload = async () => {
    const data = await fetchDeliveries();
    setDeliveries(data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("ticket-deliveries-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_deliveries" },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Los contadores de cada pestaña reflejan la búsqueda: al tipear ves cuántos
  // coinciden en "Por enviar" y en "Enviadas" al mismo tiempo.
  const term = search.trim().toLowerCase();
  const pendingCount = deliveries.filter((d) => d.status === "pending" && deliveryMatches(d, term)).length;
  const sentCount = deliveries.filter((d) => d.status === "sent" && deliveryMatches(d, term)).length;

  // Filtramos por estado + búsqueda y agrupamos por evento (ordenados por fecha).
  const groups = useMemo(() => {
    const rows = deliveries.filter(
      (d) => d.status === statusFilter && deliveryMatches(d, term)
    );
    const byEvent = new Map<string, TicketDelivery[]>();
    for (const d of rows) {
      const list = byEvent.get(d.eventId) ?? [];
      list.push(d);
      byEvent.set(d.eventId, list);
    }
    return Array.from(byEvent.entries())
      .map(([eventId, list]) => {
        const event = events.find((e) => e.id === eventId);
        return {
          eventId,
          eventName: event?.name ?? "Evento eliminado",
          eventDate: event?.date ?? "",
          eventLocation: event?.location ?? "",
          rows: list,
          totalTickets: list.reduce((a, d) => a + d.quantity, 0),
          totalValue: list.reduce((a, d) => a + d.value, 0),
        };
      })
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [deliveries, statusFilter, term, events]);

  // Resumen general (todas las entregas, sin importar pestaña ni búsqueda).
  const summary = useMemo(
    () => ({
      totalTickets: deliveries.reduce((a, d) => a + d.quantity, 0),
      totalValue: deliveries.reduce((a, d) => a + d.value, 0),
      pending: deliveries.filter((d) => d.status === "pending").length,
      sent: deliveries.filter((d) => d.status === "sent").length,
    }),
    [deliveries]
  );

  // Exporta a CSV la lista visible (pestaña actual + búsqueda), lista para Excel.
  const exportCsv = () => {
    const rows = groups.flatMap((g) =>
      g.rows.map((d) => ({ d, eventName: g.eventName, eventLocation: g.eventLocation }))
    );
    if (rows.length === 0) {
      toast.error("No hay nada para exportar en esta lista");
      return;
    }
    const headers = [
      "Evento", "Ubicación evento", "Nombre completo", "Email", "Teléfono",
      "Entradas", "Total", "Estado", "Enviada", "Registrado", "Notas",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(({ d, eventName, eventLocation }) =>
      [
        eventName, eventLocation, `${d.firstName} ${d.lastName}`.trim(), d.email,
        d.phone ? formatPhoneDisplay(d.phone) : "",
        d.quantity, d.value,
        d.status === "sent" ? "Enviada" : "Pendiente",
        d.sentAt ? d.sentAt.slice(0, 10) : "",
        d.userId ? "Sí" : "No",
        d.notes ?? "",
      ].map(esc).join(",")
    );
    // BOM (﻿) para que Excel abra el UTF-8 con acentos correctos.
    const csv = "﻿" + [headers.join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `odisea-entregas-${statusFilter === "pending" ? "por-enviar" : "enviadas"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (d: TicketDelivery) => {
    setEditing(d);
    setModalOpen(true);
  };

  const handleMarkSent = async (d: TicketDelivery) => {
    const result = await setDeliveryStatus(d.id, "sent");
    if (!result.ok) return toast.error(result.error ?? "No se pudo actualizar");
    await reload();
    toast.success("Marcada como enviada");
  };
  const handleMarkPending = async (d: TicketDelivery) => {
    const result = await setDeliveryStatus(d.id, "pending");
    if (!result.ok) return toast.error(result.error ?? "No se pudo actualizar");
    await reload();
    toast.success("Devuelta a pendientes");
  };
  const handleDelete = async (d: TicketDelivery) => {
    const ok = await confirm({
      title: "Eliminar cliente",
      description: `¿Eliminar a ${d.firstName} ${d.lastName} de la lista? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteDelivery(d.id);
    if (!result.ok) return toast.error(result.error ?? "No se pudo eliminar");
    await reload();
    toast.success("Cliente eliminado");
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Cargando entregas...</div>;

  return (
    <div className="space-y-5">
      {/* Resumen general */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={<DollarSign className="w-4 h-4" />} label="Recaudado" value={fmtMoney(summary.totalValue)} />
        <MiniStat icon={<Ticket className="w-4 h-4" />} label="Entradas" value={String(summary.totalTickets)} />
        <MiniStat icon={<Send className="w-4 h-4" />} label="Por enviar" value={String(summary.pending)} />
        <MiniStat icon={<CheckCircle2 className="w-4 h-4" />} label="Enviadas" value={String(summary.sent)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="inline-flex rounded-lg border border-border overflow-hidden self-start">
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors ${
              statusFilter === "pending"
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            Por enviar ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("sent")}
            className={`px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors ${
              statusFilter === "sent"
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            Enviadas ({sentCount})
          </button>
        </div>

        <div className="flex flex-1 gap-3 lg:justify-end">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, documento..."
              className="input-techno pl-10"
            />
          </div>
          <button
            onClick={exportCsv}
            className="btn-techno-outline whitespace-nowrap inline-flex items-center gap-2"
            title="Exportar la lista visible a CSV (Excel)"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar</span>
          </button>
          <button onClick={openNew} className="btn-celeste whitespace-nowrap inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      {/* Grupos por evento */}
      {groups.length === 0 ? (
        <div className="bg-card border border-border py-16 text-center text-muted-foreground text-sm">
          {statusFilter === "pending"
            ? "No hay clientes por enviar. Agregá uno con el botón de arriba."
            : "Todavía no marcaste ninguna entrega como enviada."}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.eventId} className="bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 bg-secondary/50 border-b border-border space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-celeste-deep shrink-0" />
                <span className="font-bold truncate">{g.eventName}</span>
                {g.eventDate && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    · {formatEventDate(g.eventDate)}
                  </span>
                )}
              </div>
              {g.eventLocation && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{g.eventLocation}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span><b className="text-foreground">{g.rows.length}</b> clientes</span>
                <span><b className="text-foreground">{g.totalTickets}</b> entradas</span>
                <span><b className="text-foreground">{fmtMoney(g.totalValue)}</b> total</span>
              </div>
            </div>

            {/* Mobile: tarjetas apiladas */}
            <div className="md:hidden divide-y divide-border">
              {g.rows.map((d) => (
                <div key={d.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{d.firstName} {d.lastName}</span>
                        {d.userId && <RegBadge />}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono break-all">{d.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold leading-tight">
                        {d.quantity}
                        <span className="text-xs font-normal text-muted-foreground"> entr.</span>
                      </p>
                      <p className="text-sm font-semibold">{fmtMoney(d.value)}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {d.phone && <p className="font-mono">{formatPhoneDisplay(d.phone)}</p>}
                    {statusFilter === "sent" && d.sentAt && (
                      <p>Enviada el {formatEventDate(d.sentAt.slice(0, 10))}</p>
                    )}
                  </div>
                  <div className="pt-1">
                    <DeliveryActions
                      d={d}
                      eventName={g.eventName}
                      onSent={handleMarkSent}
                      onPending={handleMarkPending}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Cliente</Th>
                    <Th>Contacto</Th>
                    <Th>Entradas</Th>
                    <Th>Total</Th>
                    {statusFilter === "sent" && <Th>Enviada</Th>}
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <Td>
                        <p className="font-semibold flex items-center gap-2">
                          {d.firstName} {d.lastName}
                          {d.userId && <RegBadge />}
                        </p>
                      </Td>
                      <Td>
                        <p className="text-xs font-mono">{d.email}</p>
                        {d.phone && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {formatPhoneDisplay(d.phone)}
                          </p>
                        )}
                      </Td>
                      <Td className="font-semibold">{d.quantity}</Td>
                      <Td className="font-semibold">{fmtMoney(d.value)}</Td>
                      {statusFilter === "sent" && (
                        <Td className="text-xs text-muted-foreground">
                          {d.sentAt ? formatEventDate(d.sentAt.slice(0, 10)) : "—"}
                        </Td>
                      )}
                      <Td>
                        <DeliveryActions
                          d={d}
                          eventName={g.eventName}
                          onSent={handleMarkSent}
                          onPending={handleMarkPending}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {modalOpen && (
        <DeliveryFormModal
          events={events}
          users={users}
          existing={deliveries}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            // Un cliente nuevo nace "pendiente": mostramos esa lista para que se vea.
            if (!editing) setStatusFilter("pending");
            reload();
          }}
        />
      )}
    </div>
  );
};

const DeliveryFormModal = ({
  events,
  users,
  existing,
  editing,
  onClose,
  onSaved,
}: {
  events: AdminEvent[];
  users: User[];
  existing: TicketDelivery[];
  editing: TicketDelivery | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const confirm = useConfirm();
  // "registered": elegís un usuario ya registrado y sólo cargás las entradas.
  // "manual": tipeás nombre/mail/teléfono. Al editar siempre usamos manual.
  const [mode, setMode] = useState<"registered" | "manual">(
    !editing && users.length > 0 ? "registered" : "manual"
  );
  const [form, setForm] = useState({
    eventId: editing?.eventId ?? (events[0]?.id ?? ""),
    userId: editing?.userId ?? "",
    fullName: editing ? `${editing.firstName} ${editing.lastName ?? ""}`.trim() : "",
    // País sólo para el widget de teléfono (formato/bandera), no es ubicación del cliente.
    phoneCountry: editing?.country || DEFAULT_COUNTRY_CODE,
    phone: editing?.phone ? formatPhoneDisplay(editing.phone).replace(/^\+\d+\s*/, "") : "",
    email: editing?.email ?? "",
    quantity: String(editing?.quantity ?? 1),
    value: editing ? String(editing.value) : "",
    notes: editing?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const selectedUser = users.find((u) => u.id === form.userId) ?? null;
  const selectedEvent = events.find((ev) => ev.id === form.eventId) ?? null;

  const switchMode = (m: "registered" | "manual") => {
    setMode(m);
    setForm((p) => ({ ...p, userId: "" })); // limpiar vínculo al cambiar de modo
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.eventId) return toast.error("Elegí el evento");

    const quantity = parseInt(form.quantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) return toast.error("La cantidad debe ser 1 o más");
    if (!form.value.trim()) return toast.error("Indicá el total de la compra");
    const value = parseFloat(form.value);
    if (!Number.isFinite(value) || value < 0) return toast.error("El total no es válido");

    let input: DeliveryInput;

    if (mode === "registered" && !editing) {
      // Cliente registrado: tomamos nombre/mail/teléfono del perfil.
      const u = users.find((x) => x.id === form.userId);
      if (!u) return toast.error("Elegí el cliente registrado");
      input = {
        eventId: form.eventId,
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone ?? null,
        email: u.email,
        quantity,
        value,
        notes: form.notes.trim() || null,
      };
    } else {
      // Manual (o edición): nombre completo, email y teléfono.
      const fullName = form.fullName.trim();
      if (!fullName) return toast.error("Indicá el nombre completo");

      const email = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Email inválido");

      if (!form.phone.trim()) return toast.error("Indicá el teléfono");
      const phoneE164 = normalizePhone(form.phone, form.phoneCountry as CountryCode);
      if (!phoneE164) return toast.error("Teléfono inválido");

      // Guardamos el nombre partido en nombre / resto para mantener el formato.
      const parts = fullName.split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ");

      input = {
        eventId: form.eventId,
        userId: form.userId || null, // preserva el vínculo si se editaba una registrada
        firstName,
        lastName,
        phone: phoneE164,
        email,
        quantity,
        value,
        notes: form.notes.trim() || null,
      };
    }

    // Aviso de duplicado: mismo email en el mismo evento (solo al crear).
    if (!editing) {
      const dup = existing.find(
        (x) => x.eventId === input.eventId && x.email.toLowerCase() === input.email.toLowerCase()
      );
      if (dup) {
        const ok = await confirm({
          title: "Posible duplicado",
          description: `Ya hay una entrega para ${input.email} en este evento (${dup.quantity} entrada/s, ${
            dup.status === "sent" ? "ya enviada" : "pendiente"
          }). ¿Querés cargarla igual?`,
          confirmText: "Cargar igual",
        });
        if (!ok) return;
      }
    }

    setSaving(true);
    const result = editing
      ? await updateDelivery(editing.id, input)
      : await createDelivery(input);
    setSaving(false);
    if (!result.ok) return toast.error(result.error ?? "No se pudo guardar");
    toast.success(editing ? "Cliente actualizado" : "Cliente agregado");
    onSaved();
  };

  const total = (() => {
    const v = parseFloat(form.value || "0");
    return Number.isFinite(v) ? v : 0;
  })();

  const showManualFields = mode === "manual" || !!editing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-background border border-border h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="title-sport text-xl md:text-2xl font-black tracking-wide">
            {editing ? "EDITAR CLIENTE" : "NUEVO CLIENTE"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
          {/* Toggle registrado/manual — sólo al agregar (no al editar) */}
          {!editing && (
            <div className="inline-flex w-full rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => switchMode("registered")}
                className={`flex-1 px-3 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === "registered"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                Cliente registrado
              </button>
              <button
                type="button"
                onClick={() => switchMode("manual")}
                className={`flex-1 px-3 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === "manual"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                Carga manual
              </button>
            </div>
          )}

          <div>
            <FormField label="Evento">
              <select
                value={form.eventId}
                onChange={(e) => set("eventId", e.target.value)}
                required
                className="input-techno"
              >
                {events.length === 0 && <option value="">No hay eventos creados</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} · {formatEventDate(ev.date)}
                  </option>
                ))}
              </select>
            </FormField>
            {selectedEvent?.location && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {selectedEvent.location}
              </p>
            )}
          </div>

          {/* Modo REGISTRADO: elegir usuario + resumen (solo lectura) */}
          {!showManualFields && (
            <>
              <div>
                <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                  Cliente registrado
                </span>
                <UserSearchSelect
                  users={users}
                  value={form.userId}
                  onChange={(id) => set("userId", id)}
                  placeholder="Buscá el cliente por nombre, email o documento..."
                />
              </div>

              {users.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay usuarios registrados todavía. Usá “Carga manual”.
                </p>
              )}

              {/* El buscador ya muestra nombre y email del elegido; acá va el resto. */}
              {selectedUser && (
                <p className="text-[11px] text-muted-foreground">
                  {selectedUser.phone
                    ? `Tel. ${formatPhoneDisplay(selectedUser.phone)} · `
                    : ""}
                  Nombre, email y teléfono se toman de su perfil.
                </p>
              )}
            </>
          )}

          {/* Modo MANUAL (o edición): nombre completo, email y teléfono */}
          {showManualFields && (
            <>
              <FormField label="Nombre completo">
                <input
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  required
                  className="input-techno"
                  placeholder="Juan Pérez"
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    required
                    className="input-techno"
                    placeholder="cliente@email.com"
                  />
                </FormField>
                <div>
                  <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Teléfono
                  </span>
                  <PhoneInput
                    country={form.phoneCountry}
                    value={form.phone}
                    onCountryChange={(c) => set("phoneCountry", c)}
                    onChange={(v) => set("phone", v)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* Datos de las entradas (siempre) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Cantidad de entradas">
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                required
                className="input-techno"
              />
            </FormField>
            <FormField label="Total de la compra ($)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                required
                className="input-techno"
                placeholder="0"
              />
            </FormField>
          </div>

          <p className="text-xs text-muted-foreground">
            Total registrado: <b className="text-foreground">{fmtMoney(total)}</b>
          </p>

          <FormField label="Notas (opcional)">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="input-techno resize-none"
              placeholder="Comentarios internos..."
            />
          </FormField>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-techno-outline flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-celeste flex-1 disabled:opacity-60">
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Agregar cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// CUMPLEAÑOS — promo de cumple: quién la reclamó y a quién ya se le dio el regalo
// ════════════════════════════════════════════════════════════════════════════

const MONTHS_CUMPLE = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Día y mes del cumple, sin año ("14 de marzo"). */
const birthdayLabel = (iso: string) => {
  const [, m, d] = (iso ?? "").split("-").map(Number);
  return m && d ? `${d} de ${MONTHS_CUMPLE[m - 1]}` : "—";
};

/**
 * Días hasta el próximo cumple (0 = hoy). Cuenta en días calendario, no en
 * horas, para que "hoy" no dé -1 según la hora en la que se mire el panel.
 */
const daysToNextBirthday = (iso: string) => {
  const [, m, d] = (iso ?? "").split("-").map(Number);
  if (!m || !d) return Infinity;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
};

/** Documento formateado sólo si sabemos el formato (cédula uruguaya). */
const fmtDoc = (doc: string, country?: string) =>
  country === "UY" ? formatUruguayCedula(doc) : doc;

const birthdayMatches = (b: BirthdaySignup, term: string) => {
  if (!term) return true;
  const hay = `${b.firstName} ${b.lastName} ${b.email ?? ""} ${b.documentId} ${b.phone ?? ""}`.toLowerCase();
  return hay.includes(term);
};

/** Cuenta regresiva al cumple, para ver de un vistazo a quién hay que atender. */
const BirthdayCountdown = ({ birthDate }: { birthDate: string }) => {
  const days = daysToNextBirthday(birthDate);
  if (!Number.isFinite(days)) return null;
  const soon = days <= 7;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 whitespace-nowrap border ${
        soon
          ? "text-celeste-deep bg-celeste/10 border-celeste/30"
          : "text-muted-foreground bg-secondary border-border"
      }`}
    >
      {days === 0 ? "¡Hoy!" : days === 1 ? "Mañana" : `En ${days} días`}
    </span>
  );
};

// Botonera de un cumpleañero. Compartida por tarjetas (mobile) y tabla (desktop).
const BirthdayActions = ({
  b,
  onGift,
  onUngift,
  onPhoto,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}: {
  b: BirthdaySignup;
  onGift: (b: BirthdaySignup) => void;
  onUngift: (b: BirthdaySignup) => void;
  onPhoto: (b: BirthdaySignup) => void;
  onEdit: (b: BirthdaySignup) => void;
  onDelete: (b: BirthdaySignup) => void;
  onApprove: (b: BirthdaySignup) => void;
  onReject: (b: BirthdaySignup) => void;
}) => (
  <div className="flex items-center gap-1">
    {/* Solicitud del cliente: primero se aprueba o se rechaza. Hasta entonces no
        tiene sentido ofrecer el regalo, porque no está verificada. */}
    {b.status === "pendiente" ? (
      <>
        <button
          onClick={() => onApprove(b)}
          className="p-2 hover:bg-green-600 hover:text-white transition-colors"
          title="Aprobar la solicitud"
          aria-label="Aprobar la solicitud"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onReject(b)}
          className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Rechazar la solicitud"
          aria-label="Rechazar la solicitud"
        >
          <X className="w-4 h-4" />
        </button>
      </>
    ) : b.giftGiven ? (
      <button
        onClick={() => onUngift(b)}
        className="p-2 hover:bg-secondary transition-colors"
        title="Marcar regalo como NO entregado"
        aria-label="Marcar regalo como no entregado"
      >
        <Undo2 className="w-4 h-4" />
      </button>
    ) : (
      <button
        onClick={() => onGift(b)}
        className="p-2 hover:bg-green-600 hover:text-white transition-colors"
        title="Marcar regalo como entregado"
        aria-label="Marcar regalo como entregado"
      >
        <Gift className="w-4 h-4" />
      </button>
    )}
    <button
      onClick={() => onPhoto(b)}
      disabled={!b.idPhotoPath}
      className="p-2 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title={b.idPhotoPath ? "Ver foto del documento" : "Sin foto cargada"}
      aria-label="Ver foto del documento"
    >
      <Eye className="w-4 h-4" />
    </button>
    {b.email && (
      <a
        href={`mailto:${b.email}?subject=${encodeURIComponent("Tu promo de cumpleaños · ODÍSEA")}`}
        className="p-2 hover:bg-secondary transition-colors"
        title="Escribir email"
        aria-label="Escribir email"
      >
        <Mail className="w-4 h-4" />
      </a>
    )}
    <button
      onClick={() => onEdit(b)}
      className="p-2 hover:bg-secondary transition-colors"
      title="Editar"
      aria-label="Editar"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button
      onClick={() => onDelete(b)}
      className="p-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
      title="Eliminar"
      aria-label="Eliminar"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);

const BirthdaysAdmin = () => {
  const { events, users } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<BirthdaySignup[]>([]);
  const [loading, setLoading] = useState(true);
  // "requests" = solicitudes que cargó el propio cliente y falta revisar.
  const [giftFilter, setGiftFilter] = useState<"requests" | "pending" | "given">("pending");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BirthdaySignup | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<BirthdaySignup | null>(null);

  const reload = async () => {
    const data = await fetchBirthdays();
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("birthday-signups-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "birthday_signups" },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const term = search.trim().toLowerCase();
  // Las solicitudes sin revisar no cuentan en las listas de regalo: mezclarlas
  // haría perder la diferencia entre lo verificado y lo que afirma un cliente.
  const verified = rows.filter((b) => b.status === "aprobado");
  const requestsCount = rows.filter(
    (b) => b.status === "pendiente" && birthdayMatches(b, term)
  ).length;
  const pendingCount = verified.filter((b) => !b.giftGiven && birthdayMatches(b, term)).length;
  const givenCount = verified.filter((b) => b.giftGiven && birthdayMatches(b, term)).length;

  // Filtramos por pestaña + búsqueda y agrupamos por evento. Los que todavía no
  // tienen evento asignado van juntos en un grupo al final.
  const groups = useMemo(() => {
    const list =
      giftFilter === "requests"
        ? rows.filter((b) => b.status === "pendiente" && birthdayMatches(b, term))
        : rows.filter(
            (b) =>
              b.status === "aprobado" &&
              b.giftGiven === (giftFilter === "given") &&
              birthdayMatches(b, term)
          );
    const byEvent = new Map<string, BirthdaySignup[]>();
    for (const b of list) {
      const key = b.eventId ?? "";
      const arr = byEvent.get(key) ?? [];
      arr.push(b);
      byEvent.set(key, arr);
    }
    return Array.from(byEvent.entries())
      .map(([eventId, list]) => {
        const event = eventId ? events.find((e) => e.id === eventId) : null;
        return {
          eventId,
          eventName: eventId ? event?.name ?? "Evento eliminado" : "Sin evento asignado",
          eventDate: event?.date ?? "",
          eventLocation: event?.location ?? "",
          // Primero el cumple más cercano: es el orden en el que hay que atenderlos.
          rows: [...list].sort(
            (a, b) => daysToNextBirthday(a.birthDate) - daysToNextBirthday(b.birthDate)
          ),
        };
      })
      .sort((a, b) => {
        if (!a.eventId) return 1; // "Sin evento" siempre último
        if (!b.eventId) return -1;
        return a.eventDate.localeCompare(b.eventDate);
      });
  }, [rows, giftFilter, term, events]);

  // Resumen general (todos los cumpleañeros, sin importar pestaña ni búsqueda).
  const summary = useMemo(
    () => ({
      total: rows.length,
      pending: rows.filter((b) => !b.giftGiven).length,
      given: rows.filter((b) => b.giftGiven).length,
      thisWeek: rows.filter((b) => daysToNextBirthday(b.birthDate) <= 7).length,
    }),
    [rows]
  );

  // CSV de la lista visible. Nunca incluye la foto del documento: sólo si está
  // cargada o no (el archivo es sensible y vive en el bucket privado).
  const exportCsv = () => {
    const flat = groups.flatMap((g) => g.rows.map((b) => ({ b, eventName: g.eventName })));
    if (flat.length === 0) {
      toast.error("No hay nada para exportar en esta lista");
      return;
    }
    const headers = [
      "Evento", "Nombre", "Apellido", "Documento", "Fecha de nacimiento", "Edad",
      "Cumple", "Email", "Teléfono", "País", "Ciudad/Depto", "Regalo",
      "Fecha del regalo", "Foto cargada", "Registrado", "Notas",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = flat.map(({ b, eventName }) =>
      [
        eventName, b.firstName, b.lastName, fmtDoc(b.documentId, b.country),
        b.birthDate, ageFromBirthDate(b.birthDate), birthdayLabel(b.birthDate),
        b.email ?? "", b.phone ? formatPhoneDisplay(b.phone) : "",
        b.country ?? "", b.state ?? "",
        b.giftGiven ? "Entregado" : "Pendiente",
        b.giftGivenAt ? b.giftGivenAt.slice(0, 10) : "",
        b.idPhotoPath ? "Sí" : "No",
        b.userId ? "Sí" : "No",
        b.notes ?? "",
      ].map(esc).join(",")
    );
    const csv = "﻿" + [headers.join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `odisea-cumpleanos-${giftFilter === "pending" ? "sin-regalo" : "con-regalo"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (b: BirthdaySignup) => {
    setEditing(b);
    setModalOpen(true);
  };

  const handleGift = async (b: BirthdaySignup) => {
    const result = await setGiftGiven(b.id, true);
    if (!result.ok) return toast.error(result.error ?? "No se pudo actualizar");
    await reload();
    toast.success("Regalo marcado como entregado");
  };
  const handleUngift = async (b: BirthdaySignup) => {
    const result = await setGiftGiven(b.id, false);
    if (!result.ok) return toast.error(result.error ?? "No se pudo actualizar");
    await reload();
    toast.success("Regalo devuelto a pendientes");
  };
  /** Acepta una solicitud del cliente: pasa a la lista verificada. */
  const handleApprove = async (b: BirthdaySignup) => {
    const result = await setBirthdayStatus(b.id, "aprobado");
    if (!result.ok) return toast.error(result.error ?? "No se pudo aprobar");
    await reload();
    toast.success(`${b.firstName} aprobado: ya está en la lista`);
  };

  /**
   * Rechaza la solicitud. Queda en la base como 'rechazado' (sale de las listas
   * del panel) para tener el registro; los índices únicos sólo bloquean las
   * pendientes, así que la persona puede volver a mandar una corregida.
   */
  const handleReject = async (b: BirthdaySignup) => {
    const ok = await confirm({
      title: "Rechazar solicitud",
      description: `¿Rechazar la solicitud de ${b.firstName} ${b.lastName}? Sale de la lista, pero queda el registro y puede volver a enviarla.`,
      confirmText: "Rechazar",
      destructive: true,
    });
    if (!ok) return;
    const result = await setBirthdayStatus(b.id, "rechazado");
    if (!result.ok) return toast.error(result.error ?? "No se pudo rechazar");
    await reload();
    toast.success("Solicitud rechazada");
  };

  const handleDelete = async (b: BirthdaySignup) => {
    const ok = await confirm({
      title: "Eliminar cumpleañero",
      description: `¿Eliminar a ${b.firstName} ${b.lastName} de la lista? Se borra también la foto de su documento. Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteBirthday(b);
    if (!result.ok) return toast.error(result.error ?? "No se pudo eliminar");
    await reload();
    toast.success("Cumpleañero eliminado");
  };

  if (loading)
    return <div className="py-12 text-center text-muted-foreground text-sm">Cargando cumpleaños...</div>;

  return (
    <div className="space-y-5">
      {/* Resumen general */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={<Cake className="w-4 h-4" />} label="Cargados" value={String(summary.total)} />
        <MiniStat icon={<Gift className="w-4 h-4" />} label="Sin regalo" value={String(summary.pending)} />
        <MiniStat icon={<CheckCircle2 className="w-4 h-4" />} label="Con regalo" value={String(summary.given)} />
        <MiniStat icon={<Calendar className="w-4 h-4" />} label="Cumplen esta semana" value={String(summary.thisWeek)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="inline-flex rounded-lg border border-border overflow-hidden self-start">
          <button
            onClick={() => setGiftFilter("requests")}
            className={`px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors ${
              giftFilter === "requests"
                ? "bg-foreground text-background"
                : requestsCount > 0
                  ? "bg-background text-charrua hover:bg-secondary"
                  : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            A revisar ({requestsCount})
          </button>
          <button
            onClick={() => setGiftFilter("pending")}
            className={`px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors ${
              giftFilter === "pending"
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            Sin regalo ({pendingCount})
          </button>
          <button
            onClick={() => setGiftFilter("given")}
            className={`px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors ${
              giftFilter === "given"
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            Regalo dado ({givenCount})
          </button>
        </div>

        <div className="flex flex-1 gap-3 lg:justify-end">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, documento, email..."
              className="input-techno pl-10"
            />
          </div>
          <button
            onClick={exportCsv}
            className="btn-techno-outline whitespace-nowrap inline-flex items-center gap-2"
            title="Exportar la lista visible a CSV (Excel)"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar</span>
          </button>
          <button onClick={openNew} className="btn-celeste whitespace-nowrap inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      {/* Grupos por evento */}
      {groups.length === 0 ? (
        <div className="bg-card border border-border py-16 text-center text-muted-foreground text-sm">
          {giftFilter === "requests"
            ? "No hay solicitudes para revisar. Acá caen las que cargan los clientes registrados desde el sitio."
            : giftFilter === "pending"
              ? "No hay cumpleañeros pendientes. Agregá uno con el botón de arriba."
              : "Todavía no marcaste ningún regalo como entregado."}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.eventId || "sin-evento"} className="bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 bg-secondary/50 border-b border-border space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-celeste-deep shrink-0" />
                <span className="font-bold truncate">{g.eventName}</span>
                {g.eventDate && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    · {formatEventDate(g.eventDate)}
                  </span>
                )}
              </div>
              {g.eventLocation && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{g.eventLocation}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                <b className="text-foreground">{g.rows.length}</b> cumpleañero/s
              </div>
            </div>

            {/* Mobile: tarjetas apiladas */}
            <div className="md:hidden divide-y divide-border">
              {g.rows.map((b) => (
                <div key={b.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{b.firstName} {b.lastName}</span>
                        {b.userId && <RegBadge />}
                        {b.status === "pendiente" && <PendingBadge />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {birthdayLabel(b.birthDate)} · {ageFromBirthDate(b.birthDate)} años
                      </p>
                    </div>
                    <BirthdayCountdown birthDate={b.birthDate} />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p className="font-mono">{fmtDoc(b.documentId, b.country)}</p>
                    {b.email && <p className="font-mono break-all">{b.email}</p>}
                    {b.phone && <p className="font-mono">{formatPhoneDisplay(b.phone)}</p>}
                    {!b.idPhotoPath && (
                      <p className="text-charrua font-semibold">Falta la foto del documento</p>
                    )}
                    {b.giftGiven && b.giftGivenAt && (
                      <p>Regalo entregado el {formatEventDate(b.giftGivenAt.slice(0, 10))}</p>
                    )}
                  </div>
                  <div className="pt-1">
                    <BirthdayActions
                      b={b}
                      onGift={handleGift}
                      onUngift={handleUngift}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onPhoto={setViewingPhoto}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[880px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Cumpleañero</Th>
                    <Th>Documento</Th>
                    <Th>Cumple</Th>
                    <Th>Contacto</Th>
                    <Th>Foto</Th>
                    {giftFilter === "given" && <Th>Regalo</Th>}
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((b) => (
                    <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <Td>
                        <p className="font-semibold flex items-center gap-2 flex-wrap">
                          {b.firstName} {b.lastName}
                          {b.userId && <RegBadge />}
                          {b.status === "pendiente" && <PendingBadge />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ageFromBirthDate(b.birthDate)} años
                        </p>
                      </Td>
                      <Td className="text-xs font-mono">{fmtDoc(b.documentId, b.country)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{birthdayLabel(b.birthDate)}</span>
                          <BirthdayCountdown birthDate={b.birthDate} />
                        </div>
                      </Td>
                      <Td>
                        {b.email && <p className="text-xs font-mono">{b.email}</p>}
                        {b.phone && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {formatPhoneDisplay(b.phone)}
                          </p>
                        )}
                        {!b.email && !b.phone && <span className="text-xs text-muted-foreground">—</span>}
                      </Td>
                      <Td>
                        {b.idPhotoPath ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <ImageIcon className="w-3.5 h-3.5" /> Sí
                          </span>
                        ) : (
                          <span className="text-xs text-charrua font-semibold">Falta</span>
                        )}
                      </Td>
                      {giftFilter === "given" && (
                        <Td className="text-xs text-muted-foreground">
                          {b.giftGivenAt ? formatEventDate(b.giftGivenAt.slice(0, 10)) : "—"}
                        </Td>
                      )}
                      <Td>
                        <BirthdayActions
                          b={b}
                          onGift={handleGift}
                          onUngift={handleUngift}
                          onApprove={handleApprove}
                          onReject={handleReject}
                          onPhoto={setViewingPhoto}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {modalOpen && (
        <BirthdayFormModal
          events={events}
          users={users}
          existing={rows}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            // Un cumpleañero nuevo nace sin regalo: mostramos esa lista.
            if (!editing) setGiftFilter("pending");
            reload();
          }}
        />
      )}

      {viewingPhoto && (
        <IdPhotoModal row={viewingPhoto} onClose={() => setViewingPhoto(null)} />
      )}
    </div>
  );
};

/**
 * Visor de la foto del documento. El bucket es privado: pedimos una URL firmada
 * al abrir (vence en 5 minutos) en vez de guardar un link permanente.
 */
const IdPhotoModal = ({ row, onClose }: { row: BirthdaySignup; onClose: () => void }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!row.idPhotoPath) return;
      const result = await getIdPhotoUrl(row.idPhotoPath);
      if (!alive) return;
      if (result.ok && result.url) setUrl(result.url);
      else setError(result.error ?? "No se pudo abrir la foto");
    })();
    return () => {
      alive = false;
    };
  }, [row.idPhotoPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-background border border-border h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border sticky top-0 bg-background z-10">
          <div className="min-w-0">
            <h2 className="title-sport text-lg md:text-xl font-black tracking-wide truncate">
              {row.firstName} {row.lastName}
            </h2>
            <p className="text-xs font-mono text-muted-foreground">
              {fmtDoc(row.documentId, row.country)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {error ? (
            <p className="text-sm text-charrua">{error}</p>
          ) : !url ? (
            <p className="text-sm text-muted-foreground text-center py-12">Abriendo foto...</p>
          ) : (
            <>
              <img
                src={url}
                alt={`Documento de ${row.firstName} ${row.lastName}`}
                className="w-full h-auto max-h-[60vh] object-contain bg-secondary border border-border"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-techno-outline flex-1 inline-flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> Abrir en pestaña nueva
                </a>
                <button onClick={onClose} className="btn-celeste flex-1">
                  Cerrar
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Documento de identidad: el link es temporal (5 minutos) y sólo lo puede
                generar el staff. No compartir ni descargar sin necesidad.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const BirthdayFormModal = ({
  events,
  users,
  existing,
  editing,
  onClose,
  onSaved,
}: {
  events: AdminEvent[];
  users: User[];
  existing: BirthdaySignup[];
  editing: BirthdaySignup | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const confirm = useConfirm();
  // "registered": elegís un usuario ya registrado y se autocompletan sus datos
  // (igual quedan editables). "manual": se carga todo a mano.
  const [mode, setMode] = useState<"registered" | "manual">(
    !editing && users.length > 0 ? "registered" : "manual"
  );
  const [form, setForm] = useState({
    eventId: editing?.eventId ?? "",
    userId: editing?.userId ?? "",
    firstName: editing?.firstName ?? "",
    lastName: editing?.lastName ?? "",
    documentId: editing ? fmtDoc(editing.documentId, editing.country) : "",
    birthDate: editing?.birthDate ?? "",
    email: editing?.email ?? "",
    country: editing?.country || DEFAULT_COUNTRY_CODE,
    state: editing?.state ?? "",
    phone: editing?.phone ? formatPhoneDisplay(editing.phone).replace(/^\+\d+\s*/, "") : "",
    notes: editing?.notes ?? "",
    giftGiven: editing?.giftGiven ?? false,
  });
  const [saving, setSaving] = useState(false);

  // Foto del documento: se sube al elegirla y guardamos su ruta en el bucket.
  const originalPath = editing?.idPhotoPath ?? "";
  const [photoPath, setPhotoPath] = useState(originalPath);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Archivos subidos en esta sesión del modal: si se cancela, se limpian.
  const uploadedRef = useRef<string[]>([]);
  const savedRef = useRef(false);

  const set = (field: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Al editar, la foto ya guardada se muestra con una URL firmada.
  useEffect(() => {
    let alive = true;
    if (!originalPath) return;
    (async () => {
      const result = await getIdPhotoUrl(originalPath);
      if (alive && result.ok && result.url) setPhotoPreview(result.url);
    })();
    return () => {
      alive = false;
    };
  }, [originalPath]);

  const age = form.birthDate ? ageFromBirthDate(form.birthDate) : null;
  const isMinor = age !== null && age < 18;

  // Tope del selector de fecha: hoy. Se admite cargar a un menor (avisando al
  // guardar), porque puede cumplir los 18 antes del evento; lo único imposible
  // es haber nacido en el futuro.
  const maxBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Trae los datos del perfil del usuario elegido (quedan editables).
  const pickUser = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return setForm((p) => ({ ...p, userId: "" }));
    setForm((p) => ({
      ...p,
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      documentId: u.documentId ? fmtDoc(u.documentId, u.country ?? "UY") : "",
      birthDate: u.birthDate ?? "",
      email: u.email ?? "",
      country: u.country || DEFAULT_COUNTRY_CODE,
      state: u.state ?? "",
      phone: u.phone ? formatPhoneDisplay(u.phone).replace(/^\+\d+\s*/, "") : "",
    }));
  };

  const switchMode = (m: "registered" | "manual") => {
    setMode(m);
    setForm((p) => ({ ...p, userId: "" })); // al pasar a manual se corta el vínculo
  };

  // Única vía de subida: la usan el explorador de archivos, el arrastrar-soltar
  // y el pegado desde el portapapeles.
  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Tiene que ser una imagen");
    setUploading(true);
    const result = await uploadIdPhoto(file);
    setUploading(false);
    if (!result.ok || !result.path) {
      return toast.error(result.error ?? "No se pudo subir la foto");
    }
    // Si ya habíamos subido otra en esta sesión, la de antes queda huérfana: la borramos.
    if (photoPath && photoPath !== originalPath) await removeIdPhoto(photoPath);
    uploadedRef.current.push(result.path);
    setPhotoPath(result.path);
    setPhotoPreview(URL.createObjectURL(file));
    toast.success("Foto cargada");
  };

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (file) await uploadPhoto(file);
  };

  // Arrastrar y soltar: se puede tirar la foto de la cédula sobre el recuadro
  // sin pasar por el explorador de archivos.
  const handleDragOver = (e: React.DragEvent) => {
    if (uploading) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Ignoramos los "leave" hacia un hijo del propio recuadro.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return toast.error("Soltá un archivo de imagen");
    await uploadPhoto(file);
  };

  // Pegar (Ctrl+V) una captura o una foto copiada, sin guardarla antes en disco.
  const uploadRef = useRef(uploadPhoto);
  useEffect(() => {
    uploadRef.current = uploadPhoto;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/")
      );
      if (!file) return;
      e.preventDefault();
      void uploadRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handleRemovePhoto = async () => {
    // La foto ya guardada se borra del bucket sólo cuando se guarda el cambio.
    if (photoPath && photoPath !== originalPath) await removeIdPhoto(photoPath);
    setPhotoPath("");
    setPhotoPreview(null);
  };

  // Cancelar: lo subido en esta sesión no quedó referenciado por ninguna ficha,
  // así que lo borramos del bucket para no dejar fotos de documentos huérfanas.
  const handleClose = async () => {
    if (!savedRef.current) {
      for (const p of uploadedRef.current) await removeIdPhoto(p);
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName) return toast.error("Indicá el nombre");
    if (!lastName) return toast.error("Indicá el apellido");

    if (!form.birthDate) return toast.error("Indicá la fecha de nacimiento");

    if (!form.country) return toast.error("Elegí el país");

    // Documento: guardamos sólo dígitos (y la K del RUT chileno).
    const documentId = form.documentId.replace(/[^\dkK]/g, "").toUpperCase();
    if (!documentId) return toast.error("Indicá el número de documento");
    if (!validateDocumentByCountry(documentId, form.country)) {
      return toast.error(`${documentLabelByCountry(form.country)} inválido`);
    }

    // Email y teléfono son opcionales, pero si vienen tienen que ser válidos.
    const email = form.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return toast.error("Email inválido");
    }
    let phoneE164: string | null = null;
    if (form.phone.trim()) {
      phoneE164 = normalizePhone(form.phone, form.country as CountryCode);
      if (!phoneE164) return toast.error("Teléfono inválido");
    }

    // Menor de edad: avisa pero no bloquea. Es habitual que cumpla los 18 entre
    // la carga y la fecha del evento, y eso el sistema no lo puede decidir solo.
    if (ageFromBirthDate(form.birthDate) < 18) {
      const ok = await confirm({
        title: "Es menor de edad",
        description: `Hoy tiene ${ageFromBirthDate(
          form.birthDate
        )} años: cumple 18 el ${formatEventDate(
          eighteenthBirthday(form.birthDate)
        )}. Verificá que sea antes del evento. ¿Lo cargás igual?`,
        confirmText: "Cargar igual",
      });
      if (!ok) return;
    }

    // Aviso de repetido: mismo documento ya cargado (no bloquea, avisa).
    const dup = existing.find(
      (x) => x.id !== editing?.id && x.documentId.toUpperCase() === documentId
    );
    if (dup) {
      const ok = await confirm({
        title: "Ya está cargado",
        description: `${dup.firstName} ${dup.lastName} ya figura con ese documento (${
          dup.giftGiven ? "regalo entregado" : "regalo pendiente"
        }). ¿Querés cargarlo igual?`,
        confirmText: "Cargar igual",
      });
      if (!ok) return;
    }

    // La foto del documento es lo que valida la identidad: si falta, avisamos.
    if (!photoPath) {
      const ok = await confirm({
        title: "Sin foto del documento",
        description:
          "No cargaste la foto del frente del documento. Podés agregarla después editando la ficha. ¿Guardar así?",
        confirmText: "Guardar sin foto",
      });
      if (!ok) return;
    }

    const input: BirthdayInput = {
      eventId: form.eventId || null,
      userId: form.userId || null,
      firstName,
      lastName,
      documentId,
      birthDate: form.birthDate,
      email: email || null,
      phone: phoneE164,
      country: form.country,
      state: form.state.trim() || null,
      idPhotoPath: photoPath || null,
      giftGiven: form.giftGiven,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    const result = editing
      ? await updateBirthday(editing.id, input)
      : await createBirthday(input);
    setSaving(false);
    if (!result.ok) return toast.error(result.error ?? "No se pudo guardar");

    savedRef.current = true;
    // La foto anterior ya no se usa: recién ahora es seguro borrarla del bucket.
    if (originalPath && originalPath !== photoPath) await removeIdPhoto(originalPath);
    toast.success(editing ? "Cumpleañero actualizado" : "Cumpleañero agregado");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-background border border-border h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="title-sport text-xl md:text-2xl font-black tracking-wide">
            {editing ? "EDITAR CUMPLEAÑERO" : "NUEVO CUMPLEAÑERO"}
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-muted" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
          {/* Toggle registrado/manual — sólo al agregar (no al editar) */}
          {!editing && (
            <div className="inline-flex w-full rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => switchMode("registered")}
                className={`flex-1 px-3 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === "registered"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                Usuario registrado
              </button>
              <button
                type="button"
                onClick={() => switchMode("manual")}
                className={`flex-1 px-3 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === "manual"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                Carga manual
              </button>
            </div>
          )}

          {/* Selector de usuario registrado: autocompleta los datos del perfil */}
          {!editing && mode === "registered" && (
            <>
              <div>
                <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                  Traer datos de un usuario
                </span>
                <UserSearchSelect users={users} value={form.userId} onChange={pickUser} />
              </div>
              <p className="text-xs text-muted-foreground">
                {users.length === 0
                  ? "No hay usuarios registrados todavía. Usá “Carga manual”."
                  : "Se completan nombre, documento, fecha de nacimiento y contacto desde su perfil. Podés ajustarlos."}
              </p>
            </>
          )}

          {editing && form.userId && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RegBadge /> Ficha vinculada a un usuario registrado.
            </p>
          )}

          {/* Evento (opcional) */}
          <FormField label="Evento (opcional)">
            <select
              value={form.eventId}
              onChange={(e) => set("eventId", e.target.value)}
              className="input-techno"
            >
              <option value="">Sin evento asignado</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} · {formatEventDate(ev.date)}
                </option>
              ))}
            </select>
          </FormField>

          {/* Datos personales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Nombre">
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
                className="input-techno"
                placeholder="Juan"
              />
            </FormField>
            <FormField label="Apellido">
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                required
                className="input-techno"
                placeholder="Pérez"
              />
            </FormField>
          </div>

          <LocationSelect
            country={form.country}
            state={form.state}
            onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
            onStateChange={(s) => setForm((p) => ({ ...p, state: s }))}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={documentLabelByCountry(form.country)}>
              <input
                value={form.documentId}
                onChange={(e) => set("documentId", e.target.value)}
                required
                className="input-techno"
                placeholder={documentPlaceholderByCountry(form.country)}
              />
            </FormField>
            <div>
              <FormField label="Fecha de nacimiento">
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                  required
                  max={maxBirthDate}
                  min="1900-01-01"
                  className="input-techno"
                />
              </FormField>
              {age !== null && (
                <p className={`mt-1.5 text-xs ${isMinor ? "text-charrua font-semibold" : "text-muted-foreground"}`}>
                  {isMinor
                    ? `Menor de edad: cumple 18 el ${formatEventDate(
                        eighteenthBirthday(form.birthDate)
                      )}`
                    : `${age} años · cumple el ${birthdayLabel(form.birthDate)}`}
                </p>
              )}
            </div>
          </div>

          {/* Contacto (opcional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Email (opcional)">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="input-techno"
                placeholder="cliente@email.com"
              />
            </FormField>
            <div>
              <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                Teléfono (opcional)
              </span>
              <PhoneInput
                country={form.country}
                value={form.phone}
                onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
                onChange={(v) => set("phone", v)}
              />
            </div>
          </div>

          {/* Foto del frente del documento */}
          <div>
            <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
              Foto del documento (frente)
            </span>
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border p-3 space-y-3 transition-colors ${
                dragging ? "border-celeste bg-celeste/5" : "border-border"
              }`}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Frente del documento"
                  className="w-full max-h-56 object-contain bg-secondary"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-28 flex flex-col items-center justify-center gap-1 border border-dashed border-border bg-secondary/50 text-muted-foreground text-xs hover:bg-secondary transition-colors disabled:opacity-60"
                >
                  <ImageIcon className="w-5 h-5" />
                  {uploading
                    ? "Subiendo..."
                    : dragging
                      ? "Soltá la foto acá"
                      : "Arrastrá la foto acá o hacé clic"}
                </button>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-techno-outline flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? "Subiendo..." : photoPath ? "Cambiar foto" : "Subir foto"}
                </button>
                {photoPath && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="btn-techno-outline flex-1 inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Quitar
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handlePickPhoto}
                className="hidden"
              />
              <p className="text-[11px] text-muted-foreground">
                Arrastrala sobre el recuadro, pegala con Ctrl+V o elegila del explorador.
                Una sola foto, sólo el frente. Se guarda en un depósito privado: nadie
                puede verla sin sesión de staff.
              </p>
            </div>
          </div>

          {/* Toggle del regalo */}
          <button
            type="button"
            onClick={() => set("giftGiven", !form.giftGiven)}
            className={`w-full flex items-center justify-between gap-3 border px-4 py-3 transition-colors ${
              form.giftGiven
                ? "border-green-600/40 bg-green-600/10"
                : "border-border bg-secondary/30 hover:bg-secondary/60"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Gift className="w-4 h-4" />
              {form.giftGiven ? "Regalo entregado" : "Regalo pendiente"}
            </span>
            <span
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.giftGiven ? "bg-green-600" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  form.giftGiven ? "translate-x-5" : ""
                }`}
              />
            </span>
          </button>

          <FormField label="Notas (opcional)">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="input-techno resize-none"
              placeholder="Qué regalo, con quién viene, etc."
            />
          </FormField>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={handleClose} className="btn-techno-outline flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || uploading || isMinor}
              className="btn-celeste flex-1 disabled:opacity-60"
            >
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Agregar cumpleañero"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-xs tracking-[0.15em] uppercase text-muted-foreground font-medium px-4 py-3">
    {children}
  </th>
);

const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
);

/**
 * Fecha exacta en la que cumple 18. Se usa en el aviso de menor de edad: lo que
 * importa no es la edad de hoy sino si llega a los 18 antes del evento.
 */
const eighteenthBirthday = (birth: string) => {
  const d = new Date(birth);
  d.setFullYear(d.getFullYear() + 18);
  return d.toISOString().slice(0, 10);
};

const calcAge = (birth: string) => {
  if (!birth) return "—";
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
};

export default Admin;
