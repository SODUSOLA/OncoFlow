export interface Invoice {
  id: string;
  patientId: string;
  facilityId: string;
  classificationId: string;
  totalKobo: number;
  status: "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";
  // No dueDate/createdAt columns exist on the real Invoice entity (apps/api's Invoice.toJSON())
  // — issuedAt is the one real timestamp it returns, null until the invoice is SENT.
  issuedAt: string | null;
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
  userId: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone?: string;
  phoneMasked?: string;
  email: string;
  createdAt?: string;
  secondaryEmail?: string | null;
  profilePictureFileId: string | null;
  status: string;
  facilityId: string;
}

export interface Facility {
  id: string;
  name: string;
  region: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface PendingRegistration {
  id: string;
  userId: string;
  // Non-null once the patient has verified their email — the patient record and Unique Patient
  // ID are created automatically at that point, so this queue is now "awaiting facility
  // confirmation", not "awaiting record creation".
  patientId: string | null;
  uniquePatientId: string | null;
  fullName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  preferredFacilityId: string | null;
  createdAt: string;
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
  professionalFeeKobo: number;
  drugPriceKobo: number;
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

export interface TimelineEvent {
  id: string;
  eventType: "REGISTRATION" | "STATUS_CHANGE" | "CONSULTATION" | "APPOINTMENT" | "INVOICE" | "WALLET";
  referenceId: string;
  createdAt: string;
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
}

export interface Meeting {
  id: string;
  appointmentId: string;
  provider: string;
  roomId: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "ENDED";
}

export interface PublicInquiry {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "OPEN" | "CLOSED";
  linkedPatientId: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicInquiryMessage {
  id: string;
  inquiryId: string;
  senderType: "VISITOR" | "STAFF";
  senderUserId: string | null;
  content: string;
  createdAt: string;
}
