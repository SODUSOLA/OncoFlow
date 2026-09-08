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
export const meetingRecordingStatusEnum = pgEnum("meeting_recording_status", ["PROCESSING", "AVAILABLE", "FAILED"]);
export const transcriptionAssignmentStatusEnum = pgEnum("transcription_assignment_status", [
  "QUEUED", "CLAIMED", "IN_PROGRESS", "COMPLETED", "RELEASED",
]);

export const serviceClassificationNameEnum = pgEnum("service_classification_name", [
  "SUBSCRIPTION", "CONSULTATION", "DRUG_ADMINISTRATION", "CHEMOTHERAPY", "GENERAL_ADMISSION", "PROCEDURE",
  // A self-reported side-effect chat with a Virtual Medical Officer — its own fee, distinct
  // from a general CONSULTATION (per-report, paid upfront before the conversation is created).
  "SIDE_EFFECT_REPORT",
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

// Public-inquiry chat widget (marketing site) — deliberately separate from conversation/message
// (messaging module), which both require a real patientId/senderId. A site visitor asking a
// question has neither yet: they may not be registered at all, or may be a registered patient
// who just hasn't logged in. Staff can later link an inquiry to a patient record once identified.
export const publicInquiryStatusEnum = pgEnum("public_inquiry_status", ["OPEN", "CLOSED"]);
export const publicInquiryMessageSenderTypeEnum = pgEnum("public_inquiry_message_sender_type", ["VISITOR", "STAFF"]);

// Mutual post-conversation rating — the patient rates the care they received, staff (typically
// the Virtual Medical Officer) rates the encounter from their side. Two independent rows per
// conversation (one per rater), not a single shared record — each side's rating/review stands
// on its own regardless of what the other one said.
export const conversationFeedbackRaterRoleEnum = pgEnum("conversation_feedback_rater_role", ["PATIENT", "STAFF"]);

// ONCOFLOW_PATIENT_DATA_MODELS.md §1 — treatment protocol and its individual cycles.
export const regimenStatusEnum = pgEnum("regimen_status", ["ACTIVE", "COMPLETED", "DISCONTINUED", "PAUSED"]);
export const regimenCycleStatusEnum = pgEnum("regimen_cycle_status", ["SCHEDULED", "COMPLETED", "DELAYED", "SKIPPED"]);

// ONCOFLOW_PATIENT_DATA_MODELS.md §2 — one row per reading, one reading per vital type (not a
// wide table with a column per vital), so every surface that shows vitals queries one source.
export const vitalTypeEnum = pgEnum("vital_type", [
  "WEIGHT_KG", "BLOOD_PRESSURE_SYSTOLIC", "BLOOD_PRESSURE_DIASTOLIC",
  "HEART_RATE_BPM", "TEMPERATURE_C", "SPO2_PERCENT",
]);
export const vitalSourceEnum = pgEnum("vital_source", ["MANUAL_ENTRY", "VIDEO_CONSULT", "DEVICE_SYNC"]);

// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md Track 1 — biometric snapshot computed (and stored, as a
// deliberate point-in-time exception) once per cycle by the Nursing Officer.
// Distinct from patient.gender (a self-reported text field, potentially non-binary) — CrCl's
// formula needs a specific binary clinical input (the 0.85 female multiplier), not an identity
// field, so this is scoped to the calculation, not a general demographic column.
export const biologicalSexEnum = pgEnum("biological_sex", ["MALE", "FEMALE"]);
export const bmiClassificationEnum = pgEnum("bmi_classification", ["UNDERWEIGHT", "NORMAL", "OVERWEIGHT", "OBESE"]);
export const crclTierEnum = pgEnum("crcl_tier", [
  "NORMAL", "MILD_IMPAIRMENT", "MODERATE_3A", "MODERATE_SEVERE_3B", "SEVERE",
]);
// KDIGO CKD staging for eGFR — deliberately NOT the same boundaries as crclTierEnum above (CrCl
// tiers came from the original source doc: 50-59/30-49; true KDIGO is 45-59/30-44). Two
// separate calculations per the resolved doc, not one relabeled as the other.
export const egfrStageEnum = pgEnum("egfr_stage", ["G1", "G2", "G3A", "G3B", "G4", "G5"]);

// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md Track 2 — patient-uploaded lab document, reviewed
// through an Admin (date-check only) → QA Officer (clinical) → Clinical Director (universal)
// chain. Distinct from the pre-existing labRequest/labResult/clinicalDecision tables further up
// this file: those model a staff-ORDERED lab request being fulfilled, and are effectively
// unreachable today (neither QUALITY_ASSURANCE_OFFICER nor STATE_CLINICAL_DIRECTOR has ever
// been granted a permission in seed/identity.ts, and the only frontend surface that touches
// this area — Regional Admin's 7-Day Countdown — reads just a plain countdownCase timestamp,
// never labResult/clinicalDecision content directly). Left in place rather than dropped (no
// destructive migration), but new work builds on this model per the doc's explicit "Supersedes
// Section 3" instruction.
export const labDocumentWorkflowStatusEnum = pgEnum("lab_document_workflow_status", [
  "PENDING_ADMIN_REVIEW", "ADMIN_REJECTED",
  "PENDING_QA_REVIEW", "QA_HOLD", "QA_APPROVED",
  "PENDING_CLINICAL_DIRECTOR_REVIEW", "CLINICAL_DIRECTOR_REVIEWED",
]);
export const labDocumentReviewStageEnum = pgEnum("lab_document_review_stage", [
  "ADMIN_DATE_CHECK", "QA_CLINICAL_REVIEW", "CLINICAL_DIRECTOR_REVIEW",
]);
export const labDocumentReviewDecisionEnum = pgEnum("lab_document_review_decision", [
  "APPROVED", "REJECTED", "PROCEED_TO_CHEMO", "HOLD_FROM_CHEMO", "REVIEWED",
]);

// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md — shared case-lock mechanism both tracks can trigger.
export const caseLockTriggerEnum = pgEnum("case_lock_trigger", ["CRCL_CRITICAL", "EGFR_CRITICAL", "QA_HOLD"]);
export const caseLockStatusEnum = pgEnum("case_lock_status", ["LOCKED", "SUPERSEDED"]);
export const caseLockResolvedByRoleEnum = pgEnum("case_lock_resolved_by_role", ["CLINICAL_DIRECTOR", "CHIEF_CONSULTANT"]);
export const caseLockResolutionEnum = pgEnum("case_lock_resolution", ["APPROVED_TO_PROCEED", "REMAINS_BLOCKED"]);