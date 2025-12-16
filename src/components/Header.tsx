import { useState, useEffect } from "react";
import odiseaLogo from "@/assets/odisea-logo-black.png";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import whatsappLogo2 from "@/assets/whatsapp-logo2.png";


const Header = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? "bg-background/80 backdrop-blur-md border-b border-border" 
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="container-odisea">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo - Always an image, never text */}
          <a href="#" className="flex items-center">
            <img
  src={odiseaLogo}
  alt="ODÍSEA Logo"
  className="h-12 md:h-16 w-auto object-contain"
/>
          </a>

          {/* Minimal navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#eventos"
              className="text-sm tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Eventos
            </a>
            <a
              href="https://www.instagram.com/odisea.uy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Instagram
            </a>
          </nav>

          {/* Mobile WhatsApp button */}
          <a
            href="https://wa.me/59891816716"
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden btn-techno-outline text-xs py-2 px-4"
          >
            <img src={whatsappLogo2} alt="WhatsApp" className="w-5 h-5" />
            Contacto
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
