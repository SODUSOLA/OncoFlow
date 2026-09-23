import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PatientTopBar } from "@/components/patient/PatientTopBar";
import { BottomNavBar } from "@/components/patient/BottomNavBar";

// Patient app layout that checks the session server-side and redirects to /login if missing.
export default async function PatientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-patient-bg">
      <PatientTopBar />
      <main id="main-content" className="flex-1 pb-16">
        {children}
      </main>
      <BottomNavBar />
    </div>
  );
}
