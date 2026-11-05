import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Clock, Mail, RefreshCw } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { formatEventDate } from "@/contexts/AuthContext";
import { EstadoPedido, fetchEstadoPedido } from "@/lib/pedidosWeb";
import { urlDeEvento } from "@/lib/rutas";

/**
 * "Mi pedido": el cliente ve en qué está su compra (v43).
 *
 * Existe por el problema con el que arrancó todo esto: en plena venta los
 * mensajes quedaban días sin contestar y la mitad eran "¿te llegó mi
 * transferencia?". Con el número que ya va en su mensaje, el cliente lo mira
 * acá sin escribir a nadie.
 *
 * Tres pasos, siempre a la vista, para que se entienda qué falta: pedido
 * enviado → pago confirmado → entradas enviadas. Muestra sólo lo que devuelve
 * `estado_pedido()`: nada de email ni teléfono.
 */

const WHATSAPP = "59892592179";

const PASOS = [
  { titulo: "Pedido recibido", texto: "Nos llegó tu pedido." },
  { titulo: "Pago confirmado", texto: "Revisamos tu comprobante." },
  { titulo: "Entradas enviadas", texto: "Te llegan al mail." },
];

/** En qué paso está: 0, 1 o 2. */
const pasoDe = (estado: EstadoPedido["estado"]) => (estado === "sent" ? 2 : estado === "pending" ? 1 : 0);

const MENSAJES: Record<number, string> = {
  0: "Si todavía no lo hiciste, mandanos el comprobante de la transferencia por WhatsApp. Cuando lo revisemos, este pedido pasa a Pago confirmado.",
  1: "Ya confirmamos tu pago. Las entradas te llegan al mail con el que hiciste el pedido.",
  2: "Las entradas ya salieron a tu mail. Si no las ves, revisá la carpeta de spam o promociones.",
};

const Pedido = () => {
  const { codigo = "" } = useParams();
  const numero = codigo.toUpperCase();
  const [pedido, setPedido] = useState<EstadoPedido | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no-existe" | "error">("cargando");

  const cargar = async () => {
    setEstado("cargando");
    try {
      const p = await fetchEstadoPedido(numero);
      setPedido(p);
      setEstado(p ? "listo" : "no-existe");
    } catch {
      setEstado("error");
    }
  };

  useEffect(() => {
    void cargar();
    // Sólo cuando cambia el número.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero]);

  const consulta = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola! Consulto por mi pedido #${numero}`)}`;
  const paso = pedido ? pasoDe(pedido.estado) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 px-4 pb-16 pt-24 md:pt-32">
        <div className="mx-auto max-w-lg">
          <p className="eyebrow mb-2">Seguimiento</p>
          <h1 className="title-sport mb-6 text-4xl text-tinta sm:text-5xl">
            PEDIDO <span className="highlight-celeste">#{numero}</span>
          </h1>

          {estado === "cargando" && (
            <p className="text-sm text-muted-foreground" role="status">
              Buscando tu pedido…
            </p>
          )}

          {(estado === "no-existe" || estado === "error") && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold">
                {estado === "error" ? "No pudimos revisar tu pedido ahora." : "No encontramos ese pedido."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {estado === "error"
                  ? "Probá de nuevo en un rato."
                  : "Revisá el número en el mensaje que nos mandaste. Si compraste escribiéndonos directo, puede no tener número: consultanos por WhatsApp."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {estado === "error" && (
                  <button type="button" onClick={() => void cargar()} className="btn-techno-outline inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Reintentar
                  </button>
                )}
                <a href={consulta} target="_blank" rel="noopener noreferrer" className="btn-celeste inline-flex items-center gap-2">
                  <WhatsAppIcon className="h-4 w-4" /> Consultar por WhatsApp
                </a>
              </div>
            </div>
          )}

          {estado === "listo" && pedido && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {pedido.nombre ? `${pedido.nombre}, este` : "Este"} es tu pedido para
                </p>
                {pedido.slug ? (
                  <Link to={urlDeEvento(pedido.slug)} className="text-lg font-bold hover:underline">
                    {pedido.evento}
                  </Link>
                ) : (
                  <p className="text-lg font-bold">{pedido.evento}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatEventDate(pedido.fecha)}
                  {pedido.lugar ? ` · ${pedido.lugar}` : ""}
                </p>
                <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
                  <span>
                    {pedido.detalle || `${pedido.cantidad} entrada${pedido.cantidad === 1 ? "" : "s"}`}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">${pedido.total}</span>
                </div>
              </div>

              {/* Los tres pasos: lo hecho con tilde, lo que sigue apagado. */}
              <ol className="space-y-3" aria-label="Estado del pedido">
                {PASOS.map((p, i) => {
                  const hecho = i <= paso;
                  const actual = i === paso;
                  return (
                    <li key={p.titulo} className="flex items-start gap-3" aria-current={actual ? "step" : undefined}>
                      <span
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${
                          hecho
                            ? "border-celeste bg-celeste text-accent-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {hecho ? <Check className="h-4 w-4" /> : i === 2 ? <Mail className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className={`font-semibold ${hecho ? "" : "text-muted-foreground"}`}>{p.titulo}</p>
                        <p className="text-sm text-muted-foreground">{p.texto}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="rounded-2xl border border-celeste/30 bg-celeste/10 p-4 text-sm">{MENSAJES[paso]}</p>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void cargar()} className="btn-techno-outline inline-flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" /> Actualizar
                </button>
                <a href={consulta} target="_blank" rel="noopener noreferrer" className="btn-techno-outline inline-flex items-center gap-2">
                  <WhatsAppIcon className="h-4 w-4" /> Consultar por WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Pedido;
