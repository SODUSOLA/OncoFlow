import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import type { Patient, Wallet } from "../../lib/types";

interface MyPatientResponse {
  patient: Patient;
  wallet: Wallet | null;
}

// Resolves "who am I as a patient" once via GET /patients/me so every patient tab shares it.
export function useMyPatient() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MyPatientResponse>("/patients/me");
      setPatient(res.patient);
      setWallet(res.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patient record");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { patient, wallet, loading, error, reload };
}
