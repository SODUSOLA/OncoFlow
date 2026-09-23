import { api } from "../../../lib/api";
import type { Facility } from "../../../lib/types";

// Facility cache kept in its own module with no auth dependency, since importing auth from here formed a cycle that broke useAuth.
export interface FacilityStoreState {
  facilities: Facility[];
  loading: boolean;
}

let state: FacilityStoreState = { facilities: [], loading: true };
let inFlight: Promise<void> | null = null;
let hasLoaded = false;
const subscribers = new Set<() => void>();

// Publishes new facility state to every subscriber.
function publish(next: FacilityStoreState): void {
  state = next;
  for (const notify of subscribers) notify();
}

// Loads facilities, collapsing concurrent callers onto one request.
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

// Clears the cache on sign-out so a long-lived tab doesn't serve a previous session's facilities.
export function invalidateRegionScope(): void {
  hasLoaded = false;
  inFlight = null;
  publish({ facilities: [], loading: true });
}

// The first subscriber triggers the fetch, keeping callers free of setState during render.
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
