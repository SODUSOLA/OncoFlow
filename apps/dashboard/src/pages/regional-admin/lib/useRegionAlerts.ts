import { useMemo, useSyncExternalStore } from "react";
import { useRegionScope } from "./useRegionScope";
import { subscribeToAlerts, getAlertsSnapshot, type RegionAlert } from "./alertsStore";

export interface RegionAlerts {
  loading: boolean;
  /** Every alert, already filtered to this admin's own region (countdown/staffing alerts carry
   *  a facilityId and are dropped if it's outside facilityIdsInRegion; inventory/inquiry alerts
   *  have no facility concept and pass through as-is). */
  alerts: RegionAlert[];
  critical: RegionAlert[];
  warning: RegionAlert[];
}

// The one hook every alert-consuming surface should use — Notification Center, the top bar's
// bell dot, and Scheduling's Critical Shortages card — instead of each re-deriving breach state.
// See lib/alertsStore.ts for the shared fetch/subscription this wraps.
export function useRegionAlerts(): RegionAlerts {
  const { region, facilityIdsInRegion } = useRegionScope();
  const { alerts: rawAlerts, loading } = useSyncExternalStore(
    (onChange) => subscribeToAlerts(region, onChange),
    getAlertsSnapshot,
    getAlertsSnapshot,
  );

  const alerts = useMemo(
    () => rawAlerts.filter((a) => !a.facilityId || facilityIdsInRegion.has(a.facilityId)),
    [rawAlerts, facilityIdsInRegion],
  );

  return useMemo(() => ({
    loading,
    alerts,
    critical: alerts.filter((a) => a.severity === "critical"),
    warning: alerts.filter((a) => a.severity === "warning"),
  }), [alerts, loading]);
}
