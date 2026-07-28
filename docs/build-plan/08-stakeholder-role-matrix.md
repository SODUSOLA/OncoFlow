# OncoFlow — Stakeholder & Role Capability Matrix

Every role in the system, patient through scribe, with what each can do, view, edit, and is explicitly barred from. Compiled from PRD v3.0, DB Architecture v2.0's `RoleName`/RBAC design, the Dev Plan's per-role dashboards, and the sprint build files.

**One flag before the list, so it isn't buried:** roles #7 and #9 below (Quality Assurance Officer, State Director of Nursing Services) are where the **unresolved PRD-v3-vs-DB-Architecture role-split question** lives — PRD v3 treats them as one combined role with exclusive case-open/close authority; the DB Architecture and every build file since treat them as two separate roles. Everything below documents the **current working model** (two separate roles, per DB Architecture v2.0/ADR-0012) — read those two entries as provisional until that question is settled with Valerie, not as settled fact.

Twelve roles total (eleven authenticated + one unauthenticated public visitor).

---

## 1. Public / Unauthenticated Visitor

**Who:** anyone hitting the public website before registering or logging in.

**Can do:** browse Home, About, Services; start Patient Registration.

**Can view:** public marketing content only.

**Can edit:** nothing — no session, no stored state.

**Cannot:** access any dashboard, any patient data, or any authenticated route.

---

## 2. Patient

**Who:** the person receiving care. May or may not have a linked `User` login (`Patient.user_id` is nullable — a patient record can exist before the person ever creates an account).

**Can do:**
- Register (subject to FR-01's duplicate check — name + DOB + facility match blocks a second active ID for the same person).
- Fund their `Wallet` via Monnify Reserved Account top-up.
- Pay an `Invoice` from wallet balance.
- Join a video consult (Daily.co room) as an `Appointment` participant.
- Message their care team within an open `Conversation` (side-effect reports routed to the Virtual Medical Officer inbox; general inquiries to Admin).
- Upload lab result files when requested.
- Enroll in / manage their own `Subscription`.

**Can view:**
- Their own `PatientTimeline` — triage outcomes, prescriptions, and other clinical events, rendered as **structured entries**, never as raw chat transcripts or raw file dumps (explicit product decision — see Sprint 3 build notes).
- Their own `Invoice`, `Payment`, `WalletTransaction` history.
- Their own upcoming/past `Appointment`s.

**Can edit:** their own profile/contact fields (not clinical fields), their own `PatientAddress`/`EmergencyContact` records.

**Cannot:**
- View any other patient's data, under any circumstance.
- View or edit `ClinicalDecision` internals (QA/Director recommendation/reasoning) — they see the *outcome* on their timeline, not the deliberation.
- Set their own `Invoice` amount — every invoice is system-computed from `Tariff`, never patient- or admin-entered.
- See other roles' internal notes (`ClinicalNote`, `AppointmentCard` staff notes).

---

## 3. Regional Admin

**Who:** operational/administrative staff managing the patient-facing business side at a facility/region.

**Can do:**
- Generate invoices — **dropdown-only** (patient + classification + facility selection; the system computes the amount from `Tariff`). No free-text amount entry exists in this role's UI, by design (FR-51).
- Monitor the 7-Day Countdown board across their patients.
- Initiate/manage `TransferRequest`s between facilities (P1).
- View patient contact info for coordination purposes, **with click-to-call** intended (masked number, never rendered client-side — flagged earlier as a feature present in the PRD but not yet built into the schema/plan).

**Can view:**
- `CountdownCase` status and day-count for patients in their scope.
- `LabResult` — but **scoped to `{file_id, test_date, possible_duplicate}` only.** No clinical interpretation, no diagnostic content. This is enforced by a dedicated serializer, not a shared one with a "hide some fields" flag — an Admin should never be one bug away from seeing clinical detail.
- `Invoice`/`Payment` status for patients in scope.

**Can edit:** `Invoice` (draft state only, via the dropdown generator), `TransferRequest` records they initiate.

**Cannot:**
- View clinical decision content, prescriptions' clinical rationale, triage checklist answers, or clinical notes.
- View a patient's `phone` field directly in any API response — masked/click-to-call only, never raw (FR-04, enforced at the serializer layer for every staff-facing response, not just Admin's).
- Open, review, or close a `PhysicalCase`.
- Touch payout/disbursement records.

---

## 4. Virtual Medical Officer (MO)

**Who:** first-line clinician handling patient-reported side effects via chat/messaging, not video.

**Can do:**
- Work the Side-Effect Chat Inbox (`Conversation` where `conversation_type = MO_SIDE_EFFECT`), with a **2-minute SLA** on first response (FR-31).
- Complete a `TriageChecklist` (one per `Conversation`, enforced 1:1 — a second attempt on the same conversation is rejected).
- Prescribe (`Prescription`) — but **only after** completing the triage checklist for that interaction. This is the MO-required gate: `triage_checklist_id` is enforced NOT NULL specifically when the prescribing user is an MO, checked at the service layer, not just a UI nudge.

**Can view:** the patient's relevant conversation history and triage-relevant context; their own prescribing history.

**Can edit:** their own `TriageChecklist`/`Prescription` entries while in draft/active state.

**Cannot:**
- Prescribe without a completed triage checklist for that patient interaction (the one hard gate that defines this role).
- Open a video consult room as the primary clinician (that's Consulting Oncologist territory) — though they may be looped in via `AppointmentParticipant` if the workflow calls for it.
- Access `PhysicalCase`, `AppointmentCard`, or payout data.

---

## 5. Consulting Oncologist

**Who:** the clinician conducting video consultations and directing treatment.

**Can do:**
- Run video consults (Daily.co room provisioning tied to their `Appointment`s), with live captions and an embedded transcript view.
- Prescribe **in-call**, with **no triage-checklist requirement** (unlike the MO — this is the one explicit role-conditional branch in the prescription gate).
- Author `TreatmentPlan`s (`oncologist_id`), co-signed by a State Clinical Director.
- View/manage their Appointment Grid/Calendar.

**Can view:** full clinical history for their assigned patients — `MedicalRecord`, `ClinicalNote`, prior `LabResult`s, `Transcript`s of their own consults.

**Can edit:** their own `Prescription`s, `ClinicalNote`s, `TreatmentPlan` drafts.

**Cannot:**
- Set `final_decision` on a `ClinicalDecision` — that authority sits with the State Clinical Director (stage 2), gated on Quality Assurance Officer's stage-1 recommendation existing first.
- Close a `PhysicalCase` or review an `AppointmentCard` — nursing/QA territory.
- Access payout/disbursement records or another oncologist's patient panel without explicit assignment.

---

## 6. State Clinical Director

**Who:** senior clinical authority at the state level; second (final) stage of the clinical decision workflow.

**Can do:**
- Set `final_decision` on a `ClinicalDecision` — **only after** `qa_decided_at` is set by a Quality Assurance Officer (hard sequencing rule, rejected at the service layer if attempted out of order). This is the ADR-0012 two-stage routing — note this **contradicts PRD v3's FR-13**, which describes the Director deciding directly with no QA stage; the DB Architecture's two-stage model is the current build target, per the earlier cross-reference.
- Work the Vetting Queue (whatever review/approval items route to this role).
- Lock/unlock an MO's account (`AccountLock`, `lock_type = MISCONDUCT` or admin-initiated).
- Serve as a reviewer on `MisconductFlag` records (`reviewer_1_id`/`reviewer_2_id`).
- Co-sign `TreatmentPlan`s (`clinical_director_id`).

**Can view:** `AuditLog` entries — **scoped to their own state**, not platform-wide (this is an explicit PRD restriction: audit visibility is "Clinical/Nursing Directors within their state scope" only).

**Can edit:** `ClinicalDecision.final_decision`/`final_reason` (stage 2 only), `MisconductFlag` review outcomes, `AccountLock` records they create.

**Cannot:**
- Skip QA's stage-1 recommendation — the gate is enforced regardless of how senior the Director is.
- Open/close a `PhysicalCase` directly.
- View audit activity outside their own state's scope.

---

## 7. Quality Assurance Officer *(role split — see flag at top)*

**Who:** per the current DB Architecture/build-file model, the operational gatekeeper for both the clinical-decision pipeline and physical case close-out. Per PRD v3, this role doesn't exist separately — it's merged into "State Nursing Director / QA."

**Can do (current build model):**
- Set the **stage-1 recommendation** on a `ClinicalDecision` (`qa_recommendation`, `qa_reason`, `qa_decided_at`) — this must exist before a State Clinical Director can act on stage 2.
- **Close a `PhysicalCase`** (`closed_by`, exclusive to this role) — but **only for cases at their own facility.** This is RBAC-enforced via a facility-scoped `requirePermission()` variant, not a plain role check: a QA officer at Facility A cannot close a case at Facility B, full stop.
- Review the doctor's note (`ClinicalNote`) and the `AppointmentCard`, stamping `doctor_note_reviewed_at` and `appointment_card_reviewed_at` respectively — **both** are required before a case can close, and this applies to every `PhysicalCase`, chemo-linked or standalone.
- Work the Active Physical Case Board and Case Review Panel.

**Can view:** full clinical content for cases in their review queue, `LabResult`s (unscoped — unlike Admin, QA sees the clinical fields).

**Can edit:** `ClinicalDecision` stage-1 fields, `PhysicalCase.closed_by`/`closed_at` (their own facility only), `AppointmentCard.reviewed_by`/`reviewed_at`.

**Cannot:**
- Close a case outside their own facility.
- Set `final_decision` (stage 2) — that's the Director's exclusive action.
- Receive a payout via `ProfessionalFeeSplit` — **this role does not appear in the `PayoutRole` enum at all.** Whatever this role's compensation model is, it isn't the same professional-fee-split mechanism as the clinical/nursing director roles — worth confirming with Valerie, since it's a real gap between "does the job" and "how they're paid" as currently modeled.

---

## 8. Onsite Nursing Officer

**Who:** the nurse physically present with the patient for infusions/physical consults.

**Can do:**
- **Open a `PhysicalCase`** (`opened_by`, exclusive to this role).
- Fill out the `AppointmentCard` (`filled_by`) — including its fixed checklist items (`AppointmentCardChecklistItem`, seeded from a known list, not user-configurable).
- Run the Secure Upload Wizard — the FR-40 five-step verification sequence (`FileVerificationStep`) for any document/lab upload they handle on the patient's behalf.
- View their Next-Day Schedule.

**Can view:** the patients on their schedule, the `AppointmentCard`s they've filled, upload status for files they've submitted.

**Can edit:** `AppointmentCard` while in `DRAFT`/`SUBMITTED` state (before QA review locks it), `PhysicalCase` fields prior to closure.

**Cannot:**
- Close a `PhysicalCase` — QA-exclusive, even for the same case they opened.
- Review/approve their own `AppointmentCard` — that's the reviewing QA officer's job, not self-certified.
- Access billing, payout, or another facility's schedule.

---

## 9. State Director of Nursing Services *(role split — see flag at top; also internally inconsistent)*

**Who:** per the `RoleName` enum's own inline comment in the DB Architecture doc, this role exists **"for org/payout completeness... no MVP dashboard for them (ADR-0012)."** The Dev Plan then built a P1 "oversight-only" dashboard for it anyway (lowest priority, explicit candidate to slip) — so even within the current build docs, this role's actual MVP footprint is a little inconsistent. Flagging that too, not just the PRD conflict.

**Can do (as currently planned, P1):** view oversight-level reporting across nursing operations in their state — read-only in spirit, per "oversight-only" framing.

**Can view:** aggregate/summary nursing-operations data for their state (exact scope not detailed beyond "oversight-only" in the source docs — worth nailing down if this role's dashboard actually gets built).

**Can edit:** nothing confirmed in the current build docs — this role has no write-path feature specified anywhere in the sprint files.

**Receives:** a `ProfessionalFeeSplit` payout role (it IS in the `PayoutRole` enum) — so unlike Quality Assurance Officer, this role is compensated through the standard mechanism, at a state-level share.

**Cannot:** open/close `PhysicalCase`, review `AppointmentCard`s, or act on `ClinicalDecision` — none of the operational gatekeeping authority PRD v3 assigns to "State Nursing Director/QA" is implemented for this specific role in the current build model. (That authority sits with Quality Assurance Officer instead, per #7.)

---

## 10. National Clinical Director

**Who:** top of the clinical hierarchy, org-chart and payout role only.

**Can do:** nothing operational — **no MVP dashboard exists for this role** (same enum comment as #9: "org/payout completeness" only).

**Receives:** a `ProfessionalFeeSplit` payout role, likely activated specifically for the `is_out_of_state` escalation case (exact trigger condition should be confirmed against the PRD's remuneration split rules before building the split-percentage logic).

**Cannot:** anything operational in the MVP — this role is a payout destination, not a system user with a dashboard, as currently scoped.

---

## 11. National Director of Nursing Services

**Who:** top of the nursing hierarchy, org-chart and payout role only. Same footprint as #10, on the nursing side.

**Can do:** nothing operational — no MVP dashboard.

**Receives:** a `ProfessionalFeeSplit` payout role, likely the out-of-state/escalation case equivalent to #10 on the nursing hierarchy.

**Cannot:** anything operational in the MVP.

---

## 12. Super Admin

**Who:** platform-level system administrator — the only role with authority over the identity/RBAC system itself.

**Can do:**
- Manage `User`, `Role`, `Permission`, `UserRole`, `RolePermission` — the only role that can grant/revoke another user's role assignments.
- (P1) Dashboard "polish" work is scoped, but the underlying user/role management endpoints are P1-scheduled in Sprint 1 (`F1.10`) as the functional core of this role.

**Can view:** presumably platform-wide visibility, including `AuditLog` without the state-scoping restriction that applies to Clinical/Nursing Directors — **this isn't explicitly confirmed anywhere in the source docs**, it's the reasonable assumption for a "super" admin role, but worth stating out loud and confirming rather than silently assuming, since audit-log visibility is exactly the kind of thing that shouldn't be guessed at.

**Can edit:** any `Role`/`Permission`/`UserRole`/`RolePermission` row; potentially any user's `status` (activate/deactivate/lock).

**Cannot:** nothing is explicitly walled off from this role in the source docs — which itself is worth a second look. A platform with zero documented limits on its highest-privilege role is usually an oversight, not a deliberate design choice; confirm whether Super Admin should, for instance, be able to view clinical content directly, or whether it should stay purely an identity/access-management role with no clinical visibility at all.

---

## 13. Scribe

**Who:** the transcription/minutes role for virtual consultation meetings — this is who you were asking about specifically. P1, scheduled in Sprint 3 (`F3.11`), tied to the Messaging module.

**Can do:**
- Correct/edit the auto-generated `Transcript` content from a video consult (`Transcript.edited_by`/`edited_at`) — the raw transcription comes from Daily.co's Nova-3 Medical model via webhook, and the Scribe's job is fixing errors, especially oncology-specific terminology the auto-transcription may mangle.
- Work within an SLA/backlog-cap system (per the Sprint 3 note: fields for this were flagged as worth adding "per the Valerie conversation," meaning there's a backlog-size limit intended to prevent one scribe from being buried under an unmanageable transcript queue).

**Can view:** `Transcript`s and their parent `Meeting`/`Appointment` context for consults assigned to their queue.

**Can edit:** `Transcript.content` (corrections only — the underlying speaker/timestamp structure stays intact), their own queue assignment status.

**Cannot:** join the video call as a participant with clinical authority, prescribe, view unrelated patient clinical data outside the transcript context, or act on any clinical/billing/payout entity.

**Open item:** this role's exact fields ("SLA/backlog-cap fields... per the Valerie conversation") are referenced in the Dev Plan but not spelled out in the DB Architecture v2.0 schema — there's no `Scribe`-specific table, and it's unclear whether this is meant to be a `RoleName` value at all (it isn't in the enum list) or an operational designation layered on top of an existing role (e.g. a `User` with a `Participant` entry tagged for transcript-editing purposes). Worth resolving before `F3.11` gets built, since right now "Scribe" has a job description but no confirmed place in the identity model.

---

## Summary table

| # | Role | MVP Dashboard | Opens PhysicalCase | Closes PhysicalCase | Sets Clinical Decision | Gets Payout | Notes |
|---|---|---|---|---|---|---|---|
| 2 | Patient | Yes | — | — | — | — | Own data only |
| 3 | Regional Admin | Yes | — | — | — | — | LabResult scoped to 3 fields only |
| 4 | Virtual MO | Yes | — | — | — | Yes (shift pool) | Triage-before-prescribe gate |
| 5 | Consulting Oncologist | Yes | — | — | In-call prescribe | Yes | No triage gate |
| 6 | State Clinical Director | Yes | — | — | Stage 2 (final) | Yes | Gated on QA stage 1 |
| 7 | Quality Assurance Officer | Yes | — | **Yes (facility-scoped)** | Stage 1 (recommendation) | **Not in PayoutRole** | Role-split question lives here |
| 8 | Onsite Nursing Officer | Yes | **Yes** | — | — | — | Can't review own card |
| 9 | State Dir. of Nursing Svcs | P1 (inconsistent w/ enum comment) | — | — | — | Yes | No confirmed write actions |
| 10 | National Clinical Director | No | — | — | — | Yes (out-of-state) | Payout only |
| 11 | National Dir. of Nursing Svcs | No | — | — | — | Yes (out-of-state) | Payout only |
| 12 | Super Admin | Yes (P1) | — | — | — | — | No documented limits — flagged |
| 13 | Scribe | P1 | — | — | — | Unclear | Not in RoleName enum — flagged |

Want me to fold the two "Open item" flags here (Scribe's identity-model placement, Super Admin's undocumented limits, National-director payout trigger conditions) into the sprint files as amendments, the way `F3.0` and `F4.2` were handled earlier — or hold them until the PRD v3/DB Architecture role-split question is settled, since a few of these may resolve together?
