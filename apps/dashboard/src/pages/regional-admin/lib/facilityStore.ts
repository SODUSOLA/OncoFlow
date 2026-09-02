import { api } from "../../../lib/api";
import type { Facility } from "../../../lib/types";

// The shared facility cache, kept in its own module with no dependency on lib/auth.
//
// Deliberately separate from useRegionScope: that hook reads the signed-in user (useAuth) to
// derive "my region", while lib/auth needs to clear this cache on sign-out. Putting the store
// inside useRegionScope made those two import each other, and the resulting cycle surfaced as
// "useAuth must be used within AuthProvider" — a half-initialised module, not a real provider
// problem. Nothing here imports auth, so the cycle cannot re-form.
export interface FacilityStoreState {
  facilities: Facility[];
  loading: boolean;
}

let state: FacilityStoreState = { facilities: [], loading: true };
let inFlight: Promise<void> | null = null;
let hasLoaded = false;
const subscribers = new Set<() => void>();

function publish(next: FacilityStoreState): void {
  state = next;
  for (const notify of subscribers) notify();
}

function load(): Promise<void> {
  // Collapses concurrent callers onto one request rather than starting a second.
  if (inFlight) return inFlight;

  inFlight = api
    .get<{ facilities: Facility[] }>("/facilities")
    .then((d) => publish({ facilities: d.facilities, loading: false }))
    .catch(() => publish({ facilities: [], loading: false }))
    .finally(() => {
      hasLoaded = true;
      inFlight = null;
    });

  return inFlight;
}

// Called on sign-out: the store outlives any component, and a long-lived tab should not keep
// serving a facility list fetched under a previous session.
export function invalidateRegionScope(): void {
  hasLoaded = false;
  inFlight = null;
  publish({ facilities: [], loading: true });
}

// The first subscriber triggers the fetch, which keeps callers free of a setState during
// render or in a mount effect.
export function subscribeToFacilities(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (!hasLoaded && !inFlight) void load();
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// Identity is stable between publishes, which is what useSyncExternalStore requires.
export function getFacilitySnapshot(): FacilityStoreState {
  return state;
}
