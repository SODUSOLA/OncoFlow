import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE", "LOCKED", "SUSPENDED"]);
export const roleNameEnum = pgEnum("role_name", [
  "PATIENT",
  "REGIONAL_ADMIN",
  "VIRTUAL_MEDICAL_OFFICER",
  // Consultant specialties (PRD v3 §18.1's "Consultation" classification: Oncologist,
  // Surgeon, Psycho-Oncologist, Nutritionist) — one shared frontend view for all of them
  // (apps/dashboard's consultant page), but distinct roles here so a logged-in consultant's
  // actual specialty is visible on their own page and can be used for scheduling/matching.
  // All four carry identical permissions (RBAC seed grants the set once, to every CONSULTING_*
  // role) — this is a display/matching distinction, not an access-control one.
  "CONSULTING_ONCOLOGIST",
  "CONSULTING_SURGEON",
  "CONSULTING_NUTRITIONIST",
  "CONSULTING_PSYCHO_ONCOLOGIST",
  "STATE_CLINICAL_DIRECTOR",
  "QUALITY_ASSURANCE_OFFICER",
  "ONSITE_NURSING_OFFICER",
  "NATIONAL_CLINICAL_DIRECTOR",
  "STATE_DIRECTOR_OF_NURSING_SERVICES",
  "NATIONAL_DIRECTOR_OF_NURSING_SERVICES",
  // F3.11 (docs/build-plan/13-scribe-role-definition.md): a real, independently-assignable
  // role rather than a tag on an existing one — editing Transcript content is distinct
  // authority that shouldn't be conflated with any clinical role's own permission set.
  "SCRIBE",
  "SUPER_ADMIN",
]);
export const accountLockTypeEnum = pgEnum("account_lock_type", ["24H_ADMIN", "MISCONDUCT"]);
export const misconductStatusEnum = pgEnum("misconduct_status", ["OPEN", "UNDER_REVIEW", "CLEARED"]);

export const patientStatusEnum = pgEnum("patient_status", ["ACTIVE", "INACTIVE"]);
export const facilityStatusEnum = pgEnum("facility_status", ["ACTIVE", "INACTIVE"]);

export const countdownStatusEnum = pgEnum("countdown_status", ["ACTIVE", "ESCALATED", "CLEARED", "DECLINED"]);
export const physicalCaseTypeEnum = pgEnum("physical_case_type", ["INFUSION", "CONSULTATION"]);
export const physicalCaseStatusEnum = pgEnum("physical_case_status", ["OPEN", "CLOSED"]);
export const appointmentCardStatusEnum = pgEnum("appointment_card_status", ["DRAFT", "SUBMITTED", "REVIEWED_BY_QA"]);
export const treatmentStatusEnum = pgEnum("treatment_status", ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
export const labRequestStatusEnum = pgEnum("lab_request_status", ["PENDING", "UPLOADED", "REVIEWED"]);
export const clinicalDecisionEnum = pgEnum("decision_type", ["APPROVED", "DECLINED", "REQUIRES_REVIEW"]);
export const prescriptionStatusEnum = pgEnum("prescription_status", ["ACTIVE", "FULFILLED", "CANCELLED"]);

export const appointmentTypeEnum = pgEnum("appointment_type", ["VIRTUAL", "PHYSICAL", "CHEMOTHERAPY", "PROCEDURE"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "MISSED",
]);
export const transferStatusEnum = pgEnum("transfer_status", ["PENDING", "APPROVED", "DECLINED"]);

export const conversationTypeEnum = pgEnum("conversation_type", ["ADMIN_INQUIRY", "MO_SIDE_EFFECT"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["OPEN", "CLOSED"]);
export const messageTypeEnum = pgEnum("message_type", ["TEXT", "IMAGE", "VOICE", "SYSTEM"]);
export const messageStatusEnum = pgEnum("message_status", ["SENT", "DELIVERED", "READ"]);
export const meetingStatusEnum = pgEnum("meeting_status", ["SCHEDULED", "IN_PROGRESS", "ENDED"]);
export const transcriptionAssignmentStatusEnum = pgEnum("transcription_assignment_status", [
  "QUEUED", "CLAIMED", "IN_PROGRESS", "COMPLETED", "RELEASED",
]);

export const serviceClassificationNameEnum = pgEnum("service_classification_name", [
  "SUBSCRIPTION", "CONSULTATION", "DRUG_ADMINISTRATION", "CHEMOTHERAPY", "GENERAL_ADMISSION", "PROCEDURE",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "SENT", "PAID", "VOID", "OVERDUE"]);
export const invoiceComponentEnum = pgEnum("invoice_component", ["NETWORK_FEE", "FACILITY_FEE", "PROFESSIONAL_FEE", "DRUG_COST"]);
export const payoutRoleEnum = pgEnum("payout_role", [
  "ONCOLOGIST",
  "STATE_CLINICAL_DIRECTOR",
  "NATIONAL_CLINICAL_DIRECTOR",
  "STATE_DIRECTOR_OF_NURSING_SERVICES",
  "NATIONAL_DIRECTOR_OF_NURSING_SERVICES",
]);
export const billingCycleEnum = pgEnum("billing_cycle", ["MONTHLY", "YEARLY"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "SUCCESS", "FAILED", "REFUNDED"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["ACTIVE", "CANCELLED", "EXPIRED"]);
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", ["CREDIT", "DEBIT"]);
export const payeeOwnerTypeEnum = pgEnum("payee_owner_type", ["FACILITY", "USER"]);
export const payoutStatusEnum = pgEnum("payout_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REVERSED"]);
export const payoutSourceTypeEnum = pgEnum("payout_source_type", ["PROFESSIONAL_FEE_SPLIT", "FACILITY_FEE"]);

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "PURCHASE", "DISPATCH", "RECEIPT_CONFIRMED", "ADMINISTERED", "INCIDENT", "RETURN", "ADJUSTMENT",
]);
export const incidentTypeEnum = pgEnum("incident_type", ["BROKEN", "SPILLED", "EXPIRED", "MANUFACTURING_DEFECT"]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["PENDING", "VARIANCE_FLAGGED", "RESOLVED"]);

export const virusScanStatusEnum = pgEnum("virus_scan_status", ["PENDING", "CLEAN", "INFECTED"]);
export const notificationStatusEnum = pgEnum("notification_status", ["PENDING", "SENT", "READ", "FAILED"]);
export const auditActionEnum = pgEnum("audit_action", [
  "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT", "APPROVE", "DECLINE", "ACCESS_DENIED",
]);
export const auditResultEnum = pgEnum("audit_result", ["ALLOWED", "DENIED"]);