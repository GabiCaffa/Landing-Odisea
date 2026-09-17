import { useEffect, useState } from "react";
import { COUNTRIES, getCountry } from "@/lib/locations";
import { CIUDAD_OTRA, ciudadesDe } from "@/lib/ciudades";

/**
 * País + departamento, y opcionalmente la ciudad.
 *
 * **La ciudad es opt-in por prop (`city !== undefined`)** y no algo que aparece
 * siempre. Este componente lo usan el registro, el perfil y —dentro del panel—
 * el formulario de cumpleaños, cuya tabla (`birthday_signups`) **no tiene
 * columna de ciudad**: si el campo apareciera solo, ahí se completaría para
 * nada y encima `required` trabaría un formulario que el staff usa a diario.
 */

interface LocationSelectProps {
  country: string;
  state: string;
  onCountryChange: (code: string) => void;
  onStateChange: (state: string) => void;
  /** Si se pasa (aunque sea ""), se muestra el campo de ciudad. */
  city?: string;
  onCityChange?: (city: string) => void;
  required?: boolean;
}

const LocationSelect = ({
  country,
  state,
  onCountryChange,
  onStateChange,
  city,
  onCityChange,
  required,
}: LocationSelectProps) => {
  const current = getCountry(country);
  const hasStates = (current?.states?.length ?? 0) > 0;

  const muestraCiudad = city !== undefined && onCityChange !== undefined;
  const ciudades = ciudadesDe(country, state);

  /**
   * Si el valor guardado no está en la lista, el campo abre en modo "Otra" con
   * el texto puesto.
   *
   * Hace falta porque lo que se escribió por "Otra" se guarda tal cual: sin
   * esto, alguien que puso "Puerto Gómez" abre su perfil, ve el desplegable en
   * "Seleccioná..." y al guardar **pierde su ciudad sin haber tocado nada**.
   */
  const [otra, setOtra] = useState(
    () => Boolean(city) && ciudades.length > 0 && !ciudades.includes(city!)
  );

  // Al cambiar de departamento la ciudad anterior deja de tener sentido. Se
  // limpia acá y no en el onChange del <select> de departamento porque ese
  // select tiene dos ramas (lista y texto libre) y el país también lo resetea.
  useEffect(() => {
    if (!muestraCiudad) return;
    if (!city) return;
    if (ciudades.length === 0) return; // país sin catálogo: es texto libre
    if (ciudades.includes(city) || otra) return;
    onCityChange!("");
    setOtra(false);
    // `city` queda fuera a propósito: este efecto reacciona al CAMBIO DE LUGAR,
    // no a que la persona esté tipeando su ciudad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, state]);

  const etiquetaEstado =
    country === "UY"
      ? "Departamento"
      : country === "AR"
        ? "Provincia"
        : country === "BR"
          ? "Estado"
          : country === "CL"
            ? "Región"
            : "Provincia / Estado";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
            País
          </span>
          <select
            value={country}
            onChange={(e) => {
              onCountryChange(e.target.value);
              onStateChange(""); // reset al cambiar país
              if (muestraCiudad) {
                onCityChange!("");
                setOtra(false);
              }
            }}
            required={required}
            className="input-techno"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
            {etiquetaEstado}
          </span>
          {hasStates ? (
            <select
              value={state}
              onChange={(e) => onStateChange(e.target.value)}
              required={required}
              className="input-techno"
            >
              <option value="">Seleccioná...</option>
              {current!.states!.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={state}
              onChange={(e) => onStateChange(e.target.value)}
              required={required}
              className="input-techno"
              placeholder="Provincia, estado o región"
            />
          )}
        </div>
      </div>

      {muestraCiudad && (
        <div>
          <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
            Ciudad o localidad
          </span>

          {ciudades.length > 0 && !otra ? (
            <select
              value={city}
              onChange={(e) => {
                if (e.target.value === CIUDAD_OTRA) {
                  setOtra(true);
                  onCityChange!("");
                } else {
                  onCityChange!(e.target.value);
                }
              }}
              required={required}
              className="input-techno"
            >
              <option value="">Seleccioná...</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={CIUDAD_OTRA}>Otra (escribir)</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={city}
                onChange={(e) => onCityChange!(e.target.value)}
                required={required}
                className="input-techno"
                placeholder={state ? `Tu ciudad en ${state}` : "Tu ciudad"}
              />
              {/* Volver a la lista, para el que entró a "Otra" sin querer. Sólo
                  se ofrece si hay lista a la que volver. */}
              {ciudades.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOtra(false);
                    onCityChange!("");
                  }}
                  className="flex-shrink-0 border border-border px-3 text-xs uppercase tracking-wide hover:bg-muted"
                >
                  Ver lista
                </button>
              )}
            </div>
          )}

          {!state && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Elegí primero el {etiquetaEstado.toLowerCase()}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationSelect;
