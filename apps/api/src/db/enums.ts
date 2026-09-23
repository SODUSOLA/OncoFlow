import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE", "LOCKED", "SUSPENDED"]);
export const roleNameEnum = pgEnum("role_name", [
  "PATIENT",
  "REGIONAL_ADMIN",
  "VIRTUAL_MEDICAL_OFFICER",
  // Consultant specialties share one frontend view and identical permissions; the distinct roles are for display and scheduling/matching only.
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
  // SCRIBE is its own assignable role because editing transcript content is separate authority from any clinical role.
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
  // Side-effect report chat with a Virtual Medical Officer, billed per report and paid upfront before the conversation is created.
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

// Marketing-site inquiry status; kept separate from conversation/message because a visitor has no patientId or senderId yet.
export const publicInquiryStatusEnum = pgEnum("public_inquiry_status", ["OPEN", "CLOSED"]);
export const publicInquiryMessageSenderTypeEnum = pgEnum("public_inquiry_message_sender_type", ["VISITOR", "STAFF"]);

// Which side left a post-conversation rating; the patient and staff each get their own independent row per conversation.
export const conversationFeedbackRaterRoleEnum = pgEnum("conversation_feedback_rater_role", ["PATIENT", "STAFF"]);

// ONCOFLOW_PATIENT_DATA_MODELS.md §1 — treatment protocol and its individual cycles.
export const regimenStatusEnum = pgEnum("regimen_status", ["ACTIVE", "COMPLETED", "DISCONTINUED", "PAUSED"]);
export const regimenCycleStatusEnum = pgEnum("regimen_cycle_status", ["SCHEDULED", "COMPLETED", "DELAYED", "SKIPPED"]);

// Vital types: one row per reading rather than a column per vital, so every surface queries one source.
export const vitalTypeEnum = pgEnum("vital_type", [
  "WEIGHT_KG", "BLOOD_PRESSURE_SYSTOLIC", "BLOOD_PRESSURE_DIASTOLIC",
  "HEART_RATE_BPM", "TEMPERATURE_C", "SPO2_PERCENT",
]);
export const vitalSourceEnum = pgEnum("vital_source", ["MANUAL_ENTRY", "VIDEO_CONSULT", "DEVICE_SYNC"]);

// Biological sex used only for the CrCl calculation's 0.85 female multiplier, distinct from the self-reported patient.gender.
export const biologicalSexEnum = pgEnum("biological_sex", ["MALE", "FEMALE"]);
export const bmiClassificationEnum = pgEnum("bmi_classification", ["UNDERWEIGHT", "NORMAL", "OVERWEIGHT", "OBESE"]);
export const crclTierEnum = pgEnum("crcl_tier", [
  "NORMAL", "MILD_IMPAIRMENT", "MODERATE_3A", "MODERATE_SEVERE_3B", "SEVERE",
]);
// KDIGO eGFR stages, whose boundaries intentionally differ from the CrCl tiers above.
export const egfrStageEnum = pgEnum("egfr_stage", ["G1", "G2", "G3A", "G3B", "G4", "G5"]);

// Workflow states for patient-uploaded lab documents (Admin → QA Officer → Clinical Director), which supersede the older staff-ordered labRequest tables.
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

// Nursing case lifecycle: STARTED by the nurse, PENDING_QA_REVIEW once the sheet is submitted, CLOSED when QA records REQUIREMENTS_MET.
export const nursingCaseStatusEnum = pgEnum("nursing_case_status", ["STARTED", "PENDING_QA_REVIEW", "CLOSED"]);
export const nursingCaseReviewDecisionEnum = pgEnum("nursing_case_review_decision", ["REQUIREMENTS_INCOMPLETE", "REQUIREMENTS_MET"]);
// Drug supply chain: request → dispatch → acknowledge, with stock held as two append-only ledgers.
export const drugRequestStatusEnum = pgEnum("drug_request_status", ["REQUESTED", "DISPATCHED", "DELIVERED", "CANCELLED"]);
export const drugDispatchStatusEnum = pgEnum("drug_dispatch_status", ["IN_TRANSIT", "DELIVERED"]);
export const drugLedgerReasonEnum = pgEnum("drug_ledger_reason", ["DELIVERY", "USAGE", "LOSS", "ADJUSTMENT"]);
export const regionalDrugLedgerReasonEnum = pgEnum("regional_drug_ledger_reason", ["PROCUREMENT", "DISPATCH", "ADJUSTMENT"]);
export const drugLossReasonEnum = pgEnum("drug_loss_reason", ["SPILLAGE", "BREAKAGE", "OTHER"]);
export const drugReconciliationScopeEnum = pgEnum("drug_reconciliation_scope", ["REGIONAL", "NURSING_OFFICER"]);
