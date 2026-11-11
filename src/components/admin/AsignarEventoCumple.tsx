import { useState } from "react";
import { toast } from "sonner";
import { formatEventDate, useAuth } from "@/contexts/AuthContext";
import { BirthdaySignup, updateBirthday } from "@/lib/birthdays";
import { hoyLocal } from "@/lib/cumplesConEvento";

/**
 * Selector para asignarle el evento a un cumpleañero que quedó sin evento.
 *
 * Desde v46 todo cumpleañero tiene que tener evento (el beneficio se reclama
 * PARA una fecha). Los cargados antes sin evento se asignan acá, de a uno,
 * sin abrir el formulario entero. Sólo se ofrecen las fechas que no pasaron.
 */
const AsignarEventoCumple = ({ b, onListo }: { b: BirthdaySignup; onListo: () => void | Promise<void> }) => {
  const { events } = useAuth();
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyLocal();
  const proximos = events
    .filter((e) => e.status !== "finalizado" && e.date.slice(0, 10) >= hoy)
    .sort((a, b) => a.date.localeCompare(b.date));

  const asignar = async (eventId: string) => {
    if (!eventId) return;
    setGuardando(true);
    const r = await updateBirthday(b.id, { eventId });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo asignar el evento");
    toast.success(`${b.firstName} quedó en ${events.find((e) => e.id === eventId)?.name ?? "el evento"}`);
    await onListo();
  };

  return (
    <label className="mt-1.5 flex max-w-xs items-center gap-2 text-xs">
      <span className="whitespace-nowrap font-semibold text-charrua">Sin evento:</span>
      <select
        value=""
        disabled={guardando}
        onChange={(e) => void asignar(e.target.value)}
        className="input-techno min-w-0 flex-1 border-charrua/50 py-1.5 text-xs"
        aria-label={`Asignar evento a ${b.firstName} ${b.lastName}`}
      >
        <option value="" disabled>
          {guardando ? "Guardando…" : "Asignar evento…"}
        </option>
        {proximos.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} · {formatEventDate(e.date)}
          </option>
        ))}
      </select>
    </label>
  );
};

export default AsignarEventoCumple;
