# Sprint 1-2 Loophole Report

## Summary
Cross-referenced the current Sprint 1-2 implementation against the build plan and found a set of breakpoints that would leak into later sprints if left alone. The main themes are: missing request authorization, money serialized as `Number`, non-atomic patient registration and payment writes, and a few domain contracts that exist in code but are not actually enforced.

## Findings
- Route protection is not wired at the router boundary yet, so protected paths can still be mounted without a permission gate.
- Money still leaves the domain as `Number(...)` in several API responses, which breaks the BigInt contract and will corrupt later reconciliation work.
- Patient registration writes `Patient`, `Wallet`, and timeline records independently, so a mid-flight failure can leave partial state behind.
- Billing has two payment paths: one route only flips invoice status, while the real ledger write lives in a separate service.
- Webhook processing is not yet atomic enough to guarantee idempotency under retries.
- Countdown and appointment timestamp fields exist but were not consistently used by the service layer.
- Timeline event names are still treated as free text instead of a single contract.
- Some staff-facing patient responses still leak `phone`.

## Fix Plan
1. Add request-context and RBAC wiring so protected routes resolve a user and enforce permissions consistently.
2. Seed the route permissions required by Sprint 1-2 and allow super-admin bypass for operational testing.
3. Convert all money serialization to string output and keep BigInt internally.
4. Make patient registration atomic across patient, wallet, and timeline writes.
5. Collapse invoice payment into the wallet-ledger payment path and make webhook processing transactional/idempotent.
6. Tighten countdown and appointment state transitions so timestamp fields are actually stamped and persisted.
7. Centralize timeline event names into one exported contract.
8. Remove patient phone leakage from staff-facing responses.

## Verification Targets
- Route tests still pass with a seeded test super-admin context.
- Wallet balances and invoice totals no longer round through `Number`.
- A duplicate Monnify reference remains a no-op on replay.
- Patient registration either fully succeeds or fully rolls back.
- Countdown job writes reminder timestamps when it decrements active cases.
- Patient response payloads no longer include `phone` unless explicitly intended by a future scoped endpoint.

## Assumptions
- The current router and service shapes stay intact; this pass is a stability fix, not a feature rewrite.
- Route permissions are seeded broadly enough for the current Sprint 1-2 surface, with super-admin bypass used only as a safety net for tests and ops.
