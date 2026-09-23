import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../../../lib/auth";
import { subscribeToConsultAlerts, getConsultAlertsSnapshot, type ConsultAlert } from "./alertsStore";

export interface ConsultAlerts {
  loading: boolean;
  alerts: ConsultAlert[];
  critical: ConsultAlert[];
  warning: ConsultAlert[];
}

// The one hook consultant surfaces use to read alerts instead of re-deriving them.
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
