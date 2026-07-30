import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";

const patient = lazy(() => import("./pages/patient/Dashboard"));
const regionalAdmin = lazy(() => import("./pages/regional-admin/Dashboard"));
const vmo = lazy(() => import("./pages/virtual-medical-officer/Dashboard"));
const oncologist = lazy(() => import("./pages/consulting-oncologist/Dashboard"));
const scd = lazy(() => import("./pages/state-clinical-director/Dashboard"));
const qao = lazy(() => import("./pages/quality-assurance-officer/Dashboard"));
const ono = lazy(() => import("./pages/onsite-nursing-officer/Dashboard"));
const sdns = lazy(() => import("./pages/state-director-of-nursing-services/Dashboard"));
const superAdmin = lazy(() => import("./pages/super-admin/Dashboard"));

const roles = [
  { path: "patient", component: patient, label: "Patient" },
  { path: "regional-admin", component: regionalAdmin, label: "Regional Admin" },
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

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard/patient" replace />} />
        {roles.map(({ path, component: Component, label }) => (
          <Route
            key={path}
            path={`dashboard/${path}`}
            element={<SuspenseWrapper Component={Component} label={label} />}
          />
        ))}
        <Route path="*" element={<div className="p-8 text-center text-gray-500">404 — Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}