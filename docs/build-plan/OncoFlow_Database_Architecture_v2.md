# OncoFlow — Database Architecture (Complete Entity Reference) v2.0

**Purpose:** The definitive pre-implementation reference. Unlike the earlier Miro-summary version, every table below lists every field explicitly — nothing is "implied for brevity." This is what the Drizzle schema is generated from directly (ADR-0015).

**Supersedes:** OncoFlow_Database_Architecture_v1.md (v1.0–v1.3). That doc remains useful as a Miro-drawing summary; this one is the source of truth for implementation.

**Companion docs:** OncoFlow PRD v4.0 · Product Design Spec v4.0 · `/adr` (0001–0012)

**Notation:** `field_name TYPE constraints`. FK = foreign key. All UUIDs default to `gen_random_uuid()` (ADR-0002). All money fields are `BigInt` kobo (ADR-0004). Every business entity carries the four cross-cutting fields (`id`, `created_at`, `updated_at`, `isDeleted`/`deletedAt`) unless explicitly marked **[no soft delete]** (lookup tables, ADR-0003) or **[append-only]** (immutable verification/audit trails, Core Principle 7 — these are never updated or deleted, soft or hard).

---

## 1. Core Principles

1. **Single Source of Truth** — one `Patient`, one `Invoice`, one `Appointment` table.
2. **Immutable Clinical History** — medical records are never hard-deleted; version, don't overwrite.
3. **Least Privilege at the Data Layer** — every clinical record carries `created_by`/`updated_by`/`facility_id` for defense in depth, even though RBAC is primarily app-layer (ADR-0007).
4. **Event Traceability** — Patient Registered → Countdown Started → Labs Uploaded → Chemo Approved (QA→Director) → Physical Case Opened (Nurse) → Invoice Generated → Payment Completed → Case Closed (QA) → Payout Disbursed.
5. **Multi-Tenant Ready** — every operational table carries `facility_id` and/or `region`.
6. **Financial Integrity** — kobo integers, never float. ADR-0004.
7. **Immutable Verification Trails** — every mandatory human checkpoint (triage, upload verification, chemo decision, appointment card review) is its own timestamped, actor-tagged, append-only row.

---

## 2. Schema Domains

```
identity · patients · facility · clinical · appointments · messaging
billing · inventory · documents · notifications · audit
```

---

## 3. Complete Entity Reference

### 3.1 Identity Domain

**User**
```
id                UUID PK
email             String UNIQUE (partial index WHERE isDeleted = false)
password_hash     String
status            UserStatus DEFAULT ACTIVE
last_login        Timestamp NULL
mfa_enabled       Boolean DEFAULT false
created_at        Timestamp
updated_at        Timestamp
isDeleted         Boolean DEFAULT false
deletedAt         Timestamp NULL
```

**Role** `[no soft delete — lookup table]`
```
id            UUID PK
name          RoleName UNIQUE
description   String
created_at    Timestamp
updated_at    Timestamp
```

**Permission** `[no soft delete — lookup table]`
```
id            UUID PK
resource      String        -- e.g. "invoice", "patient.labResult"
action        String        -- e.g. "create", "read", "approve"
description   String
created_at    Timestamp
updated_at    Timestamp
```

**UserRole**
```
id            UUID PK
user_id       UUID FK → User
role_id       UUID FK → Role
created_at    Timestamp
-- UNIQUE (user_id, role_id)
```

**RolePermission** `[no soft delete]`
```
id              UUID PK
role_id         UUID FK → Role
permission_id   UUID FK → Permission
created_at      Timestamp
```

**Session**
```
id              UUID PK
user_id         UUID FK → User
device          String
ip              String
expires_at      Timestamp
revoked_at      Timestamp NULL
mfa_verified    Boolean DEFAULT false
created_at      Timestamp
```

**AccountLock** ★
```
id              UUID PK
user_id         UUID FK → User
locked_by       UUID FK → User
locked_at       Timestamp
locked_until    Timestamp NULL
reason          String
lock_type       AccountLockType
created_at      Timestamp
updated_at      Timestamp
isDeleted       Boolean DEFAULT false
deletedAt       Timestamp NULL
```

**MisconductFlag** ★
```
id                UUID PK
flagged_user_id   UUID FK → User
trigger_reason    String
conversation_id   UUID FK → Conversation NULL
status            MisconductStatus DEFAULT OPEN
reviewer_1_id     UUID FK → User NULL
reviewer_2_id     UUID FK → User NULL
resolved_at       Timestamp NULL
created_at        Timestamp
updated_at        Timestamp
isDeleted         Boolean DEFAULT false
deletedAt         Timestamp NULL
```

---

### 3.2 Patient Domain

**Patient**
```
id                  UUID PK
unique_patient_id   String UNIQUE (partial index WHERE isDeleted = false) -- human-readable, distinct from id (ADR-0002)
user_id             UUID FK → User NULL, UNIQUE (1:1)
first_name          String
last_name           String
dob                 Date
gender              String
phone               String  -- RESTRICTED: never in staff-facing API payloads (PRD FR-04)
email               String
status              PatientStatus DEFAULT ACTIVE
facility_id         UUID FK → Facility
wallet_id           UUID FK → Wallet UNIQUE (1:1)
created_at          Timestamp
updated_at          Timestamp
isDeleted           Boolean DEFAULT false
deletedAt           Timestamp NULL
```

**PatientAddress**
```
id            UUID PK
patient_id    UUID FK → Patient
country       String
state         String
city          String
address       String
created_at    Timestamp
updated_at    Timestamp
isDeleted     Boolean DEFAULT false
deletedAt     Timestamp NULL
```

**EmergencyContact**
```
id             UUID PK
patient_id     UUID FK → Patient
name           String
relationship   String
phone          String
created_at     Timestamp
updated_at     Timestamp
isDeleted      Boolean DEFAULT false
deletedAt      Timestamp NULL
```

**PatientTimeline** `[append-only]`
```
id             UUID PK
patient_id     UUID FK → Patient
event_type     String
reference_id   UUID  -- polymorphic pointer to the event's source row
created_at     Timestamp
```

---

### 3.3 Facility Domain

**Facility**
```
id            UUID PK
name          String
region        String  -- plain string for MVP, not a lookup table
address       String
status        FacilityStatus DEFAULT ACTIVE
created_at    Timestamp
updated_at    Timestamp
isDeleted     Boolean DEFAULT false
deletedAt     Timestamp NULL
```

**Department**
```
id             UUID PK
facility_id    UUID FK → Facility
name           String
created_at     Timestamp
updated_at     Timestamp
isDeleted      Boolean DEFAULT false
deletedAt      Timestamp NULL
```

---

### 3.4 Clinical Domain

**CountdownCase** ★
```
id                       UUID PK
patient_id               UUID FK → Patient
current_day              Int  -- 7 → 0
status                   CountdownStatus DEFAULT ACTIVE
labs_prompted_at         Timestamp NULL
labs_uploaded_at         Timestamp NULL
results_sent_to_qa_at    Timestamp NULL  -- renamed from results_sent_to_director_at; routes to QA first (ADR-0012)
clinical_decision_id     UUID FK → ClinicalDecision NULL
invoice_id               UUID FK → Invoice NULL, UNIQUE (1:1)
payment_confirmed_at     Timestamp NULL
reminder_sent_at         Timestamp NULL
created_at               Timestamp
updated_at               Timestamp
isDeleted                Boolean DEFAULT false
deletedAt                Timestamp NULL
```

**PhysicalCase** ★
```
id                            UUID PK
countdown_case_id             UUID FK → CountdownCase NULL, UNIQUE (1:1)  -- nullable: standalone physical consults aren't always chemo-cycle-linked
appointment_id                UUID FK → Appointment UNIQUE (1:1)
opened_by                     UUID FK → User  -- Onsite Nursing Officer, exclusive (ADR-0012)
opened_at                     Timestamp NULL
case_type                     PhysicalCaseType
closed_by                     UUID FK → User NULL  -- Quality Assurance Officer, exclusive (ADR-0012)
closed_at                     Timestamp NULL
status                        PhysicalCaseStatus DEFAULT OPEN
doctor_note_reviewed_at       Timestamp NULL  -- set when QA opens the ClinicalNote (ADR-0011)
appointment_card_reviewed_at  Timestamp NULL  -- set when QA opens the AppointmentCard (ADR-0011)
created_at                    Timestamp
updated_at                    Timestamp
isDeleted                     Boolean DEFAULT false
deletedAt                     Timestamp NULL
-- Close Case transition requires doctor_note_reviewed_at AND appointment_card_reviewed_at NOT NULL (enforced in service layer, ADR-0011)
```

**TreatmentCycle**
```
id              UUID PK
patient_id      UUID FK → Patient
cycle_number    Int
status          TreatmentStatus
start_date      Date
end_date        Date NULL
created_at      Timestamp
updated_at      Timestamp
isDeleted       Boolean DEFAULT false
deletedAt       Timestamp NULL
```

**TreatmentPlan**
```
id                     UUID PK
patient_id             UUID FK → Patient
oncologist_id          UUID FK → User
clinical_director_id   UUID FK → User
status                 TreatmentStatus
created_at             Timestamp
updated_at             Timestamp
isDeleted              Boolean DEFAULT false
deletedAt              Timestamp NULL
```

**LabRequest**
```
id             UUID PK
patient_id     UUID FK → Patient
requested_by   UUID FK → User
status         LabRequestStatus DEFAULT PENDING
created_at     Timestamp
updated_at     Timestamp
isDeleted      Boolean DEFAULT false
deletedAt      Timestamp NULL
```

**LabResult**
```
id                   UUID PK
patient_id           UUID FK → Patient
request_id           UUID FK → LabRequest
uploaded_by          UUID FK → User  -- typically the Patient's linked User
reviewed_by          UUID FK → User NULL
status               LabRequestStatus DEFAULT PENDING
file_id              UUID FK → File
test_date            Date  -- date printed on the report itself, distinct from upload timestamp (ADR-0012)
file_hash            String  -- for possible_duplicate detection
possible_duplicate   Boolean DEFAULT false  -- auto-flagged if file_hash matches a prior upload for this patient (ADR-0012)
created_at           Timestamp
updated_at           Timestamp
isDeleted            Boolean DEFAULT false
deletedAt            Timestamp NULL
-- Admin's read access to this table is scoped to {file_id, test_date, possible_duplicate} only — never clinical interpretation fields (ADR-0012)
```

**ClinicalDecision** ★ — two-stage, sequential (ADR-0012)
```
id                   UUID PK
lab_result_id        UUID FK → LabResult UNIQUE (1:1)
qa_recommendation    ClinicalDecisionEnum NULL   -- stage 1, required first
qa_reason            String NULL
qa_decided_by        UUID FK → User NULL  -- Quality Assurance Officer
qa_decided_at        Timestamp NULL
final_decision       ClinicalDecisionEnum NULL   -- stage 2, locked until stage 1 set
final_reason         String NULL
director_id          UUID FK → User NULL  -- State Clinical Director
director_decided_at  Timestamp NULL
created_at           Timestamp
updated_at           Timestamp
isDeleted            Boolean DEFAULT false
deletedAt            Timestamp NULL
-- Service layer MUST reject any attempt to set final_decision while qa_decided_at IS NULL
```

**MedicalRecord**
```
id             UUID PK
patient_id     UUID FK → Patient
created_by     UUID FK → User
record_type    String
summary        Text
created_at     Timestamp
updated_at     Timestamp
isDeleted      Boolean DEFAULT false
deletedAt      Timestamp NULL
```

**ClinicalNote**
```
id                  UUID PK
medical_record_id   UUID FK → MedicalRecord
author_id           UUID FK → User
note                Text
created_at          Timestamp
updated_at          Timestamp
isDeleted           Boolean DEFAULT false
deletedAt           Timestamp NULL
```

**TriageChecklist** ★ `[append-only]`
```
id                     UUID PK
conversation_id        UUID FK → Conversation UNIQUE (1:1)
completed_by           UUID FK → User  -- Virtual Medical Officer
completed_at           Timestamp
presenting_complaint   Text
duration               String
functional_impact      Text
prior_measures         Text
can_talk_walk_eat      Text
created_at             Timestamp
```

**Prescription**
```
id                    UUID PK
patient_id            UUID FK → Patient
doctor_id             UUID FK → User
appointment_id        UUID FK → Appointment NULL
triage_checklist_id   UUID FK → TriageChecklist NULL  -- NOT NULL enforced at service layer for MO-issued prescriptions
status                PrescriptionStatus DEFAULT ACTIVE
created_at            Timestamp
updated_at            Timestamp
isDeleted             Boolean DEFAULT false
deletedAt             Timestamp NULL
```

**AppointmentCard** ★ (new, ADR-0011)
```
id                       UUID PK
appointment_id           UUID FK → Appointment UNIQUE (1:1)
physical_case_id         UUID FK → PhysicalCase
filled_by                UUID FK → User  -- Onsite Nursing Officer
filled_at                Timestamp NULL
vitals_summary           Text
necessities_checklist    JSONB
notes                    Text
status                   AppointmentCardStatus DEFAULT DRAFT
reviewed_by              UUID FK → User NULL  -- Quality Assurance Officer
reviewed_at              Timestamp NULL
created_at               Timestamp
updated_at               Timestamp
```

---

### 3.5 Appointment Domain

**Appointment**
```
id                      UUID PK
patient_id              UUID FK → Patient
oncologist_id           UUID FK → User NULL
facility_id             UUID FK → Facility
appointment_type        AppointmentType
scheduled_at            Timestamp
status                  AppointmentStatus DEFAULT PENDING
meeting_id              UUID FK → Meeting NULL
payment_confirmed_at    Timestamp NULL  -- drives the 2PM cutoff rule, FR-03
created_at              Timestamp
updated_at              Timestamp
isDeleted               Boolean DEFAULT false
deletedAt               Timestamp NULL
```

**AppointmentParticipant**
```
id               UUID PK
appointment_id   UUID FK → Appointment
user_id          UUID FK → User
role             String
created_at       Timestamp
```

**TransferRequest** ★
```
id                UUID PK
patient_id        UUID FK → Patient
from_facility_id  UUID FK → Facility
to_facility_id    UUID FK → Facility
requested_by      UUID FK → User
approved_by       UUID FK → User NULL
status            TransferStatus DEFAULT PENDING
routed_at         Timestamp NULL
created_at        Timestamp
updated_at        Timestamp
isDeleted         Boolean DEFAULT false
deletedAt         Timestamp NULL
```

---

### 3.6 Messaging & Video Domain

**Conversation** ★
```
id                  UUID PK
patient_id          UUID FK → Patient
conversation_type   ConversationType
status              ConversationStatus DEFAULT OPEN
sla_deadline         Timestamp NULL
first_response_at    Timestamp NULL
sla_breached         Boolean DEFAULT false
created_at            Timestamp
updated_at            Timestamp
isDeleted             Boolean DEFAULT false
deletedAt             Timestamp NULL
```

**Participant**
```
id                UUID PK
conversation_id   UUID FK → Conversation
user_id           UUID FK → User
created_at        Timestamp
```

**Message** `[append-only]`
```
id                UUID PK
conversation_id   UUID FK → Conversation
sender_id         UUID FK → User
type              MessageType
content           Text
status            MessageStatus DEFAULT SENT
created_at        Timestamp
```

**Meeting**
```
id               UUID PK
appointment_id   UUID FK → Appointment UNIQUE (1:1)
provider         String
room_id          String
status           MeetingStatus DEFAULT SCHEDULED
created_at       Timestamp
updated_at       Timestamp
```

**Transcript**
```
id            UUID PK
meeting_id    UUID FK → Meeting
speaker       String
content       Text
edited_by     UUID FK → User NULL
edited_at     Timestamp NULL
created_at    Timestamp
```

---

### 3.7 Billing Domain

**ServiceClassification** `[no soft delete — lookup]`
```
id                       UUID PK
name                     ServiceClassificationName UNIQUE
capped_network_fee_kobo  BigInt
created_at               Timestamp
updated_at               Timestamp
```

**Tariff** ★
```
id                       UUID PK
facility_id              UUID FK → Facility
classification_id        UUID FK → ServiceClassification
network_fee_kobo         BigInt
facility_bed_fee_kobo    BigInt
drug_price_kobo          BigInt
created_at               Timestamp
updated_at               Timestamp
isDeleted                Boolean DEFAULT false
deletedAt                Timestamp NULL
-- UNIQUE (facility_id, classification_id)
```

**Invoice**
```
id                  UUID PK
patient_id          UUID FK → Patient
appointment_id      UUID FK → Appointment NULL  -- subscriptions have none
facility_id         UUID FK → Facility
classification_id   UUID FK → ServiceClassification
status               InvoiceStatus DEFAULT DRAFT
total_kobo            BigInt
issued_at             Timestamp NULL
created_at            Timestamp
updated_at            Timestamp
isDeleted             Boolean DEFAULT false
deletedAt             Timestamp NULL
```

**InvoiceItem** `[append-only once invoice.status != DRAFT]`
```
id            UUID PK
invoice_id    UUID FK → Invoice
component     InvoiceComponent
amount_kobo   BigInt
created_at    Timestamp
```

**ProfessionalFeeSplit** ★ `[append-only]`
```
id                UUID PK
invoice_id        UUID FK → Invoice
role              PayoutRole
recipient_id      UUID FK → User
amount_kobo       BigInt
is_out_of_state   Boolean DEFAULT false
created_at        Timestamp
```

**Subscription**
```
id                 UUID PK
patient_id         UUID FK → Patient
billing_cycle      BillingCycle
status             SubscriptionStatus DEFAULT ACTIVE
next_billing_date  Date
started_at         Timestamp
created_at         Timestamp
updated_at         Timestamp
isDeleted          Boolean DEFAULT false
deletedAt          Timestamp NULL
```

**Payment**
```
id            UUID PK
invoice_id    UUID FK → Invoice
wallet_id     UUID FK → Wallet
gateway       String  -- "monnify"
reference     String UNIQUE  -- idempotency key
status        PaymentStatus DEFAULT PENDING
amount_kobo   BigInt
created_at    Timestamp
updated_at    Timestamp
```

**Wallet**
```
id             UUID PK
patient_id     UUID FK → Patient UNIQUE (1:1)
balance_kobo   BigInt DEFAULT 0
created_at     Timestamp
updated_at     Timestamp
```

**WalletTransaction** `[append-only]`
```
id            UUID PK
wallet_id     UUID FK → Wallet
payment_id    UUID FK → Payment NULL
type          WalletTransactionType  -- CREDIT | DEBIT
amount_kobo   BigInt
created_at    Timestamp
```

**PayeeBankAccount** ★
```
id                       UUID PK
owner_type               PayeeOwnerType  -- FACILITY | USER
owner_id                 UUID  -- polymorphic, resolved by owner_type
bank_code                String
account_number           String
account_name             String
verified_at              Timestamp NULL  -- set after Monnify Name Enquiry match (ADR-0010)
verification_reference   String NULL
is_active                Boolean DEFAULT true
created_at                Timestamp
updated_at                 Timestamp
isDeleted                  Boolean DEFAULT false
deletedAt                  Timestamp NULL
-- INDEX (owner_type, owner_id)
```

**Payout** ★
```
id                          UUID PK
batch_reference             String
payee_type                  PayeeOwnerType
payee_id                    UUID
payee_account_id            UUID FK → PayeeBankAccount
total_amount_kobo           BigInt
status                      PayoutStatus DEFAULT PENDING
monnify_transfer_reference  String NULL
initiated_at                Timestamp NULL
completed_at                Timestamp NULL
created_at                  Timestamp
updated_at                  Timestamp
-- INDEX (payee_type, payee_id), status, batch_reference
```

**PayoutLineItem** ★ `[append-only]`
```
id            UUID PK
payout_id     UUID FK → Payout
source_type   PayoutSourceType  -- PROFESSIONAL_FEE_SPLIT | FACILITY_FEE
source_id     UUID UNIQUE  -- enforces one-payout-per-fee-split (ADR-0010)
amount_kobo   BigInt
created_at    Timestamp
```

---

### 3.8 Inventory Domain

**Drug**
```
id            UUID PK
name          String
strength      String
category      String
created_at    Timestamp
updated_at    Timestamp
isDeleted     Boolean DEFAULT false
deletedAt     Timestamp NULL
```

**Inventory**
```
id            UUID PK
facility_id   UUID FK → Facility NULL  -- NULL = regional pool
drug_id       UUID FK → Drug
quantity      Int DEFAULT 0
created_at    Timestamp
updated_at    Timestamp
```

**InventoryMovement** ★
```
id                  UUID PK
inventory_id        UUID FK → Inventory
movement_type       InventoryMovementType
quantity            Int
performed_by         UUID FK → User
reference_id         UUID NULL  -- CountdownCase (purchase) or PhysicalCase (administered)
evidence_file_id      UUID FK → File NULL  -- required when movement_type = INCIDENT
incident_type          IncidentType NULL
dispatch_reference      String NULL  -- links a DISPATCH row to its RECEIPT_CONFIRMED row
created_at              Timestamp
```

**ReconciliationRecord** ★
```
id             UUID PK
facility_id    UUID FK → Facility
week_ending    Date
expected_qty   Int
actual_qty     Int
variance       Int
resolved_by    UUID FK → User NULL
resolved_at    Timestamp NULL
status         ReconciliationStatus DEFAULT PENDING
created_at     Timestamp
updated_at     Timestamp
```

---

### 3.9 Documents Domain

**File** ★
```
id                     UUID PK
patient_id             UUID FK → Patient NULL
uploaded_by            UUID FK → User
storage_key            String  -- Cloudinary reference (ADR-0009)
mime_type              String
virus_scan_status      VirusScanStatus DEFAULT PENDING
verification_sequence  JSONB NULL  -- FR-40's 5-step nurse upload sequence
file_hash              String
created_at              Timestamp
updated_at              Timestamp
isDeleted                Boolean DEFAULT false
deletedAt                Timestamp NULL
```

---

### 3.10 Notifications Domain

**Notification**
```
id             UUID PK
recipient_id   UUID FK → User
type           String
status         NotificationStatus DEFAULT PENDING
sent_at        Timestamp NULL
created_at     Timestamp
```

---

### 3.11 Audit Domain

**AuditLog** ★ `[append-only, no soft delete ever]`
```
id            UUID PK
actor_id      UUID FK → User NULL  -- NULL = system-initiated
action        AuditAction
resource      String
resource_id   UUID NULL
result        AuditResult
ip            String NULL
created_at    Timestamp
```

---

## 4. Complete Enum Reference

```
UserStatus                 ACTIVE | INACTIVE | LOCKED | SUSPENDED
PatientStatus               ACTIVE | INACTIVE

RoleName                     PATIENT | REGIONAL_ADMIN | VIRTUAL_MEDICAL_OFFICER
                              CONSULTING_ONCOLOGIST | STATE_CLINICAL_DIRECTOR
                              QUALITY_ASSURANCE_OFFICER | ONSITE_NURSING_OFFICER
                              NATIONAL_CLINICAL_DIRECTOR | STATE_DIRECTOR_OF_NURSING_SERVICES
                              NATIONAL_DIRECTOR_OF_NURSING_SERVICES | SUPER_ADMIN
                              -- National-level + SDNS exist for org/payout completeness;
                              -- no MVP dashboard for them (ADR-0012)

AccountLockType               24H_ADMIN | MISCONDUCT
MisconductStatus               OPEN | UNDER_REVIEW | CLEARED

FacilityStatus                   ACTIVE | INACTIVE

CountdownStatus                   ACTIVE | ESCALATED | CLEARED | DECLINED
PhysicalCaseType                   INFUSION | CONSULTATION
PhysicalCaseStatus                  OPEN | CLOSED
AppointmentCardStatus                DRAFT | SUBMITTED | REVIEWED_BY_QA
TreatmentStatus                       PLANNED | ACTIVE | PAUSED | COMPLETED | CANCELLED
LabRequestStatus                       PENDING | UPLOADED | REVIEWED
ClinicalDecisionEnum                    APPROVED | DECLINED | REQUIRES_REVIEW
PrescriptionStatus                       ACTIVE | FULFILLED | CANCELLED

AppointmentType                           VIRTUAL | PHYSICAL | CHEMOTHERAPY | PROCEDURE
AppointmentStatus                          PENDING | CONFIRMED | CHECKED_IN | IN_PROGRESS
                                            COMPLETED | CANCELLED | MISSED
TransferStatus                              PENDING | APPROVED | DECLINED

ConversationType                             ADMIN_INQUIRY | MO_SIDE_EFFECT
ConversationStatus                            OPEN | CLOSED
MessageType                                    TEXT | IMAGE | VOICE | SYSTEM
MessageStatus                                   SENT | DELIVERED | READ
MeetingStatus                                    SCHEDULED | IN_PROGRESS | ENDED

ServiceClassificationName                         SUBSCRIPTION | CONSULTATION | DRUG_ADMINISTRATION
                                                   CHEMOTHERAPY | GENERAL_ADMISSION | PROCEDURE
InvoiceStatus                                      DRAFT | SENT | PAID | VOID | OVERDUE
InvoiceComponent                                    NETWORK_FEE | FACILITY_FEE | PROFESSIONAL_FEE | DRUG_COST
PayoutRole                                           ONCOLOGIST | STATE_CLINICAL_DIRECTOR
                                                      NATIONAL_CLINICAL_DIRECTOR
                                                      STATE_DIRECTOR_OF_NURSING_SERVICES
                                                      NATIONAL_DIRECTOR_OF_NURSING_SERVICES
                                                      -- renamed to match RoleName (ADR-0012); was
                                                      -- STATE_NURSING_DIRECTOR/NATIONAL_NURSING_DIRECTOR
BillingCycle                                          MONTHLY | YEARLY
PaymentStatus                                          PENDING | SUCCESS | FAILED | REFUNDED
SubscriptionStatus                                      ACTIVE | CANCELLED | EXPIRED
WalletTransactionType                                    CREDIT | DEBIT

PayeeOwnerType                                            FACILITY | USER
PayoutStatus                                               PENDING | PROCESSING | COMPLETED | FAILED | REVERSED
PayoutSourceType                                             PROFESSIONAL_FEE_SPLIT | FACILITY_FEE

InventoryMovementType                                          PURCHASE | DISPATCH | RECEIPT_CONFIRMED
                                                                ADMINISTERED | INCIDENT | RETURN | ADJUSTMENT
IncidentType                                                    BROKEN | SPILLED | EXPIRED | MANUFACTURING_DEFECT
ReconciliationStatus                                             PENDING | VARIANCE_FLAGGED | RESOLVED

VirusScanStatus                                                    PENDING | CLEAN | INFECTED
NotificationStatus                                                  PENDING | SENT | READ | FAILED

AuditAction                                                          CREATE | UPDATE | DELETE | LOGIN | LOGOUT
                                                                      EXPORT | APPROVE | DECLINE | ACCESS_DENIED
AuditResult                                                           ALLOWED | DENIED
```

---

## 5. Full Foreign Key Tree

```
User
├──< UserRole >── Role ──< RolePermission >── Permission
├──< Session
├──< AuditLog                         (actor_id)
├──< AccountLock                      (user_id, locked_by)
├──< MisconductFlag                   (flagged_user_id, reviewer_1_id, reviewer_2_id)
└──1:1 Patient                        (optional, via Patient.user_id)

Patient
├──< PatientAddress, EmergencyContact, PatientTimeline
├──< Appointment, TreatmentCycle, TreatmentPlan
├──< LabRequest ──< LabResult ──1:1 ClinicalDecision
├──< MedicalRecord ──< ClinicalNote
├──< Prescription                      (triage_checklist_id required if MO-issued)
├──< Conversation ──< Participant, Message ──1:1 TriageChecklist
├──1:1 Wallet ──< WalletTransaction
├──< Invoice ──< InvoiceItem, ProfessionalFeeSplit, Payment
├──< File
├──< CountdownCase ──1:1 PhysicalCase ──1:1 AppointmentCard
│                   ──1:1 Invoice
├──< TransferRequest, Subscription

Facility
├──< Department, Appointment, Tariff, Inventory, ReconciliationRecord
└── region (string, no FK)

Appointment ──< AppointmentParticipant, Prescription, Invoice
            ──1:1 Meeting ──< Transcript
            ──1:1 PhysicalCase ──1:1 AppointmentCard

ProfessionalFeeSplit / facility-fee InvoiceItem ──1:1 PayoutLineItem (once paid, unique)
Payout ──< PayoutLineItem
       ── payee_account_id → PayeeBankAccount → Facility OR User (polymorphic)

Drug ──< Inventory ──< InventoryMovement
ServiceClassification ──< Tariff, Invoice
TransferRequest ── from_facility_id, to_facility_id → Facility (×2)
```

---

## 6. Key Indexes (Performance-Critical)

```
User                email UNIQUE (partial: isDeleted=false), status, last_login
Patient             unique_patient_id UNIQUE (partial: isDeleted=false), facility_id, status, dob
LabResult           file_hash, (patient_id, test_date)   ← powers possible_duplicate detection
Appointment         patient_id, (facility_id, scheduled_at), status
CountdownCase       (patient_id, status), current_day
PhysicalCase        appointment_id, status
Conversation        (assigned_to, sla_deadline)           ← powers SLA dashboards
Invoice             patient_id, status, issued_at
Tariff              (facility_id, classification_id) UNIQUE
AuditLog            actor_id, resource_id, created_at, result
Session             user_id, expires_at
Payout              (payee_type, payee_id), status, batch_reference
PayoutLineItem      source_id UNIQUE, payout_id
PayeeBankAccount    (owner_type, owner_id), is_active
```

---

## 7. Open Items Before Drizzle Schema Generation

- **PhysicalCase.countdown_case_id nullable**: confirms a physical consultation can exist without a chemo countdown cycle (a plain physical consult, not every physical case is chemo-related) — worth a one-line confirmation since it affects whether AppointmentCard/QA review applies universally or only to chemo-linked cases.
- **QA officer scope check**: `PhysicalCase.closed_by` and `ClinicalDecision.qa_decided_by` should be constrained (app-layer, via RBAC middleware ADR-0007) to a QA officer whose `facility_id` matches the case's facility — not just "any QA officer." Flagging so it's built as a scoping rule, not just a role check.

Everything else is ready for direct Drizzle translation — see `schema.ts`.
