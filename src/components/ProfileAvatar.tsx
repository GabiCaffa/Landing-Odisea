import { useAuth } from "@/contexts/AuthContext";

/**
 * Avatar del usuario logueado (foto o iniciales). Vive en su propio archivo
 * —y no dentro de pages/Profile— para evitar el import circular Header ⇄ Profile,
 * que dejaba la app en blanco al navegar entre páginas.
 */
export const ProfileAvatar = ({ size = 40 }: { size?: number }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const initials = `${currentUser.firstName[0] ?? ""}${currentUser.lastName[0] ?? ""}`;
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      className="rounded-full bg-foreground text-background overflow-hidden flex items-center justify-center font-semibold shrink-0"
    >
      {currentUser.avatarUrl ? (
        <img
          src={currentUser.avatarUrl}
          alt="Avatar"
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials.toUpperCase()}</span>
      )}
    </div>
  );
};

export default ProfileAvatar;
