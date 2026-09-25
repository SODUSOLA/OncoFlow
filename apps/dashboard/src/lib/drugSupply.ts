// Shapes and labels for the drug request, dispatch and stock ledger endpoints, shared by the nurse and admin screens.

export interface Drug { id: string; name: string; strength: string; category: string; reorderThreshold: number | null }

export interface DrugStockRow {
  drugId: string; drugName: string; drugStrength: string; reorderThreshold: number | null; quantity: number; lowStock: boolean;
}

export interface RequestLine { drugId: string; drugName: string; drugStrength: string; quantityRequested: number }
export interface DispatchLine { drugId: string; drugName: string; drugStrength: string; quantityDispatched: number }

export type DrugRequestStatus = "REQUESTED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

export interface DrugDispatch {
  id: string; status: "IN_TRANSIT" | "DELIVERED"; dispatchedAt: string; acknowledgedAt: string | null; lines: DispatchLine[];
}

export interface DrugRequest {
  id: string; status: DrugRequestStatus; requestedAt: string; facilityId: string; facilityName: string;
  requestedBy: string; requesterEmail: string; lines: RequestLine[]; dispatch: DrugDispatch | null;
}

// Label shown for a request, refining DISPATCHED into the in-transit state both sides see.
export function requestStatusLabel(r: DrugRequest): string {
  if (r.status === "DISPATCHED") return "In transit";
  if (r.status === "DELIVERED") return "Delivered";
  if (r.status === "CANCELLED") return "Cancelled";
  return "Requested";
}

// Tailwind classes for a request status chip.
export function requestStatusClass(r: DrugRequest): string {
  if (r.status === "DISPATCHED") return "bg-admin-warning/15 text-admin-warning";
  if (r.status === "DELIVERED") return "bg-admin-success/15 text-admin-success";
  if (r.status === "CANCELLED") return "bg-admin-card-alt text-admin-text-secondary";
  return "bg-admin-sidebar-cta/10 text-admin-sidebar-cta";
}

// SPILLAGE and OTHER only exist on reports filed before the four incident types; new reports use NEW_INCIDENT_TYPES.
export type IncidentType = "BREAKAGE" | "SPOILAGE" | "EXPIRY" | "WASTAGE" | "SPILLAGE" | "OTHER";
export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  BREAKAGE: "Breakage", SPOILAGE: "Spoilage", EXPIRY: "Expiry", WASTAGE: "Wastage", SPILLAGE: "Spillage (legacy)", OTHER: "Other (legacy)",
};
export const NEW_INCIDENT_TYPES: IncidentType[] = ["BREAKAGE", "SPOILAGE", "EXPIRY", "WASTAGE"];

// One stock incident as GET /drug-loss-reports returns it.
export interface IncidentReport {
  id: string; officerEmail: string; drugName: string; drugStrength: string; quantityLost: number;
  incidentType: IncidentType; reason: string | null; photoFileId: string | null; reportedAt: string;
}
