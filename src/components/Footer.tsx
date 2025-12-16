import { Instagram } from "lucide-react";
import odiseaLogoWhite from "@/assets/odisea-logo-white.png";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  return (
    <footer ref={ref} className="bg-foreground text-background section-padding">
      <div className="container-odisea">
        <div className={`flex flex-col items-center text-center space-y-8 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Logo - Always an image */}
          <img
            src={odiseaLogoWhite}
            alt="ODÍSEA"
            className="h-10 md:h-12 w-auto object-contain"
          />

          {/* Social links */}
          <div className="flex items-center gap-6">
            {/* Instagram */}
            <a
              href="https://www.instagram.com/odisea.uy/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 border border-background/20 hover:border-background/50 hover:bg-background/10 transition-all duration-300"
              aria-label="Síguenos en Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>

            {/* WhatsApp - Using official logo */}
            <a
              href="https://wa.me/59891816716"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 border border-background/20 hover:border-background/50 hover:bg-background/10 transition-all duration-300"
              aria-label="Contáctanos por WhatsApp"
            >
              <img src={whatsappLogo} alt="WhatsApp" className="w-5 h-5" />
            </a>
          </div>

          {/* Divider */}
          <div className="w-16 h-px bg-background/20" />

          {/* Copyright */}
          <p className="text-sm text-background/60 tracking-wide">
            © {currentYear} ODÍSEA. Todos los derechos reservados.
          </p>
           {/* Copyright */}
          <p className="text-sm text-background/60 tracking-wide">
            Diseñado y desarrollado por LiSoft <h1>lisoftuy@gmail.com</h1>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
