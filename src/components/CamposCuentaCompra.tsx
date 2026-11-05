import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import CampoFecha from "@/components/CampoFecha";
import LocationSelect from "@/components/LocationSelect";
import { documentLabelByCountry, documentPlaceholderByCountry } from "@/lib/validators";
import { DatosCuenta } from "@/lib/cuentaDesdePedido";

/**
 * Los datos que faltan para crear la cuenta en la compra: lo que pide /registro
 * menos nombre, email y teléfono, que ya están en el formulario de compra.
 *
 * **Va en su propio chunk** (lazy en `CompraEntradas`): `LocationSelect` trae
 * el catálogo de ciudades, y no tiene por qué bajarlo quien compra sin cuenta
 * o con sesión. Se baja recién al tocar "Sí, crear cuenta".
 */
interface Props {
  datos: DatosCuenta;
  onChange: (d: DatosCuenta) => void;
  email: string;
  country: string;
  onCountryChange: (c: string) => void;
  compacto: boolean;
}

const CamposCuentaCompra = ({ datos, onChange, email, country, onCountryChange, compacto }: Props) => {
  const [verClave, setVerClave] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // Aparece debajo de lo que la persona estaba mirando: se la trae a la vista.
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const set = (campo: keyof DatosCuenta) => (v: string | boolean) => onChange({ ...datos, [campo]: v });
  const etiqueta = compacto
    ? "mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground"
    : "mb-2 block text-sm font-medium";
  const campo = `w-full border border-border bg-background text-base transition-colors focus:border-foreground focus:outline-none ${compacto ? "px-2.5 py-2" : "p-3"}`;

  return (
    <div ref={caja} className="scroll-mt-24 space-y-3 border border-celeste/40 bg-celeste/5 p-4">
      <div>
        <p className="text-sm font-semibold">Tu cuenta</p>
        <p className="text-xs text-muted-foreground">
          Con {email || "tu email"}. Te vamos a mandar un mail para confirmarla, y después vas a ver tu
          pedido en "Mis pedidos".
        </p>
      </div>

      <div>
        <label className={etiqueta} htmlFor="cuenta-nacimiento">
          Fecha de nacimiento *
        </label>
        <CampoFecha
          id="cuenta-nacimiento"
          required
          value={datos.birthDate}
          onChange={set("birthDate")}
          className={campo}
        />
      </div>

      <div>
        <label className={etiqueta} htmlFor="cuenta-documento">
          {documentLabelByCountry(country)} *
        </label>
        <input
          id="cuenta-documento"
          type="text"
          inputMode="numeric"
          value={datos.documentId}
          onChange={(e) => set("documentId")(e.target.value)}
          className={campo}
          placeholder={documentPlaceholderByCountry(country)}
          maxLength={20}
        />
      </div>

      <LocationSelect
        country={country}
        state={datos.state}
        onCountryChange={(c) => {
          onCountryChange(c);
          onChange({ ...datos, state: "", city: "" });
        }}
        onStateChange={(s) => onChange({ ...datos, state: s, city: "" })}
        city={datos.city}
        onCityChange={set("city")}
        required
      />

      <div>
        <label className={etiqueta} htmlFor="cuenta-clave">
          Contraseña *
        </label>
        <div className="relative">
          <input
            id="cuenta-clave"
            type={verClave ? "text" : "password"}
            value={datos.password}
            onChange={(e) => set("password")(e.target.value)}
            className={`${campo} pr-12`}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mismo consentimiento que /registro (Ley 18.331). */}
      <label className="flex items-start gap-3 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={datos.terms}
          onChange={(e) => set("terms")(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-celeste"
        />
        <span>
          Acepto los{" "}
          <Link to="/terminos" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline">
            Términos de Uso
          </Link>{" "}
          y la{" "}
          <Link to="/privacidad" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline">
            Política de Privacidad
          </Link>
          , y autorizo el tratamiento de mis datos personales.
        </span>
      </label>
    </div>
  );
};

export default CamposCuentaCompra;
