import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck, User as UserIcon, UserCircle } from "lucide-react";
import odiseaLogoDark from "@/assets/odisea-logo-black.png";
import odiseaLogoLight from "@/assets/odisea-logo-white.png";
import { useTheme } from "@/contexts/ThemeContext";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { useAuth, isStaffRole } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useGaleria } from "@/lib/galeria";


const Header = () => {
  // El logo negro se pierde sobre el fondo oscuro del tema estacional.
  const { theme } = useTheme();
  const odiseaLogo = theme === "halloween" ? odiseaLogoLight : odiseaLogoDark;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { currentUser, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // "Eventos anteriores" sólo existe si la galería tiene algo cargado: un botón
  // que lleva a una sección que no se muestra es peor que no tenerlo.
  const hayGaleria = (useGaleria()?.length ?? 0) > 0;

  /**
   * En la home, ir a una sección es scrollear, no navegar: un `<Link to="/#x">`
   * a la URL en la que ya estás no cambia nada y el click parece muerto. Desde
   * otra página sí se navega, y `ScrollToTop` baja hasta el ancla.
   */
  const irAAncla = (e: React.MouseEvent, id: string) => {
    if (pathname !== "/") return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    // En desktop el botón vive dentro del dropdown, que se desmonta con este
    // mismo click. Esperamos un tick a que eso ocurra antes de abrir el diálogo;
    // si no, Radix interpreta el click como "click afuera" y lo cierra al toque
    // (se nota con mouse, no con touch). Así funciona en PC y en mobile.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const ok = await confirm({
      title: "Cerrar sesión",
      description: "¿Querés cerrar tu sesión?",
      confirmText: "Cerrar sesión",
    });
    if (!ok) return;
    await logout();
    navigate("/");
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-papel/80 backdrop-blur-md border-b border-border"
          : "bg-papel/0 border-b border-transparent"
      }`}
    >
      {/* Línea decorativa celeste superior */}
      <div className="h-1 bg-celeste" />
      <div className="container-odisea">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo - Always an image, never text */}
          <Link to="/" className="flex items-center">
            <img
              src={odiseaLogo}
              alt="ODÍSEA Logo"
              className="h-12 md:h-16 w-auto object-contain"
            />
          </Link>

          {/* Minimal navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/#eventos"
              onClick={(e) => irAAncla(e, "eventos")}
              className="font-sport text-sm font-bold tracking-[0.15em] uppercase text-tinta/70 hover:text-celeste-deep transition-colors duration-200"
            >
              Eventos
            </Link>
            {hayGaleria && (
              <Link
                to="/#anteriores"
                onClick={(e) => irAAncla(e, "anteriores")}
                className="font-sport text-sm font-bold tracking-[0.15em] uppercase text-tinta/70 hover:text-celeste-deep transition-colors duration-200"
              >
                Eventos anteriores
              </Link>
            )}
            {/* Resaltado: es lo que más conviene que se toque. Con borde y
                fondo suave y NO relleno sólido, para no competir con "Crear
                cuenta", que ya es el botón naranja lleno de este mismo header. */}
            <Link
              to="/#promos"
              onClick={(e) => irAAncla(e, "promos")}
              className="font-sport text-sm font-bold tracking-[0.15em] uppercase rounded-full border-2 border-celeste bg-celeste/10 px-4 py-1.5 text-celeste-deep hover:bg-celeste hover:text-accent-foreground transition-colors duration-200"
            >
              Promociones
            </Link>
            <a
              href="https://www.instagram.com/odisea.uy/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sport text-sm font-bold tracking-[0.15em] uppercase text-tinta/70 hover:text-celeste-deep transition-colors duration-200"
            >
              Instagram
            </a>

            {currentUser ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 text-sm font-semibold tracking-wide rounded-full border border-tinta/15 pl-1.5 pr-3 py-1 hover:bg-secondary transition-colors"
                >
                  <ProfileAvatar size={28} />
                  {currentUser.firstName}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-popover rounded-xl border border-border shadow-[var(--shadow-lg)] py-2 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border mb-1 flex items-center gap-3">
                      <ProfileAvatar size={40} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {currentUser.firstName} {currentUser.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                      </div>
                    </div>
                    <Link
                      to="/perfil"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary"
                    >
                      <UserCircle className="w-4 h-4" />
                      Mi perfil
                    </Link>
                    {isStaffRole(currentUser.role) && (
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {currentUser.role === "admin" ? "Panel admin" : "Entregas"}
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary text-left border-t border-border mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="font-sport text-sm font-bold tracking-[0.15em] uppercase text-tinta/70 hover:text-celeste-deep transition-colors duration-200"
                >
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  className="text-sm font-semibold tracking-wide bg-celeste text-accent-foreground rounded-full px-5 py-2 hover:bg-celeste-deep active:scale-[0.98] transition-all"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile actions */}
          <div className="md:hidden flex items-center gap-2">
            {/* Los dos atajos, en celular también. "Promociones" va relleno: es el
                resaltado. "Eventos anteriores" va en dos líneas porque en una
                no entra junto a los iconos de sesión y WhatsApp. */}
            {hayGaleria && !currentUser && (
              <Link
                to="/#anteriores"
                onClick={(e) => irAAncla(e, "anteriores")}
                className="flex h-11 items-center px-1 text-center font-sport text-[10px] font-bold uppercase leading-[1.1] tracking-wide text-tinta/80"
              >
                Eventos
                <br />
                anteriores
              </Link>
            )}
            <Link
              to="/#promos"
              onClick={(e) => irAAncla(e, "promos")}
              // Con sesión iniciada hay más iconos a la derecha (hasta 4 para el
              // staff), así que el botón se achica para que el header no se desborde.
              className={`flex h-11 items-center rounded-full bg-celeste font-sport font-bold uppercase tracking-wide text-accent-foreground active:scale-[0.97] ${
                currentUser ? "px-2.5 text-[10px]" : "px-3.5 text-[11px]"
              }`}
            >
              Promociones
            </Link>
            {currentUser ? (
              <>
                <Link to="/perfil" className="rounded-full border border-border overflow-hidden" aria-label="Mi perfil">
                  <ProfileAvatar size={36} />
                </Link>
                {isStaffRole(currentUser.role) && (
                  <Link
                    to="/admin"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border"
                    aria-label={currentUser.role === "admin" ? "Panel admin" : "Entregas"}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border"
                aria-label="Ingresar"
              >
                <UserIcon className="w-4 h-4" />
              </Link>
            )}

            <a
              href="https://wa.me/59892592179"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno-outline h-11 min-w-[44px] text-xs px-3"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
