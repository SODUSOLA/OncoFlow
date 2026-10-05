// Mirrors the real API response shapes, verified against the backend rather than the dashboard's types, which has an Invoice.dueDate that doesn't exist.

export interface Patient {
  id: string;
  uniquePatientId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string;
  profilePictureFileId: string | null;
  status: string;
  facilityId: string;
  // Null until a Regional Admin confirms the facility; onboarding status only, not an access gate.
  facilityConfirmedAt: string | null;
  // Only present on GET /patients/me (toOwnJSON) — never on staff-facing responses.
  phone?: string;
  secondaryEmail?: string | null;
}

export interface Wallet {
  id: string;
  patientId: string;
  balanceKobo: string;
  autoDeductEnabled: boolean;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  paymentId: string | null;
  type: "CREDIT" | "DEBIT";
  amountKobo: string;
  createdAt: string;
}

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";
export type InvoiceComponent = "NETWORK_FEE" | "FACILITY_FEE" | "PROFESSIONAL_FEE" | "DRUG_COST";

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  component: InvoiceComponent;
  amountKobo: string;
}

export interface Invoice {
  id: string;
  patientId: string;
  facilityId: string;
  classificationId: string;
  status: InvoiceStatus;
  totalKobo: string;
  issuedAt: string | null;
  // Only present on GET /invoices/:id, not on the list endpoint.
  items?: InvoiceItem[];
}

export interface TimelineEvent {
  id: string;
  eventType: "REGISTRATION" | "STATUS_CHANGE" | "CONSULTATION" | "APPOINTMENT" | "INVOICE" | "WALLET";
  referenceId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  patientId: string;
  conversationType: "ADMIN_INQUIRY" | "MO_SIDE_EFFECT";
  status: "OPEN" | "CLOSED";
  slaDeadline: string | null;
  firstResponseAt: string | null;
  slaBreached: boolean;
  assignedTo: string | null;
  // Latest message for the list preview; null if none, and callers must branch on type since content is a file id for IMAGE and VOICE.
  lastMessage: {
    id: string;
    senderId: string;
    type: "TEXT" | "IMAGE" | "VOICE" | "SYSTEM";
    content: string;
    createdAt: string;
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: "TEXT" | "IMAGE" | "VOICE" | "SYSTEM";
  content: string;
  status: "SENT" | "DELIVERED" | "READ";
  createdAt: string;
}

export interface ConversationFeedback {
  id: string;
  conversationId: string;
  raterId: string;
  raterRole: "PATIENT" | "STAFF";
  rating: number;
  review: string | null;
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

export interface LabRequest {
  id: string;
  patientId: string;
  requestedBy: string;
  status: "PENDING" | "UPLOADED" | "REVIEWED";
  createdAt: string;
}

export interface LabResult {
  id: string;
  patientId: string;
  requestId: string;
  uploadedBy: string;
  reviewedBy: string | null;
  status: "PENDING" | "UPLOADED" | "REVIEWED";
  fileId: string;
  testDate: string;
  possibleDuplicate: boolean;
  createdAt: string;
  // Derived (F4.6) — the linked File's virus-scan status, not a column on lab_result itself.
  fileStatus: "PENDING" | "CLEAN" | "INFECTED";
}

export interface Appointment {
  id: string;
  patientId: string;
  oncologistId: string | null;
  facilityId: string;
  appointmentType: "VIRTUAL" | "PHYSICAL" | "CHEMOTHERAPY" | "PROCEDURE";
  scheduledAt: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "MISSED";
  paymentConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  appointmentId: string;
  provider: string;
  roomId: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "ENDED";
}

export interface ServiceClassification {
  id: string;
  name: "SUBSCRIPTION" | "CONSULTATION" | "DRUG_ADMINISTRATION" | "CHEMOTHERAPY" | "GENERAL_ADMISSION" | "PROCEDURE" | "SIDE_EFFECT_REPORT";
  cappedNetworkFeeKobo: string;
}

export interface AppNotification {
  id: string;
  type: string;
  status: "PENDING" | "SENT" | "READ" | "FAILED";
  sentAt: string | null;
  createdAt: string;
}

export interface PublicInquiry {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
}

export interface PublicInquiryMessage {
  id: string;
  inquiryId: string;
  senderType: "VISITOR" | "STAFF";
  senderUserId: string | null;
  content: string;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface Facility {
  id: string;
  name: string;
  region: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export type SubscriptionCycle = "MONTHLY" | "YEARLY";

export interface SubscriptionStatus {
  state: "NONE" | "ACTIVE" | "EXPIRED";
  canRenew: boolean;
  subscription: {
    id: string;
    billingCycle: SubscriptionCycle;
    status: "ACTIVE" | "EXPIRED";
    nextBillingDate: string;
    startedAt: string;
  } | null;
  prices: Record<SubscriptionCycle, string>;
}
