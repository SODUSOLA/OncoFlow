export interface Invoice {
  id: string;
  patientId: string;
  facilityId: string;
  classificationId: string;
  totalKobo: number;
  status: "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";
  dueDate: string;
  createdAt: string;
}

export interface CountdownCase {
  id: string;
  patientId: string;
  currentDay: number;
  status: "ACTIVE" | "ESCALATED" | "CLEARED" | "DECLINED";
  labsPromptedAt: string | null;
  labsUploadedAt: string | null;
  resultsSentToQaAt: string | null;
  paymentConfirmedAt: string | null;
  reminderSentAt: string | null;
}

export interface Patient {
  id: string;
  uniquePatientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
}

export interface Wallet {
  id: string;
  patientId: string;
  balanceKobo: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amountKobo: number;
  status: string;
  reference: string;
}

export interface ServiceClassification {
  id: string;
  name: string;
  cappedNetworkFeeKobo: number;
}

export interface Tariff {
  id: string;
  facilityId: string;
  classificationId: string;
  networkFeeKobo: number;
  facilityBedFeeKobo: number;
  drugPriceKobo: number;
}
