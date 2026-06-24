import { COUNTRIES, getCountry } from "@/lib/locations";

interface LocationSelectProps {
  country: string;
  state: string;
  onCountryChange: (code: string) => void;
  onStateChange: (state: string) => void;
  required?: boolean;
}

const LocationSelect = ({
  country,
  state,
  onCountryChange,
  onStateChange,
  required,
}: LocationSelectProps) => {
  const current = getCountry(country);
  const hasStates = (current?.states?.length ?? 0) > 0;

  return (
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
          {country === "UY"
            ? "Departamento"
            : country === "AR"
            ? "Provincia"
            : country === "BR"
            ? "Estado"
            : country === "CL"
            ? "Región"
            : "Provincia / Estado"}
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
  );
};

export default LocationSelect;
