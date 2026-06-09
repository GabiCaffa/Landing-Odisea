import { useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import EventsSection from "@/components/EventsSection";
import PromosSection from "@/components/PromosSection";
import Footer from "@/components/Footer";

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
    </div>
  );
};

export default Index;
