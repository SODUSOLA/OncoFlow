import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { BookOpen, FileBarChart } from "lucide-react";
import { DashboardLayout } from "./components/DashboardLayout";
import { AuthProvider, useAuth } from "./lib/auth";
import { dashboardPathForRoles, hasStaffAccess } from "./lib/roleRouting";
import Login from "./pages/Login";

// Lazy-loaded placeholder dashboards for roles that don't have their own shell yet.
const vmo = lazy(() => import("./pages/virtual-medical-officer/Dashboard"));
const scd = lazy(() => import("./pages/state-clinical-director/Dashboard"));
const qao = lazy(() => import("./pages/quality-assurance-officer/Dashboard"));
const sdns = lazy(() => import("./pages/state-director-of-nursing-services/Dashboard"));
const superAdmin = lazy(() => import("./pages/super-admin/Dashboard"));

// Regional Admin has its own sidebar and topbar shell with real sub-routes instead of the generic DashboardLayout.
const RegionalAdminLayout = lazy(() =>
  import("./pages/regional-admin/RegionalAdminLayout").then((m) => ({ default: m.RegionalAdminLayout })),
);
// Lazy-loaded Regional Admin pages.
const RaRegionOverview = lazy(() => import("./pages/regional-admin/pages/RegionOverviewPage"));
const RaPatientSearch = lazy(() => import("./pages/regional-admin/pages/PatientSearchPage"));
const RaCountdown = lazy(() => import("./pages/regional-admin/pages/CountdownPage"));
const RaScheduling = lazy(() => import("./pages/regional-admin/pages/SchedulingPage"));
const RaBilling = lazy(() => import("./pages/regional-admin/pages/BillingPage"));
const RaInventory = lazy(() => import("./pages/regional-admin/pages/InventoryPage"));
const RaGeneralInquiry = lazy(() => import("./pages/regional-admin/pages/GeneralInquiryPage"));
const RaNotifications = lazy(() => import("./pages/regional-admin/pages/NotificationCenterPage"));
const RaSettings = lazy(() => import("./pages/regional-admin/pages/SettingsPage"));
const RaSecurityIncidents = lazy(() => import("./pages/regional-admin/pages/SecurityIncidentsPage"));
const RaComingSoon = lazy(() =>
  import("./pages/regional-admin/pages/ComingSoon").then((m) => ({ default: m.ComingSoon })),
);

// Consulting Oncologist gets its own shell too, separate from Regional Admin's.
const ConsultantLayout = lazy(() =>
  import("./pages/consulting-oncologist/ConsultantLayout").then((m) => ({ default: m.ConsultantLayout })),
);
// Lazy-loaded Consulting Oncologist pages.
const CoAppointmentGrid = lazy(() => import("./pages/consulting-oncologist/pages/AppointmentGridPage"));
const CoPatientFile = lazy(() => import("./pages/consulting-oncologist/pages/PatientFilePage"));
const CoPreCallBriefing = lazy(() => import("./pages/consulting-oncologist/pages/PreCallBriefingPage"));
const CoVideoRoom = lazy(() => import("./pages/consulting-oncologist/pages/VideoRoomPage"));
const CoPostCallSummary = lazy(() => import("./pages/consulting-oncologist/pages/PostCallSummaryPage"));
const CoSettings = lazy(() => import("./pages/consulting-oncologist/pages/SettingsPage"));
const CoNotifications = lazy(() => import("./pages/consulting-oncologist/pages/NotificationCenterPage"));

// Onsite Nursing Officer gets its own mobile-first shell with a 4-tab bottom nav.
const NursingLayout = lazy(() =>
  import("./pages/onsite-nursing-officer/shell/NursingLayout").then((m) => ({ default: m.NursingLayout })),
);
// Lazy-loaded Onsite Nursing Officer pages.
const NoSchedule = lazy(() => import("./pages/onsite-nursing-officer/pages/SchedulePage"));
const NoCases = lazy(() => import("./pages/onsite-nursing-officer/pages/CasesPage"));
const NoCaseDetail = lazy(() => import("./pages/onsite-nursing-officer/pages/case/CaseDetailPage"));
const NoPatients = lazy(() => import("./pages/onsite-nursing-officer/pages/PatientsPage"));
const NoPatientDetail = lazy(() => import("./pages/onsite-nursing-officer/pages/PatientDetailPage"));
const NoInventory = lazy(() => import("./pages/onsite-nursing-officer/pages/InventoryPage"));
const NoSettings = lazy(() => import("./pages/onsite-nursing-officer/pages/SettingsPage"));
const NoNewCaseWizard = lazy(() => import("./pages/onsite-nursing-officer/wizard/NewCaseWizard"));

const roles = [
  { path: "virtual-medical-officer", component: vmo, label: "Virtual Medical Officer" },
  { path: "state-clinical-director", component: scd, label: "State Clinical Director" },
  { path: "quality-assurance-officer", component: qao, label: "Quality Assurance Officer" },
  { path: "state-director-of-nursing-services", component: sdns, label: "State Director of Nursing Services" },
  { path: "super-admin", component: superAdmin, label: "Super Admin" },
] as const;

// Renders a lazy component inside Suspense with a labelled loading fallback.
function SuspenseWrapper({ Component, label }: { Component: React.LazyExoticComponent<React.ComponentType>; label: string }) {
  return (
    <DashboardLayout role={label}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
        <Component />
      </Suspense>
    </DashboardLayout>
  );
}

// Full-screen loading state shown while auth or a lazy route resolves.
function FullScreenLoading() {
  return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
}

// Waits for the session check and redirects to /login if it failed; a session alone isn't enough, since a patient-app cookie on the same host must not reach the staff console.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!hasStaffAccess(roles.map((r) => r.roleName))) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Sends the user to their role's dashboard, or to /login if they lack staff access.
function RootRedirect() {
  const { user, roles: userRoles, loading } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;

  const roleNames = userRoles.map((r) => r.roleName);
  // Non-staff sessions go to /login, which explains the situation instead of looping.
  if (!hasStaffAccess(roleNames)) return <Navigate to="/login" replace />;

  const path = dashboardPathForRoles(roleNames);
  return <Navigate to={path ? `/dashboard/${path}` : "/no-dashboard"} replace />;
}

// Screen shown when a staff user has no role with a dashboard.
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

// Declares every route in the dashboard, grouped by role shell.
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
        <Route path="security-incidents" element={<Suspense fallback={<FullScreenLoading />}><RaSecurityIncidents /></Suspense>} />
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
      <Route
        path="dashboard/consulting-oncologist"
        element={
          <RequireAuth>
            <Suspense fallback={<FullScreenLoading />}>
              <ConsultantLayout />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route index element={<Suspense fallback={<FullScreenLoading />}><CoAppointmentGrid /></Suspense>} />
        <Route path="patient/:patientId" element={<Suspense fallback={<FullScreenLoading />}><CoPatientFile /></Suspense>} />
        <Route path="consult/:appointmentId" element={<Suspense fallback={<FullScreenLoading />}><CoPreCallBriefing /></Suspense>} />
        <Route path="consult/:appointmentId/room" element={<Suspense fallback={<FullScreenLoading />}><CoVideoRoom /></Suspense>} />
        <Route path="consult/:appointmentId/summary" element={<Suspense fallback={<FullScreenLoading />}><CoPostCallSummary /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<FullScreenLoading />}><CoSettings /></Suspense>} />
        <Route path="notifications" element={<Suspense fallback={<FullScreenLoading />}><CoNotifications /></Suspense>} />
        <Route
          path="patient-history"
          element={
            <Suspense fallback={<FullScreenLoading />}>
              <RaComingSoon
                icon={BookOpen}
                title="Patient History"
                description="A standalone patient-search/history browser — not yet built. Open a patient from an appointment card's Patient File button in the meantime."
              />
            </Suspense>
          }
        />
        <Route
          path="lab-results"
          element={
            <Suspense fallback={<FullScreenLoading />}>
              <RaComingSoon
                icon={FileBarChart}
                title="Lab Results"
                description="Lab results are file uploads per-patient today, not a standalone worklist — not yet built as its own screen."
              />
            </Suspense>
          }
        />
        <Route
          path="imaging"
          element={
            <Suspense fallback={<FullScreenLoading />}>
              <RaComingSoon
                icon={FileBarChart}
                title="Imaging"
                description="No imaging data model exists in this system yet."
              />
            </Suspense>
          }
        />
      </Route>
      <Route
        path="dashboard/onsite-nursing-officer"
        element={
          <RequireAuth>
            <Suspense fallback={<FullScreenLoading />}>
              <NursingLayout />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route index element={<Suspense fallback={<FullScreenLoading />}><NoSchedule /></Suspense>} />
        <Route path="cases" element={<Suspense fallback={<FullScreenLoading />}><NoCases /></Suspense>} />
        <Route path="cases/:caseId" element={<Suspense fallback={<FullScreenLoading />}><NoCaseDetail /></Suspense>} />
        <Route path="patients" element={<Suspense fallback={<FullScreenLoading />}><NoPatients /></Suspense>} />
        <Route path="patients/:patientId" element={<Suspense fallback={<FullScreenLoading />}><NoPatientDetail /></Suspense>} />
        <Route path="inventory" element={<Suspense fallback={<FullScreenLoading />}><NoInventory /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<FullScreenLoading />}><NoSettings /></Suspense>} />
        <Route path="new-case" element={<Suspense fallback={<FullScreenLoading />}><NoNewCaseWizard /></Suspense>} />
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

// Root component wiring the router, auth provider and routes.
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
