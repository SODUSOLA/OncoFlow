# Sprint 2 — Billing & Countdown (Mon Aug 3 – Sun Aug 9, 2026)

**Read `00-global-conventions-and-schema-corrections.md` and confirm Sprint 1 (`02-sprint1-*.md`) is fully done before starting anything below.**

**Theme:** money can move, and Admin can see the countdown.

**Demoable outcome:** a patient can fund their wallet and pay an invoice; Admin sees the countdown.

---

## F2.1 — Billing base (P0, Backend)

**Depends on:** F1.3 (`Tariff.facility_id` FK → `Facility`).

**Tables:** `ServiceClassification` `[no soft delete]`, `Tariff`.

**Build sequence:**
1. `ServiceClassificationRepository` — seed the six `ServiceClassificationName` values from v2.0 §4 (`SUBSCRIPTION`, `CONSULTATION`, `DRUG_ADMINISTRATION`, `CHEMOTHERAPY`, `GENERAL_ADMISSION`, `PROCEDURE`), each with its `capped_network_fee_kobo`.
2. `TariffRepository` — seed the Pilot facility's tariff rows (`network_fee_kobo`, `facility_bed_fee_kobo`, `drug_price_kobo` per classification). Enforce the `UNIQUE (facility_id, classification_id)` constraint at the repository layer with a clear error, not just relying on the DB to reject it.

**Definition of Done:**
- Every `ServiceClassificationName` has a seeded row.
- Pilot facility's `Tariff` rows exist for every classification it offers.

---

## F2.2 — Invoice, InvoiceItem, Subscription (P0, Backend)

**Depends on:** F2.1 (`Invoice.classification_id` FK), F1.4 (`Invoice.patient_id` FK).

**Build sequence:**
1. `InvoiceRepository`, `InvoiceItemRepository`, `SubscriptionRepository`.
2. `Invoice` entity: `status` state machine (`DRAFT → SENT → PAID`, with `VOID`/`OVERDUE` as terminal/exception states) as entity methods, not raw status writes from the service layer.
3. **FR-51's zero-manual-input rule:** invoice generation must be dropdown-driven (patient + classification + facility selected from existing records), never free-text amount entry — this constrains the *controller/service* design now, not just the frontend (F2.6) later. The service method that creates an `Invoice` should compute `total_kobo` from `Tariff` lookups, never accept a raw amount from the caller.
4. `InvoiceItem` — remember `[append-only once invoice.status != DRAFT]`: enforce this as a guard in the repository/service (reject writes to `InvoiceItem` for a non-DRAFT invoice), not just a comment.

**Definition of Done:**
- Attempting to create an `Invoice` with a manually-specified `total_kobo` that doesn't match the `Tariff`-computed amount is rejected (test this — it's the concrete enforcement of FR-51).
- Attempting to add an `InvoiceItem` to a `SENT` or `PAID` invoice is rejected.

---

## F2.3 — Monnify integration (P0, Backend)

**Depends on:** F1.4 (`Wallet` must exist to top up), F2.2 (`Payment.invoice_id` FK).

**Tables:** `Payment`, `WalletTransaction` `[append-only]`.

**Build sequence:**
1. Monnify Reserved Account creation flow — one reserved account per patient wallet, for top-up.
2. Webhook handler: verify Monnify's signature, then process the payment event.
3. On confirmed payment: create a `Payment` row (`reference` is the idempotency key — **reject/ignore a webhook replay with a `reference` already recorded**, don't double-credit), then a `WalletTransaction` (`CREDIT`) row, then atomically update `Wallet.balance_kobo`.
4. Invoice payment flow: debiting the wallet against an `Invoice` — `WalletTransaction` (`DEBIT`) linked to the `Payment`, `Invoice.status` transitions to `PAID` via the entity method from F2.2.

**Definition of Done:**
- A webhook replay with the same `reference` does not double-credit the wallet (test this explicitly — Monnify webhooks are not guaranteed exactly-once).
- Wallet balance after a top-up + invoice payment matches the sum of its `WalletTransaction` rows exactly (write a reconciliation test: `balance_kobo == SUM(credits) - SUM(debits)`).

---

## F2.4 — CountdownCase entity + Day 7→0 state machine (P0, Backend)

**Depends on:** F1.4 (`Patient`), F2.2 (`Invoice`, since `CountdownCase.invoice_id` is a nullable 1:1 FK).

**Build sequence:**
1. `CountdownCaseRepository`.
2. `CountdownCase` entity: the day-countdown as an explicit state machine on the entity (`current_day` 7→0, `status` `ACTIVE`/`ESCALATED`/`CLEARED`/`DECLINED`), with each transition (labs prompted → labs uploaded → results sent to QA → payment confirmed) as a named method that also stamps the corresponding timestamp field (`labs_prompted_at`, `labs_uploaded_at`, `results_sent_to_qa_at`, `payment_confirmed_at`).
3. A scheduled job (BullMQ, since Redis/queue infra exists from F0.1) to decrement `current_day` daily and trigger reminders (`reminder_sent_at`) — this is the first BullMQ job in the codebase; establish the job-module pattern here since Sprint 3/4 add several more.
4. Note the v2.0 rename: this field is `results_sent_to_qa_at` (routes to QA first per ADR-0012), not `results_sent_to_director_at` — don't build against an older naming assumption.

**Definition of Done:**
- A `CountdownCase` created at day 7 decrements correctly via the scheduled job over simulated days (test with a mocked clock, not a real 7-day wait).
- Each state transition stamps its timestamp field and only its timestamp field — no transition silently mutates an unrelated field.

---

## F2.5 — Appointment module (P0, Backend)

**Depends on:** F1.4 (`Patient`), F1.3 (`Facility`), F1.1 (`User` — `oncologist_id`).

**Tables:** `Appointment`, `AppointmentParticipant`.

**Build sequence:**
1. `AppointmentRepository`, `AppointmentParticipantRepository`.
2. `Appointment` entity: `status` state machine (`PENDING → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`, with `CANCELLED`/`MISSED` as exception states).
3. `payment_confirmed_at` — this drives the 2PM cutoff rule (FR-03). Implement the cutoff check as a pure function taking a timestamp, testable independent of the scheduler, since the actual cutoff enforcement (rejecting late confirmations) is a business rule worth unit-testing directly.

**Definition of Done:**
- Full status state machine transitions tested, including rejected invalid transitions (e.g. `PENDING → COMPLETED` directly should fail).
- 2PM cutoff rule has a passing/failing unit test on both sides of the boundary.

---

## Frontend — P0

**F2.6 — Regional Admin: 7-Day Countdown view + Invoice Generator.** Depends on F2.4, F2.2. The Invoice Generator UI must be dropdown-only per FR-51 — no free-text amount field should exist in this screen at all, matching the backend constraint from F2.2.

**F2.7 — Patient: Wallet top-up + Invoice payment flow.** Depends on F2.3.

---

## Backend — P1 (can slip)

**F2.8 — TransferRequest** (hospital transfer). Depends on F1.3 (`from_facility_id`/`to_facility_id`, both → `Facility`), F1.4 (`Patient`). Not on the critical patient path — slips cleanly if Sprint 2 runs long.

---

## Do Not Start

- Nothing referencing `PhysicalCase`, `ClinicalDecision`, `LabResult`, `Conversation`, `Message`, or `Meeting`/`Transcript` — those are Sprint 3 territory.
- Do not build the Monnify **Bulk Transfer** (payout) flow yet — F2.3 is collection only (Reserved Account top-up). Disbursement (`Payout`, `PayoutLineItem`) is Sprint 4 (F4.5) and depends on `PhysicalCase` closure, which doesn't exist yet.
