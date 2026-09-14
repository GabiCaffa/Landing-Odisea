import { useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import EventsSection from "@/components/EventsSection";
import PromosSection from "@/components/PromosSection";
import Footer from "@/components/Footer";
import SpookyLayer from "@/components/SpookyLayer";
import SoundToggle from "@/components/SoundToggle";

const Index = () => {
  useEffect(() => {
    // Update document title
    document.title = "ODÍSEA WEB";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <EventsSection />
        <PromosSection />
      </main>
      <Footer />

      {/* Decoración y sonido del tema estacional. Los dos se desmontan solos
          con el tema apagado, y van sólo acá: en el registro o el login
          distraerían de lo único que esas páginas tienen que lograr. */}
      <SpookyLayer />
      <SoundToggle />
    </div>
  );
};

export default Index;
