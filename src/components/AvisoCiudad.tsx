import { Suspense, lazy } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Portero del aviso de ciudad (v23). Decide si hace falta, y recién ahí baja la
 * barra.
 *
 * **Son dos archivos por dos motivos concretos, no por gusto.**
 *
 * 1. `AvisoCiudadBarra` importa el catálogo de localidades
 *    (`src/lib/ciudades.ts`, 122 nombres). Si esto no fuera diferido, ese
 *    catálogo entraría en el bundle de la landing para todo el mundo — incluido
 *    el que entra sin cuenta a mirar una fiesta. Es la misma forma de falla que
 *    la trampa de `lucide-react` en `manualChunks`.
 *
 * 2. Un `lazy` suelto que se suspende durante el render inicial —que es
 *    síncrono— hace que React avise por consola en **cada carga**, aunque el
 *    `fallback` sea `null` y no se vea nada. Un error benigno que aparece
 *    siempre es exactamente lo que después tapa uno de verdad. Poniendo el
 *    chequeo antes, la suspensión ocurre recién cuando `currentUser` llega —o
 *    sea, en respuesta a un cambio asincrónico— y no hay aviso.
 *
 * De yapa, el chunk **no se descarga** para quien no lo necesita: sin sesión, o
 * con la ciudad ya cargada, esto devuelve null y nunca se pide el archivo.
 */

const AvisoCiudadBarra = lazy(() => import("./AvisoCiudadBarra"));

const AvisoCiudad = () => {
  const { currentUser, loading } = useAuth();

  if (loading || !currentUser || currentUser.city) return null;

  return (
    <Suspense fallback={null}>
      <AvisoCiudadBarra />
    </Suspense>
  );
};

export default AvisoCiudad;
