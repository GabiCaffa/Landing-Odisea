import Header from "@/components/Header";
import Hero from "@/components/Hero";
import EventsSection from "@/components/EventsSection";
import PromosSection from "@/components/PromosSection";
import Footer from "@/components/Footer";
import SpookyLayer from "@/components/SpookyLayer";
import SoundToggle from "@/components/SoundToggle";

/**
 * El título NO se toca acá.
 *
 * Había un `document.title = "ODÍSEA WEB"` que pisaba, apenas montaba React, el
 * `<title>` del `index.html`. O sea que el título escrito para que Google lo
 * muestre —"ODÍSEA · Fiestas y eventos de música electrónica en Uruguay"—
 * duraba hasta el primer render y quedaba "ODÍSEA WEB", que no dice nada y no
 * lo busca nadie. Google ejecuta JavaScript, así que puede quedarse con el
 * pisado.
 *
 * El título de la home vive en `index.html` y en ningún otro lado.
 */
const Index = () => {
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
