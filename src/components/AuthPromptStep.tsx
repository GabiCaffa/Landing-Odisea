import { Link } from "react-router-dom";
import { LogIn, UserPlus, ArrowRight } from "lucide-react";

/**
 * Paso previo de los flujos que se pueden completar sin cuenta (compra de
 * entradas, promo de cumpleaños): ofrece iniciar sesión, registrarse o seguir
 * como invitado. El registro se incentiva, nunca se obliga.
 */
const AuthPromptStep = ({
  title = "¿Cómo querés seguir?",
  subtitle,
  loginHint,
  registerHint = "Te lleva un minuto y queda guardado para próximas veces",
  guestHint = "Cargás tus datos manualmente esta vez",
  onContinue,
}: {
  title?: string;
  subtitle: string;
  /** Qué gana iniciando sesión: lo concreto de este flujo. */
  loginHint: string;
  registerHint?: string;
  guestHint?: string;
  onContinue: () => void;
}) => {
  const next = encodeURIComponent(window.location.pathname);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
          Antes de continuar
        </p>
        <h3 className="text-2xl font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Login */}
        <Link
          to={`/login?next=${next}`}
          className="flex items-center gap-4 p-5 rounded-xl border border-border hover:bg-foreground hover:text-background transition-colors group"
        >
          <LogIn className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 text-left">
            <p className="font-semibold tracking-wide uppercase text-sm">Iniciar sesión</p>
            <p className="text-xs text-muted-foreground group-hover:text-background/60 mt-0.5">
              {loginHint}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" />
        </Link>

        {/* Register */}
        <Link
          to={`/registro?next=${next}`}
          className="flex items-center gap-4 p-5 border border-border hover:bg-secondary transition-colors group"
        >
          <UserPlus className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 text-left">
            <p className="font-semibold tracking-wide uppercase text-sm">Crear cuenta</p>
            <p className="text-xs text-muted-foreground mt-0.5">{registerHint}</p>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" />
        </Link>

        {/* Guest */}
        <button
          type="button"
          onClick={onContinue}
          className="flex items-center gap-4 p-5 border border-dashed border-border hover:bg-muted transition-colors group"
        >
          <div className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 text-left">
            <p className="font-semibold tracking-wide uppercase text-sm">Continuar como invitado</p>
            <p className="text-xs text-muted-foreground mt-0.5">{guestHint}</p>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" />
        </button>
      </div>
    </div>
  );
};

export default AuthPromptStep;
