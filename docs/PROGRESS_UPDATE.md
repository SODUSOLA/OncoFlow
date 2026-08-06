# OncoFlow — Progress Update

_Last updated: 2026-08-01_

This is a snapshot of what's actually built and working in the OncoFlow monorepo right now — not a plan, a status report. For the original sprint-by-sprint build plan see `docs/build-plan/`.

---

## 1. The three apps

| App | Stack | Purpose | Dev port |
|---|---|---|---|
| `apps/api` | Express + Drizzle ORM + Postgres | Single backend for everything below | 3000 |
| `apps/web` | Next.js (App Router) | Public marketing site **+** patient-facing PWA | 5173 |
| `apps/dashboard` | Vite + React | Staff/admin console (all 13 non-patient roles) | 5174 |

Local infra runs in Docker: Postgres, PgBouncer, Redis, plus an `infra-app` container. Start all three dev servers via `.claude/launch.json` configs (`oncoflow-api`, `oncoflow-web`, `oncoflow-dashboard`).

---

## 2. Backend (`apps/api`)

### Modules
`auth`, `patient`, `facility`, `clinical`, `appointment`, `billing`, `messaging`, `documents`, `notification`, `inquiry` (new), `inventory`, `audit`.

### Auth & RBAC
- Session-cookie auth, MFA challenge support, account lockout, misconduct flags.
- 14 roles: `PATIENT` + 13 staff roles (Regional Admin, Virtual Medical Officer, four Consulting specialties, State/National Clinical Director, Quality Assurance Officer, Onsite Nursing Officer, State/National Director of Nursing Services, Scribe, Super Admin).
- Every patient-facing endpoint uses an **ownership-or-permission** pattern (`callerOwnsPatient` check, falling back to a real RBAC grant) — a patient never needs a blanket permission to see their own data.
- `REGIONAL_ADMIN` is the only staff role with real, seeded permission grants so far: `patient`, `invoice`, `countdownCase`, `labResult`, `publicInquiry`. Every other staff role currently only works via the dev-only `SUPER_ADMIN` bypass — a real RBAC pass for the remaining 12 roles is still open work.

### What's real and working end-to-end
- **Registration → approval flow**: a visitor registers (`POST /auth/register`), lands in a `patient_registration_request` queue, and a Regional Admin reviews/approves it from the dashboard, which issues the Unique Patient ID and creates the real `patient` row.
- **Wallet & billing**: invoices with itemized line items (network/facility/professional fee, drug cost), pay-from-wallet flow, and a real `wallet_transaction` ledger (CREDIT/DEBIT) now exposed via `GET /wallet/transactions`.
- **Messaging**: patient ↔ staff conversations (`ADMIN_INQUIRY` / `MO_SIDE_EFFECT`), SLA deadlines, first-response tracking, and now genuine **WhatsApp-style delivery status** — messages transition `SENT → DELIVERED → READ` based on real fetch events (list load = delivered, thread open = read), not just cosmetics.
- **Public inquiry chat** (new): a completely separate, unauthenticated flow for anonymous website visitors — `POST /public-inquiries` issues a bearer token (only its hash is stored server-side), visitor and staff both read/post through token- or session-gated endpoints, and staff can link an inquiry to an existing patient once identified.
- **Clinical**: lab requests/results, 7-day pre-treatment countdown cases, triage checklists, prescriptions, clinical decisions.
- **Appointments**: booking with the fixed weekly-structure rule (Mon/Wed/Fri = virtual + chemo, Tue/Thu = physical + procedure), calendar view.
- **Video/meetings**: Daily.co room provisioning, webhook-driven status sync, transcript capture, and a two-stage Scribe correction → consultant sign-off workflow.
- **Sessions**: `GET /auth/sessions` + revoke, used by the patient app's Settings page.

### Test coverage
Full `vitest` suite is green — 246+ tests passing. The only known failures are two pre-existing tests that need real R2/S3 credentials (`documents.test.ts`), unrelated to anything built this session.

---

## 3. Patient app (`apps/web`, the `(patient)` route group)

Full screen set, built to match a provided design reference (navy/gold brand, Inter/Jakarta fonts, flattened cards, floating pill bottom nav):

- **Dashboard** — time-of-day greeting, wallet balance card (masked/reveal toggle), Transaction History + Add Money shortcuts, active 7-day countdown card (real data, day-granularity only — no fabricated live clock), "Next Event" card with a genuine live countdown to the next appointment, Care Journey Timeline, Next Appointments (with a calendar "View All"), walkthrough-video placeholder.
- **Wallet** — merged invoice list + payment flow, insufficient-balance / payment-failed / transaction-verified states, real line-item breakdowns.
- **Transaction History** — real CREDIT/DEBIT ledger, grouped by month.
- **Add Money** — visual parity with the reference design, but every option is disabled with a "Coming soon" badge (no payment gateway exists, so no fake account number is shown).
- **Records** — lab request upload flow, result history.
- **Chat/Messages** — real conversations, WhatsApp-style ticks, image/voice attachment upload (upload works; inline preview is a labeled "Coming soon" chip since there's no file-download endpoint yet).
- **Video Consultation** — waiting-room state machine tied to real appointment/meeting data.
- **Profile / Settings** — editable contact fields, active-session list with revoke, sign-out.
- **Notifications** — real (currently empty — nothing in the system writes notification rows yet).
- **Appointments** — month calendar with marked dates + list.

Top bar: transparent, unread-count bell, a persistent "Help" shortcut that jumps straight into (or creates) the patient's side-effect-report conversation.

---

## 4. Public marketing site (`apps/web`, `(marketing)` route group)

Existing pages (Home, Solutions, Features, About, Resources, Contact) plus a **new floating chat widget** (fixed bottom-right, persists across page navigation): anonymous visitors can start a chat with just a name + email/phone, no account required. Token persisted in `localStorage` to resume the thread; polls for staff replies while open, and does a lightweight background check for an unread-dot even when closed.

---

## 5. Staff dashboard (`apps/dashboard`)

- **Super Admin** view: patient search/profile/timeline/lab-results/messages/video panels.
- **Regional Admin** view — the most built-out staff role:
  - **Registrations** tab: review pending self-registrations, approve + issue Unique Patient ID.
  - **7-Day Countdown** tab: live table of active countdown cases.
  - **Invoices** tab + a quick invoice generator.
  - **Inquiries** tab (new): the admin side of the public chat widget — reply to any visitor inquiry, search-and-link it to an existing registered patient, or close it.
- Messaging panel (used by Super Admin today) also shows real WhatsApp-style ticks now.

---

## 6. Database / seed data

Cleanup + reseed script produces realistic Nigerian demo data:
- **5 facilities** (Lagos, Ibadan, Abuja, Kano, Benin City).
- **One login account per stakeholder role** (14 accounts, password `DemoPass123!`).
- **5+ patients** with real linked login accounts (password `PatientPass123!`), addresses, emergency contacts, wallets, and timeline events.

---

## 7. Explicitly NOT built yet (by design, not oversight)

These are marked "Coming soon" / disabled in the UI rather than faked, because there's no real backend for them:
- Payment gateway integration (wallet top-up, "Add Money" bank transfer/USSD/card options).
- Biometric login (WebAuthn), MFA self-enrollment, saved payment methods.
- Chat attachment preview/playback (upload path is real; there's no file-download endpoint).
- A populated Notification Center (table + read endpoint exist; nothing writes to it yet).
- Real per-role RBAC grants for the 12 staff roles other than Regional Admin.

---

## 8. Known rough edges

- `apps/dashboard` has **no ESLint config** at all — it's been typechecked but not linted all session.
- Two `documents.test.ts` tests need real R2 credentials to pass locally (pre-existing, unrelated to recent work).
- `apps/web` and `apps/dashboard` share session cookies in local dev (same `localhost` host, different ports) — logging into one silently overwrites the other's session in the same browser.

---

## 9. How to log in locally

**Patient app** — `http://localhost:5173/login`, password `PatientPass123!` for all patients (e.g. `adebayo.ogunlesi@example.com`).

**Staff dashboard** — `http://localhost:5174/login`, password `DemoPass123!` for all staff (e.g. `admin@oncoflow.dev` for Super Admin, `funmilayo.bankole@oncoflow.dev` for Regional Admin).
