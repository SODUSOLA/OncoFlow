# OncoFlow — Stakeholder Trigger Web

How every role's actions cascade into another role's function. Builds directly on `08-stakeholder-role-matrix.md` — read that first if you haven't, since this document assumes you know what each role can do and just traces what happens *next* when they do it.

Two things repeat so often they're stated once here instead of on every line below:
- **Every state-changing action writes an `AuditLog` row** (per `F4.8`'s retrofit).
- **Every clinically-relevant, patient-facing event writes a `PatientTimeline` entry**, structured, per the `F1.5` pattern — not chat, not a raw file link.

Where a trigger target isn't actually specified anywhere in the source docs, it's marked **[UNSPECIFIED]** rather than invented — same standard as everything else built for this project.

---

## Chain A — Registration

**Patient/Admin registers a patient**
→ `Patient` + `Wallet` created atomically (Sprint 1, `F1.4`)
→ triggers `PatientTimeline` (REGISTERED)
→ triggers Notification to Patient (welcome)
→ **if FR-01's duplicate check matches an existing record** → triggers a hold/review state **[UNSPECIFIED which role reviews the match]** — worth deciding: Regional Admin, or automatic rejection with no human step at all?

---

## Chain B — Wallet funding → Invoice payment

**Patient tops up wallet (Monnify Reserved Account)**
→ Monnify webhook → `Payment` + `WalletTransaction(CREDIT)` → `Wallet.balance_kobo` updated
→ triggers Notification to Patient (funds received)

**Regional Admin generates an Invoice (dropdown-only)**
→ `Invoice` created `DRAFT` → sent (`SENT`)
→ triggers Notification to Patient (invoice due)

**Patient pays the Invoice from Wallet**
→ `WalletTransaction(DEBIT)` + `Invoice.status → PAID`
→ triggers **two parallel downstream effects**, depending on what the invoice is for:
  - If tied to a `CountdownCase`: stamps `CountdownCase.payment_confirmed_at` → **feeds into Chain C**
  - If tied to an `Appointment`: stamps `Appointment.payment_confirmed_at` → unlocks same-day booking eligibility under the 2PM cutoff rule → triggers scheduling availability for **Consulting Oncologist / Onsite Nursing Officer**
→ triggers Notification to Regional Admin (payment received) and to the assigned clinician (case ready to schedule)

---

## Chain C — 7-Day Countdown → Labs → QA → Director (the longest chain in the system)

1. `CountdownCase` created at day 7 (tied to Patient + Invoice from Chain B)
   → triggers `labs_prompted_at` stamp → Notification to **Patient** ("submit labs")

2. **Patient/Onsite Nursing Officer** uploads lab files
   → `File` created → virus-scan job runs (`F4.6`) →
     - `CLEAN` → `LabRequest`/`LabResult` become usable, `file_hash` duplicate check runs (flags `possible_duplicate` if a match exists for this patient)
     - `INFECTED` → quarantined, **never** linked to `PatientTimeline`, triggers Notification to the **uploader** (rejection) — dead end, does not proceed to QA
   → on success: `labs_uploaded_at` stamped → triggers `CountdownCase.results_sent_to_qa_at` → triggers Notification/assignment to **Quality Assurance Officer**

3. **Quality Assurance Officer** sets the stage-1 recommendation on `ClinicalDecision` (`qa_recommendation`, `qa_decided_at`)
   → this is the literal gate: nothing in stage 2 can happen without this
   → triggers Notification to **State Clinical Director** ("case ready for final decision")

4. **State Clinical Director** sets `final_decision`
   → if `APPROVED`: `CountdownCase.status → CLEARED` → triggers Notification to **Patient** + **Consulting Oncologist / Onsite Nursing Officer** (schedule the appointment/physical case) → **feeds into Chain E or Chain F**
   → if `DECLINED`: `CountdownCase.status → DECLINED` → triggers Notification to **Patient** + **[UNSPECIFIED — does Regional Admin get looped in for follow-up/alternative-care navigation, or does this dead-end at the patient?]**

5. **Independently, running the whole time:** a daily BullMQ job decrements `current_day`. If day-thresholds pass with no patient/QA/Director action, it stamps `reminder_sent_at` (Notification to Patient) and, past a threshold, flips `CountdownCase.status → ESCALATED` → triggers Notification to **[UNSPECIFIED — Regional Admin? State Clinical Director? Neither role's escalation-handling duty is documented anywhere]**. This is a real gap worth closing before `F2.4` is considered done, not just a documentation nicety — an escalated countdown case with no defined recipient is a silent failure in production.

---

## Chain D — Messaging → Triage → Prescription (MO path)

1. **Patient** sends a side-effect message
   → creates `Conversation(MO_SIDE_EFFECT)` + `Message` → starts the 2-minute SLA clock (`sla_deadline`)
   → triggers assignment/Notification to a **Virtual Medical Officer**

2. **Virtual MO** responds
   → stamps `first_response_at` (if within SLA)
   → **if SLA breached instead:** flips `sla_breached` → triggers Notification/escalation to **[UNSPECIFIED — no documented escalation target for a breached MO SLA]**. Same category of gap as Chain C step 5 — an SLA-breach flag that notifies no one isn't really an SLA system.

3. **Virtual MO** completes `TriageChecklist`
   → unlocks the MO's ability to prescribe for this interaction (the hard gate — no triage, no prescription, enforced at the service layer)

4. **Virtual MO** prescribes
   → creates `Prescription` → triggers `PatientTimeline` entry (structured) → triggers Notification to **Patient**
   → **if triage severity exceeds MO scope:** **[UNSPECIFIED — no documented escalation path from MO to Oncologist or Director for a case that's beyond MO competence]**. Worth naming explicitly: right now an MO who's out of their depth has no system-defined next step.

---

## Chain E — Video Consult (Oncologist) → Transcript (Scribe)

1. `Appointment(VIRTUAL)` confirmed (post-payment, from Chain B, or post-`CLEARED` countdown, from Chain C)
   → triggers `Meeting` creation (Daily.co room provisioned) → triggers Notification to **Patient + Consulting Oncologist** (join links)

2. Call happens
   → Daily.co webhooks update `Meeting.status` → transcription webhook creates `Transcript` rows in real time

3. **Consulting Oncologist** prescribes in-call (no triage gate, unlike MO)
   → creates `Prescription` → triggers `PatientTimeline` entry → triggers Notification to **Patient**

4. Post-call, **Scribe** reviews and corrects `Transcript.content`
   → **[UNSPECIFIED — this is currently a dead end.]** No documented downstream trigger: does a corrected transcript need Oncologist sign-off before it's considered final? Does it attach to `MedicalRecord`? Does anyone get notified a correction was made? Right now the Scribe's work product has no confirmed consumer.

---

## Chain F — Physical Case open → close (the other long chain)

1. **Onsite Nursing Officer** opens `PhysicalCase` (tied to `Appointment`, optionally to a `CountdownCase` from Chain C)
   → triggers the Nurse's own Secure Upload Wizard workflow for any needed documents (5-step `FileVerificationStep` sequence per file, same virus-scan branching as Chain C step 2)

2. **Onsite Nursing Officer** fills and submits `AppointmentCard`
   → status `DRAFT → SUBMITTED` → triggers Notification to **Quality Assurance Officer** (case ready for review)

3. **Consulting Oncologist / attending clinician** authors `ClinicalNote` (the "doctor's note")
   → makes `doctor_note_reviewed_at` eligible to be stamped — this step has to happen before step 4 can complete, but nothing in the docs specifies what *triggers* the clinician to write the note in the first place. **[UNSPECIFIED — is note-writing itself gated on something, e.g. `PhysicalCase` being opened, or is it just "whenever the clinician gets to it"?]**

4. **Quality Assurance Officer** reviews the note and the card
   → stamps `doctor_note_reviewed_at` and `appointment_card_reviewed_at` (facility-scoped — only a QA officer at the same facility can do this)
   → once **both** are stamped, unlocks the ability to close the case

5. **Quality Assurance Officer** closes `PhysicalCase`
   → triggers Notification to **Onsite Nursing Officer + Patient** (case closed)
   → triggers `ProfessionalFeeSplit` eligibility — **joins with Chain B** (see Chain G below, this is the AND-gate)
   → **if a drug was administered:** triggers an `ADMINISTERED` `InventoryMovement` referencing this case → **feeds Chain J**

---

## Chain G — Payout (where two independent chains converge)

This is the clearest literal "AND-gate" in the whole system — it's the one place two separately-triggered chains have to *both* complete before a third thing can happen.

1. A `ProfessionalFeeSplit` row becomes payout-eligible only when **both**:
   - the related `Invoice.status = PAID` (from **Chain B**), **and**
   - the related `PhysicalCase.status = CLOSED` (from **Chain F**, step 5)

   Either condition alone does nothing — a closed case with an unpaid invoice sits idle, and a paid invoice for a case still open sits idle too, by design.

2. Weekly BullMQ batch job aggregates every eligible fee split + facility fee
   → creates `Payout` + `PayoutLineItem` rows → triggers Monnify Bulk Transfer call

3. Monnify processes the transfer
   → webhook updates `Payout.status`
   → triggers Notification to each payee: **Consulting Oncologist, State Clinical Director, National Clinical Director, State/National Director of Nursing Services** — **not** Quality Assurance Officer, since that role has no `PayoutRole` entry (the gap flagged in the stakeholder matrix resurfaces here as a literal missing notification target, not just a missing enum value).

---

## Chain H — Misconduct → Account Lock

1. A `MisconductFlag` gets created — either **[UNSPECIFIED — auto-generated from `Conversation` content via some trigger_reason logic, or always manually raised by a State Clinical Director?]** the doc has a `trigger_reason` text field but doesn't specify what actually creates the row.
   → status `OPEN` → triggers assignment/Notification to reviewers (`reviewer_1_id`/`reviewer_2_id`, presumably State Clinical Directors)

2. Reviewers resolve the flag
   → if warranted, triggers `AccountLock` creation (`lock_type = MISCONDUCT`) against the flagged user (typically a Virtual MO)
   → triggers Notification to the **locked user**

3. **Any subsequent login attempt** by the locked user
   → triggers rejection at the auth layer (if the early-wire option from `F1.2` was taken) → triggers `AuditLog(ACCESS_DENIED)`

---

## Chain I — Transfer Request

1. **[UNSPECIFIED — which role initiates this?]** Regional Admin is the most likely candidate given their operational-navigation role elsewhere, but it's not explicitly stated.
   → creates `TransferRequest(PENDING)` → triggers Notification to **[UNSPECIFIED — who approves? `approved_by` is a `User` FK with no role constraint documented]**

2. Approval
   → `Patient.facility_id` updated, `routed_at` stamped
   → triggers Notification to **Patient** + staff at both the origin and destination facility

---

## Chain J — Inventory (P1)

1. `CountdownCase → CLEARED` (Chain C, step 4) → **[assumption, not explicitly stated in source docs]** likely triggers a `PURCHASE`-type `InventoryMovement` for the drugs the treatment plan requires
2. `PhysicalCase` closure (Chain F, step 5) → triggers an `ADMINISTERED` movement referencing the case
3. Weekly (Thursday) reconciliation job → creates `ReconciliationRecord` → if `variance != 0` → triggers Notification to **[UNSPECIFIED — Regional Admin, or facility-level nursing leadership?]** → requires `resolved_by`/`resolved_at` before the record closes out

---

## Quick reference — who triggers whom

| Actor's action | Directly triggers (role) |
|---|---|
| Patient registers | Admin (only if duplicate match) |
| Patient tops up wallet | — (system only) |
| Regional Admin generates invoice | Patient (payment prompt) |
| Patient pays invoice | Regional Admin, assigned clinician |
| CountdownCase reaches day 7 | Patient (labs prompt) |
| Patient/Nurse uploads labs | Quality Assurance Officer |
| QA sets stage-1 recommendation | State Clinical Director |
| Director sets final decision | Patient, Oncologist/Nurse (if approved) |
| Patient messages MO | Virtual Medical Officer |
| MO completes triage | (unlocks MO's own next action — prescribe) |
| MO/Oncologist prescribes | Patient |
| Onsite Nurse opens physical case | (unlocks Nurse's own next actions) |
| Onsite Nurse submits Appointment Card | Quality Assurance Officer |
| QA closes physical case | Onsite Nurse, Patient, **Payout system (Chain G)** |
| Payout batch completes | Oncologist, State/National Clinical Director, State/National Director of Nursing Services |
| Misconduct flag resolved | Locked user (MO), reviewers |
| Transfer approved | Patient, both facilities' staff |

---

## Six real gaps this exercise surfaced (not just documentation nits)

These are places where the trigger chain has a sender but no confirmed receiver — which in a system this notification-dependent is a functional gap, not a cosmetic one:

1. **Escalated `CountdownCase`** (Chain C, step 5) — no defined recipient.
2. **Breached MO SLA** (Chain D, step 2) — no defined escalation target.
3. **MO-triage-beyond-scope** (Chain D, step 4) — no defined escalation path to Oncologist/Director.
4. **Scribe's corrected transcript** (Chain E, step 4) — no defined downstream consumer or sign-off step.
5. **`TransferRequest` approver role** (Chain I) — `approved_by` has no role constraint documented.
6. **Duplicate-patient-match review** (Chain A) — no defined reviewer for FR-01's match hold.

Want these folded into the sprint files as amendments (same treatment as `F3.0`/`F4.2` earlier), or held until you've had a chance to run them past Valerie — a few of these (especially #2 and #3) are clinical-safety-adjacent enough that I'd lean toward getting her read before locking in an assumed answer.
