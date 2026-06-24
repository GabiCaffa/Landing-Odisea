import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Compartido por Terms.tsx y Privacy.tsx
export const LEGAL_LAST_UPDATED = "23 de junio de 2026";

export const LegalSection = ({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section>
    <h2 className="title-sport text-xl md:text-2xl text-tinta mb-3">
      <span className="text-celeste mr-2">{n}.</span>
      {title}
    </h2>
    <div className="text-sm md:text-base text-muted-foreground leading-relaxed space-y-3">
      {children}
    </div>
  </section>
);

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-3xl">
          <div className="mb-10">
            <p className="eyebrow mb-4">Legal</p>
            <h1 className="title-sport text-4xl md:text-6xl text-tinta mb-3">
              POLÍTICA DE <span className="highlight-celeste">PRIVACIDAD</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Última actualización: {LEGAL_LAST_UPDATED}
            </p>
          </div>

          <div className="space-y-8">
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              En ODÍSEA respetamos tu privacidad. Esta Política explica qué datos
              personales recopilamos, con qué finalidad y qué derechos tenés, de acuerdo
              con la Ley N.º 18.331 de Protección de Datos Personales del Uruguay y su
              decreto reglamentario.
            </p>

            <LegalSection n="1" title="Responsable del tratamiento">
              El responsable de la base de datos es ODÍSEA. Para ejercer tus derechos o
              realizar consultas, contactanos por los medios indicados al final de esta
              Política.
            </LegalSection>

            <LegalSection n="2" title="Datos que recopilamos">
              Al registrarte y usar tu cuenta podemos recopilar: nombre y apellido, fecha
              de nacimiento, documento de identidad (cédula o equivalente), correo
              electrónico, número de teléfono, país y departamento/provincia, y de forma
              opcional una foto de perfil. También procesamos datos técnicos mínimos
              necesarios para mantener tu sesión.
            </LegalSection>

            <LegalSection n="3" title="Finalidad del tratamiento">
              Usamos tus datos para: crear y administrar tu cuenta; verificar que seas
              mayor de 18 años; coordinar la compra de entradas; aplicar promociones y
              beneficios (como la promo de cumpleaños); comunicarnos con vos respecto de
              eventos y tu cuenta; y cumplir obligaciones legales.
            </LegalSection>

            <LegalSection n="4" title="Base legal">
              El tratamiento se basa en tu <strong>consentimiento</strong>, que prestás al
              aceptar esta Política durante el registro, y en la ejecución de la relación
              que se establece al usar el servicio. Podés retirar tu consentimiento en
              cualquier momento eliminando tu cuenta.
            </LegalSection>

            <LegalSection n="5" title="Conservación">
              Conservamos tus datos mientras mantengas tu cuenta activa y durante el plazo
              necesario para cumplir obligaciones legales. Si eliminás tu cuenta, tus datos
              se suprimen salvo aquellos que debamos conservar por ley.
            </LegalSection>

            <LegalSection n="6" title="Encargados y terceros">
              Para operar la Plataforma utilizamos proveedores que actúan como encargados
              del tratamiento, en particular <strong>Supabase</strong> (alojamiento de base
              de datos y autenticación). Estos proveedores solo acceden a los datos para
              prestarnos el servicio. <strong>No vendemos ni cedemos tus datos personales</strong>{" "}
              a terceros con fines comerciales.
            </LegalSection>

            <LegalSection n="7" title="Seguridad">
              Aplicamos medidas técnicas y organizativas razonables para proteger tus datos
              (contraseñas cifradas, control de acceso por roles y conexión segura). Ningún
              sistema es 100 % infalible, pero trabajamos para minimizar los riesgos.
            </LegalSection>

            <LegalSection n="8" title="Tus derechos">
              Tenés derecho a acceder, rectificar, actualizar y suprimir tus datos, así
              como a oponerte a su tratamiento. Podés actualizar la mayoría de tus datos
              desde tu perfil, eliminar tu cuenta directamente desde la app, o escribirnos
              para ejercer cualquiera de estos derechos. También podés presentar reclamos
              ante la Unidad Reguladora y de Control de Datos Personales (URCDP) del Uruguay.
            </LegalSection>

            <LegalSection n="9" title="Menores de edad">
              La Plataforma está dirigida exclusivamente a personas mayores de 18 años. No
              recopilamos intencionalmente datos de menores. Si detectamos una cuenta de un
              menor, la eliminaremos.
            </LegalSection>

            <LegalSection n="10" title="Almacenamiento en tu dispositivo">
              Utilizamos almacenamiento local del navegador para mantener tu sesión
              iniciada. No usamos cookies de seguimiento publicitario.
            </LegalSection>

            <LegalSection n="11" title="Cambios en esta Política">
              Podemos actualizar esta Política. La versión vigente será siempre la publicada
              en esta página, con su fecha de última actualización.
            </LegalSection>

            <LegalSection n="12" title="Contacto">
              Para ejercer tus derechos o realizar consultas escribinos por WhatsApp al{" "}
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
              o al correo <span className="font-semibold text-foreground">[COMPLETAR: correo de contacto]</span>.
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

export default Privacy;
