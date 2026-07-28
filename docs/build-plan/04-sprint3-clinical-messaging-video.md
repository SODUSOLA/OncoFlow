# Sprint 3 — Clinical Core (Mon Aug 10 – Sun Aug 16, 2026)

**Read `00-global-conventions-and-schema-corrections.md` and confirm Sprint 2 (`03-sprint2-*.md`) is fully done before starting anything below.**

**Theme:** the clinical core — this is the heaviest, highest-risk sprint in the whole build.

**Demoable outcome:** full MO triage → prescription flow; Oncologist video consult with live captions and transcript.

**Before this sprint starts:** the video-vendor hands-on quality spike (Daily.co + Nova-3 Medical, real oncology terminology) should already have happened — ideally the week before Sprint 3, per the Dev Plan's own risk note. If it hasn't happened yet, do it before F3.7, not during it.

---

## F3.0 — [PLAN AMENDMENT] Minimal Documents module (P0, Backend)

**Why this exists:** the original Dev Plan schedules the full virus-scan + R2 pipeline for Sprint 4 (F4.6), but `LabResult.file_id` is a required FK and `LabResult` is Sprint 3 P0 — the plan as written would have Sprint 3 blocked on a Sprint 4 feature. This amendment pulls forward the minimum needed: a working `File` entity and a direct R2 write path, with virus scanning layered on top in Sprint 4.

**Depends on:** F0.3 (`File` table already exists from the full schema), F0.1 (R2 bucket).

**Build sequence:**
1. `FileRepository`.
2. `File` entity: `virus_scan_status` starts and stays `PENDING` this sprint (no scanner wired yet — that's F4.6's job) — do not let anything downstream (e.g. `LabResult` review) gate on `virus_scan_status = CLEAN` yet, since nothing sets it to `CLEAN` until Sprint 4. If a business rule genuinely requires a clean scan before clinical review, flag that explicitly as a known gap for this sprint rather than building a check that can never pass.
3. Direct upload → R2 write path: compute `file_hash` on upload (needed by `LabResult`'s duplicate-detection logic, F3.5), store the R2 object key in `storage_key`.

**Definition of Done:**
- A file can be uploaded, written to R2, and its `File` row created with a correct `file_hash`.
- `virus_scan_status` is confirmed `PENDING` and nothing in this sprint's code treats it as a gate.

---

## F3.1 — Messaging module (P0, Backend)

**Depends on:** F1.4 (`Patient`), F1.1 (`User`).

**Tables:** `Conversation`, `Participant`, `Message` `[append-only]`.

**Build sequence:**
1. `ConversationRepository`, `ParticipantRepository`, `MessageRepository`.
2. `Conversation` entity: SLA tracking — `sla_deadline` set on creation (per `conversation_type`: `ADMIN_INQUIRY` vs `MO_SIDE_EFFECT` likely have different SLA windows, confirm the exact windows against the PRD/FRs before hardcoding), `first_response_at` stamped on the first non-system `Message`, `sla_breached` flipped by a scheduled job checking `now() > sla_deadline AND first_response_at IS NULL`.
3. Index `(assigned_to, sla_deadline)` from v2.0 §6 powers the SLA dashboard — confirm this index exists from F0.3, don't re-add it here.

**Definition of Done:**
- `first_response_at` stamps correctly on the first real message, not on `SYSTEM`-type messages.
- SLA breach job correctly flips `sla_breached` for a conversation whose deadline has passed with no response (test with simulated time, not a real wait).

---

## F3.2 — TriageChecklist (P0, Backend)

**Depends on:** F3.1 (`Conversation` — `TriageChecklist.conversation_id` is a required `UNIQUE (1:1)` FK).

**Table:** `TriageChecklist` `[append-only]`.

**Build sequence:**
1. `TriageChecklistRepository`.
2. Enforce the 1:1 uniqueness at the service layer with a clear error (attempting a second `TriageChecklist` for the same `Conversation` should fail cleanly, not throw a raw DB constraint error to the client).
3. `completed_by` must resolve to a Virtual Medical Officer — check role via RBAC, not just "any authenticated user."

**Definition of Done:**
- Second triage attempt on the same conversation is rejected with a clear domain-level error.
- Only a Virtual Medical Officer role can complete a triage checklist (test with a non-MO user, expect 403).

---

## F3.3 — Prescription (P0, Backend)

**Depends on:** F3.2 (`TriageChecklist`), F1.4 (`Patient`), F1.1 (`User` — `doctor_id`), F2.5 (`Appointment`, optional FK).

**Build sequence:**
1. `PrescriptionRepository`.
2. **The MO-required gate:** `triage_checklist_id` is nullable in the schema but must be enforced NOT NULL at the service layer specifically **when the prescribing user is a Virtual Medical Officer** — a Consulting Oncologist prescribing during a video consult (F3.9) does not require a prior triage checklist. Build this as an explicit role-conditional check in the service, with a named method (e.g. `assertTriageRequiredIfMO()`) rather than an inline if-statement buried in `create()`.

**Definition of Done:**
- An MO attempting to prescribe without a `triage_checklist_id` is rejected.
- A Consulting Oncologist prescribing without one succeeds.
- Both paths have explicit tests — this gate is easy to silently regress later if it's not covered.

---

## F3.4 — LabRequest (P0, Backend)

**Depends on:** F1.4 (`Patient`), F1.1 (`User` — `requested_by`).

**Build sequence:**
1. `LabRequestRepository`. Straightforward CRUD, `status` (`PENDING`/`UPLOADED`/`REVIEWED`) as an entity-level state machine for consistency with the rest of the codebase, even though it's simple.

**Definition of Done:**
- Standard CRUD + status transitions tested.

---

## F3.5 — LabResult (P0, Backend)

**Depends on:** F3.4 (`LabRequest`), F3.0 (`File` — `LabResult.file_id` FK).

**Build sequence:**
1. `LabResultRepository`.
2. **Duplicate detection:** on upload, query existing `LabResult` rows for the same `patient_id` where `file_hash` matches; if found, set `possible_duplicate = true`. Index `LabResult (file_hash, (patient_id, test_date))` from v2.0 §6 exists from F0.3 — confirm the query actually uses it (check the query plan, don't assume).
3. `test_date` is the date printed on the report itself — distinct from the upload timestamp (`created_at`). Do not conflate these; the frontend upload form must capture `test_date` as a separate explicit field, not derive it from "now."
4. **Admin scoping rule:** anywhere an Admin role reads `LabResult`, the response must be scoped to `{file_id, test_date, possible_duplicate}` only — never clinical interpretation fields. Build this as a distinct serializer/DTO for the Admin read path, not a shared serializer with a "hide some fields" flag that's easy to misconfigure.

**Definition of Done:**
- Uploading a second file with an identical hash for the same patient sets `possible_duplicate = true` on the new row.
- An Admin-role API response for `LabResult` is confirmed, via test, to contain only the three scoped fields — nothing else, even if new clinical fields are added to the table later.

---

## F3.6 — ClinicalDecision, two-stage QA→Director (P0, Backend)

**Depends on:** F3.5 (`LabResult`, `UNIQUE (1:1)` FK), F1.1 (`User` — `qa_decided_by`, `director_id`).

**Build sequence:**
1. `ClinicalDecisionRepository`.
2. **Hard sequencing rule from v2.0:** the service layer **must reject** any attempt to set `final_decision` while `qa_decided_at IS NULL`. This is the single most important invariant in this feature — implement it as a guard clause at the top of the service method that sets `final_decision`, and write a test that specifically tries to skip stage 1 and confirms rejection.
3. Stage 1 (`qa_recommendation`, `qa_reason`, `qa_decided_by`, `qa_decided_at`) is set by a Quality Assurance Officer. Stage 2 (`final_decision`, `final_reason`, `director_id`, `director_decided_at`) is set by a State Clinical Director, and only after stage 1 is complete.
4. This is the entity that ADR-0012's routing change lives on — `CountdownCase.results_sent_to_qa_at` (F2.4) is what triggers this workflow starting, so confirm that linkage is wired: when lab results are ready, the countdown case's timestamp gets stamped **and** a `ClinicalDecision` row gets created for QA to act on.

**Definition of Done:**
- Setting `final_decision` before `qa_decided_at` is set fails, with a test proving it.
- Full happy path (QA recommends → Director decides) tested end to end.
- `CountdownCase → ClinicalDecision` linkage confirmed: a countdown case reaching the "results sent to QA" state actually produces a `ClinicalDecision` row for a QA officer to act on, not just a timestamp with nothing downstream.

---

## F3.7 — Video (Daily.co) (P0, Backend)

**Depends on:** F2.5 (`Appointment`, `Meeting.appointment_id` `UNIQUE (1:1)` FK).

**Tables:** `Meeting`, `Transcript`.

**Build sequence:**
1. `MeetingRepository`, `TranscriptRepository`.
2. Daily.co room provisioning tied to `Appointment` creation/confirmation (decide the trigger point — likely on `CONFIRMED` status, confirm against the actual consult-scheduling flow).
3. `Meeting.status` (`SCHEDULED`/`IN_PROGRESS`/`ENDED`) synced from Daily.co webhooks.
4. Transcription webhook → `Transcript` row creation (`speaker`, `content`), with `edited_by`/`edited_at` supporting post-hoc correction (this is where the earlier-recommended Nova-3 Medical terminology spike matters — verify real oncology terms transcribe acceptably before trusting this pipeline for clinical use).

**Definition of Done:**
- A test appointment can have a Daily.co room provisioned, joined, and a transcript captured end to end (even a short test call).
- Webhook signature verification confirmed on both Daily.co's meeting-status and transcription webhooks.

---

## Frontend — P0

**F3.8 — Virtual MO dashboard** (Side-Effect Chat Inbox, Triage Checklist form). Depends on F3.1, F3.2.

**F3.9 — Consulting Oncologist dashboard** (Appointment Grid/Calendar, Video Consult Room — embedded Daily.co, live captions, in-call prescription action). Depends on F2.5, F3.7, F3.3.

**F3.10 — Patient: triage/prescription as structured Timeline entries** — per the Valerie clarification, these render as structured entries, **not** as chat messages and **not** as raw file uploads. Depends on F1.5 (`PatientTimeline` pattern), F3.2, F3.3. Confirm the `event_type` values for triage/prescription were added to the F1.5 lookup/enum — don't invent new ad hoc strings here.

---

## Backend — P1 (can slip)

**F3.11 — Scribe role + SLA/backlog-cap fields.** Depends on F3.1. Realistic candidate to slip if Sprint 3's core (F3.0–F3.7) lands on schedule but leaves no slack.

---

## Do Not Start

- Nothing referencing `PhysicalCase`, `AppointmentCard`, `MedicalRecord`/`ClinicalNote`, `Payout`, or the full virus-scan pipeline — those are Sprint 4.
- Do not gate any Sprint 3 feature on `File.virus_scan_status = CLEAN` — nothing sets that value until F4.6.
- Do not start Sprint 4's `PhysicalCase.opened_by`/`closed_by` facility-scoping logic here even though it touches RBAC middleware you already built in F0.5 — it belongs with F4.1, once `PhysicalCase` itself exists.
