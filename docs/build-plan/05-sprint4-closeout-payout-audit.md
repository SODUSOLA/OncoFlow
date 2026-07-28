# Sprint 4 — Close-Out & Payout (Mon Aug 17 – Fri Aug 21, 2026)

**Read `00-global-conventions-and-schema-corrections.md` and confirm Sprint 3 (`04-sprint3-*.md`) is fully done before starting anything below.**

**Theme:** physical case close-out and the money actually pays out.

**Demoable outcome:** Nurse opens a case, QA reviews and closes it, payout batch runs.

**End of Sprint 4 = end of the Jul 22–Aug 21 build window.** By the end of this sprint, the full patient journey (register → pay → triage/consult → physical case → payout) must work end to end for P0 roles. Anything marked P1 below is the known, flagged carry-over into the reserved final week (Aug 24–31) — not a surprise if it slips.

---

## F4.1 — PhysicalCase (P0, Backend)

**Depends on:** F2.5 (`Appointment`, `UNIQUE (1:1)` FK), F2.4 (`CountdownCase`, nullable FK), F1.3 (`Facility`, for the QA scoping rule below).

**Build sequence:**
1. `PhysicalCaseRepository`.
2. `PhysicalCase` entity: `opened_by` exclusive to Onsite Nursing Officer, `closed_by` exclusive to Quality Assurance Officer (ADR-0012) — enforce both via RBAC role checks in the service, not just documentation.
3. **Facility scoping (confirmed, global conventions §1.4):** the `close()` method must verify the closing QA officer's `facility_id` matches `PhysicalCase`'s own facility (resolved via its linked `Appointment.facility_id`) — use the facility-scoped `requirePermission()` variant built in F0.5.
4. **Confirmed scope (global conventions §1.3):** the review-gate fields (`doctor_note_reviewed_at`, `appointment_card_reviewed_at`) and the resulting close-case gate apply to **every** `PhysicalCase`, regardless of whether `countdown_case_id` is set. Do not branch this logic on countdown linkage.
5. `close()` must enforce: both `doctor_note_reviewed_at` AND `appointment_card_reviewed_at` are NOT NULL before allowing the `OPEN → CLOSED` transition — this is the ADR-0011 gate, enforced in the service layer per v2.0's explicit note.

**Definition of Done:**
- A QA officer from a different facility than the case attempting to close it is rejected (test this specifically — it's the concrete proof of the facility-scoping requirement).
- Attempting to close a case with only one of the two review timestamps set is rejected.
- A standalone (non-chemo-linked) `PhysicalCase` still requires both review timestamps before closing — test this explicitly since it's the concrete proof of the "applies to every case" confirmation.

---

## F4.2 — [PLAN AMENDMENT] MedicalRecord + ClinicalNote (P0, Backend)

**Why this exists:** these tables exist in v2.0 §3.4 but weren't assigned to any sprint in the original Dev Plan. The ADR-0011 review gate (F4.1, F4.4) references a "doctor's note" — that's `ClinicalNote`. Without this feature, F4.4's review gate has nothing to review.

**Depends on:** F1.4 (`Patient`), F1.1 (`User` — `created_by`/`author_id`).

**Build sequence:**
1. `MedicalRecordRepository`, `ClinicalNoteRepository`.
2. A `ClinicalNote` is authored during/after a physical case by the attending clinician — decide and document the exact trigger point (likely tied to `PhysicalCase`/`Appointment` completion) so F4.4's review logic has a clear, unambiguous note to point at.

**Definition of Done:**
- A `ClinicalNote` can be created and linked to a `MedicalRecord` for a given patient, authored by the correct role.

---

## F4.3 — AppointmentCard + AppointmentCardChecklistItem (P0, Backend)

**Depends on:** F4.1 (`PhysicalCase`), F2.5 (`Appointment`, `UNIQUE (1:1)` FK).

**Build sequence:**
1. `AppointmentCardRepository`, `AppointmentCardChecklistItemRepository` (the normalized table from the global conventions corrections — **not** JSON).
2. `AppointmentCard` entity: `status` (`DRAFT → SUBMITTED → REVIEWED_BY_QA`), `filled_by` exclusive to Onsite Nursing Officer.
3. Seed the fixed checklist item names (confirm the exact list against the PRD/FR spec — since it's confirmed fixed, this is a one-time seed, not user-configurable input) as `AppointmentCardChecklistItem` rows created alongside the `AppointmentCard`, all `is_checked = false` initially, then updated individually as the nurse works through the form.
4. `reviewed_by`/`reviewed_at` set by QA — this is what stamps `PhysicalCase.appointment_card_reviewed_at` (F4.1) when set.

**Definition of Done:**
- Creating an `AppointmentCard` creates its full set of checklist items automatically (test the count matches the fixed list length).
- Reviewing the card correctly stamps `PhysicalCase.appointment_card_reviewed_at`.

---

## F4.4 — Doctor-note + Appointment Card review gate (P0, Backend)

**Depends on:** F4.1, F4.2, F4.3 — this is the feature that ties all three together; do not start it until all three have independently passed their own Definition of Done.

**Build sequence:**
1. QA-facing review action: opening the `ClinicalNote` (from F4.2) stamps `PhysicalCase.doctor_note_reviewed_at`; opening/reviewing the `AppointmentCard` (from F4.3) stamps `appointment_card_reviewed_at`.
2. Only once both are stamped does `PhysicalCase.close()` (F4.1) become callable — confirm this end-to-end, not just each half in isolation.

**Definition of Done:**
- Full sequence tested end to end: nurse opens case → nurse fills appointment card → clinician writes note → QA reviews note → QA reviews card → QA closes case. Each step's precondition (previous step done) is enforced, not just the final gate.

---

## F4.5 — Payout pipeline (P0, Backend)

**Depends on:** F4.4 (a case must be closeable — payout logic reads off `PhysicalCase`/`Invoice` state), F2.2 (`Invoice`, for `ProfessionalFeeSplit`), F2.3 (Monnify client already integrated for collection — this extends it to disbursement).

**Tables:** `ProfessionalFeeSplit` `[append-only]`, `PayeeBankAccount`, `Payout`, `PayoutLineItem` `[append-only]`.

**Build sequence:**
1. `ProfessionalFeeSplitRepository` — created when an invoice's professional-fee component is finalized, one row per `PayoutRole` recipient, `is_out_of_state` flag affecting split percentage (confirm the exact split rule against the PRD/ADR-0010, don't guess the percentages).
2. `PayeeBankAccountRepository` — Monnify Name Enquiry verification flow (`verified_at`, `verification_reference` set only after a successful match); `owner_type`/`owner_id` polymorphic resolution to either `Facility` or `User`.
3. `PayoutRepository`, `PayoutLineItemRepository`.
4. **Weekly Bulk Transfer batch job (BullMQ):** gated on invoice payment **and** case closure — a `ProfessionalFeeSplit` or facility-fee `InvoiceItem` is only eligible for a `PayoutLineItem` once both conditions hold. Enforce the `PayoutLineItem.source_id UNIQUE` constraint at the service layer too (one payout per fee split, ever) — reject, don't silently skip, a second attempt.
5. `Payout.status` state machine (`PENDING → PROCESSING → COMPLETED`, with `FAILED`/`REVERSED` as exception states), `monnify_transfer_reference` set once Monnify accepts the transfer.

**Definition of Done:**
- A fee split for an unpaid invoice or an unclosed case is **not** included in a payout batch — test both exclusion conditions independently.
- Running the batch job twice against the same eligible fee splits produces only one `PayoutLineItem` per split (the `UNIQUE (source_id)` constraint holding under a concurrent/duplicate job run).
- `PayeeBankAccount` with no `verified_at` is excluded from payout eligibility.

---

## F4.6 — Virus-scan job (P0, Backend)

**Depends on:** F3.0 (the minimal `File`/R2 write path from Sprint 3 — this feature adds scanning on top, doesn't replace it).

**Build sequence:**
1. ClamAV integration, invoked via a BullMQ job triggered on `File` creation.
2. `virus_scan_status` transitions `PENDING → CLEAN` or `PENDING → INFECTED`.
3. Decide and implement the consequence of `INFECTED`: at minimum, block the file from being served/downloaded and flag it for review — confirm the exact handling (quarantine vs. hard delete vs. admin alert) against product before finalizing, since this wasn't fully specified in the source docs.

**Definition of Done:**
- A clean test file transitions to `CLEAN`.
- An EICAR test file (standard antivirus test string) transitions to `INFECTED` and is confirmed blocked from being served.

---

## F4.7 — FileVerificationStep table (P0, Backend)

**Depends on:** F4.6 (builds on the now-functional `File` pipeline).

**Build sequence:**
1. `FileVerificationStepRepository`.
2. Implement FR-40's 5-step nurse upload sequence as 5 `FileVerificationStep` rows created alongside a `File` upload in the nurse's Secure Upload Wizard context (F4.9), each stamped as it's completed — replacing what would have been a JSONB blob per the global conventions correction.

**Definition of Done:**
- A file uploaded through the Secure Upload Wizard flow produces exactly 5 `FileVerificationStep` rows, each independently timestamped and actor-tagged as completed.

---

## F4.8 — Audit domain retrofit (P0, Backend)

**Depends on:** every state-changing backend feature built so far, across all sprints — this is explicitly a **checkpoint**, not new functionality. Per the Dev Plan: "should have been incremental, but this is the checkpoint to confirm nothing was missed."

**Build sequence:**
1. Audit every module's service-layer state-changing methods (creates, updates, approvals, declines, logins, exports) against the `AuditAction` enum (`CREATE | UPDATE | DELETE | LOGIN | LOGOUT | EXPORT | APPROVE | DECLINE | ACCESS_DENIED`).
2. For each one missing an `AuditLog` write, add it now — `actor_id` (NULL for system-initiated), `action`, `resource`, `resource_id`, `result` (`ALLOWED`/`DENIED`), `ip`.
3. Specifically confirm `ACCESS_DENIED` is logged from the RBAC middleware itself (F0.5) on every 403 — this is easy to miss since it's a cross-cutting concern, not a per-module one.

**Definition of Done:**
- A checklist run across every module's service layer, confirming every state-changing method writes an `AuditLog` row — literally go module by module, not a spot-check.
- A deliberately-denied action (403 from RBAC) produces an `AuditLog` row with `result = DENIED`.
- `AuditLog` is confirmed to have no soft-delete columns and is never updated after insert (write a test attempting an update and confirming it's rejected at the repository layer, since this table must stay append-only "no soft delete ever" per v2.0).

---

## Frontend — P0

**F4.9 — Onsite Nursing Officer dashboard** (Next-Day Schedule, Appointment Card form, Secure Upload Wizard). Depends on F4.1, F4.3, F4.6.

**F4.10 — Quality Assurance Officer dashboard** (Active Physical Case Board, Case Review Panel — doctor's note + Appointment Card, Close Case action). Depends on F4.4.

---

## P1 — realistic candidates to slip into the reserved final week (Aug 24–31)

**F4.11 — State Clinical Director dashboard** (Vetting Queue, MO Lock/Unlock, Misconduct Review). Depends on F3.6, F1.2.

**F4.12 — State Director of Nursing Services dashboard** (oversight-only — lowest priority per ADR-0012's own framing). Depends on F4.1.

**F4.13 — Inventory module, full** (`Drug`, `Inventory`, `InventoryMovement`, `ReconciliationRecord`) + Admin's inventory screens. Depends on F1.3, F2.4 (purchase movements reference `CountdownCase`), F4.1 (administered movements reference `PhysicalCase`). Note the two-ledger model (regional pool = `Inventory.facility_id IS NULL`, facility ledger = `Inventory.facility_id` set) and the Thursday reconciliation job; `InventoryMovement.evidence_file_id` is required when `movement_type = INCIDENT` — enforce this at the service layer.

**F4.14 — Super Admin dashboard polish.** Depends on F1.10.

**F4.15 — Unified Calendar View** (FR-24), layered on top of the role-specific views that already exist. Depends on F2.5, F3.7.

**F4.16 — Full Notification module** (SMS/email trigger wiring across every workflow — some incremental coverage may already exist from earlier sprints; this is the comprehensive-coverage checkpoint, same pattern as F4.8's audit retrofit). Depends on essentially every prior feature that should trigger a notification.

---

## Do Not Start (post-Aug-21 territory)

- Testing/UAT/Pilot hardening is explicitly out of this plan's scope — reserved for Aug 24–31.
- Multilingual anything — pending Valerie's clarification (interface-only vs. clinical), not scoped into any sprint.
- Do not treat a P1 item's slip as scope creep into Sprint 5/hardening week without flagging it as a known, planned carry-over — that's the whole point of marking it P1 now instead of discovering the gap on Aug 19.
