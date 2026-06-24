import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRIES, getCountry, Country } from "@/lib/locations";
import { formatPhoneAsTyped } from "@/lib/validators";
import { CountryCode } from "libphonenumber-js";

interface PhoneInputProps {
  country: string;
  value: string;
  onCountryChange: (code: string) => void;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
}

const PhoneInput = ({
  country,
  value,
  onCountryChange,
  onChange,
  required,
  autoComplete = "tel",
}: PhoneInputProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current = getCountry(country) ?? COUNTRIES[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permitir solo dígitos y separadores comunes mientras tipea
    const cleaned = raw.replace(/[^\d\s()-]/g, "");
    const formatted = formatPhoneAsTyped(cleaned, country as CountryCode);
    onChange(formatted);
  };

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectCountry = (c: Country) => {
    onCountryChange(c.code);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative flex" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-3 border border-r-0 border-border bg-background hover:bg-secondary transition-colors text-sm"
        aria-label="País"
      >
        <span className="text-lg leading-none">{current.flag}</span>
        <span className="font-mono text-xs text-muted-foreground">{current.dial}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      <input
        type="tel"
        value={value}
        onChange={handleInput}
        required={required}
        autoComplete={autoComplete}
        className="input-techno rounded-none flex-1 min-w-0"
        placeholder="Número"
      />

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-background border border-border shadow-lg z-50 max-h-72 overflow-hidden flex flex-col">
          <div className="relative p-2 border-b border-border">
            <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-border bg-background focus:outline-none focus:border-foreground"
            />
          </div>
          <ul className="overflow-y-auto flex-1">
            {filteredCountries.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => selectCountry(c)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary text-left ${
                    c.code === country ? "bg-secondary font-semibold" : ""
                  }`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.dial}</span>
                </button>
              </li>
            ))}
            {filteredCountries.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground text-center">
                Sin resultados
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
