"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "./api";
import type { Patient, Wallet } from "./types";

interface MyPatientResponse {
  patient: Patient;
  wallet: Wallet | null;
}

// Every patient screen needs "who am I as a patient" — resolved once here via GET /patients/me
// (the caller's own linked record). A 404 means registration hasn't been staff-confirmed yet —
// that's a valid, expected state, not an error, so callers should check `notLinked` rather than
// treating `error` as fatal.
export function useMyPatient() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No synchronous setState before the first `await` here — every branch below only sets state
  // once the request settles, which is what lets the mount-time effect call this directly
  // without triggering react-hooks/set-state-in-effect.
  const fetchPatient = useCallback(async () => {
    try {
      const res = await api.get<MyPatientResponse>("/patients/me");
      setPatient(res.patient);
      setWallet(res.wallet);
      setNotLinked(false);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load patient record";
      if (message.includes("No patient record linked")) {
        setNotLinked(true);
        setError(null);
      } else {
        setError(message);
        setNotLinked(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchPatient();
    })();
  }, [fetchPatient]);

  // For manual refresh from event handlers (not the mount effect) — safe to reset loading
  // synchronously here since this only ever runs outside a render/effect.
  const reload = useCallback(() => {
    setLoading(true);
    return fetchPatient();
  }, [fetchPatient]);

  return { patient, wallet, loading, error, notLinked, reload };
}
