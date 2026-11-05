import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Cuánto falta para el 2027, en la home y sólo con el tema Año Nuevo.
 *
 * Es una cuenta REAL hacia la medianoche del 31 en Uruguay, no un reloj que se
 * reinicia: la urgencia inventada ya se descartó una vez en este proyecto
 * (v29) y no vuelve por acá.
 *
 * Después de la medianoche dice "¡Feliz 2027!" hasta el mediodía del 1° y
 * después desaparece. El reloj late cada segundo sólo mientras se ve.
 */
const MEDIANOCHE = Date.parse("2027-01-01T00:00:00-03:00");
const FIN_SALUDO = Date.parse("2027-01-01T12:00:00-03:00");

const dos = (n: number) => String(n).padStart(2, "0");

const CuentaRegresiva = () => {
  const { theme } = useTheme();
  const [ahora, setAhora] = useState(() => Date.now());
  const activo = theme === "anio-nuevo" && ahora < FIN_SALUDO;

  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);

  if (!activo) return null;

  const falta = Math.max(0, MEDIANOCHE - ahora);
  const dias = Math.floor(falta / 86_400_000);
  const horas = Math.floor((falta % 86_400_000) / 3_600_000);
  const minutos = Math.floor((falta % 3_600_000) / 60_000);
  const segundos = Math.floor((falta % 60_000) / 1000);

  if (falta === 0) {
    return (
      <section className="px-4 py-6 text-center">
        <p className="title-sport text-4xl sm:text-5xl">
          <span className="highlight-celeste">¡FELIZ 2027!</span>
        </p>
      </section>
    );
  }

  const partes = [
    { n: dias, rotulo: dias === 1 ? "día" : "días" },
    { n: horas, rotulo: "horas" },
    { n: minutos, rotulo: "min" },
    { n: segundos, rotulo: "seg" },
  ];

  return (
    <section className="px-4 pb-6 pt-4 text-center md:pb-8">
      <p className="eyebrow mb-3">Cuenta regresiva al 2027</p>
      <div
        role="timer"
        aria-label={`Faltan ${dias} días, ${horas} horas y ${minutos} minutos para el 2027`}
        className="mx-auto flex max-w-md items-stretch justify-center gap-2 sm:gap-3"
      >
        {partes.map((p, i) => (
          <div
            key={p.rotulo}
            className="min-w-0 flex-1 rounded-xl border border-celeste/30 bg-card px-2 py-3 shadow-[0_0_24px_-10px_hsl(var(--celeste)/0.6)]"
          >
            <span className="block font-sport text-3xl font-black tabular-nums text-celeste sm:text-4xl" aria-hidden="true">
              {i === 0 ? p.n : dos(p.n)}
            </span>
            <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground" aria-hidden="true">
              {p.rotulo}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CuentaRegresiva;
