"use client";

import { useCallback, useSyncExternalStore } from "react";
import { api } from "./api";
import type { Patient, Wallet } from "./types";

interface MyPatientResponse {
  patient: Patient;
  wallet: Wallet | null;
}

interface MyPatientState {
  patient: Patient | null;
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  notLinked: boolean;
}

// "Who am I as a patient" is process-wide state, not per-component state, so it lives in a
// module-level store that every caller shares rather than in each component's own useState.
//
// It used to be plain per-component state with a mount effect, which meant every screen using
// this hook issued its own GET /patients/me — so a single navigation fired the request several
// times over (once per mounted consumer), which is the duplicate-`me` traffic seen in devtools.
// Sharing one store collapses that to a single request: concurrent mounts await the same
// in-flight promise, and later mounts read the value that is already there.
//
// A 404 means registration has not been staff-confirmed yet. That is a valid, expected state,
// not an error, so callers check `notLinked` rather than treating `error` as fatal.
const initialState: MyPatientState = {
  patient: null,
  wallet: null,
  loading: true,
  error: null,
  notLinked: false,
};

let state: MyPatientState = initialState;
let inFlight: Promise<void> | null = null;
let hasLoaded = false;
const subscribers = new Set<() => void>();

function publish(next: MyPatientState): void {
  state = next;
  for (const notify of subscribers) notify();
}

function load(): Promise<void> {
  // Collapses concurrent callers onto one request rather than starting a second.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await api.get<MyPatientResponse>("/patients/me");
      publish({ patient: res.patient, wallet: res.wallet, loading: false, error: null, notLinked: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load patient record";
      const notLinked = message.includes("No patient record linked");
      publish({
        patient: null,
        wallet: null,
        loading: false,
        error: notLinked ? null : message,
        notLinked,
      });
    } finally {
      hasLoaded = true;
      inFlight = null;
    }
  })();

  return inFlight;
}

// Must be called on sign-out: the store outlives any single component, so without this the
// next account to sign in on the same tab would briefly read the previous patient's record.
export function invalidateMyPatient(): void {
  hasLoaded = false;
  inFlight = null;
  publish(initialState);
}

// The first subscriber triggers the fetch. Doing it here rather than in a mount effect keeps
// the hook free of a synchronous setState during render/effect.
function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (!hasLoaded && !inFlight) void load();
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// Identity is stable between publishes, which is what useSyncExternalStore requires — `state`
// is only ever reassigned in publish(), never rebuilt per call.
function getSnapshot(): MyPatientState {
  return state;
}

export function useMyPatient() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Forces a refetch even when one has already completed — used after an action that changes
  // the record (profile edit, wallet top-up) rather than on mount.
  const reload = useCallback(() => {
    inFlight = null;
    publish({ ...state, loading: true });
    return load();
  }, []);

  return {
    patient: snapshot.patient,
    wallet: snapshot.wallet,
    loading: snapshot.loading,
    error: snapshot.error,
    notLinked: snapshot.notLinked,
    reload,
  };
}
