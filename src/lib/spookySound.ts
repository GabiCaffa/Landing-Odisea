/**
 * Sonido del tema Halloween. Apagado por defecto y siempre opcional.
 *
 * Tres restricciones que definen el diseño de esto:
 *
 * 1. **El navegador bloquea el audio automático.** Chrome y Safari no dejan
 *    sonar nada hasta que la persona interactúa con la página. No es algo que
 *    se pueda saltear, así que el AudioContext se crea recién cuando se toca
 *    el botón de altavoz — que es, justamente, el gesto que lo habilita.
 * 2. **Viene PRENDIDO por defecto** (decisión del autor). El navegador igual no
 *    deja sonar nada hasta el primer gesto, así que en la práctica el audio
 *    arranca cuando la persona toca algo, no al abrir. El altavoz siempre está
 *    a la vista para apagarlo, y esa decisión queda guardada: quien lo apaga no
 *    se lo vuelve a encontrar prendido.
 * 3. **Los sonidos cortos se sintetizan, no se descargan.** Sin archivos, sin
 *    licencias y sin peso. El único archivo es el ambiente, que es opcional:
 *    si no está, el resto funciona igual.
 */

const STORAGE_KEY = "odisea:sonido";

/**
 * Loop de ambiente. Es el único pedazo de sonido que necesita un archivo real
 * (viento, aullido lejano), porque sintetizarlo con osciladores suena a módem.
 * Poner el archivo en `public/` con este nombre lo activa; sin él, los sonidos
 * de interacción andan lo mismo y esto queda en silencio.
 */
const AMBIENT_SRC = "/halloween-ambiente.mp3";
const AMBIENT_VOLUME = 0.18;

let enabled = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: HTMLAudioElement | null = null;
/** Si el archivo de ambiente no existe, se deja de intentar. */
let ambientUnavailable = false;

// ─── Preferencia ────────────────────────────────────────────────────────────

/**
 * Prendido salvo que la persona lo haya apagado explícitamente. El `!== "0"`
 * y no `=== "1"` es justamente eso: sin nada guardado, prendido; sólo un "0"
 * —que sólo escribe el botón— lo deja apagado.
 */
export const loadSoundPreference = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    // Storage bloqueado (incógnito): se respeta el default.
    return true;
  }
};

const savePreference = (value: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage bloqueado: se pierde sólo la preferencia entre visitas.
  }
};

export const isSoundEnabled = () => enabled;

// ─── Motor ──────────────────────────────────────────────────────────────────

/**
 * Crea (o despierta) el AudioContext. Sólo tiene sentido llamarlo desde el
 * manejador de un gesto de la persona; fuera de eso el navegador lo deja
 * suspendido y no suena nada.
 */
const ensureContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null; // Navegador sin Web Audio: el sitio sigue andando.
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

/**
 * Un tono con caída de altura y envolvente suave. Sin envolvente, arrancar y
 * cortar un oscilador produce un "click" — el chasquido es la discontinuidad
 * en la onda, no un sonido que hayamos pedido.
 */
interface ToneOpts {
  from: number;
  to: number;
  duration: number;
  peak: number;
  type?: OscillatorType;
  cutoff?: number;
}

const tone = (opts: ToneOpts) => {
  const audio = ensureContext();
  if (!audio || !master) return;

  // `resume()` es ASÍNCRONO. Programar el sonido justo después parece
  // funcionar y no suena nada: mientras el contexto está suspendido su reloj
  // no avanza, así que el oscilador queda agendado en un instante que, para
  // cuando el contexto despierta, ya pasó. Hay que esperar a que arranque.
  if (audio.state === "suspended") {
    void audio.resume().then(() => emit(audio, opts));
    return;
  }
  emit(audio, opts);
};

const emit = (audio: AudioContext, opts: ToneOpts) => {
  if (!master) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();

  osc.type = opts.type ?? "triangle";
  osc.frequency.setValueAtTime(opts.from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), now + opts.duration);

  filter.type = "lowpass";
  filter.frequency.value = opts.cutoff ?? 900;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(opts.peak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  osc.start(now);
  osc.stop(now + opts.duration + 0.05);
};

// ─── Sonidos ────────────────────────────────────────────────────────────────

/** Al pasar por una tarjeta de evento: un crujido corto y grave. */
export const playHover = () => {
  if (!enabled) return;
  tone({ from: 190, to: 120, duration: 0.18, peak: 0.05, cutoff: 700 });
};

/** Al apretar un botón importante: un golpe seco y profundo. */
export const playThud = () => {
  if (!enabled) return;
  tone({ from: 110, to: 48, duration: 0.38, peak: 0.12, type: "sine", cutoff: 420 });
};

// ─── Ambiente ───────────────────────────────────────────────────────────────

const startAmbient = () => {
  if (ambientUnavailable) return;
  if (!ambient) {
    ambient = new Audio(AMBIENT_SRC);
    ambient.loop = true;
    ambient.preload = "none";
    // Si el archivo no está, se apaga esta parte y no se vuelve a intentar.
    ambient.addEventListener("error", () => {
      ambientUnavailable = true;
      ambient = null;
    });
  }
  ambient.volume = AMBIENT_VOLUME;
  // Puede rechazar si el navegador todavía no considera que hubo gesto: no es
  // un error que haya que mostrarle a nadie.
  void ambient.play().catch(() => {});
};

const stopAmbient = () => {
  if (!ambient) return;
  ambient.pause();
  ambient.currentTime = 0;
};

// ─── Encendido / apagado ────────────────────────────────────────────────────

/**
 * Llamar SIEMPRE desde el manejador de un gesto (click, tecla), no desde un
 * efecto: fuera de un gesto el navegador deja el contexto suspendido.
 *
 * `confirm` toca un golpe como acuse de que quedó prendido. Se pasa en false
 * al restaurar la preferencia de una visita anterior: ahí la persona no acaba
 * de apretar el altavoz y un golpe salido de la nada sobresalta.
 */
export const setSoundEnabled = (value: boolean, { confirm = true } = {}) => {
  enabled = value;
  savePreference(value);
  if (value) {
    ensureContext();
    startAmbient();
    if (confirm) playThud();
  } else {
    stopAmbient();
  }
};
