import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Miniatura, Visor } from "@/components/GaleriaAnteriores";
import { useAlbumes, useGaleria } from "@/lib/galeria";

/**
 * Álbum de fotos de un evento (v37): /fotos/<slug>. Grilla pareja y liviana
 * (pueden ser cientos de fotos), con el mismo visor que la galería de la home.
 */

const DE_A = 30;

const Fotos = () => {
  const { slug } = useParams();
  const albumes = useAlbumes();
  const todos = useGaleria();
  const [visibles, setVisibles] = useState(DE_A);
  const [abierto, setAbierto] = useState<number | null>(null);

  const album = albumes?.find((a) => a.slug === slug);
  const fotos = album && todos ? todos.filter((i) => i.albumId === album.id) : [];

  useEffect(() => {
    const previo = document.title;
    document.title = `${album ? `Fotos ${album.title}` : "Fotos"} · ODÍSEA`;
    return () => {
      document.title = previo;
    };
  }, [album]);

  const cargando = albumes === null || todos === null;
  const mostradas = fotos.slice(0, visibles);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-28 md:pt-36">
        <div className="container-odisea">
          {cargando ? (
            <p className="py-20 text-center text-muted-foreground">Cargando…</p>
          ) : !album || fotos.length === 0 ? (
            <div className="py-20 text-center">
              <h1 className="title-sport mb-3 text-3xl text-tinta">No encontramos ese álbum</h1>
              <Link to="/#anteriores" className="btn-techno-outline inline-flex min-h-[44px] items-center px-6 text-xs">
                Ver eventos anteriores
              </Link>
            </div>
          ) : (
            <>
              <Link
                to="/#anteriores"
                className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-tinta"
              >
                <ArrowLeft className="h-4 w-4" /> Eventos anteriores
              </Link>
              <div className="mb-6 md:mb-8">
                <p className="eyebrow mb-2">
                  {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}
                </p>
                <h1 className="title-sport text-4xl text-tinta sm:text-5xl md:text-6xl">
                  FOTOS <span className="highlight-celeste">{album.title.toUpperCase()}</span>
                </h1>
              </div>

              <div className="grid grid-cols-3 gap-1.5 md:grid-cols-5 md:gap-2">
                {mostradas.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAbierto(i)}
                    aria-label={item.kind === "video" ? "Ver video" : "Ver foto"}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-secondary"
                  >
                    <Miniatura item={item} grande={false} />
                    {item.kind === "video" && (
                      <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-celeste text-accent-foreground">
                        <Play className="h-4 w-4 translate-x-px fill-current" />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {visibles < fotos.length && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibles((v) => v + DE_A)}
                    className="btn-techno-outline min-h-[44px] px-6 text-xs"
                  >
                    Ver más
                  </button>
                </div>
              )}

              {abierto !== null && (
                <Visor
                  items={mostradas}
                  indice={abierto}
                  onCambiar={setAbierto}
                  onCerrar={() => setAbierto(null)}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Fotos;
