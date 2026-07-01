import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// El look de marca ODÍSEA de los toasts vive en src/index.css
// (bloque "Toasts (sonner)"), apuntando a los data-attrs de sonner.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      {...props}
    />
  );
};

export { Toaster, toast };
