import { Instagram } from "lucide-react";
import { Link } from "react-router-dom";
import odiseaLogoWhite from "@/assets/odisea-logo-white.png";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  return (
    <footer ref={ref} className="relative bg-tinta text-papel overflow-hidden">
      {/* Halo de acento sutil */}
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-[420px] w-[420px] rounded-full bg-celeste/15 blur-[130px]" />

      <div className="container-odisea relative z-10 py-16 md:py-24">
        <div
          className={`flex flex-col items-center text-center space-y-9 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Logo */}
          <img
            src={odiseaLogoWhite}
            alt="ODÍSEA"
            className="h-10 md:h-14 w-auto object-contain"
          />

          <p className="text-sm md:text-base text-papel/60 max-w-md leading-relaxed">
            Productora de música y eventos. Seguinos para enterarte de las
            próximas fechas.
          </p>

          {/* Social */}
          <div className="flex items-center gap-3">
            <a
              href="https://www.instagram.com/odisea.uy/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-full border border-papel/15 hover:border-celeste hover:bg-celeste hover:text-white transition-all"
              aria-label="Síguenos en Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="https://wa.me/59892592179"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-full border border-papel/15 hover:border-celeste hover:bg-celeste hover:text-white transition-all"
              aria-label="Contáctanos por WhatsApp"
            >
              <img src={whatsappLogo} alt="WhatsApp" className="w-5 h-5" />
            </a>
          </div>

          {/* Links legales */}
          <div className="flex items-center gap-5 text-xs text-papel/60">
            <Link to="/terminos" className="hover:text-celeste transition-colors">
              Términos de Uso
            </Link>
            <span className="h-3 w-px bg-papel/20" />
            <Link to="/privacidad" className="hover:text-celeste transition-colors">
              Política de Privacidad
            </Link>
          </div>

          {/* Divider */}
          <div className="w-16 h-px bg-papel/15" />

          {/* Copyright */}
          <div className="space-y-1.5">
            <p className="text-xs text-papel/50 tracking-wide">
              © {currentYear} ODÍSEA. Todos los derechos reservados.
            </p>
            <p className="text-[10px] text-papel/35 tracking-wide">
              Diseñado y desarrollado por LiSoft · lisoftuy@gmail.com
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
