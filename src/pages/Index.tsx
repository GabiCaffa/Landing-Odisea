import Header from "@/components/Header";
import HeroDelSitio from "@/components/HeroDelSitio";
import PromosActivasSection from "@/components/PromosActivasSection";
import EventsSection from "@/components/EventsSection";
import PromosSection from "@/components/PromosSection";
import GaleriaAnteriores from "@/components/GaleriaAnteriores";
import Footer from "@/components/Footer";
import SpookyLayer from "@/components/SpookyLayer";
import SoundToggle from "@/components/SoundToggle";

/**
 * El título NO se toca acá.
 *
 * Había un `document.title = "ODÍSEA WEB"` que pisaba, apenas montaba React, el
 * `<title>` del `index.html`. O sea que el título escrito para que Google lo
 * muestre —"ODÍSEA · Fiestas y eventos en Uruguay"—
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
        {/* El de siempre o el slider de banners, según el interruptor del
            panel (v27). La decisión vive en la base, no acá. */}
        <HeroDelSitio />
        {/* Entre el hero y los eventos: una promo que vence en horas es lo más
            urgente de la página. Si no hay ninguna vigente, no se renderiza. */}
        <PromosActivasSection />
        <EventsSection />
        <PromosSection />
        {/* Fotos y videos de fiestas pasadas (v33). Sin nada cargado no se
            renderiza, ni el título. */}
        <GaleriaAnteriores />
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
