import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { BookOpen, FileBarChart } from "lucide-react";
import { DashboardLayout } from "./components/DashboardLayout";
import { AuthProvider, useAuth } from "./lib/auth";
import { dashboardPathForRoles, hasStaffAccess } from "./lib/roleRouting";
import Login from "./pages/Login";

const vmo = lazy(() => import("./pages/virtual-medical-officer/Dashboard"));
const oncologist = lazy(() => import("./pages/consulting-oncologist/Dashboard"));
const scd = lazy(() => import("./pages/state-clinical-director/Dashboard"));
const qao = lazy(() => import("./pages/quality-assurance-officer/Dashboard"));
const ono = lazy(() => import("./pages/onsite-nursing-officer/Dashboard"));
const sdns = lazy(() => import("./pages/state-director-of-nursing-services/Dashboard"));
const superAdmin = lazy(() => import("./pages/super-admin/Dashboard"));

// Regional Admin has its own sidebar+topbar shell and real sub-routes (see
// pages/regional-admin/RegionalAdminLayout.tsx) instead of the generic single-page
// DashboardLayout wrapper every other role below still uses — kept out of the `roles` loop.
const RegionalAdminLayout = lazy(() =>
  import("./pages/regional-admin/RegionalAdminLayout").then((m) => ({ default: m.RegionalAdminLayout })),
);
const RaRegionOverview = lazy(() => import("./pages/regional-admin/pages/RegionOverviewPage"));
const RaPatientSearch = lazy(() => import("./pages/regional-admin/pages/PatientSearchPage"));
const RaCountdown = lazy(() => import("./pages/regional-admin/pages/CountdownPage"));
const RaScheduling = lazy(() => import("./pages/regional-admin/pages/SchedulingPage"));
const RaBilling = lazy(() => import("./pages/regional-admin/pages/BillingPage"));
const RaInventory = lazy(() => import("./pages/regional-admin/pages/InventoryPage"));
const RaGeneralInquiry = lazy(() => import("./pages/regional-admin/pages/GeneralInquiryPage"));
const RaNotifications = lazy(() => import("./pages/regional-admin/pages/NotificationCenterPage"));
const RaSettings = lazy(() => import("./pages/regional-admin/pages/SettingsPage"));
const RaComingSoon = lazy(() =>
  import("./pages/regional-admin/pages/ComingSoon").then((m) => ({ default: m.ComingSoon })),
);

const roles = [
  { path: "virtual-medical-officer", component: vmo, label: "Virtual Medical Officer" },
  { path: "consulting-oncologist", component: oncologist, label: "Consulting Oncologist" },
  { path: "state-clinical-director", component: scd, label: "State Clinical Director" },
  { path: "quality-assurance-officer", component: qao, label: "Quality Assurance Officer" },
  { path: "onsite-nursing-officer", component: ono, label: "Onsite Nursing Officer" },
  { path: "state-director-of-nursing-services", component: sdns, label: "State Director of Nursing Services" },
  { path: "super-admin", component: superAdmin, label: "Super Admin" },
] as const;

function SuspenseWrapper({ Component, label }: { Component: React.LazyExoticComponent<React.ComponentType>; label: string }) {
  return (
    <DashboardLayout role={label}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
        <Component />
      </Suspense>
    </DashboardLayout>
  );
}

function FullScreenLoading() {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
}

// Session check happens once at the top of the tree (AuthProvider's /auth/profile call) —
// this just waits for that to settle and redirects to /login if it came back empty, remembering
// where the user was headed so login can send them straight back.
//
// Being signed in is not sufficient: the session cookie is scoped to the host, and cookies
// ignore the port, so a patient signed into the patient app on the same hostname arrives here
// already authenticated. Checking only `user` meant that session was admitted into the staff
// console and routed to a page — the staff login was never even shown. The API refused every
// staff request behind it (403), so no data was exposed, but the shell should never have
// rendered. Staff standing is now required to get past this point.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!hasStaffAccess(roles.map((r) => r.roleName))) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, roles: userRoles, loading } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;

  const roleNames = userRoles.map((r) => r.roleName);
  // Non-staff sessions are bounced to /login, which explains the situation rather than
  // silently looping them back here.
  if (!hasStaffAccess(roleNames)) return <Navigate to="/login" replace />;

  const path = dashboardPathForRoles(roleNames);
  return <Navigate to={path ? `/dashboard/${path}` : "/no-dashboard"} replace />;
}

function NoDashboard() {
  const { roles: userRoles, logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-700">No dashboard yet for your role</h2>
        <p className="text-gray-400 mt-2 text-sm">
          {userRoles.map((r) => r.roleName).join(", ") || "No roles assigned"}
        </p>
        <button onClick={() => logout()} className="mt-4 text-sm text-ink hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/no-dashboard" element={<RequireAuth><NoDashboard /></RequireAuth>} />
      <Route
        path="dashboard/regional-admin"
        element={
          <RequireAuth>
            <Suspense fallback={<FullScreenLoading />}>
              <RegionalAdminLayout />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route index element={<Suspense fallback={<FullScreenLoading />}><RaRegionOverview /></Suspense>} />
        <Route path="patient-search" element={<Suspense fallback={<FullScreenLoading />}><RaPatientSearch /></Suspense>} />
        <Route path="countdown" element={<Suspense fallback={<FullScreenLoading />}><RaCountdown /></Suspense>} />
        <Route path="scheduling" element={<Suspense fallback={<FullScreenLoading />}><RaScheduling /></Suspense>} />
        <Route path="billing" element={<Suspense fallback={<FullScreenLoading />}><RaBilling /></Suspense>} />
        <Route path="inventory" element={<Suspense fallback={<FullScreenLoading />}><RaInventory /></Suspense>} />
        <Route path="inquiry" element={<Suspense fallback={<FullScreenLoading />}><RaGeneralInquiry /></Suspense>} />
        <Route path="notifications" element={<Suspense fallback={<FullScreenLoading />}><RaNotifications /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<FullScreenLoading />}><RaSettings /></Suspense>} />
        <Route
          path="guidelines"
          element={
            <Suspense fallback={<FullScreenLoading />}>
              <RaComingSoon
                icon={BookOpen}
                title="Clinical Guidelines"
                description="Treatment protocols and dosing references — not yet built. Shown in the design as a standing reference library, not tied to any one patient's record."
              />
            </Suspense>
          }
        />
        <Route
          path="reports"
          element={
            <Suspense fallback={<FullScreenLoading />}>
              <RaComingSoon
                icon={FileBarChart}
                title="Reports"
                description="Regional analytics and exports — not yet built. No reporting endpoint exists yet to back this page."
              />
            </Suspense>
          }
        />
      </Route>
      {roles.map(({ path, component: Component, label }) => (
        <Route
          key={path}
          path={`dashboard/${path}`}
          element={<RequireAuth><SuspenseWrapper Component={Component} label={label} /></RequireAuth>}
        />
      ))}
      <Route path="*" element={<div className="p-8 text-center text-gray-500">404 — Page not found</div>} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
