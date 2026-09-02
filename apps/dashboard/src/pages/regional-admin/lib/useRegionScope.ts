import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../../../lib/auth";
import type { Facility } from "../../../lib/types";
import { subscribeToFacilities, getFacilitySnapshot } from "./facilityStore";

interface RegionScope {
  loading: boolean;
  /** The region string of the admin's own facility, or null until resolved. */
  region: string | null;
  /** Every facility in the system (unfiltered) — used for the "out of scope" illustration. */
  facilities: Facility[];
  /** Facilities sharing the admin's own region. */
  facilitiesInRegion: Facility[];
  facilityIdsInRegion: Set<string>;
}

// Derives "my region" from the admin's own `facilityId` (already populated for Regional Admins,
// see auth/schema.ts) cross-referenced against `Facility.region` — no `User.region` column exists
// yet (still an open business question per 21-regional-admin-scope-definition.md), so this is a
// client-side read of data that's already there rather than a new backend concept.
export function useRegionScope(): RegionScope {
  const { user } = useAuth();
  const { facilities, loading } = useSyncExternalStore(
    subscribeToFacilities, getFacilitySnapshot, getFacilitySnapshot,
  );

  const region = useMemo(() => {
    if (!user?.facilityId) return null;
    return facilities.find((f) => f.id === user.facilityId)?.region ?? null;
  }, [facilities, user?.facilityId]);

  const facilitiesInRegion = useMemo(
    () => (region ? facilities.filter((f) => f.region === region) : []),
    [facilities, region],
  );

  const facilityIdsInRegion = useMemo(
    () => new Set(facilitiesInRegion.map((f) => f.id)),
    [facilitiesInRegion],
  );

  return { loading, region, facilities, facilitiesInRegion, facilityIdsInRegion };
}
