import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cake,
  CalendarDays,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Send,
  Tag,
  Ticket,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdminTab } from "@/lib/adminPermisos";
import odiseaLogo from "@/assets/odisea-logo-black.png";

/**
 * Caparazón del panel: navegación, encabezado y sesión.
 *
 * **En celular la navegación va en un `Sheet`, no en una tira.** Antes el
 * sidebar era `flex md:flex-col` con `overflow-x-auto`: en el teléfono quedaba
 * una fila de botones con scroll horizontal. Con 2 pestañas se toleraba; desde
 * v22 el operador ve 7 y el admin 9, y una tira de 9 con scroll lateral es
 * imposible de usar con el pulgar — no se ve dónde termina ni dónde estás
 * parado. El `Sheet` muestra las 9 de una, verticales y con el objetivo táctil
 * completo.
 *
 * De `md:` para arriba no cambia nada: el sidebar sigue fijo a la izquierda.
 */

interface TabMeta {
  label: string;
  icon: ReactNode;
  /** Bajada chica arriba del título. */
  kicker: string;
  title: string;
}

/**
 * Los rótulos de cada pestaña, en un solo lugar.
 *
 * Antes vivían en tres cadenas de `{tab === "x" && "..."}` separadas (botón,
 * kicker y título), o sea el mismo dato escrito tres veces: agregar una
 * pestaña pedía acordarse de los tres lugares.
 */
const TAB_META: Record<AdminTab, TabMeta> = {
  dashboard: {
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    kicker: "Resumen general",
    title: "DASHBOARD",
  },
  events: {
    label: "Eventos",
    icon: <CalendarDays className="h-4 w-4" />,
    kicker: "Gestión",
    title: "EVENTOS",
  },
  tickets: {
    label: "Entradas",
    icon: <Ticket className="h-4 w-4" />,
    kicker: "Tipos de entrada",
    title: "ENTRADAS",
  },
  promos: {
    label: "Promos",
    icon: <Tag className="h-4 w-4" />,
    kicker: "Promos de entrada",
    title: "PROMOS",
  },
  deliveries: {
    label: "Entregas",
    icon: <Send className="h-4 w-4" />,
    kicker: "Envío de entradas",
    title: "ENTREGAS",
  },
  birthdays: {
    label: "Cumpleaños",
    icon: <Cake className="h-4 w-4" />,
    kicker: "Promo cumpleaños",
    title: "CUMPLEAÑOS",
  },
  accounts: {
    label: "Cuentas",
    icon: <CreditCard className="h-4 w-4" />,
    kicker: "Cobros",
    title: "CUENTAS",
  },
  users: {
    label: "Usuarios",
    icon: <Users className="h-4 w-4" />,
    kicker: "Comunidad",
    title: "USUARIOS",
  },
  appearance: {
    label: "Apariencia",
    icon: <Palette className="h-4 w-4" />,
    kicker: "Cara del sitio",
    title: "APARIENCIA",
  },
};

const NavLink = ({
  tab,
  active,
  onClick,
}: {
  tab: AdminTab;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    // min-h-11 = 44px: el mínimo táctil de las guías de accesibilidad.
    className={`flex min-h-11 w-full items-center gap-3 whitespace-nowrap px-4 py-3 text-sm uppercase tracking-wide transition-colors ${
      active
        ? "bg-background text-foreground font-semibold"
        : "text-background/70 hover:bg-background/10 hover:text-background"
    }`}
  >
    {TAB_META[tab].icon}
    <span>{TAB_META[tab].label}</span>
  </button>
);

/** El contenido de la navegación, compartido por el sidebar y el Sheet. */
const Nav = ({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: AdminTab[];
  activeTab: AdminTab;
  onSelect: (t: AdminTab) => void;
}) => (
  <nav className="flex flex-1 flex-col gap-1 p-3 md:p-4">
    {tabs.map((t) => (
      <NavLink key={t} tab={t} active={activeTab === t} onClick={() => onSelect(t)} />
    ))}
    <Link
      to="/"
      className="mt-auto flex min-h-11 items-center gap-3 whitespace-nowrap px-4 py-3 text-sm uppercase tracking-wide text-background/70 transition-colors hover:bg-background/10 hover:text-background"
    >
      <ExternalLink className="h-4 w-4" />
      <span>Ver sitio</span>
    </Link>
  </nav>
);

const Sesion = ({
  nombre,
  email,
  rotulo,
  onLogout,
}: {
  nombre: string;
  email: string;
  rotulo: string;
  onLogout: () => void;
}) => (
  <div className="border-t border-background/10 p-4">
    <p className="mb-1 text-xs text-background/60">{rotulo} · conectado como</p>
    <p className="truncate text-sm font-semibold">{nombre}</p>
    <p className="mb-3 truncate text-xs text-background/60">{email}</p>
    <button
      onClick={onLogout}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-background/30 px-3 py-2 text-xs uppercase tracking-wide transition-colors hover:bg-background hover:text-foreground"
    >
      <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
    </button>
  </div>
);

const AdminShell = ({
  tabs,
  activeTab,
  onSelect,
  rotulo,
  nombre,
  email,
  onLogout,
  children,
}: {
  tabs: AdminTab[];
  activeTab: AdminTab;
  onSelect: (t: AdminTab) => void;
  rotulo: string;
  nombre: string;
  email: string;
  onLogout: () => void;
  children: ReactNode;
}) => {
  const [abierto, setAbierto] = useState(false);
  const meta = TAB_META[activeTab];

  const elegir = (t: AdminTab) => {
    onSelect(t);
    setAbierto(false); // el Sheet se cierra solo al navegar
  };

  return (
    <div className="flex min-h-screen flex-col bg-secondary/20 md:flex-row">
      {/* ── Sidebar fijo (md en adelante) ─────────────────────────────── */}
      <aside className="hidden w-64 flex-col bg-foreground text-background md:sticky md:top-0 md:flex md:h-screen">
        <div className="border-b border-background/10 p-6">
          <img src={odiseaLogo} alt="Odísea" className="h-10 w-auto object-contain invert" />
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-background/60">{rotulo}</p>
        </div>
        <Nav tabs={tabs} activeTab={activeTab} onSelect={elegir} />
        <Sesion nombre={nombre} email={email} rotulo={rotulo} onLogout={onLogout} />
      </aside>

      {/* ── Barra superior (sólo celular) ─────────────────────────────── */}
      {/* Es `sticky`: con listas largas, tener que subir hasta arriba para
          cambiar de pestaña es justo lo que hacía tedioso el panel. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-foreground px-3 py-2 text-background md:hidden">
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="flex h-11 w-11 items-center justify-center"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-background/60">{rotulo}</p>
          <p className="truncate text-sm font-semibold uppercase tracking-wide">{meta.title}</p>
        </div>
        <button
          onClick={onLogout}
          aria-label="Cerrar sesión"
          className="flex h-11 w-11 items-center justify-center"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent
          side="left"
          // El botón de cerrar que trae SheetContent es un icono de 16px suelto.
          // Se le da la caja táctil de 44px sin tocar el componente compartido.
          className="flex w-[280px] flex-col border-none bg-foreground p-0 text-background [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        >
          <div className="border-b border-background/10 p-6">
            <img src={odiseaLogo} alt="Odísea" className="h-8 w-auto object-contain invert" />
            <SheetTitle className="mt-3 text-xs font-normal uppercase tracking-[0.3em] text-background/60">
              {rotulo}
            </SheetTitle>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Nav tabs={tabs} activeTab={activeTab} onSelect={elegir} />
          </div>
          <Sesion nombre={nombre} email={email} rotulo={rotulo} onLogout={onLogout} />
        </SheetContent>
      </Sheet>

      {/* ── Contenido ─────────────────────────────────────────────────── */}
      <main className="max-w-full flex-1 overflow-x-hidden p-4 md:p-8">
        {/* En celular el título ya está en la barra de arriba; repetirlo acá
            gastaba una pantalla entera antes de mostrar nada útil. */}
        <div className="mb-6 hidden items-center justify-between md:mb-8 md:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {meta.kicker}
            </p>
            <h1 className="title-sport text-3xl font-black tracking-wide text-tinta md:text-4xl">
              {meta.title}
            </h1>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-wider transition-colors hover:bg-foreground hover:text-background"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Ver sitio
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
};

export default AdminShell;
