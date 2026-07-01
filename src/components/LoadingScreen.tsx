/**
 * Pantalla de carga branded ODÍSEA. Se usa como fallback del Suspense (al
 * cambiar de página) y en los estados de carga de sesión (Profile / Admin).
 */
const LoadingScreen = ({ label = "Cargando" }: { label?: string }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background">
    <div className="h-10 w-10 rounded-full border-2 border-tinta/15 border-t-celeste animate-spin" />
    <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">{label}...</p>
  </div>
);

export default LoadingScreen;
