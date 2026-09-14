import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { loadSoundPreference, setSoundEnabled } from "@/lib/spookySound";

/**
 * Altavoz del tema Halloween. Prendido por defecto, siempre visible mientras el
 * tema esté prendido y con la preferencia guardada entre visitas.
 *
 * **Viene prendido por defecto**, pero el navegador **no deja sonar nada**
 * hasta que la persona toque algo — Chrome y Safari lo prohíben y no hay forma
 * de saltearlo. Así que se arma un escuchador de un solo uso para el primer
 * gesto y ahí arranca el audio, sin el golpe de confirmación (nadie apretó
 * nada: un ruido de la nada sobresalta).
 *
 * Sin eso el botón mentiría: diría "prendido" y no sonaría nada hasta un
 * apagar-y-prender que nadie va a adivinar.
 */
const SoundToggle = () => {
  const { theme } = useTheme();
  const [on, setOn] = useState(false);

  // Restaurar la preferencia y esperar al primer gesto.
  useEffect(() => {
    if (theme !== "halloween") return;
    if (!loadSoundPreference()) return;

    setOn(true);

    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      setSoundEnabled(true, { confirm: false });
      remove();
    };
    // Varios tipos de gesto porque el navegador sólo considera "activación"
    // algunos: un scroll con la rueda NO cuenta, un toque o una tecla sí.
    const GESTOS = ["pointerdown", "keydown", "touchstart"] as const;
    const remove = () => GESTOS.forEach((g) => window.removeEventListener(g, start));
    GESTOS.forEach((g) => window.addEventListener(g, start, { once: true }));
    return remove;
  }, [theme]);

  if (theme !== "halloween") return null;

  const toggle = () => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Apagar el sonido del sitio" : "Encender el sonido del sitio"}
      title={on ? "Apagar sonido" : "Encender sonido"}
      className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center w-11 h-11 rounded-full border border-celeste/40 bg-papel/85 text-celeste backdrop-blur-sm shadow-odisea-md transition-colors hover:bg-celeste hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celeste focus-visible:ring-offset-2 focus-visible:ring-offset-papel"
    >
      {on ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
    </button>
  );
};

export default SoundToggle;
