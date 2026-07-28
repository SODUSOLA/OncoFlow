# OncoFlow — Development Plan (July 22 – August 21, 2026)

**Scope:** Implementation phase, from today through the end of the third week of August. The final week+ of August (Aug 24–31) is deliberately **not** covered here — reserved for hardening, UAT, and Pilot handoff per the PRD's Release Plan, not implementation.

**Built against:** `OncoFlow_Technology_Stack_Final.md` and ADR-0001–0015. If any of those change mid-build, this plan needs a matching update — don't silently drift from what's documented.

**Reality check up front:** this is 9 backend domain modules, 8 role-scoped frontend dashboards plus the public website, and 5 external integrations, solo, in 4.5 weeks. That is genuinely tight. This plan is sequenced so the **highest-value, patient-critical path is complete and demoable first**, with lower-priority roles and polish explicitly flagged as likely to slip past Aug 21 into the reserved final week — better to know that now than discover it August 19th. P0 = must exist and work by Aug 21. P1 = build if time allows; if it slips, it slips into the reserved week, not into scope-cutting panic.

**Methodology:** vertical slices, not "all backend then all frontend." Each sprint pairs a backend module with the frontend screens that depend on it, so there's something real to demo every week — not four silent weeks of backend work with nothing to show.

---

## Foundation Sprint — Wed Jul 22 – Sun Jul 26 (this week, partial)

Nothing else can start until this is done. **P0, no exceptions.**

**Infrastructure**
- [ ] Provision 2x Hetzner VPS (app server, database server) — ADR-0013
- [ ] Install Coolify on app server; configure private networking between the two VPS
- [ ] PostgreSQL install + PgBouncer transaction-pooling config on DB server
- [ ] Redis install on app server
- [ ] Cloudflare: DNS pointed at both servers, R2 bucket created, Pages project stub created — ADR-0013, ADR-0014
- [ ] Domain registered (.com + .com.ng)

**Backend scaffold**
- [ ] Repo structure per ADR-0006 (`src/modules/{auth,patient,appointment,clinical,messaging,billing,inventory,notification,audit}`)
- [ ] Drizzle schema file (`schema.ts`) generated from Database Architecture v2.0 — ADR-0015
- [ ] First migration run against the DB server
- [ ] `dependency-cruiser` module-boundary rule wired into CI — ADR-0006
- [ ] RBAC middleware skeleton (`requirePermission()`) + Redis permission cache — ADR-0007
- [ ] CI pipeline: lint, typecheck, module-boundary check, RBAC-coverage check (route-without-permission-check fails build) — ADR-0007

**Frontend scaffold**
- [ ] React + TS + Tailwind + shadcn/ui project init
- [ ] Role-based code-splitting/routing shell (empty dashboards for all 8 roles + public site)
- [ ] Deployed to Cloudflare Pages, confirm it's actually live and reachable

---

## Sprint 1 — Mon Jul 27 – Sun Aug 2

**Theme:** identity and the first real patient exists in the system.

**Backend — P0**
- Identity module: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`, MFA
- `AccountLock`, `MisconductFlag` (data model only — full workflow later)
- Patient module: `Patient`, `PatientAddress`, `EmergencyContact`, `Wallet` creation on registration
- `PatientTimeline` write-hook pattern established (every module writes here — build this pattern once, correctly, now)
- Facility module: `Facility`, `Department` (seed data for Pilot's one hospital)

**Frontend — P0**
- Public website: Home, About, Services, Register
- Login (role-based routing) + MFA challenge screen
- Patient registration flow
- Patient dashboard shell (Timeline view, empty states)

**Backend — P1**
- Super Admin's user/role management screens' backing endpoints (can slip)

---

## Sprint 2 — Mon Aug 3 – Sun Aug 9

**Theme:** money can move, and Admin can see the countdown.

**Backend — P0**
- Billing module: `ServiceClassification`, `Tariff` (seed data), `Invoice`, `InvoiceItem`, `Subscription`
- Monnify integration: Reserved Account creation (wallet top-up), webhook handling, `Payment`/`WalletTransaction` ledger — ADR-0010
- `CountdownCase` entity + Day 7→0 state machine
- Appointment module: `Appointment`, `AppointmentParticipant`

**Frontend — P0**
- Regional Admin dashboard: 7-Day Countdown view, Invoice Generator (dropdown-only, per FR-51's zero-manual-input rule)
- Patient: Wallet top-up flow, Invoice payment flow

**Backend — P1**
- `TransferRequest` (hospital transfer) — can slip, not on the critical patient path

---

## Sprint 3 — Mon Aug 10 – Sun Aug 16

**Theme:** the clinical core — this is the heaviest, highest-risk sprint.

**Backend — P0**
- Clinical module: `TriageChecklist`, `Prescription` (with the MO-required gate), `LabRequest`, `LabResult` (with `file_hash` duplicate detection — ADR-0012), `ClinicalDecision` two-stage QA→Director flow (ADR-0012)
- Messaging module: `Conversation`, `Message`, `Participant`, SLA tracking (`sla_deadline`, `sla_breached`)
- Video: Daily.co room provisioning tied to `Appointment`, `Meeting`/`Transcript` entities, transcription webhook → `Transcript` storage

**Frontend — P0**
- Virtual MO dashboard: Side-Effect Chat Inbox, Triage Checklist form
- Consulting Oncologist dashboard: Appointment Grid/Calendar, Video Consult Room (embedded Daily.co, live captions, prescription action in-call)
- Patient: triage/prescription appearing as structured Timeline entries (not chat, not upload — per the Valerie clarification)

**Backend — P1**
- Scribe role + SLA/backlog-cap fields (per the Valerie conversation) — worth building this sprint if Sprint 3's core lands on schedule; realistic candidate to slip

---

## Sprint 4 — Mon Aug 17 – Fri Aug 21 (end of third week of August)

**Theme:** physical case close-out and the money actually pays out.

**Backend — P0**
- `PhysicalCase` (open by Nurse, close by QA — ADR-0012), `AppointmentCard`, the doctor-note + card review-gate (ADR-0011)
- `ProfessionalFeeSplit`, `PayeeBankAccount`, `Payout`, `PayoutLineItem`, Monnify Bulk Transfer integration, weekly payout batch job — ADR-0010
- Virus-scan job (ClamAV via BullMQ) + R2 upload pipeline — ADR-0014
- Audit domain: `AuditLog` writes wired into every state-changing action across all modules built so far (retrofit, not new — should have been incremental, but this is the checkpoint to confirm nothing was missed)

**Frontend — P0**
- Onsite Nursing Officer dashboard: Next-Day Schedule, Appointment Card form, Secure Upload Wizard
- Quality Assurance Officer dashboard: Active Physical Case Board, Case Review Panel (doctor's note + Appointment Card), Close Case action

**Frontend/Backend — P1, realistic candidates to slip into the reserved final week**
- State Clinical Director dashboard (Vetting Queue, MO Lock/Unlock, Misconduct Review)
- State Director of Nursing Services dashboard (oversight-only, lowest priority per ADR-0012's own framing)
- Inventory module in full (Drug, Inventory, InventoryMovement, ReconciliationRecord) + Admin's inventory screens
- Super Admin dashboard polish
- Unified Calendar View (FR-24) across all roles — nice-to-have layered on top of role-specific views that already exist
- Full Notification module (SMS/email trigger wiring across every workflow — some of this happens incrementally per sprint, but comprehensive coverage is a checkpoint item)

---

## What's explicitly out of this plan

- **Testing/UAT/Pilot hardening** — reserved for Aug 24–31, not detailed here
- **Multilingual anything** — pending Valerie's clarification (interface-only vs. clinical), not scoped into any sprint above
- **Video vendor hands-on quality spike** (Daily.co + Nova-3 Medical, real oncology terms) — should happen **before Sprint 3**, ideally this week or early next, since Sprint 3's Video Consult Room work depends on it being confirmed, not assumed

## Dependencies to watch

- Sprint 2's Monnify integration blocks Sprint 4's payout work — if Monnify onboarding (account activation, IP whitelisting per earlier setup notes) is slow on their end, that's an external risk to this timeline, not something more engineering hours fixes
- Sprint 3's Daily.co integration blocks the Oncologist's full Video Consult Room — the earlier-recommended hands-on transcription test should happen now, not during Sprint 3 itself

---

## Weekly Deliverable Summary (for sharing)

| Sprint | Dates | Demoable by end of sprint |
|---|---|---|
| Foundation | Jul 22–26 | Infrastructure live, empty app deployed, CI green |
| 1 | Jul 27–Aug 2 | A patient can register and log in; Timeline exists |
| 2 | Aug 3–9 | A patient can fund their wallet and pay an invoice; Admin sees the countdown |
| 3 | Aug 10–16 | Full MO triage → prescription flow; Oncologist video consult with live captions and transcript |
| 4 | Aug 17–21 | Nurse opens a case, QA reviews and closes it, payout batch runs |

By Aug 21: the full patient journey (register → pay → triage/consult → physical case → payout) works end to end for the P0 roles. State Clinical Director, State Director of Nursing Services, full Inventory, and dashboard polish are the realistic carry-over into the reserved final week — flagging now so it's a known trade-off, not a surprise.
