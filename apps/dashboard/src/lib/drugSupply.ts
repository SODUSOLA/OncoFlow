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

export const LOSS_REASON_LABEL: Record<"SPILLAGE" | "BREAKAGE" | "OTHER", string> = {
  SPILLAGE: "Spillage", BREAKAGE: "Breakage", OTHER: "Other",
};
