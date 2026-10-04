import { useState } from "react";
import { Check, Copy, Link2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { RUTA_EVENTO, urlAbsolutaDeEvento } from "@/lib/rutas";
import { claveDeGrupo } from "@/lib/grupos";
import { PistaTab, useAceptarConTab } from "@/components/admin/CamposEvento";

/**
 * La dirección pública del evento, dentro del form (v25).
 *
 * Es el campo que se copia y se pega en un anuncio, así que lo importante no es
 * editarlo —casi nunca hace falta— sino **poder copiarlo de un toque** y
 * entender qué pasa si se cambia.
 *
 * **Al crear se puede dejar vacío**: la base lo arma sola con el nombre
 * (trigger `events_slug`). Por eso no es `required` y el texto de ayuda lo dice:
 * pedirle a alguien que invente una dirección cuando el sistema la puede
 * deducir es trabajo inventado.
 *
 * **Al editar avisa en rojo**, porque cambiarla rompe todos los links ya
 * repartidos: los de los anuncios que están corriendo y los que la gente tiene
 * pegados en un chat. Eso no se puede deshacer apretando Ctrl+Z.
 */
const CampoDireccion = ({
  slug,
  esNuevo,
  nombreEvento = "",
  onChange,
}: {
  slug: string;
  esNuevo: boolean;
  /** Para proponer la dirección y poder aceptarla con Tab. */
  nombreEvento?: string;
  onChange: (v: string) => void;
}) => {
  const [copiado, setCopiado] = useState(false);
  const limpio = slug.trim();

  /**
   * La dirección que la base va a armar sola si esto queda vacío.
   *
   * Se calcula con `claveDeGrupo`, que es el espejo en JS de `slugify()`
   * (v25) — el mismo que usa el trigger. **La corrección no depende de que
   * coincidan**: si no se acepta la sugerencia, la base la arma igual. Esto es
   * para poder mostrarla y aceptarla con Tab.
   */
  const sugerida = esNuevo ? claveDeGrupo(nombreEvento) : "";
  const alTeclear = useAceptarConTab(slug, sugerida, onChange);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(urlAbsolutaDeEvento(limpio));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Safari sin permiso de portapapeles, o contexto no seguro.
      toast.error("No se pudo copiar. La dirección es: " + urlAbsolutaDeEvento(limpio));
    }
  };

  return (
    <div>
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Dirección de la página
      </span>

      <div className="flex items-stretch border border-border focus-within:border-celeste">
        <span className="hidden items-center whitespace-nowrap bg-muted px-2 text-xs text-muted-foreground sm:flex">
          odiseaoficial.com{RUTA_EVENTO}/
        </span>
        <input
          type="text"
          value={slug}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={alTeclear}
          // Sin `required`: vacío significa "derivala del nombre".
          // Con nombre cargado el placeholder muestra la dirección REAL que va
          // a quedar, en vez de describirla: así se ve antes de guardar y se
          // acepta con Tab.
          placeholder={
            esNuevo ? sugerida || "se arma sola con el nombre" : "halloween-colonia"
          }
          // text-base en celular, o Safari de iOS hace zoom al enfocar.
          className="min-w-0 flex-1 bg-background px-2 py-2.5 text-base outline-none sm:text-sm"
        />
        {limpio && (
          <button
            type="button"
            onClick={copiar}
            title="Copiar la dirección completa"
            aria-label="Copiar la dirección completa"
            className="flex w-11 flex-shrink-0 items-center justify-center border-l border-border transition-colors hover:bg-muted"
          >
            {copiado ? (
              <Check className="h-4 w-4 text-celeste-deep" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {limpio ? (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Link2 className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="break-all">{urlAbsolutaDeEvento(limpio)}</span>
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {esNuevo
              ? "Si lo dejás vacío se arma sola con el nombre del evento."
              : "Vacío: se vuelve a armar con el nombre al guardar."}
          </p>
          <PistaTab visible={!!sugerida} />
        </>
      )}

      {!esNuevo && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-charrua">
          <TriangleAlert className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            Si la cambiás, los links que ya repartiste —anuncios incluidos— dejan de
            funcionar.
          </span>
        </p>
      )}
    </div>
  );
};

export default CampoDireccion;
