import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PedirIngresoPedidos from "@/components/PedirIngresoPedidos";
import { ChevronRight, Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatEventDate, useAuth } from "@/contexts/AuthContext";
import { EstadoPedido, fetchMisPedidos } from "@/lib/pedidosWeb";

/**
 * "Mis pedidos" (v44): la lista, a la que lleva el botón del menú.
 *
 * Los pedidos de la cuenta con la que se entró, aunque se hayan hecho desde
 * otro teléfono, y los hechos sin cuenta con el mismo mail. **Sin sesión no
 * muestra nada**: pide entrar (v44). Cada uno lleva a `/pedido/:codigo`.
 *
 * Abajo, un buscador por número, que también responde sólo con los propios.
 */

const ESTADO: Record<EstadoPedido["estado"], { texto: string; clase: string }> = {
  por_confirmar: { texto: "Pago por confirmar", clase: "border-border text-muted-foreground" },
  vencido: { texto: "Pago por confirmar", clase: "border-border text-muted-foreground" },
  pending: { texto: "Pago confirmado", clase: "border-celeste/50 bg-celeste/10 text-celeste-deep" },
  sent: { texto: "Entradas enviadas", clase: "border-green-600/40 bg-green-600/10 text-green-700" },
};

const MisPedidos = () => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<EstadoPedido[] | null>(null);
  const [error, setError] = useState(false);
  const [numero, setNumero] = useState("");

  useEffect(() => {
    // Sin sesión no se pide nada: los pedidos se ven sólo con la cuenta (v44).
    if (loading) return;
    // Al cerrar sesión, lo que se veía se borra de la pantalla.
    if (!currentUser) {
      setPedidos(null);
      return;
    }
    let vivo = true;
    fetchMisPedidos()
      .then((p) => vivo && (setPedidos(p), setError(false)))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [currentUser, loading]);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const limpio = numero.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (limpio.length === 6) navigate(`/pedido/${limpio}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 px-4 pb-16 pt-24 md:pt-32">
        <div className="mx-auto max-w-lg">
          <p className="eyebrow mb-2">Tus compras</p>
          <h1 className="title-sport mb-6 text-4xl text-tinta sm:text-5xl">
            MIS <span className="highlight-celeste">PEDIDOS</span>
          </h1>

          {!loading && !currentUser && <PedirIngresoPedidos />}

          {currentUser && pedidos === null && !error && (
            <p className="text-sm text-muted-foreground" role="status">
              Buscando tus pedidos…
            </p>
          )}

          {error && (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm">
              No pudimos traer tus pedidos ahora. Probá de nuevo en un rato, o buscá uno por su número acá
              abajo.
            </p>
          )}

          {pedidos && pedidos.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm">
              <p className="font-semibold">Todavía no hay pedidos para mostrar.</p>
              <p className="mt-1 text-muted-foreground">
                Aparecen acá los que hagas desde la web con tu cuenta, y los que hayas hecho sin cuenta con
                tu mismo mail.
              </p>
            </div>
          )}

          {pedidos && pedidos.length > 0 && (
            <ul className="space-y-3">
              {pedidos.map((p) => {
                const estado = ESTADO[p.estado] ?? ESTADO.por_confirmar;
                return (
                  <li key={p.codigo}>
                    <Link
                      to={`/pedido/${p.codigo}`}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-celeste/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{p.evento}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatEventDate(p.fecha)} · #{p.codigo}
                        </p>
                        <p className="mt-1 truncate text-sm">
                          {p.detalle || `${p.cantidad} entrada${p.cantidad === 1 ? "" : "s"}`} · ${p.total}
                        </p>
                        <span
                          className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${estado.clase}`}
                        >
                          {estado.texto}
                        </span>
                      </div>
                      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {currentUser && (
          <form onSubmit={buscar} className="mt-8 rounded-2xl border border-border p-4">
            <label htmlFor="numero-pedido" className="text-sm font-semibold">
              ¿Tenés un número de pedido?
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">Está en el mensaje que nos mandaste: "Pedido: #…".</p>
            <div className="mt-3 flex gap-2">
              <input
                id="numero-pedido"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="K7Q2XM"
                maxLength={8}
                autoCapitalize="characters"
                className="input-techno flex-1 uppercase"
              />
              <button type="submit" className="btn-celeste inline-flex items-center gap-2" aria-label="Buscar pedido">
                <Search className="h-4 w-4" /> <span className="hidden sm:inline">Buscar</span>
              </button>
            </div>
          </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default MisPedidos;
