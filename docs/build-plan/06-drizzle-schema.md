# OncoFlow — Drizzle Schema (`schema.ts`, generated per module)

Generated directly from `OncoFlow_Database_Architecture_v2.md` §3–§6, with the corrections from `00-global-conventions-and-schema-corrections.md` already applied. Matches the module layout from ADR-0006 (`src/modules/{auth,patient,facility,clinical,appointment,messaging,billing,inventory,documents,notification,audit}`), plus a shared `src/db/enums.ts` and a root barrel at `src/db/schema.ts`.

**One schema-generation-only exception to the module-boundary rule:** `dependency-cruiser` (F0.6) blocks cross-module imports for services/repositories/controllers — but `schema.ts` files are allowed to import table objects from other modules' `schema.ts` files, because foreign keys are inherently cross-cutting and Drizzle needs the actual table object to build a `.references()` constraint. Configure the `dependency-cruiser` rule to allow `schema.ts → schema.ts` imports specifically, while still blocking `service.ts → other-module/repository.ts` and similar. Where two modules' schemas reference each other (e.g. `auth` ↔ `messaging`, via `MisconductFlag.conversation_id` and `Message.sender_id`), the `.references(() => otherTable.column)` callback form is used everywhere below — this defers resolution until query-build time, so the circular file import between the two schema files resolves cleanly; it isn't optional styling, it's what makes the circular case work at all.

**One schema correction beyond the three already documented:** v2.0 gives `Wallet` a *redundant* circular 1:1 — `Patient.wallet_id → Wallet` **and** `Wallet.patient_id → Patient` both encode the same relationship. Only one is needed. Kept: `Wallet.patient_id → Patient` (matches the build sequence in Sprint 1, where creating a `Patient` also creates its `Wallet` row in the same transaction — `Wallet` is the dependent side). Dropped: `Patient.wallet_id`. Flag this if it conflicts with anything downstream you already assumed.

---

## `src/db/enums.ts`

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

// Identity
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED']);
export const roleNameEnum = pgEnum('role_name', [
  'PATIENT',
  'REGIONAL_ADMIN',
  'VIRTUAL_MEDICAL_OFFICER',
  'CONSULTING_ONCOLOGIST',
  'STATE_CLINICAL_DIRECTOR',
  'QUALITY_ASSURANCE_OFFICER',
  'ONSITE_NURSING_OFFICER',
  'NATIONAL_CLINICAL_DIRECTOR',
  'STATE_DIRECTOR_OF_NURSING_SERVICES',
  'NATIONAL_DIRECTOR_OF_NURSING_SERVICES',
  'SUPER_ADMIN',
]);
export const accountLockTypeEnum = pgEnum('account_lock_type', ['24H_ADMIN', 'MISCONDUCT']);
export const misconductStatusEnum = pgEnum('misconduct_status', ['OPEN', 'UNDER_REVIEW', 'CLEARED']);

// Patient / Facility
export const patientStatusEnum = pgEnum('patient_status', ['ACTIVE', 'INACTIVE']);
export const facilityStatusEnum = pgEnum('facility_status', ['ACTIVE', 'INACTIVE']);

// Clinical
export const countdownStatusEnum = pgEnum('countdown_status', ['ACTIVE', 'ESCALATED', 'CLEARED', 'DECLINED']);
export const physicalCaseTypeEnum = pgEnum('physical_case_type', ['INFUSION', 'CONSULTATION']);
export const physicalCaseStatusEnum = pgEnum('physical_case_status', ['OPEN', 'CLOSED']);
export const appointmentCardStatusEnum = pgEnum('appointment_card_status', ['DRAFT', 'SUBMITTED', 'REVIEWED_BY_QA']);
export const treatmentStatusEnum = pgEnum('treatment_status', ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);
export const labRequestStatusEnum = pgEnum('lab_request_status', ['PENDING', 'UPLOADED', 'REVIEWED']);
export const clinicalDecisionEnum = pgEnum('clinical_decision', ['APPROVED', 'DECLINED', 'REQUIRES_REVIEW']);
export const prescriptionStatusEnum = pgEnum('prescription_status', ['ACTIVE', 'FULFILLED', 'CANCELLED']);

// Appointment
export const appointmentTypeEnum = pgEnum('appointment_type', ['VIRTUAL', 'PHYSICAL', 'CHEMOTHERAPY', 'PROCEDURE']);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED',
]);
export const transferStatusEnum = pgEnum('transfer_status', ['PENDING', 'APPROVED', 'DECLINED']);

// Messaging / Video
export const conversationTypeEnum = pgEnum('conversation_type', ['ADMIN_INQUIRY', 'MO_SIDE_EFFECT']);
export const conversationStatusEnum = pgEnum('conversation_status', ['OPEN', 'CLOSED']);
export const messageTypeEnum = pgEnum('message_type', ['TEXT', 'IMAGE', 'VOICE', 'SYSTEM']);
export const messageStatusEnum = pgEnum('message_status', ['SENT', 'DELIVERED', 'READ']);
export const meetingStatusEnum = pgEnum('meeting_status', ['SCHEDULED', 'IN_PROGRESS', 'ENDED']);

// Billing
export const serviceClassificationNameEnum = pgEnum('service_classification_name', [
  'SUBSCRIPTION', 'CONSULTATION', 'DRUG_ADMINISTRATION', 'CHEMOTHERAPY', 'GENERAL_ADMISSION', 'PROCEDURE',
]);
export const invoiceStatusEnum = pgEnum('invoice_status', ['DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE']);
export const invoiceComponentEnum = pgEnum('invoice_component', ['NETWORK_FEE', 'FACILITY_FEE', 'PROFESSIONAL_FEE', 'DRUG_COST']);
export const payoutRoleEnum = pgEnum('payout_role', [
  'ONCOLOGIST',
  'STATE_CLINICAL_DIRECTOR',
  'NATIONAL_CLINICAL_DIRECTOR',
  'STATE_DIRECTOR_OF_NURSING_SERVICES',
  'NATIONAL_DIRECTOR_OF_NURSING_SERVICES',
]);
export const billingCycleEnum = pgEnum('billing_cycle', ['MONTHLY', 'YEARLY']);
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['ACTIVE', 'CANCELLED', 'EXPIRED']);
export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', ['CREDIT', 'DEBIT']);
export const payeeOwnerTypeEnum = pgEnum('payee_owner_type', ['FACILITY', 'USER']);
export const payoutStatusEnum = pgEnum('payout_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED']);
export const payoutSourceTypeEnum = pgEnum('payout_source_type', ['PROFESSIONAL_FEE_SPLIT', 'FACILITY_FEE']);

// Inventory
export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
  'PURCHASE', 'DISPATCH', 'RECEIPT_CONFIRMED', 'ADMINISTERED', 'INCIDENT', 'RETURN', 'ADJUSTMENT',
]);
export const incidentTypeEnum = pgEnum('incident_type', ['BROKEN', 'SPILLED', 'EXPIRED', 'MANUFACTURING_DEFECT']);
export const reconciliationStatusEnum = pgEnum('reconciliation_status', ['PENDING', 'VARIANCE_FLAGGED', 'RESOLVED']);

// Documents / Notifications / Audit
export const virusScanStatusEnum = pgEnum('virus_scan_status', ['PENDING', 'CLEAN', 'INFECTED']);
export const notificationStatusEnum = pgEnum('notification_status', ['PENDING', 'SENT', 'READ', 'FAILED']);
export const auditActionEnum = pgEnum('audit_action', [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'APPROVE', 'DECLINE', 'ACCESS_DENIED',
]);
export const auditResultEnum = pgEnum('audit_result', ['ALLOWED', 'DENIED']);
```

---

## `src/modules/auth/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import {
  userStatusEnum, roleNameEnum, accountLockTypeEnum, misconductStatusEnum,
} from '../../db/enums';
import { conversation } from '../messaging/schema'; // circular file import — resolved via .references() callback below, see file header

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  lastLogin: timestamp('last_login'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  emailUniqueActive: uniqueIndex('user_email_unique_active').on(t.email).where(sql`${t.isDeleted} = false`),
  statusIdx: index('user_status_idx').on(t.status),
  lastLoginIdx: index('user_last_login_idx').on(t.lastLogin),
}));

// [no soft delete — lookup table]
export const role = pgTable('role', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: roleNameEnum('name').notNull().unique(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// [no soft delete — lookup table]
export const permission = pgTable('permission', {
  id: uuid('id').primaryKey().defaultRandom(),
  resource: varchar('resource', { length: 255 }).notNull(), // e.g. "invoice", "patient.labResult"
  action: varchar('action', { length: 100 }).notNull(),      // e.g. "create", "read", "approve"
  description: text('description').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const userRole = pgTable('user_role', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  roleId: uuid('role_id').notNull().references(() => role.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userRoleUnique: uniqueIndex('user_role_unique').on(t.userId, t.roleId),
}));

// [no soft delete]
export const rolePermission = pgTable('role_permission', {
  id: uuid('id').primaryKey().defaultRandom(),
  roleId: uuid('role_id').notNull().references(() => role.id),
  permissionId: uuid('permission_id').notNull().references(() => permission.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  device: varchar('device', { length: 255 }).notNull(),
  ip: varchar('ip', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  mfaVerified: boolean('mfa_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('session_user_idx').on(t.userId),
  expiresAtIdx: index('session_expires_at_idx').on(t.expiresAt),
}));

export const accountLock = pgTable('account_lock', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  lockedBy: uuid('locked_by').notNull().references(() => user.id),
  lockedAt: timestamp('locked_at').notNull(),
  lockedUntil: timestamp('locked_until'),
  reason: text('reason').notNull(),
  lockType: accountLockTypeEnum('lock_type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const misconductFlag = pgTable('misconduct_flag', {
  id: uuid('id').primaryKey().defaultRandom(),
  flaggedUserId: uuid('flagged_user_id').notNull().references(() => user.id),
  triggerReason: text('trigger_reason').notNull(),
  conversationId: uuid('conversation_id').references(() => conversation.id),
  status: misconductStatusEnum('status').notNull().default('OPEN'),
  reviewer1Id: uuid('reviewer_1_id').references(() => user.id),
  reviewer2Id: uuid('reviewer_2_id').references(() => user.id),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});
```

*(Note: `sql` used in the partial-index `.where()` clause above needs `import { sql } from 'drizzle-orm';` at the top — omitted from the snippet header for brevity, include it in the real file.)*

---

## `src/modules/facility/schema.ts`

```typescript
import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { facilityStatusEnum } from '../../db/enums';

export const facility = pgTable('facility', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  region: varchar('region', { length: 100 }).notNull(), // plain string for MVP, not a lookup table
  address: text('address').notNull(),
  status: facilityStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const department = pgTable('department', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});
```

*(`text` import needed alongside the others — included in full-file assembly, trimmed here for repeated boilerplate.)*

---

## `src/modules/patient/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, text, date, boolean, timestamp, uniqueIndex, index, sql,
} from 'drizzle-orm/pg-core';
import { patientStatusEnum } from '../../db/enums';
import { user } from '../auth/schema';
import { facility } from '../facility/schema';

export const patient = pgTable('patient', {
  id: uuid('id').primaryKey().defaultRandom(),
  // human-readable, distinct from id (ADR-0002) — confirm exact format convention before hardcoding a pattern
  uniquePatientId: varchar('unique_patient_id', { length: 32 }).notNull(),
  userId: uuid('user_id').references(() => user.id), // NULL, UNIQUE (1:1)
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  dob: date('dob').notNull(),
  gender: varchar('gender', { length: 32 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(), // RESTRICTED: never in staff-facing API payloads (PRD FR-04)
  email: varchar('email', { length: 255 }).notNull(),
  status: patientStatusEnum('status').notNull().default('ACTIVE'),
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniquePatientIdActive: uniqueIndex('patient_unique_id_active').on(t.uniquePatientId).where(sql`${t.isDeleted} = false`),
  userIdUnique: uniqueIndex('patient_user_id_unique').on(t.userId),
  facilityIdx: index('patient_facility_idx').on(t.facilityId),
  statusIdx: index('patient_status_idx').on(t.status),
  dobIdx: index('patient_dob_idx').on(t.dob),
}));

export const patientAddress = pgTable('patient_address', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  country: varchar('country', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  address: text('address').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const emergencyContact = pgTable('emergency_contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  name: varchar('name', { length: 255 }).notNull(),
  relationship: varchar('relationship', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

// [append-only]
export const patientTimeline = pgTable('patient_timeline', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  referenceId: uuid('reference_id').notNull(), // polymorphic pointer, no FK by design
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// [SCHEMA CORRECTION] Wallet lives here, not in billing/schema.ts — see file header.
// Patient.wallet_id (redundant circular 1:1 in v2.0) dropped; only this FK direction kept.
export const wallet = pgTable('wallet', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id), // UNIQUE (1:1)
  balanceKobo: bigint('balance_kobo', { mode: 'bigint' }).notNull().default(0n),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  patientIdUnique: uniqueIndex('wallet_patient_id_unique').on(t.patientId),
}));
```

*(`bigint` needs adding to the `drizzle-orm/pg-core` import list in the real file — trimmed from the snippet above to keep each import line focused on what's new.)*

---

## `src/modules/clinical/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, text, date, integer, boolean, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import {
  countdownStatusEnum, physicalCaseTypeEnum, physicalCaseStatusEnum, appointmentCardStatusEnum,
  treatmentStatusEnum, labRequestStatusEnum, clinicalDecisionEnum, prescriptionStatusEnum,
} from '../../db/enums';
import { user } from '../auth/schema';
import { patient } from '../patient/schema';
import { appointment } from '../appointment/schema';
import { conversation } from '../messaging/schema';
import { file } from '../documents/schema'; // F3.0 minimal Documents module — see Sprint 3 markdown
import { invoice } from '../billing/schema';

export const countdownCase = pgTable('countdown_case', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  currentDay: integer('current_day').notNull(), // 7 → 0
  status: countdownStatusEnum('status').notNull().default('ACTIVE'),
  labsPromptedAt: timestamp('labs_prompted_at'),
  labsUploadedAt: timestamp('labs_uploaded_at'),
  resultsSentToQaAt: timestamp('results_sent_to_qa_at'), // routes to QA first (ADR-0012)
  clinicalDecisionId: uuid('clinical_decision_id').references(() => clinicalDecision.id),
  invoiceId: uuid('invoice_id').references(() => invoice.id), // UNIQUE (1:1)
  paymentConfirmedAt: timestamp('payment_confirmed_at'),
  reminderSentAt: timestamp('reminder_sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  patientStatusIdx: index('countdown_case_patient_status_idx').on(t.patientId, t.status),
  currentDayIdx: index('countdown_case_current_day_idx').on(t.currentDay),
  invoiceIdUnique: uniqueIndex('countdown_case_invoice_id_unique').on(t.invoiceId),
}));

export const physicalCase = pgTable('physical_case', {
  id: uuid('id').primaryKey().defaultRandom(),
  countdownCaseId: uuid('countdown_case_id').references(() => countdownCase.id), // NULL, UNIQUE (1:1) — standalone consults allowed
  appointmentId: uuid('appointment_id').notNull().references(() => appointment.id), // UNIQUE (1:1)
  openedBy: uuid('opened_by').notNull().references(() => user.id), // Onsite Nursing Officer, exclusive
  openedAt: timestamp('opened_at'),
  caseType: physicalCaseTypeEnum('case_type').notNull(),
  closedBy: uuid('closed_by').references(() => user.id), // Quality Assurance Officer, exclusive + facility-scoped (see global conventions §1.4)
  closedAt: timestamp('closed_at'),
  status: physicalCaseStatusEnum('status').notNull().default('OPEN'),
  // Close Case transition requires BOTH of the below NOT NULL — enforced in service layer (F4.4), applies to every PhysicalCase (§1.3)
  doctorNoteReviewedAt: timestamp('doctor_note_reviewed_at'),
  appointmentCardReviewedAt: timestamp('appointment_card_reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  countdownCaseIdUnique: uniqueIndex('physical_case_countdown_case_id_unique').on(t.countdownCaseId),
  appointmentIdUnique: uniqueIndex('physical_case_appointment_id_unique').on(t.appointmentId),
  statusIdx: index('physical_case_status_idx').on(t.status),
}));

export const treatmentCycle = pgTable('treatment_cycle', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  cycleNumber: integer('cycle_number').notNull(),
  status: treatmentStatusEnum('status').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const treatmentPlan = pgTable('treatment_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  oncologistId: uuid('oncologist_id').notNull().references(() => user.id),
  clinicalDirectorId: uuid('clinical_director_id').notNull().references(() => user.id),
  status: treatmentStatusEnum('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const labRequest = pgTable('lab_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  requestedBy: uuid('requested_by').notNull().references(() => user.id),
  status: labRequestStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const labResult = pgTable('lab_result', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  requestId: uuid('request_id').notNull().references(() => labRequest.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => user.id), // typically the Patient's linked User
  reviewedBy: uuid('reviewed_by').references(() => user.id),
  status: labRequestStatusEnum('status').notNull().default('PENDING'),
  fileId: uuid('file_id').notNull().references(() => file.id),
  testDate: date('test_date').notNull(), // date on the report itself, distinct from upload timestamp
  fileHash: varchar('file_hash', { length: 128 }).notNull(),
  possibleDuplicate: boolean('possible_duplicate').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  // Admin read access scoped to {file_id, test_date, possible_duplicate} only — enforce via a dedicated DTO/serializer, not here
}, (t) => ({
  fileHashPatientTestDateIdx: index('lab_result_file_hash_patient_test_date_idx').on(t.fileHash, t.patientId, t.testDate),
}));

// two-stage, sequential (ADR-0012) — service layer MUST reject setting final_decision while qa_decided_at IS NULL
export const clinicalDecision = pgTable('clinical_decision', {
  id: uuid('id').primaryKey().defaultRandom(),
  labResultId: uuid('lab_result_id').notNull().references(() => labResult.id), // UNIQUE (1:1)
  qaRecommendation: clinicalDecisionEnum('qa_recommendation'),
  qaReason: text('qa_reason'),
  qaDecidedBy: uuid('qa_decided_by').references(() => user.id), // Quality Assurance Officer
  qaDecidedAt: timestamp('qa_decided_at'),
  finalDecision: clinicalDecisionEnum('final_decision'),
  finalReason: text('final_reason'),
  directorId: uuid('director_id').references(() => user.id), // State Clinical Director
  directorDecidedAt: timestamp('director_decided_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  labResultIdUnique: uniqueIndex('clinical_decision_lab_result_id_unique').on(t.labResultId),
}));

export const medicalRecord = pgTable('medical_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  createdBy: uuid('created_by').notNull().references(() => user.id),
  recordType: varchar('record_type', { length: 100 }).notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const clinicalNote = pgTable('clinical_note', {
  id: uuid('id').primaryKey().defaultRandom(),
  medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
  authorId: uuid('author_id').notNull().references(() => user.id),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

// [append-only]
export const triageChecklist = pgTable('triage_checklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversation.id), // UNIQUE (1:1)
  completedBy: uuid('completed_by').notNull().references(() => user.id), // Virtual Medical Officer
  completedAt: timestamp('completed_at').notNull(),
  presentingComplaint: text('presenting_complaint').notNull(),
  duration: varchar('duration', { length: 100 }).notNull(),
  functionalImpact: text('functional_impact').notNull(),
  priorMeasures: text('prior_measures').notNull(),
  canTalkWalkEat: text('can_talk_walk_eat').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  conversationIdUnique: uniqueIndex('triage_checklist_conversation_id_unique').on(t.conversationId),
}));

export const prescription = pgTable('prescription', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  doctorId: uuid('doctor_id').notNull().references(() => user.id),
  appointmentId: uuid('appointment_id').references(() => appointment.id),
  triageChecklistId: uuid('triage_checklist_id').references(() => triageChecklist.id), // NOT NULL enforced at service layer for MO-issued prescriptions
  status: prescriptionStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

// [SCHEMA CORRECTION] necessities_checklist JSONB removed — see AppointmentCardChecklistItem below
export const appointmentCard = pgTable('appointment_card', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().references(() => appointment.id), // UNIQUE (1:1)
  physicalCaseId: uuid('physical_case_id').notNull().references(() => physicalCase.id),
  filledBy: uuid('filled_by').notNull().references(() => user.id), // Onsite Nursing Officer
  filledAt: timestamp('filled_at'),
  vitalsSummary: text('vitals_summary').notNull(),
  notes: text('notes').notNull(),
  status: appointmentCardStatusEnum('status').notNull().default('DRAFT'),
  reviewedBy: uuid('reviewed_by').references(() => user.id), // Quality Assurance Officer
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  appointmentIdUnique: uniqueIndex('appointment_card_appointment_id_unique').on(t.appointmentId),
}));

// [SCHEMA CORRECTION, replaces necessities_checklist JSONB] fixed checklist, confirmed non-configurable
export const appointmentCardChecklistItem = pgTable('appointment_card_checklist_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentCardId: uuid('appointment_card_id').notNull().references(() => appointmentCard.id),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  isChecked: boolean('is_checked').notNull().default(false),
  checkedAt: timestamp('checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  cardItemUnique: uniqueIndex('appointment_card_checklist_item_unique').on(t.appointmentCardId, t.itemName),
}));
```

---

## `src/modules/appointment/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, boolean, timestamp, index,
} from 'drizzle-orm/pg-core';
import { appointmentTypeEnum, appointmentStatusEnum, transferStatusEnum } from '../../db/enums';
import { patient } from '../patient/schema';
import { user } from '../auth/schema';
import { facility } from '../facility/schema';
import { meeting } from '../messaging/schema';

export const appointment = pgTable('appointment', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  oncologistId: uuid('oncologist_id').references(() => user.id),
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  appointmentType: appointmentTypeEnum('appointment_type').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: appointmentStatusEnum('status').notNull().default('PENDING'),
  meetingId: uuid('meeting_id').references(() => meeting.id),
  paymentConfirmedAt: timestamp('payment_confirmed_at'), // drives the 2PM cutoff rule, FR-03
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  patientIdx: index('appointment_patient_idx').on(t.patientId),
  facilityScheduledIdx: index('appointment_facility_scheduled_idx').on(t.facilityId, t.scheduledAt),
  statusIdx: index('appointment_status_idx').on(t.status),
}));

export const appointmentParticipant = pgTable('appointment_participant', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().references(() => appointment.id),
  userId: uuid('user_id').notNull().references(() => user.id),
  role: varchar('role', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const transferRequest = pgTable('transfer_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  fromFacilityId: uuid('from_facility_id').notNull().references(() => facility.id),
  toFacilityId: uuid('to_facility_id').notNull().references(() => facility.id),
  requestedBy: uuid('requested_by').notNull().references(() => user.id),
  approvedBy: uuid('approved_by').references(() => user.id),
  status: transferStatusEnum('status').notNull().default('PENDING'),
  routedAt: timestamp('routed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});
```

---

## `src/modules/messaging/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import {
  conversationTypeEnum, conversationStatusEnum, messageTypeEnum, messageStatusEnum, meetingStatusEnum,
} from '../../db/enums';
import { patient } from '../patient/schema';
import { user } from '../auth/schema'; // circular file import with auth/schema.ts — resolved via .references() callback, see file header
import { appointment } from '../appointment/schema';

export const conversation = pgTable('conversation', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  conversationType: conversationTypeEnum('conversation_type').notNull(),
  status: conversationStatusEnum('status').notNull().default('OPEN'),
  slaDeadline: timestamp('sla_deadline'),
  firstResponseAt: timestamp('first_response_at'),
  slaBreached: boolean('sla_breached').notNull().default(false),
  assignedTo: uuid('assigned_to').references(() => user.id), // implied by v2.0 §6 index; assign on conversation creation
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  assignedSlaIdx: index('conversation_assigned_sla_idx').on(t.assignedTo, t.slaDeadline), // powers SLA dashboards
}));

export const participant = pgTable('participant', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversation.id),
  userId: uuid('user_id').notNull().references(() => user.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// [append-only]
export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversation.id),
  senderId: uuid('sender_id').notNull().references(() => user.id),
  type: messageTypeEnum('type').notNull(),
  content: text('content').notNull(),
  status: messageStatusEnum('status').notNull().default('SENT'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const meeting = pgTable('meeting', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().references(() => appointment.id), // UNIQUE (1:1)
  provider: varchar('provider', { length: 100 }).notNull(),
  roomId: varchar('room_id', { length: 255 }).notNull(),
  status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  appointmentIdUnique: uniqueIndex('meeting_appointment_id_unique').on(t.appointmentId),
}));

export const transcript = pgTable('transcript', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meeting.id),
  speaker: varchar('speaker', { length: 100 }).notNull(),
  content: text('content').notNull(),
  editedBy: uuid('edited_by').references(() => user.id),
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

*Note: `Appointment.meeting_id` (appointment/schema.ts) and `Meeting.appointment_id` (here) form the same kind of redundant circular 1:1 that `Wallet`/`Patient` had. v2.0 defines both directions. Unlike the Wallet case, this one is left as-is deliberately — `Appointment.meeting_id` is genuinely useful as a fast forward-lookup even with `Meeting.appointment_id` present, since appointment rows are read far more often than meeting rows in the app's actual traffic pattern. Flagging so it's a conscious choice, not an oversight — drop `Appointment.meeting_id` if you'd rather keep the schema strictly non-redundant.*

---

## `src/modules/billing/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, bigint, boolean, date, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import {
  serviceClassificationNameEnum, invoiceStatusEnum, invoiceComponentEnum, payoutRoleEnum,
  billingCycleEnum, paymentStatusEnum, subscriptionStatusEnum, walletTransactionTypeEnum,
  payeeOwnerTypeEnum, payoutStatusEnum, payoutSourceTypeEnum,
} from '../../db/enums';
import { patient, wallet } from '../patient/schema'; // wallet now lives in patient/schema.ts — see file header
import { appointment } from '../appointment/schema';
import { facility } from '../facility/schema';
import { user } from '../auth/schema';

// [no soft delete — lookup]
export const serviceClassification = pgTable('service_classification', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: serviceClassificationNameEnum('name').notNull().unique(),
  cappedNetworkFeeKobo: bigint('capped_network_fee_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tariff = pgTable('tariff', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  classificationId: uuid('classification_id').notNull().references(() => serviceClassification.id),
  networkFeeKobo: bigint('network_fee_kobo', { mode: 'bigint' }).notNull(),
  facilityBedFeeKobo: bigint('facility_bed_fee_kobo', { mode: 'bigint' }).notNull(),
  drugPriceKobo: bigint('drug_price_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  facilityClassificationUnique: uniqueIndex('tariff_facility_classification_unique').on(t.facilityId, t.classificationId),
}));

export const invoice = pgTable('invoice', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  appointmentId: uuid('appointment_id').references(() => appointment.id), // NULL — subscriptions have none
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  classificationId: uuid('classification_id').notNull().references(() => serviceClassification.id),
  status: invoiceStatusEnum('status').notNull().default('DRAFT'),
  totalKobo: bigint('total_kobo', { mode: 'bigint' }).notNull(),
  issuedAt: timestamp('issued_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  patientIdx: index('invoice_patient_idx').on(t.patientId),
  statusIdx: index('invoice_status_idx').on(t.status),
  issuedAtIdx: index('invoice_issued_at_idx').on(t.issuedAt),
}));

// [append-only once invoice.status != DRAFT] — enforce at service layer
export const invoiceItem = pgTable('invoice_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoice.id),
  component: invoiceComponentEnum('component').notNull(),
  amountKobo: bigint('amount_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// [append-only]
export const professionalFeeSplit = pgTable('professional_fee_split', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoice.id),
  role: payoutRoleEnum('role').notNull(),
  recipientId: uuid('recipient_id').notNull().references(() => user.id),
  amountKobo: bigint('amount_kobo', { mode: 'bigint' }).notNull(),
  isOutOfState: boolean('is_out_of_state').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscription = pgTable('subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patient.id),
  billingCycle: billingCycleEnum('billing_cycle').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
  nextBillingDate: date('next_billing_date').notNull(),
  startedAt: timestamp('started_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoice.id),
  walletId: uuid('wallet_id').notNull().references(() => wallet.id),
  gateway: varchar('gateway', { length: 50 }).notNull(), // "monnify"
  reference: varchar('reference', { length: 255 }).notNull().unique(), // idempotency key
  status: paymentStatusEnum('status').notNull().default('PENDING'),
  amountKobo: bigint('amount_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// [append-only]
export const walletTransaction = pgTable('wallet_transaction', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').notNull().references(() => wallet.id),
  paymentId: uuid('payment_id').references(() => payment.id),
  type: walletTransactionTypeEnum('type').notNull(),
  amountKobo: bigint('amount_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const payeeBankAccount = pgTable('payee_bank_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerType: payeeOwnerTypeEnum('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(), // polymorphic, resolved by owner_type — no FK
  bankCode: varchar('bank_code', { length: 20 }).notNull(),
  accountNumber: varchar('account_number', { length: 20 }).notNull(),
  accountName: varchar('account_name', { length: 255 }).notNull(),
  verifiedAt: timestamp('verified_at'), // set after Monnify Name Enquiry match (ADR-0010)
  verificationReference: varchar('verification_reference', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  ownerIdx: index('payee_bank_account_owner_idx').on(t.ownerType, t.ownerId),
}));

export const payout = pgTable('payout', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchReference: varchar('batch_reference', { length: 255 }).notNull(),
  payeeType: payeeOwnerTypeEnum('payee_type').notNull(),
  payeeId: uuid('payee_id').notNull(), // polymorphic — no FK
  payeeAccountId: uuid('payee_account_id').notNull().references(() => payeeBankAccount.id),
  totalAmountKobo: bigint('total_amount_kobo', { mode: 'bigint' }).notNull(),
  status: payoutStatusEnum('status').notNull().default('PENDING'),
  monnifyTransferReference: varchar('monnify_transfer_reference', { length: 255 }),
  initiatedAt: timestamp('initiated_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  payeeIdx: index('payout_payee_idx').on(t.payeeType, t.payeeId),
  statusIdx: index('payout_status_idx').on(t.status),
  batchReferenceIdx: index('payout_batch_reference_idx').on(t.batchReference),
}));

// [append-only]
export const payoutLineItem = pgTable('payout_line_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  payoutId: uuid('payout_id').notNull().references(() => payout.id),
  sourceType: payoutSourceTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull().unique(), // enforces one-payout-per-fee-split (ADR-0010)
  amountKobo: bigint('amount_kobo', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  payoutIdx: index('payout_line_item_payout_idx').on(t.payoutId),
}));
```

---

## `src/modules/inventory/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, integer, date, boolean, timestamp,
} from 'drizzle-orm/pg-core';
import { inventoryMovementTypeEnum, incidentTypeEnum, reconciliationStatusEnum } from '../../db/enums';
import { facility } from '../facility/schema';
import { user } from '../auth/schema';
import { file } from '../documents/schema';

export const drug = pgTable('drug', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  strength: varchar('strength', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

export const inventory = pgTable('inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').references(() => facility.id), // NULL = regional pool
  drugId: uuid('drug_id').notNull().references(() => drug.id),
  quantity: integer('quantity').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const inventoryMovement = pgTable('inventory_movement', {
  id: uuid('id').primaryKey().defaultRandom(),
  inventoryId: uuid('inventory_id').notNull().references(() => inventory.id),
  movementType: inventoryMovementTypeEnum('movement_type').notNull(),
  quantity: integer('quantity').notNull(),
  performedBy: uuid('performed_by').notNull().references(() => user.id),
  referenceId: uuid('reference_id'), // CountdownCase (purchase) or PhysicalCase (administered) — polymorphic, no FK
  evidenceFileId: uuid('evidence_file_id').references(() => file.id), // required when movement_type = INCIDENT — enforce at service layer
  incidentType: incidentTypeEnum('incident_type'),
  dispatchReference: varchar('dispatch_reference', { length: 255 }), // links a DISPATCH row to its RECEIPT_CONFIRMED row
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const reconciliationRecord = pgTable('reconciliation_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').notNull().references(() => facility.id),
  weekEnding: date('week_ending').notNull(),
  expectedQty: integer('expected_qty').notNull(),
  actualQty: integer('actual_qty').notNull(),
  variance: integer('variance').notNull(),
  resolvedBy: uuid('resolved_by').references(() => user.id),
  resolvedAt: timestamp('resolved_at'),
  status: reconciliationStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## `src/modules/documents/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { virusScanStatusEnum } from '../../db/enums';
import { patient } from '../patient/schema';
import { user } from '../auth/schema';

// [SCHEMA CORRECTION] storage_key is an R2 object key (ADR-0014), not Cloudinary (ADR-0009 was stale)
// [SCHEMA CORRECTION] verification_sequence JSONB removed — see FileVerificationStep below
export const file = pgTable('file', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').references(() => patient.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => user.id),
  storageKey: varchar('storage_key', { length: 512 }).notNull(), // R2 object key (ADR-0014)
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  virusScanStatus: virusScanStatusEnum('virus_scan_status').notNull().default('PENDING'),
  fileHash: varchar('file_hash', { length: 128 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
});

// [SCHEMA CORRECTION, replaces verification_sequence JSONB] FR-40's fixed 5-step nurse upload sequence
// [append-only]
export const fileVerificationStep = pgTable('file_verification_step', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull().references(() => file.id),
  stepNumber: integer('step_number').notNull(), // 1 through 5
  stepName: varchar('step_name', { length: 255 }).notNull(),
  verifiedBy: uuid('verified_by').references(() => user.id),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  fileStepUnique: uniqueIndex('file_verification_step_unique').on(t.fileId, t.stepNumber),
}));
```

---

## `src/modules/notification/schema.ts`

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { notificationStatusEnum } from '../../db/enums';
import { user } from '../auth/schema';

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').notNull().references(() => user.id),
  type: varchar('type', { length: 100 }).notNull(),
  status: notificationStatusEnum('status').notNull().default('PENDING'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## `src/modules/audit/schema.ts`

```typescript
import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { auditActionEnum, auditResultEnum } from '../../db/enums';
import { user } from '../auth/schema';

// [append-only, no soft delete ever] — reject any UPDATE at the repository layer (F4.8 DoD)
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => user.id), // NULL = system-initiated
  action: auditActionEnum('action').notNull(),
  resource: varchar('resource', { length: 255 }).notNull(),
  resourceId: uuid('resource_id'),
  result: auditResultEnum('result').notNull(),
  ip: varchar('ip', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  actorIdx: index('audit_log_actor_idx').on(t.actorId),
  resourceIdIdx: index('audit_log_resource_id_idx').on(t.resourceId),
  createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  resultIdx: index('audit_log_result_idx').on(t.result),
}));
```

---

## `src/db/schema.ts` — root barrel

```typescript
export * from './enums';
export * from '../modules/auth/schema';
export * from '../modules/facility/schema';
export * from '../modules/patient/schema';
export * from '../modules/clinical/schema';
export * from '../modules/appointment/schema';
export * from '../modules/messaging/schema';
export * from '../modules/billing/schema';
export * from '../modules/inventory/schema';
export * from '../modules/documents/schema';
export * from '../modules/notification/schema';
export * from '../modules/audit/schema';
```

Pass this barrel to `drizzle-kit`'s `schema` config path and to `drizzle()`'s schema argument — `drizzle-kit generate` walks every re-exported table from here to build the migration, so this file is the actual entry point even though each module owns its own definitions.

---

## Before running `drizzle-kit generate`

1. Add the trimmed imports back in per file (`bigint`, `sql`, `text` were omitted from a couple of snippets above to avoid repeating identical import lines — every table above needs its actual column builders imported).
2. Confirm the two flagged redundant-FK decisions (`Wallet`↔`Patient` resolved; `Appointment.meeting_id`↔`Meeting.appointment_id` left as-is) match what you want before generating the first migration — this is Foundation Sprint's F0.3/F0.4, so it's the one place a wrong call here costs the least to fix.
3. Run against the F0.1 DB server exactly as F0.4 in the Foundation sprint file describes, then verify every table/enum/index/FK via `\d+`, not just migration exit code.
