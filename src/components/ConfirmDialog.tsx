import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

/**
 * Confirm con estética ODÍSEA que reemplaza al window.confirm() nativo.
 *
 * Uso:
 *   const confirm = useConfirm();
 *   if (!(await confirm("¿Eliminar el evento?"))) return;
 *   // o con opciones:
 *   if (!(await confirm({ title: "Eliminar", description: "...", destructive: true }))) return;
 */

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** true → botón de confirmar en rojo (acción destructiva, ej. eliminar). */
  destructive?: boolean;
}

type ConfirmFn = (opts: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
};

const DEFAULTS: Required<ConfirmOptions> = {
  title: "¿Confirmás?",
  description: "",
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  destructive: false,
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Required<ConfirmOptions>>(DEFAULTS);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>((o) => {
    const merged: Required<ConfirmOptions> =
      typeof o === "string" ? { ...DEFAULTS, description: o } : { ...DEFAULTS, ...o };
    setOpts(merged);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Cerrado con ESC o clickeando afuera → se toma como "cancelar".
          if (!next) settle(false);
        }}
      >
        <AlertDialogContent className="max-w-md rounded-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl tracking-wide text-tinta">
              {opts.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {opts.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <button type="button" className="btn-techno-outline" onClick={() => settle(false)}>
              {opts.cancelText}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => settle(true)}
              className={
                opts.destructive
                  ? "inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold tracking-wide rounded-full bg-charrua text-white transition-all duration-200 hover:bg-charrua/90 active:scale-[0.98]"
                  : "btn-techno"
              }
            >
              {opts.confirmText}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
};
