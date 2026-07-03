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
} from "@/contexts/AuthContext";
import PhoneInput from "@/components/PhoneInput";
import LocationSelect from "@/components/LocationSelect";
import {
  validateDocumentByCountry,
  documentLabelByCountry,
  documentPlaceholderByCountry,
  normalizePhone,
  formatPhoneDisplay,
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
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type Tab = "dashboard" | "events" | "users" | "deliveries";

const Admin = () => {
  const { currentUser, logout, users, events, loading } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (loading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== "admin") return <Navigate to="/" replace />;

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
          <SidebarLink
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="Dashboard"
            active={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
          />
          <SidebarLink
            icon={<CalendarDays className="w-4 h-4" />}
            label="Eventos"
            active={tab === "events"}
            onClick={() => setTab("events")}
          />
          <SidebarLink
            icon={<Users className="w-4 h-4" />}
            label="Usuarios"
            active={tab === "users"}
            onClick={() => setTab("users")}
          />
          <SidebarLink
            icon={<Send className="w-4 h-4" />}
            label="Entregas"
            active={tab === "deliveries"}
            onClick={() => setTab("deliveries")}
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
              {tab === "dashboard" && "Resumen general"}
              {tab === "events" && "Gestión"}
              {tab === "users" && "Comunidad"}
              {tab === "deliveries" && "Envío de entradas"}
            </p>
            <h1 className="title-sport text-3xl md:text-4xl tracking-wide font-black text-tinta">
              {tab === "dashboard" && "DASHBOARD"}
              {tab === "events" && "EVENTOS"}
              {tab === "users" && "USUARIOS"}
              {tab === "deliveries" && "ENTREGAS"}
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

        {tab === "dashboard" && <Dashboard users={users} events={events} onGo={setTab} />}
        {tab === "events" && <EventsAdmin />}
        {tab === "users" && <UsersAdmin />}
        {tab === "deliveries" && <DeliveriesAdmin />}
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
  const avgPrice = events.length
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
          label="Precio promedio"
          value={`$${avgPrice}`}
          hint="por entrada"
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
    const result = editing
      ? await updateEvent(editing.id, data)
      : await createEvent(data);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar el evento");
      return;
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
              <Th>Precio</Th>
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
                <Td>${e.price}</Td>
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
                <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
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
// Event form modal with image upload, positioning & live preview
// ────────────────────────────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.1;

const EventFormModal = ({
  initial,
  onClose,
  onSave,
}: {
  initial: AdminEvent | null;
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
    image: initial?.image ?? "",
    imagePosition: initial?.imagePosition ?? { ...DEFAULT_IMAGE_TRANSFORM },
    instagramUrl: initial?.instagramUrl ?? "https://www.instagram.com/odisea.uy/",
  });

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Precio (UYU)">
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="input-techno"
                />
              </FormField>
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
              price={form.price}
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
            <span>{status === "agotado" ? "Agotado" : `Comprar · $${price}`}</span>
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
                      <option value="admin">admin</option>
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
    const rows = groups.flatMap((g) => g.rows.map((d) => ({ d, eventName: g.eventName })));
    if (rows.length === 0) {
      toast.error("No hay nada para exportar en esta lista");
      return;
    }
    const headers = [
      "Evento", "Nombre", "Apellido", "Email", "Teléfono", "Documento",
      "Departamento", "País", "Nacimiento", "Entradas", "Valor total",
      "Estado", "Enviada", "Registrado", "Notas",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(({ d, eventName }) =>
      [
        eventName, d.firstName, d.lastName, d.email,
        d.phone ? formatPhoneDisplay(d.phone) : "",
        d.documentId ?? "", d.state ?? "", d.country ?? "", d.birthDate ?? "",
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
                    <p>
                      {[d.state, d.country].filter(Boolean).join(", ") || "—"}
                      {d.documentId ? ` · ${d.documentId}` : ""}
                    </p>
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
                    <Th>Ubicación</Th>
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
                        {d.documentId && (
                          <p className="text-xs text-muted-foreground font-mono">{d.documentId}</p>
                        )}
                      </Td>
                      <Td>
                        <p className="text-xs font-mono">{d.email}</p>
                        {d.phone && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {formatPhoneDisplay(d.phone)}
                          </p>
                        )}
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {[d.state, d.country].filter(Boolean).join(", ") || "—"}
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
  // "manual": tipeás todos los datos a mano. Al editar siempre usamos manual.
  const [mode, setMode] = useState<"registered" | "manual">(
    !editing && users.length > 0 ? "registered" : "manual"
  );
  const [form, setForm] = useState({
    eventId: editing?.eventId ?? (events[0]?.id ?? ""),
    userId: editing?.userId ?? "",
    firstName: editing?.firstName ?? "",
    lastName: editing?.lastName ?? "",
    birthDate: editing?.birthDate ?? "",
    country: editing?.country ?? DEFAULT_COUNTRY_CODE,
    state: editing?.state ?? "",
    documentId: editing?.documentId ?? "",
    phone: editing?.phone ? formatPhoneDisplay(editing.phone).replace(/^\+\d+\s*/, "") : "",
    email: editing?.email ?? "",
    quantity: String(editing?.quantity ?? 1),
    value: editing ? String(editing.value) : "",
    notes: editing?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      ),
    [users]
  );
  const selectedUser = users.find((u) => u.id === form.userId) ?? null;

  const switchMode = (m: "registered" | "manual") => {
    setMode(m);
    // Al pasar a "registrado" limpiamos el vínculo para forzar elegir de la lista.
    if (m === "registered") setForm((p) => ({ ...p, userId: "" }));
    else setForm((p) => ({ ...p, userId: "" })); // manual = sin vínculo a perfil
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.eventId) return toast.error("Elegí el evento");

    const quantity = parseInt(form.quantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) return toast.error("La cantidad debe ser 1 o más");
    if (!form.value.trim()) return toast.error("Indicá el valor total pagado");
    const value = parseFloat(form.value);
    if (!Number.isFinite(value) || value < 0) return toast.error("El valor total no es válido");

    let input: DeliveryInput;

    if (mode === "registered" && !editing) {
      // Cliente registrado: tomamos sus datos del perfil (ya validados al registrarse).
      const u = users.find((x) => x.id === form.userId);
      if (!u) return toast.error("Elegí el cliente registrado");
      input = {
        eventId: form.eventId,
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        birthDate: u.birthDate ?? null,
        country: u.country ?? null,
        state: u.state ?? null,
        documentId: u.documentId ?? null,
        phone: u.phone ?? null,
        email: u.email,
        quantity,
        value,
        notes: form.notes.trim() || null,
      };
    } else {
      // Manual (o edición): validamos todos los datos.
      if (!form.firstName.trim() || !form.lastName.trim()) return toast.error("Completá nombre y apellido");
      if (!form.birthDate) return toast.error("Indicá la fecha de nacimiento");
      if (!form.state.trim()) return toast.error("Indicá la provincia o departamento");

      const email = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Email inválido");

      const doc = form.documentId.trim();
      if (!doc) return toast.error(`Indicá ${documentLabelByCountry(form.country)}`);
      if (!validateDocumentByCountry(doc, form.country)) {
        return toast.error(`${documentLabelByCountry(form.country)} inválido`);
      }

      if (!form.phone.trim()) return toast.error("Indicá el teléfono");
      const phoneE164 = normalizePhone(form.phone, form.country as CountryCode);
      if (!phoneE164) return toast.error("Teléfono inválido");

      input = {
        eventId: form.eventId,
        userId: form.userId || null, // preserva el vínculo si se editaba una registrada
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate,
        country: form.country,
        state: form.state.trim(),
        documentId: doc,
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

          {/* Modo REGISTRADO: elegir usuario + resumen de sus datos (solo lectura) */}
          {!showManualFields && (
            <>
              <FormField label="Cliente registrado">
                <select
                  value={form.userId}
                  onChange={(e) => set("userId", e.target.value)}
                  required
                  className="input-techno"
                >
                  <option value="">Elegí un cliente...</option>
                  {sortedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} — {u.email}
                    </option>
                  ))}
                </select>
              </FormField>

              {sortedUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay usuarios registrados todavía. Usá “Carga manual”.
                </p>
              )}

              {selectedUser && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm space-y-1">
                  <p className="font-semibold">
                    {selectedUser.firstName} {selectedUser.lastName}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-xs font-mono text-muted-foreground">
                      {formatPhoneDisplay(selectedUser.phone)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[selectedUser.state, selectedUser.country].filter(Boolean).join(", ") || "—"}
                    {selectedUser.documentId ? ` · ${selectedUser.documentId}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Sus datos personales se toman del perfil.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Modo MANUAL (o edición): todos los datos a mano */}
          {showManualFields && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Nombre">
                  <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required className="input-techno" placeholder="Juan" />
                </FormField>
                <FormField label="Apellido">
                  <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required className="input-techno" placeholder="Pérez" />
                </FormField>
              </div>

              <FormField label="Fecha de nacimiento">
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  required
                  className="input-techno"
                />
              </FormField>

              <LocationSelect
                country={form.country}
                state={form.state}
                onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
                onStateChange={(s) => set("state", s)}
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label={documentLabelByCountry(form.country)}>
                  <input
                    value={form.documentId}
                    onChange={(e) => set("documentId", e.target.value)}
                    inputMode="numeric"
                    required
                    className="input-techno"
                    placeholder={documentPlaceholderByCountry(form.country)}
                    maxLength={20}
                  />
                </FormField>
                <div>
                  <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Teléfono
                  </span>
                  <PhoneInput
                    country={form.country}
                    value={form.phone}
                    onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
                    onChange={(v) => set("phone", v)}
                    required
                  />
                </div>
              </div>

              <FormField label="Email (destino de las entradas)">
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required className="input-techno" placeholder="cliente@email.com" />
              </FormField>
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
            <FormField label="Valor total pagado ($)">
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
            Total a cobrar registrado: <b className="text-foreground">{fmtMoney(total)}</b>
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

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-xs tracking-[0.15em] uppercase text-muted-foreground font-medium px-4 py-3">
    {children}
  </th>
);

const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
);

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
