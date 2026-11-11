import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Cake,
  CalendarDays,
  CreditCard,
  ExternalLink,
  Film,
  Images,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  Palette,
  Search,
  Send,
  Sun,
  Tag,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdminTab } from "@/lib/adminPermisos";
import type { PanelTema } from "@/lib/panelTema";
import odiseaLogoNegro from "@/assets/odisea-logo-black.png";
import odiseaLogoBlanco from "@/assets/odisea-logo-white.png";

/**
 * Caparazón del panel: navegación, encabezado, sesión, buscador y tema.
 *
 * **Mobile first.** En celular hay una barra ABAJO, a mano del pulgar, con las
 * pestañas que más usa ese rol (`ABAJO`) y "Más" para el resto, que abre un
 * `Sheet` con todo. Arriba queda una barra fina con el título, la lupa y el
 * claro/oscuro. Antes la navegación del celular era un menú hamburguesa
 * arriba a la izquierda: el rincón más lejos del pulgar, para lo que más se
 * toca.
 *
 * De `md:` para arriba, barra lateral fija como siempre.
 *
 * Cada pestaña puede llevar un número (`insignias`): lo que está esperando a
 * alguien ahí (ver `src/lib/pendientesPanel.ts`).
 */

interface TabMeta {
  label: string;
  /** Más corto, para la barra de abajo del celular. */
  corto?: string;
  icon: ReactNode;
  /** Bajada chica arriba del título. */
  kicker: string;
  title: string;
}

/**
 * Los rótulos de cada pestaña, en un solo lugar: botón, bajada y título salen
 * de acá, así agregar una pestaña es tocar un solo lugar.
 */
const TAB_META: Record<AdminTab, TabMeta> = {
  dashboard: {
    label: "Inicio",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
    kicker: "Lo que hay que hacer hoy",
    title: "INICIO",
  },
  events: {
    label: "Eventos",
    icon: <CalendarDays className="h-[18px] w-[18px]" />,
    kicker: "Gestión",
    title: "EVENTOS",
  },
  tickets: {
    label: "Entradas",
    icon: <Ticket className="h-[18px] w-[18px]" />,
    kicker: "Tipos de entrada",
    title: "ENTRADAS",
  },
  promos: {
    label: "Promos",
    icon: <Tag className="h-[18px] w-[18px]" />,
    kicker: "Promos de entrada",
    title: "PROMOS",
  },
  deliveries: {
    label: "Entregas",
    corto: "Ventas",
    icon: <Send className="h-[18px] w-[18px]" />,
    kicker: "Ventas y envío de entradas",
    title: "ENTREGAS",
  },
  history: {
    label: "Historia",
    icon: <Archive className="h-[18px] w-[18px]" />,
    kicker: "Eventos y ranking",
    title: "HISTORIA DE ODÍSEA",
  },
  birthdays: {
    label: "Cumpleaños",
    corto: "Cumples",
    icon: <Cake className="h-[18px] w-[18px]" />,
    kicker: "Promo cumpleaños",
    title: "CUMPLEAÑOS",
  },
  accounts: {
    label: "Cuentas",
    icon: <CreditCard className="h-[18px] w-[18px]" />,
    kicker: "Cobros",
    title: "CUENTAS",
  },
  users: {
    label: "Usuarios",
    icon: <Users className="h-[18px] w-[18px]" />,
    kicker: "Comunidad",
    title: "USUARIOS",
  },
  banners: {
    label: "Banners",
    icon: <Images className="h-[18px] w-[18px]" />,
    kicker: "Hero de la home",
    title: "BANNERS",
  },
  gallery: {
    label: "Galería",
    icon: <Film className="h-[18px] w-[18px]" />,
    kicker: "Eventos anteriores",
    title: "GALERÍA",
  },
  voting: {
    label: "Votación",
    icon: <Trophy className="h-[18px] w-[18px]" />,
    kicker: "Concurso de disfraces",
    title: "VOTACIÓN",
  },
  appearance: {
    label: "Apariencia",
    icon: <Palette className="h-[18px] w-[18px]" />,
    kicker: "Cara del sitio",
    title: "APARIENCIA",
  },
};

/**
 * Qué va en la barra de abajo del celular, en orden de prioridad: lo que se
 * usa todos los días. Cada rol se queda con las primeras 4 que puede ver; el
 * resto va en "Más".
 */
const ABAJO: readonly AdminTab[] = ["dashboard", "deliveries", "events", "birthdays", "users", "promos"];
const EN_BARRA = 4;

const Insignia = ({ n, chica = false }: { n?: number; chica?: boolean }) =>
  n ? (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-charrua font-bold leading-none text-white tabular-nums ${
        chica ? "absolute -right-2 -top-1 h-4 min-w-4 px-1 text-[10px]" : "ml-auto h-5 min-w-5 px-1.5 text-[11px]"
      }`}
      aria-label={`${n} pendientes`}
    >
      {n > 99 ? "99+" : n}
    </span>
  ) : null;

const NavLink = ({
  tab,
  active,
  onClick,
  insignia,
}: {
  tab: AdminTab;
  active: boolean;
  onClick: () => void;
  insignia?: number;
}) => (
  <button
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    // min-h-11 = 44px: el mínimo táctil de las guías de accesibilidad.
    className={`flex min-h-11 w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors ${
      active
        ? "bg-nav-activo font-semibold text-nav-activo-foreground"
        : "text-nav-muted hover:bg-nav-hover hover:text-nav-foreground"
    }`}
  >
    {TAB_META[tab].icon}
    <span>{TAB_META[tab].label}</span>
    <Insignia n={insignia} />
  </button>
);

/** El contenido de la navegación, compartido por la barra lateral y el Sheet. */
const Nav = ({
  tabs,
  activeTab,
  onSelect,
  insignias,
}: {
  tabs: AdminTab[];
  activeTab: AdminTab;
  onSelect: (t: AdminTab) => void;
  insignias: Partial<Record<AdminTab, number>>;
}) => (
  /*
   * `min-h-0` no es decoración: sin eso, un hijo `flex-1` NO se encoge por
   * debajo de su contenido (su `min-height` es `auto`), así que la lista
   * empujaba al bloque de sesión fuera de la pantalla. Con `min-h-0` se
   * encoge, y `overflow-y-auto` le da scroll propio.
   */
  <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
    {tabs.map((t) => (
      <NavLink key={t} tab={t} active={activeTab === t} onClick={() => onSelect(t)} insignia={insignias[t]} />
    ))}
    <Link
      to="/"
      className="mt-auto flex min-h-11 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm text-nav-muted transition-colors hover:bg-nav-hover hover:text-nav-foreground"
    >
      <ExternalLink className="h-[18px] w-[18px]" />
      <span>Ver sitio</span>
    </Link>
  </nav>
);

const BotonTema = ({ tema, onTema, conTexto = false }: { tema: PanelTema; onTema: (t: PanelTema) => void; conTexto?: boolean }) => {
  const oscuro = tema === "oscuro";
  return (
    <button
      type="button"
      onClick={() => onTema(oscuro ? "claro" : "oscuro")}
      aria-label={oscuro ? "Pasar a modo claro" : "Pasar a modo oscuro"}
      title={oscuro ? "Modo claro" : "Modo oscuro"}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-nav-muted transition-colors hover:bg-nav-hover hover:text-nav-foreground ${
        conTexto ? "w-full px-3 text-sm" : "w-11"
      }`}
    >
      {oscuro ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      {conTexto && <span className="mr-auto">{oscuro ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
};

const Sesion = ({
  nombre,
  email,
  rotulo,
  onLogout,
  tema,
  onTema,
}: {
  nombre: string;
  email: string;
  rotulo: string;
  onLogout: () => void;
  tema: PanelTema;
  onTema: (t: PanelTema) => void;
}) => (
  // `flex-shrink-0`: el pie no se achica aunque falte lugar — el que cede es
  // la lista, que tiene scroll.
  <div className="flex-shrink-0 space-y-2 border-t border-border p-3">
    <BotonTema tema={tema} onTema={onTema} conTexto />
    <div className="flex items-center gap-3 rounded-lg px-3 py-2">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-celeste text-sm font-bold text-white">
        {nombre.trim()[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-nav-foreground">{nombre}</p>
        <p className="truncate text-xs text-nav-muted">{email}</p>
      </div>
      <button
        onClick={onLogout}
        aria-label="Cerrar sesión"
        title={`Cerrar sesión (${rotulo})`}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-nav-muted transition-colors hover:bg-nav-hover hover:text-charrua"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  </div>
);

const Logo = ({ tema, className }: { tema: PanelTema; className: string }) => (
  <img src={tema === "oscuro" ? odiseaLogoBlanco : odiseaLogoNegro} alt="Odísea" className={`w-auto object-contain ${className}`} />
);

const AdminShell = ({
  tabs,
  activeTab,
  onSelect,
  rotulo,
  nombre,
  email,
  onLogout,
  insignias = {},
  tema,
  onTema,
  onBuscar,
  children,
}: {
  tabs: AdminTab[];
  activeTab: AdminTab;
  onSelect: (t: AdminTab) => void;
  rotulo: string;
  nombre: string;
  email: string;
  onLogout: () => void;
  /** Lo que espera en cada pestaña (el número rojo). */
  insignias?: Partial<Record<AdminTab, number>>;
  tema: PanelTema;
  onTema: (t: PanelTema) => void;
  /** Abre el buscador (Ctrl+K). Sin esto no se muestra la lupa. */
  onBuscar?: () => void;
  children: ReactNode;
}) => {
  const [abierto, setAbierto] = useState(false);
  const meta = TAB_META[activeTab];

  const elegir = (t: AdminTab) => {
    onSelect(t);
    setAbierto(false); // el Sheet se cierra solo al navegar
    window.scrollTo({ top: 0 });
  };

  const enBarra = ABAJO.filter((t) => tabs.includes(t)).slice(0, EN_BARRA);
  // Con una sola pestaña (el rol cumples) no hay nada para navegar.
  const conBarra = tabs.length > 1;
  const resto = tabs.filter((t) => !enBarra.includes(t));
  const insigniaMas = resto.reduce((a, t) => a + (insignias[t] ?? 0), 0);

  const lupa = onBuscar && (
    <button
      type="button"
      onClick={onBuscar}
      aria-label="Buscar en el panel"
      className="flex h-11 w-11 items-center justify-center rounded-lg text-nav-muted transition-colors hover:bg-nav-hover hover:text-nav-foreground"
    >
      <Search className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* ── Barra lateral fija (md en adelante) ───────────────────────── */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-nav text-nav-foreground md:sticky md:top-0 md:flex md:h-screen">
        <div className="flex-shrink-0 px-5 pb-3 pt-5">
          {/* El PNG es cuadrado con aire alrededor de la palabra: se agranda y se recorta el aire con márgenes negativos. */}
          <Logo tema={tema} className="-my-5 -ml-4 h-24" />
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-nav-muted">{rotulo}</p>
        </div>
        {onBuscar && (
          <div className="px-3">
            <button
              type="button"
              onClick={onBuscar}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
          </div>
        )}
        <Nav tabs={tabs} activeTab={activeTab} onSelect={elegir} insignias={insignias} />
        <Sesion nombre={nombre} email={email} rotulo={rotulo} onLogout={onLogout} tema={tema} onTema={onTema} />
      </aside>

      {/* ── Barra superior (sólo celular) ─────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-nav/95 px-3 py-1.5 text-nav-foreground backdrop-blur md:hidden">
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-nav-muted">{meta.kicker}</p>
          <p className="truncate text-base font-bold tracking-wide">{meta.title}</p>
        </div>
        {lupa}
        <BotonTema tema={tema} onTema={onTema} />
        {/* Sin barra de abajo (una sola pestaña), la salida va acá. */}
        {!conBarra && (
          <button
            onClick={onLogout}
            aria-label="Cerrar sesión"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-nav-muted hover:bg-nav-hover"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent
          side="bottom"
          // El botón de cerrar que trae SheetContent es un icono de 16px suelto:
          // se le da la caja táctil de 44px sin tocar el componente compartido.
          className="flex max-h-[85dvh] flex-col rounded-t-2xl border-border bg-nav p-0 text-nav-foreground [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        >
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Logo tema={tema} className="-my-4 -ml-2 h-16" />
            <SheetTitle className="text-[11px] font-normal uppercase tracking-[0.25em] text-nav-muted">{rotulo}</SheetTitle>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Nav tabs={tabs} activeTab={activeTab} onSelect={elegir} insignias={insignias} />
          </div>
          <Sesion nombre={nombre} email={email} rotulo={rotulo} onLogout={onLogout} tema={tema} onTema={onTema} />
        </SheetContent>
      </Sheet>

      {/* ── Contenido ─────────────────────────────────────────────────── */}
      {/* pb: en celular la barra de abajo tapa los últimos 64 px. */}
      <main className={`min-w-0 max-w-full flex-1 overflow-x-hidden p-4 md:p-8 ${conBarra ? "pb-28 md:pb-8" : ""}`}>
        {/* En celular el título ya está en la barra de arriba. */}
        <div className="mb-6 hidden items-end justify-between gap-4 md:mb-8 md:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{meta.kicker}</p>
            <h1 className="title-sport text-3xl font-black tracking-wide text-tinta md:text-4xl">{meta.title}</h1>
          </div>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs uppercase tracking-wider transition-colors hover:border-foreground/30"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Ver sitio
          </Link>
        </div>
        {children}
      </main>

      {/* ── Barra de abajo (sólo celular) ─────────────────────────────── */}
      {conBarra && (
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-nav/95 text-nav-foreground backdrop-blur md:hidden"
          style={{
            gridTemplateColumns: `repeat(${enBarra.length + (resto.length ? 1 : 0)}, minmax(0, 1fr))`,
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {enBarra.map((t) => {
            const activa = t === activeTab;
            return (
              <button
                key={t}
                onClick={() => elegir(t)}
                aria-current={activa ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  activa ? "text-celeste-deep" : "text-nav-muted"
                }`}
              >
                <span className={`relative rounded-full px-4 py-1 ${activa ? "bg-nav-activo" : ""}`}>
                  {TAB_META[t].icon}
                  <Insignia n={insignias[t]} chica />
                </span>
                {TAB_META[t].corto ?? TAB_META[t].label}
              </button>
            );
          })}
          {resto.length > 0 && (
            <button
              onClick={() => setAbierto(true)}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                resto.includes(activeTab) ? "text-celeste-deep" : "text-nav-muted"
              }`}
            >
              <span className={`relative rounded-full px-4 py-1 ${resto.includes(activeTab) ? "bg-nav-activo" : ""}`}>
                <MoreHorizontal className="h-[18px] w-[18px]" />
                <Insignia n={insigniaMas} chica />
              </span>
              Más
            </button>
          )}
        </nav>
      )}
    </div>
  );
};

export default AdminShell;
