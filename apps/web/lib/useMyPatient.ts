"use client";

import { useCallback, useSyncExternalStore } from "react";
import { api } from "./api";
import type { Patient, Wallet } from "./types";

export interface PatientAddress {
  id: string;
  country: string;
  state: string;
  city: string;
  address: string;
}

export interface PatientEmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
}

export interface PatientFacility {
  id: string;
  name: string;
  region: string;
}

interface MyPatientResponse {
  patient: Patient;
  facility: PatientFacility | null;
  addresses: PatientAddress[];
  emergencyContacts: PatientEmergencyContact[];
  wallet: Wallet | null;
}

interface MyPatientState {
  patient: Patient | null;
  facility: PatientFacility | null;
  // GET /patients/me has always returned these; they were simply dropped on the floor here, so
  // no screen could show a patient their own address or emergency contacts.
  addresses: PatientAddress[];
  emergencyContacts: PatientEmergencyContact[];
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
  facility: null,
  addresses: [],
  emergencyContacts: [],
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
      publish({
        patient: res.patient,
        facility: res.facility ?? null,
        addresses: res.addresses ?? [],
        emergencyContacts: res.emergencyContacts ?? [],
        wallet: res.wallet,
        loading: false,
        error: null,
        notLinked: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load patient record";
      const notLinked = message.includes("No patient record linked");
      publish({
        patient: null,
        facility: null,
        addresses: [],
        emergencyContacts: [],
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
  //
  // Deliberately does NOT flip `loading`. Callers gate their first paint on it (`if (loading)
  // return <spinner>`), so raising it for a background refresh tore the screen down and rebuilt
  // it: saving a profile edit unmounted the very form that had just saved, discarding its
  // "Profile updated" confirmation. `loading` means "nothing to show yet", not "a request is
  // in flight" — the existing data stays on screen while the refresh completes.
  const reload = useCallback(() => {
    inFlight = null;
    return load();
  }, []);

  return {
    patient: snapshot.patient,
    facility: snapshot.facility,
    addresses: snapshot.addresses,
    emergencyContacts: snapshot.emergencyContacts,
    wallet: snapshot.wallet,
    loading: snapshot.loading,
    error: snapshot.error,
    notLinked: snapshot.notLinked,
    reload,
  };
}
