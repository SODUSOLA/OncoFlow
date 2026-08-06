# OncoFlow — Monorepo Structure (frontend + backend, one folder)

This changes how `F0.2` (backend scaffold) and `F0.7` (frontend scaffold) get built — not the modular-monolith decision itself, just where it physically lives. The backend stays exactly as designed: one deployable Express service with nine internally-isolated modules. What changes is that it now sits *beside* the frontend in one repo instead of being described in isolation, which means the module-boundary enforcement needs a second, outer tier: the existing rule stops the `clinical` module from reaching into `billing`'s internals; a new rule stops the **frontend** from reaching into the **backend's** internals the same way.

**Package manager: recommend pnpm workspaces** — native monorepo support, efficient node_modules deduplication across `apps/api` and `apps/web`, and the TypeScript-project-references pattern below works cleanly with it. npm workspaces works too if you'd rather not add tooling — the structure below is the same either way, only the root config file differs (`pnpm-workspace.yaml` vs. the `workspaces` array in root `package.json`).

---

## Directory tree

```
oncoflow/
├── apps/
│   ├── api/                              # Backend — Express modular monolith (unchanged design)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── schema.ts
│   │   │   │   │   ├── entities/
│   │   │   │   │   ├── repository.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   ├── controller.ts
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   └── index.ts          # only file other modules may import from
│   │   │   │   ├── patient/
│   │   │   │   ├── facility/
│   │   │   │   ├── appointment/
│   │   │   │   ├── clinical/
│   │   │   │   ├── messaging/
│   │   │   │   ├── billing/
│   │   │   │   ├── inventory/
│   │   │   │   ├── documents/
│   │   │   │   ├── notification/
│   │   │   │   └── audit/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts             # barrel — 06-drizzle-schema.md
│   │   │   │   ├── enums.ts
│   │   │   │   └── migrations/
│   │   │   ├── events/                   # domain event bus — F0.8 (new, from 11-ddd-...md §6)
│   │   │   │   ├── bus.ts
│   │   │   │   └── event-types.ts
│   │   │   ├── jobs/                     # BullMQ workers
│   │   │   │   ├── countdown-decrement.job.ts
│   │   │   │   ├── payout-batch.job.ts
│   │   │   │   ├── payout-eligibility.saga.ts
│   │   │   │   ├── virus-scan.job.ts
│   │   │   │   └── reconciliation.job.ts
│   │   │   ├── middleware/
│   │   │   │   └── require-permission.ts # + facility-scoped variant, F0.5
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── test/
│   │   ├── drizzle.config.ts
│   │   ├── .dependency-cruiser.js        # inner rule: module-to-module boundaries within api
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                              # Frontend — React + Tailwind + shadcn/ui
│       ├── src/
│       │   ├── routes/
│       │   │   ├── public/               # Home, About, Services, Register
│       │   │   ├── patient/
│       │   │   ├── regional-admin/
│       │   │   ├── virtual-mo/
│       │   │   ├── consulting-oncologist/
│       │   │   ├── state-clinical-director/
│       │   │   ├── quality-assurance-officer/
│       │   │   ├── onsite-nursing-officer/
│       │   │   ├── state-director-nursing/
│       │   │   └── super-admin/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── api-client/               # typed HTTP client against apps/api, built on packages/shared-types
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       ├── package.json
│       ├── tailwind.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── shared-types/                     # the ONLY thing api and web are allowed to share
│   │   ├── src/
│   │   │   ├── enums.ts                  # plain string-union mirrors of db/enums.ts — no DB import, ever
│   │   │   ├── dto/                      # request/response shapes, one file per backend module
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── config/                           # shared eslint / tsconfig / prettier base
│       ├── eslint-preset.js
│       ├── tsconfig.base.json
│       └── package.json
│
├── docs/
│   └── build-plan/                       # 00 through 11 (+ this file) — OpenCode's required reading
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   └── worker.Dockerfile             # optional separate container for BullMQ workers
│   └── coolify/
│       └── notes.md
│
├── .github/workflows/ (or your CI provider's equivalent)
│   └── ci.yml
├── package.json                          # workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## The rule that makes this actually work: two tiers of boundary enforcement, not one

**Tier 1 (unchanged):** `apps/api/.dependency-cruiser.js` still blocks `modules/clinical/repository.ts` from importing `modules/billing/repository.ts` directly — everything from `00-global-conventions...md` §"Module boundaries" applies exactly as written, just physically inside `apps/api/`.

**Tier 2 (new):** `apps/web` must never import anything from `apps/api/src` directly — not `schema.ts`, not a `service.ts`, nothing. The frontend talks to the backend over HTTP, full stop, the same way it would if they were two separate repos. Two things enforce this:
1. **Structurally** — `apps/web/package.json` never lists `apps/api` as a workspace dependency, so normal module resolution can't find it.
2. **By lint rule anyway** — a relative path import (`../../../api/src/modules/patient/entities/patient`) can still physically reach across the folder boundary even without a package dependency, so add a root-level `dependency-cruiser` (or ESLint `no-restricted-imports`) rule blocking any import path matching `apps/api/*` from anywhere under `apps/web`. Don't rely on "nobody would do that" — the whole point of the Tier 1 rule already in place is that good intentions aren't a boundary, a lint failure is.

**`packages/shared-types` is the one deliberate exception, and it has its own rule:** it may contain plain TypeScript types/enums/interfaces only — **zero runtime dependencies on Drizzle, zero imports from `apps/api`**. If `shared-types` ever imports `drizzle-orm` or a Postgres driver, that dependency ships inside the frontend's bundle the next time `apps/web` builds, which is both a real bundle-size problem and a way for backend-only concerns to leak into client code. Keep the mirroring manual and explicit (the enum values in `packages/shared-types/src/enums.ts` match `apps/api/src/db/enums.ts` because a human keeps them in sync, not because they're the same import) — a build-time codegen step to auto-generate `shared-types` from the Drizzle schema is a reasonable later optimization, but don't reach for it before the manual version has actually become painful.

---

## Deployment mapping

This repo builds to **two separate deployment targets**, matching what was already decided in Foundation Sprint (`F0.1`/`F0.7`) — the monorepo doesn't change *where* things run, just where the source lives:

- `apps/api` → Docker container on the Hetzner app VPS, managed by Coolify, alongside Redis and the BullMQ workers (`infra/docker/api.Dockerfile`, optionally `worker.Dockerfile` if you split the job workers into their own container for independent scaling later).
- `apps/web` → static build, deployed to Cloudflare Pages — same as `F0.7`'s DoD already specified ("a distinct, separately-deployed frontend, not served from the app VPS"). Coolify never touches this one.

CI (`ci.yml`) should run both apps' checks in one pipeline but keep the module-boundary and RBAC-coverage checks (`F0.6`) scoped to `apps/api` only — there's no RBAC-coverage concept on the frontend, and running the backend's `dependency-cruiser` config against the frontend's file tree would just fail confusingly on files it was never meant to look at.

---

## What this changes in the existing sprint files

- **`F0.2`** ("Backend repo scaffold + module boundaries") — the module folder structure is unchanged, it just now lives at `apps/api/src/modules/` instead of the repo root. Add a step: initialize the pnpm workspace root and `packages/shared-types` before scaffolding the module folders, since `apps/api` will need `shared-types` as a dependency from the start.
- **`F0.7`** ("Frontend scaffold") — same content, now explicitly `apps/web`, and its Definition of Done gains one line: confirm the Tier 2 boundary rule (no `apps/api` imports from `apps/web`) is wired into CI, not just assumed.
- **`F0.8`** (the domain event bus, proposed in `11-ddd-security-architecture-blueprint.md` §6) — lives entirely inside `apps/api/src/events/`, no frontend surface.
- **`07-opencode-build-instructions.md`** — add this file to its required-reading list, and note that "module boundaries" now has two tiers, not one, since the instructions currently describe only the inner (module-to-module) rule.

Want me to fold those four amendments into the actual sprint files now, or hold them alongside the still-open items from the last two documents?
