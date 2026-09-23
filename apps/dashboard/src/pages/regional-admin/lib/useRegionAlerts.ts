import { useMemo, useSyncExternalStore } from "react";
import { useRegionScope } from "./useRegionScope";
import { subscribeToAlerts, getAlertsSnapshot, type RegionAlert } from "./alertsStore";

export interface RegionAlerts {
  loading: boolean;
  // Alerts filtered to the admin's region; facility-less inventory and inquiry alerts pass through.
  alerts: RegionAlert[];
  critical: RegionAlert[];
  warning: RegionAlert[];
}

// The one hook alert surfaces use instead of re-deriving breach state, wrapping the shared store.
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
