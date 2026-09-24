import { cn } from "../../../lib/utils";
import type { AuthUser } from "../../../lib/auth";

// The signed-in staff member's profile image, or their initials when they haven't set one.
export function ProfileAvatar({ user, className }: { user: AuthUser | null; className?: string }) {
  const initials = (user?.fullName ?? user?.email ?? "?").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  if (user?.profilePictureFileId) {
    return <img src={`/api/files/${user.profilePictureFileId}/content`} alt={user.fullName} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    // Inline colour: a font-size token in className would otherwise be merged over text-white.
    <div style={{ color: "#fff" }} className={cn("flex shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta font-semibold", className)}>
      {initials}
    </div>
  );
}
