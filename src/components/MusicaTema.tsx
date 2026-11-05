import { useEffect, useRef, useState } from "react";
import { Music, VolumeX } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Musiquita de fondo de los temas de fin de año, con su botón.
 *
 * **Viene APAGADA** y la prende quien quiere. Con Halloween el sonido venía
 * prendido, pero eso eran efectos cortos; una canción que arranca sola en un
 * sitio que vende entradas espanta, y el navegador igual la bloquea hasta el
 * primer toque. La elección queda guardada para la próxima visita.
 *
 * **El tema es un archivo en `public/`** que hay que poner a mano y que tiene
 * que ser libre de derechos (ver CLAUDE.md, "Música de los temas"):
 * - Navidad: `/navidad-musica.mp3`
 * - Año Nuevo: `/anio-nuevo-musica.mp3`
 * Sin el archivo el botón no aparece: se pregunta si existe después de que
 * cargó la página, con un pedido liviano que no baja la canción.
 */
const ARCHIVOS = {
  navidad: "/navidad-musica.mp3",
  "anio-nuevo": "/anio-nuevo-musica.mp3",
} as const;

const CLAVE = "odisea:musica";
const VOLUMEN = 0.35;

const leer = () => {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
};

const MusicaTema = () => {
  const { theme } = useTheme();
  const src = theme === "navidad" || theme === "anio-nuevo" ? ARCHIVOS[theme] : null;
  const [existe, setExiste] = useState(false);
  const [sonando, setSonando] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // ¿Está el archivo? Recién con la página cargada, y sin bajar la canción.
  useEffect(() => {
    setExiste(false);
    if (!src) return;
    let vivo = true;
    const revisar = () =>
      fetch(src, { method: "HEAD" })
        .then((r) => vivo && setExiste(r.ok && (r.headers.get("content-type") ?? "").startsWith("audio")))
        .catch(() => {});
    if (document.readyState === "complete") revisar();
    else window.addEventListener("load", revisar, { once: true });
    return () => {
      vivo = false;
      window.removeEventListener("load", revisar);
    };
  }, [src]);

  // Quien la dejó prendida la última vez: arranca con el primer toque, que es
  // lo que el navegador exige para dejar sonar algo.
  useEffect(() => {
    if (!existe || !src || !leer()) return;
    setSonando(true);
    const empezar = () => {
      tocar(src);
      quitar();
    };
    const GESTOS = ["pointerdown", "keydown", "touchstart"] as const;
    const quitar = () => GESTOS.forEach((g) => window.removeEventListener(g, empezar));
    GESTOS.forEach((g) => window.addEventListener(g, empezar, { once: true }));
    return quitar;
  }, [existe, src]);

  // Cambia el tema o se sale de la home: se calla.
  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [src]
  );

  const tocar = (archivo: string) => {
    if (!audio.current) {
      audio.current = new Audio(archivo);
      audio.current.loop = true;
      audio.current.volume = VOLUMEN;
    }
    void audio.current.play().catch(() => setSonando(false));
  };

  if (!src || !existe) return null;

  const alternar = () => {
    const prender = !sonando;
    setSonando(prender);
    try {
      localStorage.setItem(CLAVE, prender ? "1" : "0");
    } catch {
      // Storage bloqueado: se pierde sólo la preferencia.
    }
    if (prender) tocar(src);
    else audio.current?.pause();
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={sonando}
      aria-label={sonando ? "Apagar la música" : "Poner música"}
      title={sonando ? "Apagar la música" : "Poner música"}
      className="fixed bottom-4 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-celeste/40 bg-papel/85 text-celeste shadow-odisea-md backdrop-blur-sm transition-colors hover:bg-celeste hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celeste focus-visible:ring-offset-2 focus-visible:ring-offset-papel"
    >
      {sonando ? <Music className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
};

export default MusicaTema;
