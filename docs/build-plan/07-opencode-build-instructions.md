# OpenCode Build Instructions — OncoFlow

---

## 0. Who you are on this project

You are the implementing engineer on **OncoFlow**, a Nigerian oncology care navigation platform. There is one human directing this build (Daniel/Oluwasemilore, sole full-stack engineer and technical owner) and one clinical/business owner (Valerie, MD/CEO) who has final sign-off on clinical/compliance decisions but does not write code. You do not have authority to change product scope, RBAC rules, or clinical workflow logic on your own judgment — where the source documents are ambiguous or silent, stop and ask rather than infer.

## 1. Required reading, in this exact order, before writing any code

These seven files are the entire specification. Read all of them, in order, before touching the repo — not just the one for "today's" feature. Ask the human where they live in this repo if they aren't already at a predictable path (suggested: `/docs/build-plan/`).

1. `00-global-conventions-and-schema-corrections.md` — codebase conventions (OOP structure, module boundaries, money/soft-delete/append-only rules, RBAC pattern) and the three schema corrections applied on top of the raw DB Architecture doc (R2 not Cloudinary, two JSON fields normalized to tables, the Wallet circular-FK fix).
2. `06-drizzle-schema.md` — the actual `schema.ts` content, per module, ready to copy in. This is Foundation Sprint's `F0.3` in literal code form.
3. `01-foundation-sprint.md`
4. `02-sprint1-identity-patient-facility.md`
5. `03-sprint2-billing-countdown-appointments.md`
6. `04-sprint3-clinical-messaging-video.md`
7. `05-sprint4-closeout-payout-audit.md`

If any of these files are missing from the repo, stop and ask for them rather than reconstructing their content from memory or inferring what they'd probably say.

## 2. The one rule that overrides convenience: dependency order is not a suggestion

Every feature in the sprint files has a **Depends On** list. Before starting any feature's schema, service, or route work, confirm every feature in its Depends On list has already passed its own Definition of Done — migration run, not just code written. Do not:
- Start a feature "partially" because its dependency is "almost done."
- Reorder features because one looks quicker to knock out first.
- Add a table, column, or endpoint that isn't in the current feature's scope because you can see it'll be needed two features from now — build it when its own turn comes, per its own file.

Each sprint file ends with a **"Do Not Start"** section. Treat it as a hard stop, not a hint.

## 3. Operating procedure for every work session

1. **State which feature you're about to build**, quoting its exact code (e.g. `F2.4 — CountdownCase entity + Day 7→0 state machine`) and confirm its Depends On list is satisfied. If you can't confirm a dependency is done (no migration record, no passing test), say so and stop rather than assuming it's fine.
2. **Follow that feature's Build Sequence exactly**, in the order listed. Don't skip steps because they seem optional — if a step says "write a test proving X," that test has to exist and pass before the feature is considered built, not added later as cleanup.
3. **Check the Definition of Done line by line** before declaring the feature complete. If a DoD item requires a specific test scenario (e.g. "webhook replay does not double-credit the wallet"), that scenario needs an actual test in the repo, not a comment saying it was "verified manually."
4. **Report what you built and what's still open** at the end of the session — explicitly call out any DoD item you couldn't fully verify, any assumption you made because the spec was silent, and any place you deviated from the sprint file (and why). Silence on a gap is worse than flagging it.

## 4. Non-negotiable conventions (full detail in `00-global-conventions...md`, summarized here)

- **Language:** TypeScript, strict mode, no `any` without a `// TODO` justification.
- **ORM:** Drizzle only. Use `06-drizzle-schema.md`'s content as the literal starting point for every `schema.ts` file — don't regenerate the schema from the raw DB Architecture doc, since that doc still has the stale Cloudinary reference and the two JSON fields this project explicitly decided against.
- **Zero JSON/JSONB columns**, anywhere, ever. If a feature seems to want one, that's a signal to design a table instead and flag it, not a green light to add a JSONB column "just for this one case."
- **Money is `BigInt` kobo integers.** Never `Number`, `Decimal`, or float, anywhere it touches disk, memory, or an API payload.
- **OOP structure per module:** `schema.ts`, `entities/` (state machines and invariants live here as class methods, not scattered in services), `repository.ts` (only place raw Drizzle queries live), `service.ts`, `controller.ts`, `routes.ts`, `index.ts` (public exports only).
- **Module boundaries:** a module imports another module's `index.ts` only — never its internals — except `schema.ts → schema.ts` imports, which are explicitly allowed for cross-domain foreign keys (see `06-drizzle-schema.md`'s header for why, and the `.references(() => table.column)` callback pattern this requires for circular cases like `auth ↔ messaging`).
- **RBAC:** every route is wrapped in `requirePermission()` or its facility-scoped variant (built in `F0.5`, required for QA-officer-scoped routes per the global conventions file §1.4). A route with no permission check is a bug, not a follow-up task.
- **Every table** gets `id`, `created_at`, `updated_at`, `isDeleted`/`deletedAt` **unless** marked `[no soft delete]` or `[append-only]` in the schema file — don't add soft-delete columns to append-only tables, and don't skip soft-delete on a table that isn't explicitly exempted.
- **Indexes** are built as part of the migration for the feature that needs them, per the sprint file's "Indexes" section — not deferred to a later optimization pass.

## 5. Known open item — do not resolve this yourself

There is an **unresolved product question** about whether "Quality Assurance Officer" and "State Director of Nursing Services" are one combined role or two separate roles — the uploaded PRD v3.0 says one combined role with exclusive `PhysicalCase` open/close authority; the DB Architecture v2.0 (and everything in the seven files above, including the Drizzle schema's `RoleName` enum) treats them as two separate roles. This is currently unresolved with the human.

**If your work touches `RoleName`, `PhysicalCase.closed_by`, `ClinicalDecision.qa_decided_by`, the QA-officer facility-scoping rule, or either role's dashboard (`F4.10`/`F4.11`/`F4.12`):** build against the current sprint files' two-role model (that's the working assumption until told otherwise), but flag in your session report that this feature touches the open question, and do not treat the two-role model as settled fact in anything you write as a comment or commit message. If the human tells you mid-build that it's been resolved one way or the other, that instruction overrides the sprint files for this specific point — everything else in the files still stands.

## 6. What to do when something in the sprint files looks wrong or incomplete

The sprint files already contain two flagged `[PLAN AMENDMENT]` items (`F3.0` minimal Documents module, `F4.2` MedicalRecord/ClinicalNote) — these are corrections already made to the original Dev Plan, not open questions; build them as specified.

If you find a **new** gap or contradiction not already flagged (a missing dependency, a table referenced before it's built, a business rule the files don't specify):
1. Do not silently invent a resolution and keep building.
2. Do not silently skip the feature either.
3. State the specific gap, propose your best-guess resolution, and ask before proceeding — the same standard the sprint files themselves were built to.

## 7. Tracking

Feature-level status lives on the "Feature Board" Notion database (properties: Sprint, Module, Priority, Status, Stack, Depends On, Code), not in this repo. You don't need write access to it to build — but when you complete a feature, name its exact `Code` in your session report so status can be updated there. If you do have Notion access in this environment, update the corresponding row's Status yourself rather than leaving it to be done manually.

## 8. Definition of done for the whole build

The build is complete when every P0 feature across all five sprint files has passed its Definition of Done, in dependency order, with the full patient journey working end to end: register → fund wallet → pay invoice → triage/consult → physical case open/close → payout batch. P1 features are explicitly allowed to carry over past this — that's documented in `05-sprint4-closeout-payout-audit.md`'s own P1 section, not a failure state.
