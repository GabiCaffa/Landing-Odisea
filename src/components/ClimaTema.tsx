import { useTheme } from "@/contexts/ThemeContext";

/**
 * Atmósfera de los temas de fin de año: nieve en Navidad y polvo dorado en Año
 * Nuevo. Son puntos sin silueta, por lo mismo que sobrevivió el grano de
 * Halloween: las figuras dibujadas a mano se leían como calcomanías.
 *
 * **Va DETRÁS del contenido** (`z-index: -1`), y para eso el contenedor de la
 * home lleva `isolate`: sin esa clase, su `bg-background` taparía la capa.
 *
 * **Todo el movimiento es `transform`**, que corre en la GPU y no repinta nada.
 * Sin librería, sin JavaScript por cuadro y sin bajar nada: los puntos son
 * gradientes del CSS. Con `prefers-reduced-motion` quedan quietos.
 */
const ClimaTema = () => {
  const { theme } = useTheme();

  if (theme !== "navidad" && theme !== "anio-nuevo") return null;

  return (
    <div className={`clima clima--${theme}`} aria-hidden="true">
      <div className="clima__capa clima__capa--lejos" />
      <div className="clima__capa clima__capa--cerca" />
    </div>
  );
};

export default ClimaTema;
