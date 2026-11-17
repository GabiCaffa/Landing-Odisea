import { useEffect, useState } from "react";

/**
 * Cuenta regresiva hasta `revealAt`: días, horas, minutos y segundos. Late cada
 * segundo sólo mientras está a la vista. Al llegar a cero queda en 00: el que
 * desbloquea la tarjeta es `useAhora` (ver `proximamente.ts`), no este reloj.
 *
 * `role="timer"` sin `aria-live` (anunciar cada segundo es inusable); el dato
 * completo va en el `aria-label`.
 */
const dos = (n: number) => String(n).padStart(2, "0");

const ContadorReveal = ({ revealAt, className = "" }: { revealAt: string; className?: string }) => {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = Math.max(0, Math.floor((Date.parse(revealAt) - ahora) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const celdas: [string, string][] = [
    [String(d), "días"],
    [dos(h), "hs"],
    [dos(m), "min"],
    [dos(s), "seg"],
  ];

  return (
    <div
      role="timer"
      aria-label={`Faltan ${d} días, ${h} horas y ${m} minutos`}
      className={`flex items-stretch justify-center gap-1.5 ${className}`}
    >
      {celdas.map(([valor, rotulo]) => (
        <div
          key={rotulo}
          className="flex min-w-[3rem] flex-col items-center rounded-lg bg-black px-2 py-1.5 text-white"
        >
          <span className="font-sport text-xl font-black leading-none tabular-nums">{valor}</span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-70">{rotulo}</span>
        </div>
      ))}
    </div>
  );
};

export default ContadorReveal;
