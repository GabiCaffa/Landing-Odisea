import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck, User as UserIcon, UserCircle } from "lucide-react";
import odiseaLogo from "@/assets/odisea-logo-black.png";
import whatsappLogo2 from "@/assets/whatsapp-logo2.png";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileAvatar } from "@/pages/Profile";


const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

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
    await logout();
    setMenuOpen(false);
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
              className="font-sport text-sm font-bold tracking-[0.15em] uppercase text-tinta/70 hover:text-celeste-deep transition-colors duration-200"
            >
              Eventos
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
                    {currentUser.role === "admin" && (
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Panel admin
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
                  className="text-sm font-semibold tracking-wide bg-celeste text-white rounded-full px-5 py-2 hover:bg-celeste-deep active:scale-[0.98] transition-all"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile actions */}
          <div className="md:hidden flex items-center gap-2">
            {currentUser ? (
              <>
                <Link to="/perfil" className="rounded-full border border-border overflow-hidden" aria-label="Mi perfil">
                  <ProfileAvatar size={36} />
                </Link>
                {currentUser.role === "admin" && (
                  <Link
                    to="/admin"
                    className="p-2 rounded-full border border-border"
                    aria-label="Panel admin"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-full border border-border"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="p-2 rounded-full border border-border"
                aria-label="Ingresar"
              >
                <UserIcon className="w-4 h-4" />
              </Link>
            )}

            <a
              href="https://wa.me/59892592179"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno-outline text-xs py-2 px-3"
            >
              <img src={whatsappLogo2} alt="WhatsApp" className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
