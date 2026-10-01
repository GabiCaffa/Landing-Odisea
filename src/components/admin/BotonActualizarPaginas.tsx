import { useEffect, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import ModalAdmin from "@/components/admin/ModalAdmin";
import { usePuede } from "@/lib/adminPermisos";
import {
  CLAVE_DEPLOY_HOOK,
  dispararDeploy,
  fetchAdminSetting,
  saveAdminSetting,
} from "@/lib/adminSettings";

/**
 * Rehornea las páginas de los eventos (v25).
 *
 * **Qué arregla exactamente, y qué no.** La página de un evento
 * (`/evento/<slug>`) funciona desde el momento en que se guarda la fecha: la
 * arma React leyendo Supabase. Lo que NO se actualiza solo es el **preview del
 * link** —el flyer que se ve al pegarlo en WhatsApp— porque WhatsApp no ejecuta
 * JavaScript y lee el HTML crudo, que se hornea en el build.
 *
 * O sea: este botón no "publica" el evento, que ya está publicado. Pone al día
 * el preview y el sitemap. Por eso el texto dice lo que dice y no "Publicar".
 *
 * El hook se guarda en `admin_settings`, que el público no puede leer: con esa
 * URL cualquiera puede hacer que el sitio se reconstruya en loop y quemar la
 * cuota de builds.
 */
const BotonActualizarPaginas = () => {
  const puedeConfigurar = usePuede("cuentas"); // mismo corte que el resto de lo sólo-admin
  const [hook, setHook] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [config, setConfig] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchAdminSetting(CLAVE_DEPLOY_HOOK)
      .then((v) => {
        if (!vivo) return;
        setHook(v);
        setBorrador(v ?? "");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const actualizar = async () => {
    if (!hook) return;
    setEnviando(true);
    const r = await dispararDeploy(hook);
    setEnviando(false);
    if (!r.enviado) {
      toast.error(r.error ?? "No se pudo enviar el pedido");
      return;
    }
    // "Pedido enviado" y no "Listo": desde el navegador no se puede leer la
    // respuesta del hook (ver dispararDeploy), así que afirmar que salió bien
    // sería inventar.
    toast.success("Pedido enviado. En ~1 minuto los links muestran el flyer nuevo.");
  };

  const guardarHook = async () => {
    const v = borrador.trim();
    if (!v) {
      toast.error("Pegá la URL del Deploy Hook");
      return;
    }
    const r = await saveAdminSetting(CLAVE_DEPLOY_HOOK, v);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo guardar");
      return;
    }
    setHook(v);
    setConfig(false);
    toast.success("Deploy Hook guardado");
  };

  if (cargando) return null;

  // Sin hook configurado: al admin se le ofrece configurarlo; al operador no se
  // le muestra un botón que no puede usar ni arreglar.
  if (!hook) {
    if (!puedeConfigurar) return null;
    return (
      <>
        <button
          onClick={() => setConfig(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-dashed border-border px-4 text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" /> Configurar actualización
        </button>
        {config && (
          <ModalConfig
            valor={borrador}
            onChange={setBorrador}
            onGuardar={guardarHook}
            onClose={() => setConfig(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={actualizar}
        disabled={enviando}
        title="Pone al día el flyer que se ve al compartir los links por WhatsApp"
        className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 text-xs uppercase tracking-wide transition-colors hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${enviando ? "animate-spin" : ""}`} />
        {enviando ? "Enviando..." : "Actualizar páginas"}
      </button>
      {puedeConfigurar && config && (
        <ModalConfig
          valor={borrador}
          onChange={setBorrador}
          onGuardar={guardarHook}
          onClose={() => setConfig(false)}
        />
      )}
    </>
  );
};

const ModalConfig = ({
  valor,
  onChange,
  onGuardar,
  onClose,
}: {
  valor: string;
  onChange: (v: string) => void;
  onGuardar: () => void;
  onClose: () => void;
}) => (
  <ModalAdmin
    titulo="Actualizar páginas"
    subtitulo="Deploy Hook de Vercel"
    ancho="lg"
    onClose={onClose}
    pie={
      <>
        <button
          onClick={onClose}
          className="min-h-11 border border-border px-4 text-xs uppercase tracking-wide hover:bg-muted"
        >
          Cancelar
        </button>
        <button onClick={onGuardar} className="btn-techno min-h-11 px-4 text-xs">
          Guardar
        </button>
      </>
    }
  >
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        La página de cada evento anda apenas la guardás. Lo que necesita esto es otra
        cosa: que al <b>compartir el link por WhatsApp se vea el flyer</b> de esa fecha
        y no el logo. Eso se arma cuando el sitio se reconstruye.
      </p>
      <div className="border border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider">
          Dónde sacar la URL
        </p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Entrá a Vercel y abrí el proyecto del sitio.</li>
          <li>
            Settings → Git → <b>Deploy Hooks</b>.
          </li>
          <li>
            Creá uno con cualquier nombre (por ejemplo <i>panel</i>) sobre la rama{" "}
            <b>master</b>.
          </li>
          <li>Copiá la URL que te da y pegala acá abajo.</li>
        </ol>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
          URL del Deploy Hook
        </span>
        <input
          type="url"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://api.vercel.com/v1/integrations/deploy/..."
          className="input-techno"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Queda guardada donde sólo la ve el staff: cualquiera que tenga esta URL puede
        hacer que el sitio se reconstruya una y otra vez.
      </p>
    </div>
  </ModalAdmin>
);

export default BotonActualizarPaginas;
