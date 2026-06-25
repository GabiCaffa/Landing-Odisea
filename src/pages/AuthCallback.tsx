import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * Aterrizaje del link de confirmación de email (emailRedirectTo del signUp).
 * El cliente tiene detectSessionInUrl: true, así que consume el #access_token
 * solo y crea la sesión. Acá esperamos esa sesión y mandamos al usuario adentro.
 * Si en unos segundos no aparece, el link venció o es inválido.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    const finish = (ok: boolean) => {
      if (!active || settled.current) return;
      settled.current = true;
      setStatus(ok ? "ok" : "error");
      if (ok) {
        toast.success("¡Cuenta confirmada!");
        setTimeout(() => active && navigate("/", { replace: true }), 1600);
      }
    };

    // Caso 1: la sesión ya está cuando llegamos
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });

    // Caso 2: la sesión llega un instante después (al procesarse el hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });

    // Fallback: si pasados unos segundos no hay sesión, el link no sirve
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) finish(false);
      });
    }, 5000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-md">
          <div className="rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)] text-center space-y-4">
            {status === "loading" && (
              <>
                <h1 className="font-display text-2xl tracking-wide">CONFIRMANDO...</h1>
                <p className="text-sm text-muted-foreground">Estamos activando tu cuenta.</p>
              </>
            )}

            {status === "ok" && (
              <>
                <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h1 className="font-display text-2xl tracking-wide">¡CUENTA CONFIRMADA!</h1>
                <p className="text-sm text-muted-foreground">Te llevamos al inicio...</p>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                  <X className="w-6 h-6" />
                </div>
                <h1 className="font-display text-2xl tracking-wide">LINK INVÁLIDO</h1>
                <p className="text-sm text-muted-foreground">
                  El enlace de confirmación es inválido o ya expiró. Iniciá sesión y, si hace
                  falta, reenviá el correo de confirmación.
                </p>
                <Link to="/login" className="btn-techno-outline inline-block">
                  Ir al login
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AuthCallback;
