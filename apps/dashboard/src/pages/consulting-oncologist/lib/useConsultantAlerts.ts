import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../../../lib/auth";
import { subscribeToConsultAlerts, getConsultAlertsSnapshot, type ConsultAlert } from "./alertsStore";

export interface ConsultAlerts {
  loading: boolean;
  alerts: ConsultAlert[];
  critical: ConsultAlert[];
  warning: ConsultAlert[];
}

// The one hook every alert-consuming Consultant surface should use (Notification Center today;
// a future top-bar indicator could reuse it too) instead of re-deriving this logic.
export function useConsultantAlerts(): ConsultAlerts {
  const { user } = useAuth();
  const subscribe = useMemo(
    () => (onChange: () => void) => (user ? subscribeToConsultAlerts(user.id, user.facilityId, onChange) : () => {}),
    [user],
  );
  const { alerts, loading } = useSyncExternalStore(subscribe, getConsultAlertsSnapshot, getConsultAlertsSnapshot);

  return useMemo(() => ({
    loading,
    alerts,
    critical: alerts.filter((a) => a.severity === "critical"),
    warning: alerts.filter((a) => a.severity === "warning"),
  }), [alerts, loading]);
}
