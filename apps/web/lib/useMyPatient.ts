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
  // GET /patients/me already returned these, so screens can now show the patient's own address and emergency contacts.
  addresses: PatientAddress[];
  emergencyContacts: PatientEmergencyContact[];
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  notLinked: boolean;
}

// Process-wide store so concurrent mounts share one GET /patients/me; a 404 means not yet confirmed, a valid state (notLinked) rather than an error.
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

// Publishes new patient state to every subscriber.
function publish(next: MyPatientState): void {
  state = next;
  for (const notify of subscribers) notify();
}

// Loads the patient once, collapsing concurrent callers onto one request.
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

// Must be called on sign-out so the next account on this tab doesn't read the previous patient's record.
export function invalidateMyPatient(): void {
  hasLoaded = false;
  inFlight = null;
  publish(initialState);
}

// The first subscriber triggers the fetch, keeping the hook free of synchronous setState.
function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (!hasLoaded && !inFlight) void load();
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// Stable between publishes, as useSyncExternalStore requires, since state is only reassigned in publish().
function getSnapshot(): MyPatientState {
  return state;
}

// Returns the current patient, wallet and loading state, and a reload function.
export function useMyPatient() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Refetches without flipping `loading`, so a background refresh doesn't tear down the screen and discard a "Profile updated" confirmation.
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
