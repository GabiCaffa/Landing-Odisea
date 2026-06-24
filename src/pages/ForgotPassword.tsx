import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ForgotPassword = () => {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo enviar el email");
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-md">
          <div className="text-center mb-8 md:mb-10">
            <p className="font-sport text-xs tracking-[0.4em] uppercase text-celeste-deep font-bold mb-3">
              ¿Olvidaste tu contraseña?
            </p>
            <h1 className="title-sport text-5xl md:text-6xl tracking-wide font-black mb-3 text-tinta">
              <span className="highlight-celeste">RECUPERAR</span>
            </h1>
            <div className="w-20 h-1.5 bg-tinta mx-auto" />
          </div>

          {sent ? (
            <div className="rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)] text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h2 className="font-display text-2xl tracking-wide">EMAIL ENVIADO</h2>
              <p className="text-sm text-muted-foreground">
                Si existe una cuenta con <span className="font-mono">{email}</span>, vas a recibir
                un link para restablecer tu contraseña. Revisá también la carpeta de spam.
              </p>
              <Link to="/login" className="btn-techno-outline inline-block">
                Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)]"
            >
              <p className="text-sm text-muted-foreground">
                Ingresá tu email y te enviamos un link para restablecer tu contraseña.
              </p>

              <label className="block">
                <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                  Email
                </span>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-techno pl-10"
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="btn-techno w-full disabled:opacity-60"
              >
                {submitting ? "Enviando..." : "Enviar link de recuperación"}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Te acordaste?{" "}
                <Link to="/login" className="text-foreground font-semibold hover:underline">
                  Volver al login
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
