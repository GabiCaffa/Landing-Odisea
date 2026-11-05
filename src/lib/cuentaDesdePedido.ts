import { calcAge, validateDocumentByCountry } from "@/lib/validators";

/**
 * Crear la cuenta en la misma compra.
 *
 * Los pedidos se ven sólo con la cuenta de su dueño (v44), así que quien
 * compra como invitado no puede seguir el suyo. Antes de enviar se le pregunta
 * si quiere crear la cuenta; si dice que sí, los datos que faltan se piden ahí
 * mismo y el botón "Crear cuenta y enviar" hace las dos cosas en el mismo
 * toque.
 *
 * **WhatsApp se abre primero y la cuenta se crea después**, en paralelo, igual
 * que el pedido (v40): `window.open` tiene que pasar en el toque o el celular
 * bloquea la ventana, y esperar al registro lo dejaría fuera. Si el registro
 * falla, el pedido ya salió igual y sólo se avisa.
 */

/** Lo que falta para crear la cuenta; nombre, email y teléfono vienen de la compra. */
export interface DatosCuenta {
  birthDate: string;
  documentId: string;
  state: string;
  city: string;
  password: string;
  terms: boolean;
}

export const DATOS_CUENTA_VACIOS: DatosCuenta = {
  birthDate: "",
  documentId: "",
  state: "",
  city: "",
  password: "",
  terms: false,
};

/** Nombre y apellido salen del "Nombre completo" de la compra. */
export function partirNombre(nombre: string): { firstName: string; lastName: string } {
  const [firstName = "", ...resto] = nombre.trim().split(/\s+/);
  return { firstName, lastName: resto.join(" ") };
}

/** Por qué todavía no se puede crear la cuenta, o `null` si está todo. Mismas reglas que /registro. */
export function faltaParaCuenta(d: DatosCuenta, nombre: string, country: string): string | null {
  if (!partirNombre(nombre).lastName) return "Escribí tu nombre y apellido";
  if (!d.birthDate) return "Falta tu fecha de nacimiento";
  if (calcAge(d.birthDate) < 18) return "Tenés que ser mayor de 18 para crear una cuenta";
  if (!validateDocumentByCountry(d.documentId, country)) return "Revisá tu documento";
  if (!d.state.trim() || !d.city.trim()) return "Falta tu departamento y ciudad";
  if (d.password.length < 6) return "La contraseña tiene que tener al menos 6 caracteres";
  if (!d.terms) return "Aceptá los Términos y la Política de Privacidad";
  return null;
}

/**
 * A dónde volver después de confirmar el mail.
 *
 * El link de confirmación llega por mail y abre `/auth/callback`: ahí ya no
 * hay nada de la compra. Se guarda en este navegador. **No va en el
 * `emailRedirectTo`**: Supabase sólo acepta las URLs de su lista, y una que
 * no coincida lo manda a la Site URL y se pierde la bienvenida. Si el mail se
 * abre en otro dispositivo, se cae al inicio como siempre.
 */
const CLAVE_VOLVER = "odisea:volver-a";

/** Sólo rutas internas: un `//otro.sitio` llevaría afuera. */
const esRutaInterna = (p: unknown): p is string =>
  typeof p === "string" && p.startsWith("/") && !p.startsWith("//");

export function recordarVolverA(ruta: string | undefined | null): void {
  try {
    if (esRutaInterna(ruta)) localStorage.setItem(CLAVE_VOLVER, ruta);
  } catch {
    // Storage bloqueado: se cae al inicio.
  }
}

export function tomarVolverA(): string | null {
  try {
    const ruta = localStorage.getItem(CLAVE_VOLVER);
    localStorage.removeItem(CLAVE_VOLVER);
    return esRutaInterna(ruta) ? ruta : null;
  } catch {
    return null;
  }
}
