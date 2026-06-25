import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const { login, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo iniciar sesión");
      setNeedsConfirm(!!result.needsEmailConfirmation);
      setSubmitting(false);
      return;
    }
    toast.success(`Hola ${result.user?.firstName}!`);
    navigate(result.user?.role === "admin" ? "/admin" : "/");
  };

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    const result = await resendConfirmation(email);
    setResending(false);
    if (result.ok) toast.success("Te reenviamos el correo de confirmación");
    else toast.error(result.error ?? "No se pudo reenviar el correo");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-md">
          <div className="text-center mb-8 md:mb-10">
            <p className="font-sport text-xs tracking-[0.4em] uppercase text-celeste-deep font-bold mb-3">
              Bienvenido de nuevo
            </p>
            <h1 className="title-sport text-5xl md:text-6xl tracking-wide font-black mb-3 text-tinta">
              INICIAR <span className="highlight-celeste">SESIÓN</span>
            </h1>
            <div className="w-20 h-1.5 bg-tinta mx-auto" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)]">
            <label className="block">
              <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-techno"
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                Contraseña
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-techno pr-10"
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            <div className="flex justify-end">
              <Link
                to="/recuperar"
                className="text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-techno w-full disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Ingresando..." : "Ingresar"}
            </button>

            {needsConfirm && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                Tu email todavía no está confirmado.{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-foreground font-semibold hover:underline disabled:opacity-60"
                >
                  {resending ? "Reenviando..." : "Reenviar correo"}
                </button>
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">
              ¿No tenés cuenta?{" "}
              <Link to="/registro" className="text-foreground font-semibold hover:underline">
                Registrate
              </Link>
            </p>
          </form>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Login;
