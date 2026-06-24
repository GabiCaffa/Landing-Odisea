import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LegalSection, LEGAL_LAST_UPDATED } from "./Privacy";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-3xl">
          <div className="mb-10">
            <p className="eyebrow mb-4">Legal</p>
            <h1 className="title-sport text-4xl md:text-6xl text-tinta mb-3">
              TÉRMINOS DE <span className="highlight-celeste">USO</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Última actualización: {LEGAL_LAST_UPDATED}
            </p>
          </div>

          <div className="space-y-8">
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Estos Términos de Uso regulan el acceso y uso del sitio web de ODÍSEA
              (en adelante, “la Plataforma”). Al crear una cuenta o usar la Plataforma,
              aceptás estos términos en su totalidad. Si no estás de acuerdo, no utilices
              el servicio.
            </p>

            <LegalSection n="1" title="Quiénes somos">
              ODÍSEA es una productora de música y eventos. A través de la Plataforma
              difundimos nuestras fechas, gestionamos cuentas de usuario y coordinamos la
              compra de entradas. Podés contactarnos por los medios indicados al final.
            </LegalSection>

            <LegalSection n="2" title="Registro y cuenta">
              Para acceder a ciertas funciones necesitás crear una cuenta. Al registrarte
              declarás que tenés <strong>18 años o más</strong> y que la información que
              proporcionás es veraz, exacta y actual. Sos responsable de mantener la
              confidencialidad de tu contraseña y de toda actividad realizada desde tu
              cuenta. Podés eliminar tu cuenta en cualquier momento desde tu perfil.
            </LegalSection>

            <LegalSection n="3" title="Compra de entradas">
              La Plataforma facilita la coordinación de la compra de entradas, que se
              concreta a través de nuestro canal de ventas (WhatsApp) y, según el caso,
              mediante transferencia bancaria. Los precios, beneficios y disponibilidad se
              muestran a título informativo y pueden variar o agotarse sin previo aviso. La
              venta de un evento puede cerrarse automáticamente al llegar su fecha y hora
              límite.
            </LegalSection>

            <LegalSection n="4" title="Promociones y beneficios">
              Las promociones (grupos, cumpleaños, preventa, etc.) están sujetas a
              condiciones y disponibilidad. Nos reservamos el derecho de modificarlas o
              darlas de baja en cualquier momento. Cualquier intento de uso fraudulento
              puede derivar en la cancelación del beneficio y/o de la cuenta.
            </LegalSection>

            <LegalSection n="5" title="Uso aceptable">
              Te comprometés a no utilizar la Plataforma con fines ilícitos, a no intentar
              vulnerar su seguridad, ni a suplantar la identidad de terceros o cargar datos
              falsos. Podemos suspender o cancelar cuentas que incumplan estos términos.
            </LegalSection>

            <LegalSection n="6" title="Propiedad intelectual">
              Las marcas, logotipos, textos, imágenes y demás contenidos de la Plataforma
              son propiedad de ODÍSEA o de sus respectivos titulares y están protegidos por
              la normativa vigente. No está permitida su reproducción sin autorización.
            </LegalSection>

            <LegalSection n="7" title="Limitación de responsabilidad">
              La Plataforma se ofrece “tal cual”. Hacemos esfuerzos razonables para
              mantener la información actualizada y el servicio disponible, pero no
              garantizamos que esté libre de errores o interrupciones. En la medida
              permitida por la ley, ODÍSEA no será responsable por daños indirectos
              derivados del uso de la Plataforma.
            </LegalSection>

            <LegalSection n="8" title="Protección de datos">
              El tratamiento de tus datos personales se rige por nuestra{" "}
              <Link to="/privacidad" className="text-foreground font-semibold hover:underline">
                Política de Privacidad
              </Link>
              , de conformidad con la Ley N.º 18.331 de Protección de Datos Personales del
              Uruguay.
            </LegalSection>

            <LegalSection n="9" title="Modificaciones">
              Podemos actualizar estos Términos en cualquier momento. La versión vigente
              será siempre la publicada en esta página, con su fecha de última
              actualización. El uso continuado de la Plataforma implica la aceptación de los
              cambios.
            </LegalSection>

            <LegalSection n="10" title="Ley aplicable y jurisdicción">
              Estos Términos se rigen por las leyes de la República Oriental del Uruguay.
              Ante cualquier controversia, las partes se someten a los tribunales
              competentes de Uruguay.
            </LegalSection>

            <LegalSection n="11" title="Contacto">
              Por consultas sobre estos Términos podés escribirnos por WhatsApp al{" "}
              <a
                href="https://wa.me/59892592179"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-semibold hover:underline"
              >
                +598 92 592 179
              </a>
              , por Instagram{" "}
              <a
                href="https://www.instagram.com/odisea.uy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-semibold hover:underline"
              >
                @odisea.uy
              </a>{" "}
              o al correo{" "}
              <a
                href="mailto:odiseaoficialcolonia@gmail.com"
                className="text-foreground font-semibold hover:underline"
              >
                odiseaoficialcolonia@gmail.com
              </a>
              .
            </LegalSection>
          </div>

          <div className="mt-12">
            <Link to="/" className="btn-techno-outline">← Volver al inicio</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
