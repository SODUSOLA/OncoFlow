# Sprint 0 — Foundation (Wed Jul 22 – Sun Jul 26, 2026)

**Read `00-global-conventions-and-schema-corrections.md` first.**

**Theme:** nothing else can start until this is done. Every feature in every later sprint file has this entire sprint as an implicit dependency.

**Demoable outcome:** infrastructure live, empty app deployed, CI green.

**Priority:** P0, no exceptions — there is no P1 in this sprint.

---

## F0.1 — Infra provisioning

**Depends on:** nothing (first feature in the whole build).

**Build sequence:**
1. Provision 2x Hetzner VPS: one app server, one database server (ADR-0013).
2. Set up private networking between the two VPS so the DB server is not reachable from the public internet.
3. Install Coolify on the app server.
4. Install PostgreSQL on the DB server; configure PgBouncer in **transaction-pooling mode** (this is why Drizzle was chosen over Prisma — confirm PgBouncer transaction mode compatibility now, don't assume it).
5. Install Redis on the app server.
6. Cloudflare: point DNS at both servers, create the R2 bucket (ADR-0014), create the Pages project stub.
7. Register the domain (.com + .com.ng).

**Definition of Done:**
- SSH access confirmed to both VPS.
- PgBouncer accepts a transaction-mode connection from the app server.
- Redis reachable from the app server.
- R2 bucket exists and a test object can be written/read via the Cloudflare API.
- DNS resolves for the registered domain(s).

---

## F0.2 — Backend repo scaffold + module boundaries

**Depends on:** F0.1 (needs somewhere to eventually deploy; can be scaffolded locally in parallel but CI wiring in F0.6 needs F0.1's infra reachable).

**Build sequence:**
1. Initialize the Node.js + TypeScript repo.
2. Create `src/modules/{auth,patient,appointment,clinical,messaging,billing,inventory,notification,audit}` per ADR-0006 — empty module folders, each with the OOP subfolder structure from the global conventions file (`schema.ts`, `entities/`, `repository.ts`, `service.ts`, `controller.ts`, `routes.ts`, `index.ts`).
3. Install and configure `dependency-cruiser` with a rule set that blocks any import reaching past a module's `index.ts`.

**Definition of Done:**
- `dependency-cruiser` fails the build on a deliberately-introduced cross-module internal import (test this — don't just assume the config is correct).
- Every module folder exists with the standard subfolder skeleton, even if empty.

---

## F0.3 — Full Drizzle schema.ts, all domains

**Depends on:** F0.2.

This is the single most important feature in the Foundation sprint: **every table from every domain across all five sprints is generated here, now** — not incrementally per sprint. Later sprints write the services/routes/business logic against tables that already exist from this step.

**Build sequence:**
1. Generate `schema.ts` per module domain, translating `OncoFlow_Database_Architecture_v2.md` §3 directly, **with the two corrections from the global conventions file already applied**:
   - `File` table gets `storage_key` as an R2 object key (drop the Cloudinary comment), and does **not** get a `verification_sequence` JSONB column — instead create the `FileVerificationStep` table.
   - `AppointmentCard` does **not** get a `necessities_checklist` JSONB column — instead create the `AppointmentCardChecklistItem` table.
2. Translate every enum in v2.0 §4 as Postgres enums (or Drizzle's enum helper) — all of them, even ones only used in Sprint 4 (e.g. `PayoutStatus`, `ReconciliationStatus`) — since this is a one-time full-schema generation step.
3. Write every FK relationship from v2.0 §5 (the Full Foreign Key Tree).
4. Write every index from v2.0 §6 (Key Indexes) as part of the table definitions, plus the two new indexes implied by the normalized tables: `FileVerificationStep (file_id, step_number) UNIQUE` and `AppointmentCardChecklistItem (appointment_card_id, item_name) UNIQUE`.
5. Cross-cutting fields (`id`, `created_at`, `updated_at`, `isDeleted`/`deletedAt`) applied per the exceptions marked `[no soft delete]` / `[append-only]` in v2.0.

**Definition of Done:**
- `schema.ts` compiles with no TypeScript errors.
- Every table in v2.0 §3 exists (cross-check against the doc table-by-table — this is a checklist task, not a "looks about right" task).
- Zero JSON/JSONB columns anywhere in the generated schema.
- `drizzle-kit` can generate a migration from this schema with no warnings.

---

## F0.4 — First migration run

**Depends on:** F0.3.

**Build sequence:**
1. Generate the initial migration via `drizzle-kit`.
2. Run it against the DB server provisioned in F0.1.
3. Verify every table, enum, index, and FK constraint exists in Postgres exactly as designed (query `information_schema` or use `psql \d+` per table — don't just trust "migration succeeded" exit code 0).

**Definition of Done:**
- All tables present in Postgres.
- All partial indexes (e.g. `User.email WHERE isDeleted = false`) confirmed present via `\d+`, not just assumed from the migration file.
- Rolling the migration back and forward again is clean (test this once, now, before any other module writes data against this schema).

---

## F0.5 — RBAC middleware skeleton + Redis permission cache

**Depends on:** F0.3 (needs `Permission`/`Role`/`RolePermission`/`UserRole` tables to exist), F0.1 (needs Redis).

**Build sequence:**
1. Build `requirePermission(resource, action)` Express middleware per ADR-0007.
2. Build the facility-scoped variant described in the global conventions file §1.4 — it must accept an optional comparator function that checks the requesting user's `facility_id` against the resource's `facility_id`, for later use by QA-officer-scoped routes (Sprint 4).
3. Wire a Redis-backed permission cache: on login/session-refresh, resolve the user's full permission set (via `UserRole` → `RolePermission` → `Permission`) once and cache it, rather than re-querying Postgres on every request.
4. Cache invalidation: when a `UserRole` or `RolePermission` row changes, invalidate the affected user(s)' cached permission set.

**Definition of Done:**
- A route protected by `requirePermission()` returns 403 for a user lacking the permission, 200 for a user with it — test both paths.
- Permission cache hit avoids a Postgres round-trip (verify via query logging, not assumption).
- Cache invalidation confirmed: revoking a role's permission and hitting the route again (without re-login) reflects the change within the cache TTL you set.

---

## F0.6 — CI pipeline

**Depends on:** F0.2 (module-boundary rule), F0.5 (RBAC-coverage check needs `requirePermission()` to exist so CI can detect its *absence*).

**Build sequence:**
1. Lint + typecheck steps.
2. Module-boundary check (`dependency-cruiser`) as a CI gate, not just a local script.
3. RBAC-coverage check: a CI step that scans `routes.ts` files across all modules and fails the build if any route handler is registered without a `requirePermission()` (or its facility-scoped variant) call wrapping it.

**Definition of Done:**
- A PR introducing a route with no permission check fails CI — test this deliberately with a throwaway branch.
- A PR introducing a cross-module internal import fails CI.
- Green CI on the current (near-empty) main branch.

---

## F0.7 — Frontend scaffold

**Depends on:** F0.1 (Cloudflare Pages project must exist to deploy to).

**Build sequence:**
1. Init React + TypeScript + Tailwind + shadcn/ui project.
2. Build the role-based code-splitting/routing shell: one route group per role (Patient, Regional Admin, Virtual Medical Officer, Consulting Oncologist, State Clinical Director, Quality Assurance Officer, Onsite Nursing Officer, State Director of Nursing Services, Super Admin) plus the public site — all empty/placeholder dashboards at this stage.
3. Deploy to Cloudflare Pages.

**Definition of Done:**
- Every role's placeholder dashboard route is reachable and renders something (even just a labeled empty state) at a live Cloudflare Pages URL.
- Confirmed reachable from outside the Hetzner/Coolify network (this is a distinct, separately-deployed frontend, not served from the app VPS).

---

## Do Not Start (nothing in this sprint depends on later work, but flagging for downstream readers)

Nothing in Sprint 1 (`02-sprint1-*.md`) should begin until **F0.4 has run successfully** — every subsequent sprint's first feature assumes the full schema already exists in Postgres. Do not let "we'll just add the User table now and the rest later" happen — F0.3/F0.4 is explicitly whole-schema-at-once by design, precisely to prevent later sprints from hitting missing-table errors on FKs that reference tables scheduled for a different sprint (e.g. `LabResult.file_id → File`, where `File` is fully schema'd here in Foundation even though its upload pipeline isn't built until Sprint 3/4).
