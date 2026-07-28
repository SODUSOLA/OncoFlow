# Sprint 1 — Identity & Patient (Mon Jul 27 – Sun Aug 2, 2026)

**Read `00-global-conventions-and-schema-corrections.md` and confirm `01-foundation-sprint.md` is fully done (F0.1–F0.7, especially the migration in F0.4) before starting anything below.**

**Theme:** identity and the first real patient exists in the system.

**Demoable outcome:** a patient can register and log in; Timeline exists.

---

## F1.1 — Identity module (P0, Backend)

**Depends on:** F0.3 (schema exists), F0.4 (migration run), F0.5 (RBAC skeleton exists to protect these routes).

**Tables (already exist from F0.3 — this feature builds the service/repository/route layer over them):** `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`.

**Build sequence:**
1. `UserRepository`, `RoleRepository`, `PermissionRepository`, `SessionRepository` — CRUD over the above tables.
2. `User` entity class: password hashing on create, `status` transitions (`ACTIVE`/`INACTIVE`/`LOCKED`/`SUSPENDED`) as methods, not raw field writes.
3. Seed the eleven `RoleName` values from v2.0 §4 as `Role` rows (data migration/seed script, not app code).
4. Auth service: register, login (issues `Session`), logout (revokes `Session`), MFA enrollment + challenge flow (`mfa_enabled` on `User`, verification on `Session.mfa_verified`).
5. Routes, each behind `requirePermission()` where appropriate (registration/login are public; session-management routes are not).

**RBAC permissions to seed:** `auth.login` (public), `user.read`, `user.update` (self-scoped), plus placeholders for every other module's permissions you'll seed as those modules land — decide now whether permission seeding is centralized (one seed file) or per-module; centralized is recommended so RolePermission mapping stays auditable in one place.

**Definition of Done:**
- A user can register, log in, receive a session, and log out.
- MFA challenge blocks session completion until verified, when `mfa_enabled = true`.
- Password hashes never appear in any API response payload (write a test asserting this).

---

## F1.2 — AccountLock, MisconductFlag — data model only (P0, Backend)

**Depends on:** F1.1 (`User` must exist; `locked_by`/`flagged_user_id`/reviewer FKs point at `User`).

**Build sequence:**
1. `AccountLockRepository`, `MisconductFlagRepository` — basic CRUD, no workflow logic yet (the full State Clinical Director review workflow is a Sprint 4 P1 item, F4.11).
2. `AccountLock` entity: `lock_type` (`24H_ADMIN` | `MISCONDUCT`) as a typed field, `locked_until` nullable for the 24h-admin case.
3. Do **not** wire the actual lock-enforcement check into the login flow yet unless F1.1's login service already has a hook point for it — if it does, wire a simple "reject login if an active AccountLock exists for this user" check now, since it's cheap and prevents a security gap; if it's extra scope, note it as deferred to Sprint 4 explicitly rather than silently skipping.

**Definition of Done:**
- Both tables have working repositories.
- A manually-inserted `AccountLock` row (via repository, in a test) blocks login if you chose to wire the check now; otherwise this is explicitly flagged as deferred in your own tracking, not silently dropped.

---

## F1.3 — Facility module (P0, Backend)

**Depends on:** F0.4 (migration run) — otherwise independent of Identity, can be built in parallel with F1.1/F1.2.

**Tables:** `Facility`, `Department`.

**Build sequence:**
1. `FacilityRepository`, `DepartmentRepository`.
2. Seed data: the Pilot's one hospital, as a `Facility` row with its `Department` rows.

**Definition of Done:**
- Pilot facility + departments exist in the DB, queryable via the repository layer.

---

## F1.4 — Patient module (P0, Backend)

**Depends on:** F1.1 (`Patient.user_id` optional FK → `User`), F1.3 (`Patient.facility_id` FK → `Facility`, required).

**Tables:** `Patient`, `PatientAddress`, `EmergencyContact`, `Wallet`.

**Build sequence:**
1. `PatientRepository`, `PatientAddressRepository`, `EmergencyContactRepository`, `WalletRepository`.
2. `Patient` entity: on creation, generate `unique_patient_id` (human-readable, distinct from the UUID `id` — confirm the format convention with Valerie if not already specified in the PRD before hardcoding a pattern).
3. **Registration transaction:** creating a `Patient` must atomically create its `Wallet` row (`balance_kobo = 0`) in the same DB transaction — a `Patient` should never exist without a `Wallet`, given the `UNIQUE (1:1)` constraint. Wrap this in a single Drizzle transaction, not two sequential calls that could partially fail.
4. `phone` field: enforce at the serializer/controller layer that it is stripped from any staff-facing API response (PRD FR-04) — write this as a response-shaping rule in the controller, not something each future caller has to remember.

**Definition of Done:**
- Registering a patient creates exactly one `Patient` row and exactly one `Wallet` row, atomically (test a forced failure mid-transaction and confirm neither row persists).
- `phone` is confirmed absent from a staff-role API response in a test, present in a patient-self or admin-with-explicit-permission response only if that's the intended scope — confirm scope with product before finalizing.

---

## F1.5 — PatientTimeline write-hook pattern (P0, Backend)

**Depends on:** F1.4 (`Patient` must exist).

This is explicitly called out in the Dev Plan as "build this pattern once, correctly, now" — every future module (clinical, billing, appointments, messaging) writes to `PatientTimeline` going forward, so getting the pattern wrong here compounds across every later sprint.

**Table:** `PatientTimeline` `[append-only]`.

**Build sequence:**
1. Design a single, reusable `TimelineWriter` (or similar) service/interface that any module can call: `recordTimelineEvent(patientId, eventType, referenceId)`. Since `reference_id` is a polymorphic pointer (no FK constraint, by design per v2.0), document in code exactly which `event_type` strings map to which source table — a lookup/enum, not free-text scattered across call sites.
2. This should live in a place every module can import without violating the module-boundary rule (§ODC in global conventions) — likely a shared/`core` module, or the `patient` module's public `index.ts` export, decided once and used consistently.
3. No business logic beyond "write the row" belongs here — this is a dumb, reliable append, not a place for conditional logic.

**Definition of Done:**
- A test event write from at least one other module stub (even a fake call) confirms the interface works before Sprint 2/3 modules start depending on it for real.
- `event_type` values are defined in one place (enum or constant map), not string-literal'd ad hoc at each call site.

---

## Frontend — P0

**F1.6 — Public website** (Home, About, Services, Register). Depends on F0.7.

**F1.7 — Login (role-based routing) + MFA challenge screen.** Depends on F1.1, F0.7.

**F1.8 — Patient registration flow.** Depends on F1.4, F1.6.

**F1.9 — Patient dashboard shell (Timeline view, empty states).** Depends on F1.5, F1.7. The Timeline view here should render real (if sparse) `PatientTimeline` rows once F1.5 is live — not mock data, since the pattern exists specifically to be exercised end-to-end this sprint.

---

## Backend — P1 (can slip)

**F1.10 — Super Admin's user/role management endpoints.** Depends on F1.1. If this slips, it slips into the reserved final week of August — don't let it block Sprint 2's start.

---

## Do Not Start

- Nothing referencing `CountdownCase`, `Invoice`, `Appointment`, `Conversation`, or any table outside Identity/Patient/Facility — those are Sprint 2/3 territory, even if a stub FK exists in the schema from F0.3.
- Do not wire real Monnify/payment logic against `Wallet.balance_kobo` yet — this sprint only creates the wallet at zero balance; funding it is Sprint 2 (F2.3).
