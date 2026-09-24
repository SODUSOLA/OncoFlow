import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Settings } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { api } from "../../../lib/api";
import { useAuth, type AuthUser } from "../../../lib/auth";
import type { Facility } from "../../../lib/types";
import { uploadFile, pollScanStatus } from "../lib/uploadFile";
import { ProfileAvatar } from "../lib/ProfileAvatar";

// Who you're signed in as: image, full name, email, then designation and hospital. Security and
// preferences are in Settings (the gear, top right of this page).
export default function ProfilePage() {
  const { user, roles, updateUser } = useAuth();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    api.get<{ facilities: Facility[] }>("/facilities")
      .then((d) => setHospital(d.facilities.find((f) => f.id === user.facilityId)?.name ?? null))
      .catch(() => {});
  }, [user?.facilityId]);

  // Uploads a new image through the shared scan pipeline, then points the profile at it.
  async function changePhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      const scanned = await pollScanStatus(uploaded.id);
      if (scanned.virusScanStatus !== "CLEAN") throw new Error("That image didn't pass the safety scan");
      const res = await api.put<{ user: AuthUser }>("/auth/profile/picture", { fileId: scanned.id });
      updateUser(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your photo");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-admin-h4 text-admin-text">Profile</p>
        <button
          onClick={() => navigate("/dashboard/onsite-nursing-officer/settings")} title="Settings" aria-label="Settings"
          className="flex size-9 items-center justify-center rounded-full text-admin-text-secondary hover:bg-admin-card-alt"
        >
          <Settings className="size-5" aria-hidden="true" />
        </button>
      </div>
      <Card className="flex flex-col items-center gap-1 border-admin-border p-6 text-center">
        <div className="relative">
          <ProfileAvatar user={user} className="size-28 text-admin-h2" />
          <button
            onClick={() => fileInput.current?.click()} disabled={uploading} title="Change photo" aria-label="Change photo"
            className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full border border-admin-border bg-white text-admin-text shadow-admin-card disabled:opacity-60"
          >
            <Camera className="size-4" aria-hidden="true" />
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void changePhoto(f); }} />
        </div>
        {uploading && <p className="text-admin-micro text-admin-text-secondary">Uploading and scanning…</p>}
        {error && <p className="text-admin-micro text-admin-danger">{error}</p>}

        <p className="mt-3 text-admin-h3 text-admin-text">{user?.fullName}</p>
        <p className="text-admin-body-sm text-admin-text-secondary">{user?.email}</p>

        <dl className="mt-5 w-full space-y-3 border-t border-admin-border pt-5 text-left">
          <div>
            <dt className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">Designation</dt>
            <dd className="text-admin-body-sm text-admin-text">{roles[0]?.roleDescription ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">Hospital</dt>
            <dd className="text-admin-body-sm text-admin-text">{hospital ?? "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
