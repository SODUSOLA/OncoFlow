# OncoFlow — Global Build Conventions & Schema Corrections

**Read this file first, in every session, before touching any sprint file.** It applies to all five sprints without exception. Feed it to OpenCode/Cursor/Codex alongside whichever sprint file is active.

**Source of truth:** `OncoFlow_Database_Architecture_v2.md` + `OncoFlow_Development_Plan_Jul22_Aug21.md` + ADR-0001–0015. This file documents the corrections applied on top of those two docs — the sprint files below already build against the corrected version, but if any tool needs to regenerate schema from the raw v2.0 doc, apply these corrections manually first.

---

## 1. Corrections applied on top of DB Architecture v2.0

### 1.1 Storage — R2, not Cloudinary
`File.storage_key`'s inline comment in v2.0 reads `-- Cloudinary reference (ADR-0009)`. This is stale. Storage is **Cloudflare R2** (ADR-0014). Treat `storage_key` as an **R2 object key** — build signed-URL generation and access checks against R2's API, not Cloudinary's.

### 1.2 JSON eliminated — two fields normalized into tables
Per explicit build instruction: don't store JSON where a real table works, since JSONB blobs cost more DB memory/RAM and aren't indexable per-field. Both JSON fields in v2.0 are replaced:

**`File.verification_sequence JSONB`** → new table:
```
FileVerificationStep
id             UUID PK
file_id        UUID FK → File
step_number    Int              -- 1 through 5, FR-40's fixed nurse upload sequence
step_name      String
verified_by    UUID FK → User NULL
verified_at    Timestamp NULL
created_at     Timestamp
-- [append-only], UNIQUE (file_id, step_number)
```

**`AppointmentCard.necessities_checklist JSONB`** → new table (confirmed fixed list, not facility-configurable):
```
AppointmentCardChecklistItem
id                    UUID PK
appointment_card_id   UUID FK → AppointmentCard
item_name             String
is_checked            Boolean DEFAULT false
checked_at            Timestamp NULL
created_at            Timestamp
updated_at            Timestamp
-- UNIQUE (appointment_card_id, item_name)
```
Both `File` and `AppointmentCard` tables drop their JSONB column entirely — do not carry it forward as a legacy/unused field.

**Result: zero JSON/JSONB columns anywhere in the OncoFlow schema.** If any future feature seems to want one, that itself is a signal to stop and design a table instead — don't default to JSON for convenience.

### 1.3 PhysicalCase / AppointmentCard scope — confirmed
`AppointmentCard` + the QA review gate (doctor's note + card, ADR-0011) applies to **every** `PhysicalCase` row, chemo-linked or not. `PhysicalCase.countdown_case_id` stays nullable (a standalone physical consult has no countdown cycle), but that nullability has **no effect** on whether the review gate applies — it always applies. Do not branch review-gate logic on whether `countdown_case_id IS NULL`.

### 1.4 QA officer facility scoping — confirmed, build as a scoping rule
`PhysicalCase.closed_by` and `ClinicalDecision.qa_decided_by` must be restricted, in the RBAC middleware layer (ADR-0007), to a QA officer whose own `facility_id` (via their `Facility`/`Department` assignment) matches the case's `facility_id`. This is **not** a plain role check (`role === QUALITY_ASSURANCE_OFFICER`) — it's role check **plus** facility-match check. Build `requirePermission()` so it can take an optional facility-scoping comparator, not just a bare permission string. Any QA-officer-scoped route (`PhysicalCase.close`, `ClinicalDecision.qa_decide`) must use it.

### 1.5 Two plan amendments — features the Dev Plan didn't explicitly schedule but that block P0 work
These are called out individually in Sprint 3 and Sprint 4 below, but the summary:
- **F3.0** — a minimal `File` entity + direct R2 write path is pulled into Sprint 3, ahead of the full virus-scan pipeline (Sprint 4), because `LabResult.file_id` is a required FK and LabResult is Sprint 3 P0. The full ClamAV/BullMQ virus-scan job stays in Sprint 4 as originally planned (F4.6) and layers on top of F3.0's storage path.
- **F4.2** — `MedicalRecord` + `ClinicalNote` (the "doctor's note" the ADR-0011 review gate references) weren't assigned to any sprint in the original plan. They're scheduled in Sprint 4, immediately before the review-gate feature that depends on them.

---

## 2. Codebase conventions (all sprints)

**Language/runtime:** Node.js + TypeScript, strict mode on. No `any` without a `// TODO` justification comment.

**ORM:** Drizzle. One `schema.ts` per module domain (`src/modules/<domain>/schema.ts`), re-exported from a root `src/db/schema.ts` barrel. Migrations generated via `drizzle-kit`, never hand-edited after generation.

**Module boundaries (ADR-0006):** `src/modules/{auth,patient,appointment,clinical,messaging,billing,inventory,notification,audit}`. A module may only import another module's *public* exports (its `index.ts`), never reach into another module's internals (`schema.ts`, `repository.ts`, etc. directly). `dependency-cruiser` enforces this in CI — a build that violates it should fail, not warn.

**OOP structure, per module:**
```
module/
  schema.ts          -- Drizzle table defs for this domain
  entities/          -- domain classes wrapping raw rows (e.g. class Patient, class CountdownCase)
                          -- encapsulate state transitions as methods, not free functions
                          -- e.g. countdownCase.advanceDay(), physicalCase.close(qaUserId)
  repository.ts       -- class XRepository { findById, create, update... } — only place raw Drizzle queries live
  service.ts           -- class XService — orchestrates repositories + entities, owns business rules
  controller.ts          -- HTTP layer, thin — validates input, calls service, shapes response
  routes.ts                -- Express route wiring, requirePermission() on every route
  index.ts                  -- public exports only
```
Business rules (state-machine transitions, gating logic like "final_decision cannot be set while qa_decided_at IS NULL") belong on the **entity class**, not scattered across services — one method, one invariant, testable in isolation.

**Comments:** every entity class documents the invariant(s) it enforces at the top of the file. Every service method that crosses a domain boundary (e.g., billing service calling into clinical service) gets a one-line comment naming which ADR or FR justifies the coupling.

**Cross-cutting fields:** every table gets `id (UUID, gen_random_uuid())`, `created_at`, `updated_at`, and `isDeleted`/`deletedAt` — **unless** explicitly marked `[no soft delete]` (lookup tables) or `[append-only]` (immutable trails, never updated or deleted, soft or hard) in the sprint file. Don't add soft-delete columns to append-only tables even "just in case."

**Money:** `BigInt`, kobo integers. Never `Number`, never `Decimal`, never float, anywhere money touches disk, memory, or an API payload. Convert to Naira only at the presentation layer (frontend formatting), never in backend logic.

**RBAC:** every route calls `requirePermission(resource, action)` (or the facility-scoped variant per §1.4) — this is what the CI RBAC-coverage check enforces. A route with no permission check should fail CI, not just review.

**Indexing:** build every index listed in each sprint file's "Indexes" section as part of that feature's migration — not as a later optimization pass. Partial indexes (`WHERE isDeleted = false`) are written exactly as specified; don't substitute a full index.

---

## 3. Dependency rule (applies to every sprint file below)

A feature's **Depends On** list is a hard build gate. Do not start a feature's schema, service, or route work until every feature in its Depends On list has passed its own Definition of Done — including the migration being run, not just the code being written. "I'll build it now and wire the FK later" is exactly the failure mode this file exists to prevent.

Each sprint file's final section is an explicit **"Do Not Start"** list — features that reference tables/services not yet built anywhere in this sprint or an earlier one. Treat that list as a guardrail, not a suggestion.
