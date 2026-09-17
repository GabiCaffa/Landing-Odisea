import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { CIUDAD_OTRA, ciudadesDe } from "@/lib/ciudades";

/**
 * Le pide la ciudad a quien se registró antes de que el campo existiera (v23).
 *
 * **No bloquea nada, y ésa es la decisión principal.** La alternativa era un
 * modal que no se puede saltear: llena la base más rápido, pero si le aparece a
 * alguien que estaba por comprar una entrada, se pierde la venta — y es
 * justamente la gente que más interesa. Acá va una barra abajo, con el campo
 * ahí mismo para que completarlo sea un click, y un "Ahora no" de verdad.
 *
 * Quien lo cierra no lo vuelve a ver por dos semanas. No es "nunca más" a
 * propósito: el dato sigue haciendo falta y la persona puede estar apurada hoy
 * y no la semana que viene. Pero tampoco en cada carga, que es acoso.
 */

const CLAVE = "odisea:aviso-ciudad-pospuesto";
const DIAS = 14;

/** ¿Lo pospuso hace poco? Si `localStorage` no está disponible, se muestra. */
const pospuestoHacePOco = (): boolean => {
  try {
    const t = Number(localStorage.getItem(CLAVE));
    if (!t) return false;
    return Date.now() - t < DIAS * 24 * 60 * 60 * 1000;
  } catch {
    // Ventana privada o almacenamiento bloqueado: no es motivo para esconder
    // el aviso, sólo para que el "ahora no" dure lo que dure la pestaña.
    return false;
  }
};

const AvisoCiudadBarra = () => {
  const { currentUser, updateProfile } = useAuth();
  const { pathname } = useLocation();

  const [cerrado, setCerrado] = useState(pospuestoHacePOco);
  const [ciudad, setCiudad] = useState("");
  const [otra, setOtra] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // El panel es herramienta de trabajo y no se tematiza (§v19): una barra de la
  // cara pública ahí adentro se ve fuera de lugar. Y en el registro sería
  // absurdo: ese formulario ya pide la ciudad.
  const rutaExcluida = pathname.startsWith("/admin") || pathname.startsWith("/registro");

  // La sesión y la falta de ciudad ya las verificó el portero (AvisoCiudad).
  if (!currentUser || cerrado || rutaExcluida) return null;

  const opciones = ciudadesDe(currentUser.country, currentUser.state);
  const usaLista = opciones.length > 0 && !otra;

  const posponer = () => {
    setCerrado(true);
    try {
      localStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      // Si no se puede guardar, se cerró igual: vuelve en la próxima visita.
    }
  };

  const guardar = async () => {
    const valor = ciudad.trim();
    if (!valor) {
      toast.error("Elegí tu ciudad");
      return;
    }
    setGuardando(true);
    const r = await updateProfile({ city: valor });
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo guardar");
      return;
    }
    toast.success("¡Gracias! Ya quedó tu ciudad");
    // No hace falta cerrar a mano: al refrescarse el perfil, `currentUser.city`
    // pasa a tener valor y el aviso deja de renderizarse solo.
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-tinta text-papel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="region"
      aria-label="Completá tu ciudad"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <p className="flex items-center gap-2 text-sm sm:flex-1">
          <MapPin className="h-4 w-4 flex-shrink-0" />
          <span>
            ¿De qué ciudad sos?
            {currentUser.state && (
              <span className="text-papel/60"> Nos falta ese dato de tu perfil.</span>
            )}
          </span>
        </p>

        <div className="flex gap-2 sm:w-auto">
          {usaLista ? (
            <select
              value={ciudad}
              onChange={(e) => {
                if (e.target.value === CIUDAD_OTRA) {
                  setOtra(true);
                  setCiudad("");
                } else {
                  setCiudad(e.target.value);
                }
              }}
              // text-base: con menos de 16px Safari de iOS hace zoom al enfocar.
              className="h-11 min-w-0 flex-1 border border-papel/30 bg-tinta px-2 text-base text-papel sm:w-56 sm:flex-none sm:text-sm"
            >
              <option value="">Seleccioná...</option>
              {opciones.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={CIUDAD_OTRA}>Otra (escribir)</option>
            </select>
          ) : (
            <input
              type="text"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Tu ciudad"
              className="h-11 min-w-0 flex-1 border border-papel/30 bg-tinta px-2 text-base text-papel placeholder:text-papel/40 sm:w-56 sm:flex-none sm:text-sm"
            />
          )}

          <button
            onClick={guardar}
            disabled={guardando}
            className="h-11 flex-shrink-0 bg-celeste px-4 text-xs font-semibold uppercase tracking-wide text-accent-foreground disabled:opacity-60"
          >
            {guardando ? "..." : "Guardar"}
          </button>

          <button
            onClick={posponer}
            aria-label="Ahora no"
            title="Ahora no"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center border border-papel/30 hover:bg-papel/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvisoCiudadBarra;
