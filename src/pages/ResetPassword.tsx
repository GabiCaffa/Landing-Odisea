import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { updatePasswordWithSession, logout } = useAuth();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Cuando Supabase procesa el hash del link, fires PASSWORD_RECOVERY y crea
  // una sesión temporal que solo permite updateUser({password}).
  useEffect(() => {
    let active = true;

    // Caso 1: ya hay sesión cuando llegamos (link recién procesado)
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });

    // Caso 2: la sesión llega después del mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSubmitting(true);
    const result = await updatePasswordWithSession(newPassword);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo actualizar la contraseña");
      return;
    }
    setDone(true);
    toast.success("Contraseña actualizada");
    // Cerramos esa sesión especial y mandamos a login para que entre con la nueva
    setTimeout(async () => {
      await logout();
      navigate("/login");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-md">
          <div className="text-center mb-8 md:mb-10">
            <p className="font-sport text-xs tracking-[0.4em] uppercase text-celeste-deep font-bold mb-3">
              Restablecer
            </p>
            <h1 className="title-sport text-5xl md:text-6xl tracking-wide font-black mb-3 text-tinta">
              NUEVA <span className="highlight-celeste">CONTRASEÑA</span>
            </h1>
            <div className="w-20 h-1.5 bg-tinta mx-auto" />
          </div>

          {hasSession === null ? (
            <p className="text-center text-sm text-muted-foreground">Verificando link...</p>
          ) : !hasSession ? (
            <div className="rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)] text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                El link es inválido o expiró. Pedí uno nuevo desde "Olvidé mi contraseña".
              </p>
              <Link to="/recuperar" className="btn-techno-outline inline-block">
                Pedir nuevo link
              </Link>
            </div>
          ) : done ? (
            <div className="rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)] text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h2 className="font-display text-2xl tracking-wide">¡LISTO!</h2>
              <p className="text-sm text-muted-foreground">
                Tu contraseña fue actualizada. Te llevamos al login...
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)]"
            >
              <label className="block">
                <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                  Nueva contraseña
                </span>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-techno pl-10 pr-10"
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Mostrar/ocultar"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                  Confirmar contraseña
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-techno"
                  autoComplete="new-password"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="btn-techno w-full disabled:opacity-60"
              >
                {submitting ? "Guardando..." : "Establecer nueva contraseña"}
              </button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ResetPassword;
