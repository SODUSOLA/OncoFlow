# OncoFlow — Domain-Driven Module Blueprint

Applies the rigor from the enterprise brief — DDD, aggregate design, event-driven boundaries, OWASP ASVS-level threat modeling, CQRS-where-appropriate — to the architecture already locked in across `00`–`10`. Nothing here changes the stack (Drizzle/PgBouncer, R2, Monnify, the facility-scoped RBAC pattern) or invents new modules; it goes deep on the five dimensions that actually differ per module: **domain entities & aggregate roots, authorization matrix, security threats, events published, events consumed.**

**Why not the other 35 sections from the brief:** things like "Folder Structure," "Testing Strategy," and "Logging Strategy" would be near-identical copy across eleven modules if done honestly — that's exactly why `00-global-conventions-and-schema-corrections.md` exists as one shared reference instead of being restated per module. Repeating them here would be DRY's violation dressed up as thoroughness. The cross-cutting section below (§2) covers the patterns that apply uniformly, once, with the reasoning — then each module section stays focused on what's actually unique to it.

---

## 1. Strategic Domain Map

DDD's first question isn't "what tables exist," it's "which parts of this system are the actual competitive/business-critical logic, and which are necessary but generic plumbing." Getting this classification right changes where you're allowed to cut corners and where you aren't.

| Bounded context | Classification | Why |
|---|---|---|
| **Clinical** | **Core domain** | This is OncoFlow's actual reason to exist — the countdown-to-chemo workflow, the two-stage QA→Director gate, the physical-case review chain. Nobody buys this platform for its auth system; they buy it for this. Gets the most design rigor and the most invariant-protection below. |
| **Billing** | **Core domain** | Revenue-critical, legally sensitive (money leaving the system to real people), and structurally complex (the fee-split/payout eligibility logic spans two other bounded contexts). Same rigor tier as Clinical. |
| Patient, Appointment, Messaging, Inventory | **Supporting subdomain** | Necessary, OncoFlow-specific, but not the differentiator — a competent team could rebuild any one of these from a spec in a sprint. Standard patterns apply; no need to over-invest here. |
| Identity/Auth, Notification, Audit, Facility, Documents | **Generic subdomain** | Solved problems. Auth, file storage, notification dispatch, audit logging, and facility reference data look basically the same in any B2B healthcare platform. Build them competently and move on — this is exactly where YAGNI matters most, because it's the tier most tempted by over-engineering for its own sake. |

**Context relationships worth naming explicitly** (this is where most integration bugs actually live):

- **Clinical → Billing** is a **Customer-Supplier** relationship: `PhysicalCaseClosed` and the invoice-paid state from Billing jointly gate payout eligibility. Neither context should reach into the other's tables directly — this navigation has to happen through published events, which is why §5 below formalizes it as a saga rather than a cross-context transaction.
- **Wallet lives in the Patient bounded context** (per the schema correction in `06-drizzle-schema.md`) **but its primary domain events are produced by Billing** (`PaymentReceived` → `WalletCredited`). This is a known tension, not a clean split — flagging it here rather than pretending the module boundary is tidier than it is. The pragmatic fix: Patient owns the `Wallet` aggregate's *data*, Billing owns the *behavior* that mutates it, coordinated via the event bus, never via Billing directly writing to Patient's tables.
- **Identity/Auth** is referenced by every other context, but only ever **by `User.id`** — no other module should hold a deep reference to Auth's internal `Role`/`Permission` structure. This is a **Conformist** relationship: everyone accepts Auth's model of "who can act" as given, without trying to reshape it.
- **Facility** and **Documents** are both **Open Host Service** providers — small, stable, ID-referenceable APIs (`facility_id`, `file_id`) that five other contexts depend on. They should never gain business logic of their own beyond what they already have; if either one starts accumulating workflow rules, that's a sign the rule belongs in whichever context is actually driving it.
- **Notification and Audit** are both **universal subscribers** — the only two contexts that legitimately listen broadly across the whole event catalog rather than narrowly to one or two upstream events. Every other context should subscribe narrowly; broad subscription anywhere else is a coupling smell.

---

## 2. Cross-cutting patterns (stated once, applied everywhere)

**Repository + Service + Controller layering, Dependency Injection, module boundaries via `dependency-cruiser`** — already specified in `00-global-conventions...md` and unchanged here. One addition worth making explicit: **repositories return domain entities, never raw Drizzle row objects.** A service calling `patientRepository.findById()` should get back a `Patient` class instance with its invariants already reconstructed (e.g., a `Wallet` with a `debit()` method that itself enforces non-negative balance), not a plain object the service then has to remember to validate. This is the actual point of the Repository pattern — it's not just "where the SQL lives," it's the seam that keeps domain logic out of services and on the entities that own it.

**DTOs and validators sit at the controller boundary, always.** No raw request body ever reaches a service method — every module's `controller.ts` maps `req.body` through a validator (recommend `zod`, given it's TypeScript-native and composes well with Drizzle's inferred types) into a typed command object before calling the service. This is the concrete mechanism behind Gate 3/6's "never trust client input" controls from `10-security-gates.md` — stated as policy there, implemented as a mandatory layer here.

**Optimistic concurrency** on every aggregate root that can be concurrently modified by two actors — `Appointment` (double-booking), `Wallet` (concurrent debit/credit), `CountdownCase` (the daily job vs. a human action landing at the same time), `ClinicalDecision` (QA and Director shouldn't both be able to act if the state already moved). Implementation: an `updated_at`-based or explicit `version` integer check-and-increment on every write, service layer rejects a write against a stale version rather than silently overwriting. This wasn't called out per-feature in the sprint files — it's a real gap worth closing, and it's cheap: one column, one `WHERE version = $expected` clause per update.

**Idempotency keys** on every externally-triggered write — Monnify webhooks (`Payment.reference`, already planned), Daily.co webhooks, the weekly payout batch job, the daily countdown-decrement job. Any job or webhook handler that could plausibly run twice (retry, at-least-once delivery, a crashed-and-restarted BullMQ worker) needs its idempotency check to be a **database constraint**, not just an application-layer "have I seen this before" check — the same reasoning as the `AuditLog` DB-grant recommendation in `10-security-gates.md`.

**Domain events, not direct cross-module calls, for anything crossing a bounded-context boundary.** Within a module, direct method calls between service/repository are fine. Across modules — Clinical telling Billing a case closed, Billing telling Patient a wallet should credit — goes through a published event and a subscriber, never a direct import of another module's service. This is what actually enforces "low coupling" beyond what `dependency-cruiser` catches for imports; a `dependency-cruiser` pass tells you nobody imported another module's internals, but it won't catch a `billingService` call sitting inside `clinicalService` if both modules' `index.ts` happens to export the right function. The event bus is the real enforcement mechanism; the lint rule is a backstop.

---

## 3. Module deep dives

### 3.1 Identity / Auth — *Generic subdomain*

**Aggregates, entities, value objects:**
- **`User`** (aggregate root) — invariant: password is always hashed before persistence (Argon2id, per `10-security-gates.md` Gate 2), `status` transitions follow a defined state graph, `mfaEnabled` can't silently flip without an explicit enrollment event.
- **`Session`** (aggregate root, *not* a child of `User`) — deliberately separate: a session has its own lifecycle (issue, refresh, expire, revoke) and its own concurrency concerns, and forcing it inside the `User` aggregate would mean every login serializes against every other write to that user's profile. References `User` by ID only.
- **`Role`** (aggregate root) — invariant: its `RolePermission` set is the actual consistency boundary; granting/revoking a permission is a transactional operation on the `Role` aggregate, not a bare insert into a join table.
- **`AccountLock`** (aggregate root) — **gap found while modeling this**: nothing currently enforces *only one active lock per user*. Two overlapping `AccountLock` rows for the same user is possible today. Add the invariant here: creating a new lock while an unexpired one exists should either reject or supersede, not silently stack.
- **`MisconductFlag`** (aggregate root) — **second gap found**: nothing enforces `reviewer_1_id != reviewer_2_id`. A two-person review that can be satisfied by one person acting twice isn't a two-person review. Add as a service-layer invariant.
- Value objects: `Email` (validated format, normalized casing), `PermissionKey` (the `resource`+`action` pair, immutable once created).

**Authorization matrix:**

| Action | Patient | Staff (self) | Super Admin |
|---|---|---|---|
| Read own `User`/`Session` | ✅ | ✅ | ✅ |
| Revoke own `Session` | ✅ | ✅ | ✅ |
| Assign/revoke `UserRole` | ❌ | ❌ | ✅ only |
| Create/modify `RolePermission` | ❌ | ❌ | ✅ only |
| Create `AccountLock` (`24H_ADMIN`) | ❌ | ❌ | ✅ |
| Create `AccountLock` (`MISCONDUCT`) | ❌ | State Clinical Director only | ✅ |
| Review `MisconductFlag` | ❌ | Two distinct State Clinical Directors | ✅ (oversight) |

**Security threats (OWASP-mapped):**
- **A07:2021 — Identification and Authentication Failures**: credential stuffing, session fixation, MFA bypass via a race between enrollment and first login.
- **A01:2021 — Broken Access Control / API5 Broken Function-Level Authorization**: privilege escalation via a `UserRole` write path that doesn't itself require Super Admin authorization (the classic "the endpoint that grants admin isn't itself admin-protected" bug).
- **CWE-307** (Improper Restriction of Excessive Authentication Attempts): brute force if lockout isn't wired to actual failed-attempt counting, not just the manual `AccountLock` path.
- **CWE-613** (Insufficient Session Expiration): sessions that outlive their `expiresAt` due to a missing scheduled cleanup, or a revoked session still valid in the Redis permission cache (the exact gap flagged in `10-security-gates.md` Gate 2).

**Events published:** `UserRegistered`, `UserLoggedIn`, `UserLoggedOut`, `SessionRevoked`, `RoleAssigned`, `RoleRevoked`, `AccountLocked`, `AccountUnlocked`, `MisconductFlagRaised`, `MisconductFlagResolved`.

**Events consumed:** none — Identity is foundational/upstream to nearly everything else and shouldn't need to react to other contexts' events. If you ever find yourself wanting Identity to subscribe to something, that's usually a sign the logic belongs in the subscribing context instead, referencing `User.id`.

---

### 3.2 Patient — *Supporting subdomain*

**Aggregates, entities, value objects:**
- **`Patient`** (aggregate root) — encloses `PatientAddress` and `EmergencyContact` as child entities (no independent lifecycle — they only make sense in the context of a specific patient). Invariant: `uniquePatientId` uniqueness among non-deleted records, FR-01's duplicate-match check runs before creation completes.
- **`Wallet`** (aggregate root, separate — per the schema correction) — invariant: **`balanceKobo` must never go negative.** This isn't currently enforced as an explicit constraint anywhere in the build files — worth a `CHECK (balance_kobo >= 0)` at the DB level *and* a guard in the `debit()` method, so it holds even against a service-layer bug.
- **`PatientTimeline`** — **this is not really an aggregate at all; it's a read-model projection**, and modeling it as one would be a mistake. See §5 (CQRS) for why.
- Value objects: `Money` (the `BigInt` kobo wrapper — this is a genuine **shared kernel** value object, used identically wherever money appears across Patient, Billing, and Inventory; define it once, import everywhere, never reimplement kobo-arithmetic per module).

**Authorization matrix:**

| Action | Patient (self) | Regional Admin | Onsite Nurse | Oncologist |
|---|---|---|---|---|
| Read own full record | ✅ | ❌ (phone masked) | ❌ (phone masked) | ✅ (assigned only) |
| Edit own contact fields | ✅ | ❌ | ❌ | ❌ |
| Fund own `Wallet` | ✅ | ❌ | ❌ | ❌ |
| Read `Wallet` balance | ✅ | ✅ (for invoicing context) | ❌ | ❌ |

**Security threats:**
- **API3:2023 — Broken Object Property Level Authorization (mass assignment)**: the registration endpoint must reject a client-supplied `facilityId`, `status`, or `uniquePatientId` — these are server-computed/assigned, never client-set, even if the field happens to be present in the request body.
- **A01 — IDOR**: sequential or guessable `Patient.id` combined with a missing object-level check would let one patient enumerate another's record; UUIDv4 primary keys already mitigate the guessability half, object-level authorization (§Gate 3, `10-security-gates.md`) covers the rest.
- PHI exposure via `phone` — already controlled at the serializer layer per FR-04, restated here as the concrete threat it's mitigating.

**Events published:** `PatientRegistered`, `PatientAddressUpdated`, `EmergencyContactAdded`, `WalletCredited`, `WalletDebited`.

**Events consumed:** `PaymentReceived` (from Billing) → triggers `WalletCredited`; `InvoicePaid` (from Billing) → triggers `WalletDebited`. This is the concrete implementation of the cross-context tension named in §1 — Patient owns the aggregate, Billing drives the mutation, the event is the seam.

---

### 3.3 Appointment — *Supporting subdomain*

**Aggregates, entities, value objects:**
- **`Appointment`** (aggregate root) — encloses `AppointmentParticipant` as child entities. Invariant: status transitions follow the defined graph (`PENDING → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`, with `CANCELLED`/`MISSED` as terminal exceptions from any non-terminal state), and **confirmation past the 2PM cutoff must be rejected using server time only** — a client-supplied timestamp anywhere near this check is a business-logic-bypass vector (CWE-807, reliance on untrusted inputs in a security decision).
- **`TransferRequest`** (aggregate root, independent) — references `Patient`/`Facility` by ID only.

**Authorization matrix:** Patient (own, read-only), Consulting Oncologist (own panel, read/confirm), Regional Admin (facility-wide read + transfer initiation), Onsite Nursing Officer (facility schedule read).

**Security threats:**
- **Race condition / TOCTOU on double-booking**: two confirm requests for the same slot arriving concurrently. This is the concrete case optimistic concurrency (§2) exists to prevent — without a version check, "last write wins" silently double-books a clinician.
- **CWE-807** as above — 2PM cutoff enforced client-side only is a bypassable control, not a real one.
- **A01 — IDOR** on `appointment_id` across facilities, same pattern as every other facility-scoped resource.

**Events published:** `AppointmentRequested`, `AppointmentConfirmed`, `AppointmentCheckedIn`, `AppointmentCompleted`, `AppointmentCancelled`, `AppointmentMissed`, `TransferRequested`, `TransferApproved`.

**Events consumed:** `InvoicePaid` (Billing) → unlocks confirm eligibility; `ClinicalDecisionApproved` (Clinical) → prompts scheduling.

---

### 3.4 Clinical — *Core domain* (the deepest section, deliberately — this is where the platform's actual value lives)

**This bounded context deliberately decomposes into seven aggregate roots, not one.** A single "Clinical" aggregate encompassing everything from triage to case closure would violate the small-aggregate principle badly enough to make every write in the module contend for the same lock. Each aggregate below owns exactly the invariant that has to be transactionally consistent; everything that can tolerate eventual consistency is coordinated by events instead.

| Aggregate root | Child entities | Core invariant |
|---|---|---|
| **`CountdownCase`** | — | `currentDay` only decreases; status transitions follow the defined graph; `CLEARED` requires `resultsSentToQaAt` set |
| **`LabRequest`** | `LabResult` | a `LabResult` can only attach to a request that's in a state expecting one; duplicate-hash detection runs at attach time |
| **`ClinicalDecision`** | — | **the two-stage sequencing rule**: `finalDecision` cannot be set while `qaDecidedAt IS NULL` — this single invariant is the entire reason this is its own aggregate rather than a child of `LabResult` |
| **`TriageChecklist`** | — | immutable once `completedAt` is set (append-only in practice); 1:1 with `Conversation` |
| **`Prescription`** | — | **the MO-required gate**: `triageChecklistId` required when the prescriber's role is Virtual MO, not required for Consulting Oncologist |
| **`PhysicalCase`** | `AppointmentCard` → `AppointmentCardChecklistItem` | `close()` requires both `doctorNoteReviewedAt` and `appointmentCardReviewedAt`, closer must be facility-scoped QA |
| **`TreatmentPlan`** | `TreatmentCycle` | cycles belong to exactly one plan; plan requires oncologist + director co-sign before `ACTIVE` |
| **`MedicalRecord`** | `ClinicalNote` | notes are append-only once authored — no in-place clinical-note editing, only new notes |

**Authorization matrix** (condensed — full detail in `08-stakeholder-role-matrix.md`):

| Aggregate | Write access |
|---|---|
| `ClinicalDecision` stage 1 | Quality Assurance Officer only |
| `ClinicalDecision` stage 2 | State Clinical Director only, gated on stage 1 |
| `PhysicalCase.open()` | Onsite Nursing Officer only |
| `PhysicalCase.close()` | Quality Assurance Officer only, **same-facility as the case** |
| `Prescription` | Virtual MO (gated) or Consulting Oncologist (ungated) |
| `TriageChecklist` | Virtual MO only |

**Security threats:**
- **A01:2021 / CWE-284 — Improper Access Control**: the facility-scoping bypass on `PhysicalCase.close()` and `ClinicalDecision.qa_decided_by` — already identified and controlled for, restated here as the formal threat class it belongs to.
- **A08:2021 — Software and Data Integrity Failures**: a `ClinicalDecision` silently `UPDATE`-able after both stages are set is exactly this category — a medical approve/decline record needs to be tamper-evident, which is why §2's recommendation to make it append-only-after-completion (new versioned record on correction, never overwrite) belongs here specifically, not as a general nicety.
- **A04:2021 — Insecure Design**: the triage-before-prescribe gate (and the two-stage decision gate) must be enforced at the service layer, reachable directly via API, not only via UI flow control — an attacker (or a bug in a future frontend) that calls the `Prescription` endpoint directly must hit the same gate a legitimate MO would hit through the UI.
- **CWE-362 — Race Condition**: two concurrent attempts to close the same `PhysicalCase`, or to set `finalDecision` twice — optimistic concurrency (§2) is the control.

**Events published:** `CountdownCaseStarted`, `LabsPrompted`, `LabsUploaded`, `ResultsSentToQA`, `QARecommendationRecorded`, `FinalDecisionRecorded`, `CountdownCaseCleared`, `CountdownCaseDeclined`, `CountdownCaseEscalated`, `TriageCompleted`, `PrescriptionIssued`, `PhysicalCaseOpened`, `AppointmentCardSubmitted`, `DoctorNoteReviewed`, `AppointmentCardReviewed`, `PhysicalCaseClosed`.

**Events consumed:** `PaymentReceived`/`InvoicePaid` (Billing) → unlocks `CountdownCase` progression; `AppointmentConfirmed` (Appointment) → enables `PhysicalCase` linkage; `FileScanCompleted:CLEAN` (Documents) → unlocks `LabResult` usability; `FileScanCompleted:INFECTED` → blocks it and should trigger a re-upload prompt rather than a silent dead end.

---

### 3.5 Messaging — *Supporting subdomain*

**Aggregates, entities, value objects:**
- **`Conversation`** (aggregate root) — encloses `Participant` and `Message` as child entities. Invariant: `slaDeadline` computed at creation from `conversationType` (2 min for `MO_SIDE_EFFECT`, 5 min for `ADMIN_INQUIRY`, per FR-31), no writes to a `CLOSED` conversation.
- **`Meeting`** (aggregate root, separate bounded concern from `Conversation` — video infrastructure, not messaging content).
- **`Transcript`** (aggregate root, deliberately **not** a child entity of `Meeting`) — a long consult could produce hundreds of transcript segments; loading them all every time the `Meeting` aggregate is touched (e.g. just to check `status`) is a real performance cost for no consistency benefit, since transcript edits don't need to be atomic with meeting-state changes.

**Authorization matrix:** Patient/MO/Oncologist per their assigned `Participant` row (object-level check, §Gate 5), Scribe (edit `Transcript.content` only, no clinical authority).

**Security threats:**
- **A01 — Broken Access Control**: reading a `Conversation`/`Transcript` without an actual `Participant` row for that specific conversation — the object-level check from `10-security-gates.md` Gate 5/7 is the control.
- **CWE-345 — Insufficient Verification of Data Authenticity**: unverified Daily.co webhook payloads driving `Meeting.status` or creating `Transcript` rows — signature verification is mandatory, not optional, per Gate 7.
- Real-time channel authorization (if messaging uses WebSockets): the auth check has to happen **at socket-connection time and be re-verified per message**, not just once at HTTP handshake — a common gap where REST-style auth thinking gets ported to a persistent connection incorrectly.

**Events published:** `ConversationOpened`, `MessageSent`, `SLABreached`, `FirstResponseRecorded`, `MeetingScheduled`, `MeetingStarted`, `MeetingEnded`, `TranscriptSegmentCaptured`, `TranscriptCorrected`.

**Events consumed:** `AppointmentConfirmed` (Appointment) → triggers `MeetingScheduled`.

---

### 3.6 Billing — *Core domain*

**Aggregates, entities, value objects:**
- **`Invoice`** (aggregate root) — encloses `InvoiceItem` as child entities. Invariant: `totalKobo` always equals the sum of items, items are append-only once status leaves `DRAFT`, amount is always server-computed from `Tariff` — never client-supplied (FR-51, already the single best-enforced control in the system per `10-security-gates.md`).
- **`ProfessionalFeeSplit`** (aggregate root, deliberately independent of `Invoice`) — its actual consistency boundary (payout eligibility) spans into the Clinical bounded context, which an aggregate can never do transactionally by DDD rules. This is exactly why it's coordinated by a saga rather than a direct join — see §5.
- **`Subscription`** (aggregate root) — independent recurring-billing lifecycle.
- **`Payout`** (aggregate root) — encloses `PayoutLineItem` as child entities. Invariant: `sourceId` uniqueness prevents double-paying a single fee split, enforced as a DB constraint (per `10-security-gates.md` Gate 11), not just a service check.
- **`PayeeBankAccount`** (aggregate root, independent) — invariant: only a `verifiedAt`-set account is payout-eligible; a bank-detail change re-enters an unverified state and requires the maker-checker flow from Gate 11 before it can receive funds again.

**Authorization matrix:**

| Action | Regional Admin | Patient | Super Admin |
|---|---|---|---|
| Generate `Invoice` (dropdown-only) | ✅ | ❌ | ✅ |
| Pay `Invoice` | ❌ | ✅ (own) | ❌ |
| Manage `PayeeBankAccount` | ❌ | n/a | ✅, with maker-checker |
| Trigger manual `Payout` override | ❌ | n/a | ✅, with logged justification |

**Security threats:**
- **A08:2021 — Software and Data Integrity Failures**: unsigned/unverified Monnify webhook payloads driving `Payment` creation — signature verification + idempotency via `reference` is the control (already planned, restated as the specific OWASP category it addresses).
- **CWE-841 — Improper Enforcement of Behavioral Workflow**: bank-account substitution bypassing the maker-checker hold — this is the highest-severity threat in the entire platform, since it converts directly into stolen money rather than leaked data.
- **CWE-362 — Race Condition**: two concurrent debits against the same `Wallet` — row-level locking (`SELECT ... FOR UPDATE`) or optimistic concurrency required, this is a textbook double-spend scenario if left unguarded.
- **A04 — Insecure Design**: any code path that lets an amount be client-supplied rather than server-computed is a design-level flaw, not a bug to patch later — worth a standing rule in code review, not just a one-time check.

**Events published:** `InvoiceCreated`, `InvoiceSent`, `InvoicePaid`, `InvoiceVoided`, `PaymentReceived`, `SubscriptionStarted`, `SubscriptionCancelled`, `SubscriptionRenewed`, `PayeeBankAccountVerified`, `PayoutBatchCreated`, `PayoutCompleted`, `PayoutFailed`.

**Events consumed:** `PhysicalCaseClosed` (Clinical) — the other half of the payout-eligibility saga (§5).

---

### 3.7 Inventory — *Supporting subdomain (P1)*

**Aggregates, entities, value objects:**
- **`Inventory`** (aggregate root, one per facility+drug, or facility-null for the regional pool) — invariant: `quantity` never goes negative.
- **`InventoryMovement`** (aggregate root, deliberately **not** a child of `Inventory`, same reasoning as `Transcript`/`Meeting` — movement history is high-volume and doesn't need to load atomically with a stock-level check).
- **`ReconciliationRecord`** (aggregate root, independent).

**Authorization matrix:** Onsite Nursing Officer (record `ADMINISTERED`/`INCIDENT`), Regional Admin (`PURCHASE`/`DISPATCH`, reconciliation resolution).

**Security threats:**
- **CWE-345** — `evidenceFileId` required on `INCIDENT` movements, but nothing currently verifies the evidence file's `fileHash` hasn't been tampered with post-upload — ties directly to the file-integrity-on-read recommendation in `10-security-gates.md` Gate 6.
- **A01 — Broken Access Control**: unauthorized stock adjustment outside a nurse's own facility, same facility-scoping pattern as Clinical.

**Events published:** `StockReceived`, `StockDispatched`, `StockAdministered`, `IncidentReported`, `ReconciliationVarianceFlagged`, `ReconciliationResolved`.

**Events consumed:** `PhysicalCaseClosed` (Clinical) → creates the `StockAdministered` movement. **This closes a gap flagged in `09-stakeholder-trigger-web.md` Chain J** — that document noted this connection as an unconfirmed assumption; formalizing it as an explicit event subscription here is the fix, not just a documentation note.

---

### 3.8 Notification — *Generic subdomain, deliberately thin*

**Aggregates, entities, value objects:**
- **`Notification`** (aggregate root) — single entity, no children. **Worth stating explicitly: adding CQRS, multiple aggregates, or event-sourcing to this module would be over-engineering.** It's a generic subdomain doing one job (dispatch a message, track its status); the temptation to apply every pattern from this document uniformly is exactly what YAGNI exists to catch.

**Authorization matrix:** system-only writes (no human directly creates a `Notification` — every row originates from an event handler reacting to something else).

**Security threats:**
- **PHI leakage via insecure channel**: SMS/email content showing clinical detail in a push notification preview (visible on a lock screen, logged by the carrier). Control: generic "you have an update" content for external channels, full detail only inside the authenticated app.
- **Notification-bombing / abuse**: rate-limit dispatch per recipient per time window, both for cost control and to prevent a bug (or an attacker triggering repeated events) from spamming a patient or clinician into ignoring real alerts.

**Events published:** `NotificationSent`, `NotificationFailed`, `NotificationRead`.

**Events consumed:** effectively the entire event catalog (§4) — this is the one module where broad subscription is correct, not a smell, because dispatching notifications *is* the job.

---

### 3.9 Audit — *Generic subdomain, but architecturally distinct from the others*

**This one deserves a modeling correction, not just a description.** `AuditLog` isn't really an aggregate with business invariants the way `ClinicalDecision` or `Wallet` are — it's an **append-only event store / ledger**, and the current build plan (`F4.8`, a manual retrofit pass adding `AuditLog.create()` calls into every service method) is a materially weaker pattern than what DDD/event-driven design would actually recommend here.

**The better version:** build a single generic event-bus subscriber, from Foundation Sprint onward, that writes an `AuditLog` row for **every** published domain event across every module (§4's catalog), automatically, using the event's own metadata (`actorId`, event type, `resourceId`, timestamp) to populate the row. `F4.8` then becomes a **coverage-verification checkpoint** — confirming every state-changing action actually publishes an event, which the generic subscriber then captures for free — rather than a manual pass hand-writing audit calls into a dozen services and hoping none get missed. This is a genuine architectural improvement the earlier sprint files didn't have, surfaced specifically by applying real event-driven rigor here — worth updating `F4.8`'s build sequence to reflect it rather than treating this as a nice-to-have aside.

**Security threats:** covered in depth in `10-security-gates.md` Gate 12 (DB-level write restriction, separate write-only destination) — not repeated here.

**Events consumed:** the entire catalog, same as Notification — the second legitimate universal subscriber.

---

### 3.10 Facility & Documents — *Generic/shared subdomains, intentionally brief*

Both are Open Host Service providers (§1) — small, stable, ID-referenced by everyone, with almost no business logic of their own. Giving them the same six-dimension treatment as Clinical or Billing would be padding, not rigor.

- **`Facility`** (aggregate root, `Department` as child entity) — no interesting invariants beyond `status` (`ACTIVE`/`INACTIVE`). Events published: `FacilityActivated`, `FacilityDeactivated`. Consumed: none.
- **`File`** (aggregate root, `FileVerificationStep` as child entity) — invariant: `virusScanStatus` only transitions `PENDING → CLEAN` or `PENDING → INFECTED`, never backward. Events published: `FileUploaded`, `FileScanCompleted`, `FileVerificationStepCompleted`. Consumed: none — this context is upstream to nearly everything and shouldn't need to react to anything else.

---

## 4. Event catalog — the system's actual event-driven backbone

This is `09-stakeholder-trigger-web.md`'s trigger chains, reframed as formal domain events with publisher/subscriber pairs — the same underlying flows, now expressed as the pub/sub contract a real event bus (BullMQ-backed, given it's already in the stack) would implement.

| Event | Published by | Consumed by |
|---|---|---|
| `PatientRegistered` | Patient | Notification, Audit |
| `WalletCredited` / `WalletDebited` | Patient (triggered by Billing events) | Notification, Audit, PatientTimeline projection |
| `InvoicePaid` | Billing | Patient, Appointment, Clinical, Notification, **Payout Eligibility Saga (§5)** |
| `PaymentReceived` | Billing | Patient, Notification |
| `AppointmentConfirmed` | Appointment | Messaging (`MeetingScheduled`), Clinical (`PhysicalCase` linkage) |
| `TriageCompleted` | Clinical | (unlocks `Prescription` write within the same aggregate cluster — no cross-context subscriber needed) |
| `PrescriptionIssued` | Clinical | PatientTimeline projection, Notification |
| `ResultsSentToQA` | Clinical | Notification (assign to QA) |
| `QARecommendationRecorded` | Clinical | Notification (assign to Director) |
| `FinalDecisionRecorded` | Clinical | Patient, Appointment (scheduling prompt), Notification, PatientTimeline projection |
| `CountdownCaseEscalated` | Clinical | Notification — **currently no confirmed recipient, per the gap flagged in `09-stakeholder-trigger-web.md` Chain C** |
| `PhysicalCaseClosed` | Clinical | **Billing (Payout Eligibility Saga), Inventory (`StockAdministered`)**, Notification |
| `FileScanCompleted` | Documents | Clinical (`LabResult` usability gate), Inventory (`INCIDENT` evidence gate) |
| `MisconductFlagRaised` / `Resolved` | Identity | Notification, Audit |
| `PayoutCompleted` | Billing | Notification (per-payee) |
| **(every event above)** | — | **Audit (universal), Notification (universal, per §3.8/3.9)** |

---

## 5. CQRS — where it's earned, and where it isn't

CQRS is expensive: separate read/write models mean separate schemas or projections to keep in sync, and that sync mechanism is itself a source of bugs if applied somewhere that didn't need it. Three places in OncoFlow genuinely earn it; everywhere else, plain repository queries against the write model are the right call, and reaching for CQRS there would be YAGNI's violation, not rigor.

**Earn it:**
1. **`PatientTimeline`** — this is already, structurally, a read-model projection rather than a true aggregate (§3.2). It should be built as one explicitly: a dedicated event-bus subscriber that listens to `PrescriptionIssued`, `FinalDecisionRecorded`, `TriageCompleted`, etc., and writes a denormalized, query-optimized row — never queried by joining across seven live aggregates on every page load.
2. **Clinical's dashboard views** — the QA Case Board, the Director's Vetting Queue, the 7-Day Countdown board all query across multiple aggregates (`PhysicalCase` + `AppointmentCard` + `ClinicalNote`, or `CountdownCase` + `ClinicalDecision`) in ways the write-side aggregate boundaries deliberately don't optimize for (aggregates are sized for consistency, not for dashboard joins). Dedicated read projections here avoid a live 4-table join on every QA officer's page load.
3. **The Payout Eligibility Saga** (§1, §3.6) — this is the formal fix for the "AND-gate" already identified in `09-stakeholder-trigger-web.md` Chain G. A `PayoutEligibilitySaga` (a process manager, implemented as a BullMQ-backed state tracker) subscribes to both `InvoicePaid` and `PhysicalCaseClosed`; when both have arrived for the same case, it publishes `PayoutEligible`, which is what the weekly batch job actually reads from — rather than the batch job trying to join across Clinical and Billing's tables directly at run time, which would violate the bounded-context separation this whole document is built on.

**Don't earn it:** Notification, Facility, Documents, Inventory at MVP scale, Identity/Auth. Plain reads against the write model are simpler, correct, and sufficient — applying CQRS here would be solving a scaling problem OncoFlow doesn't have yet, for the sake of using the pattern.

---

## 6. Self-review — weaknesses in this blueprint, and gaps it surfaces in earlier files

Per the brief's own instruction to review the plan before presenting it:

**Weaknesses in this document:**
- The event catalog (§4) is a design target, not yet a build sequence — it needs to be folded into the sprint files (which BullMQ queue backs the event bus, which module owns the bus infrastructure itself — likely a new Foundation Sprint feature, "F0.8 — Domain event bus," that doesn't currently exist).
- Optimistic concurrency (§2) is recommended broadly but not yet specified per-table (which column, what the conflict-response contract looks like for each aggregate) — needs a follow-up pass before it's build-ready.
- The `AccountLock`/`MisconductFlag` invariant gaps (§3.1) were found by modeling exercise, not by re-reading the PRD — worth confirming against the PRD text directly in case they're addressed somewhere this exercise didn't check.

**Gaps this surfaces in already-built files, consolidated:**
- `F4.8` (Audit retrofit) should be rewritten as a coverage-verification checkpoint against a generic event subscriber, not a manual per-service instrumentation pass (§3.9) — this is a real, actionable change to an existing sprint file, not just a note.
- `F2.4`/`F4.5` need the Payout Eligibility Saga formalized as its own feature rather than an implicit join inside the weekly batch job (§5) — this changes how `F4.5`'s build sequence should read.
- The six open trigger-web gaps from `09-stakeholder-trigger-web.md` (escalation targets, transfer approver role, Scribe's role-model placement) are unchanged by this exercise — still open, still worth Valerie's input before locking in an assumption.

**Compliance gap, restated from `10-security-gates.md`:** none of the DDD rigor above changes the Hetzner data-residency question under NDPA — worth resolving independently of anything architectural.

---

Want the event-bus feature (`F0.8`) and the Payout Eligibility Saga written up as formal sprint-file amendments — the same `[PLAN AMENDMENT]` treatment `F3.0` and `F4.2` got earlier — or held as this standalone architectural reference until the still-open PRD/role-model question settles, since a couple of these may be worth revisiting together?
