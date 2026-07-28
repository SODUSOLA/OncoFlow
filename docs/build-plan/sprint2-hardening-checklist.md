# Sprint 2 Hardening Checklist

## P0 — Blockers
- [ ] Remove trust in `x-user-id`, `x-facility-id`, and `x-session-id` from public requests in `src/lib/request-context.ts`.
- [ ] Make auth cookie-only: set opaque `session_id` in `src/modules/auth/controller.ts` and read it only from `HttpOnly; Secure; SameSite=Strict` cookies.
- [ ] Enforce session state on every request: active, unexpired, unrevoked, MFA-complete, user still active in `src/lib/request-context.ts` and `src/lib/rbac.ts`.
- [ ] Stop returning `sessionId` in login JSON from `src/modules/auth/controller.ts`.
- [ ] Replace `verifyMfa()` stub with a real verified challenge or defer MFA-enabled logins until real MFA exists in `src/modules/auth/service.ts`.
- [ ] Enforce facility-scoped authorization on every patient/invoice/appointment/clinical read-write path using server-derived resource ownership, not request params.
- [ ] Add stable public error codes and remove raw exception text from handlers in `src/app.ts` and module controllers.
- [ ] Add append-only audit events for login, logout, access denied, PHI reads, writes, and exports; use `src/modules/audit/schema.ts` plus a new audit service/middleware.
- [ ] Add transaction-safe idempotency and row locking for payment/webhook handling in `src/modules/billing/services/PaymentService.ts`.
- [ ] Verify Monnify webhook signatures before processing in `src/modules/billing/services/MonnifyService.ts` and the webhook entrypoint.
- [ ] Add CSRF protection for cookie-authenticated mutations in `src/app.ts` and auth routes.
- [ ] Cap list endpoints with pagination and max page size in `src/modules/patient/controller.ts`, `src/modules/billing/controller.ts`, and `src/modules/appointment/controller.ts`.

## P1 — Strongly Recommended
- [ ] Add request size limits and stricter CORS origin allowlists in `src/app.ts`.
- [ ] Replace app-wide wildcard CORS fallback with an explicit allowlist only.
- [ ] Add auth brute-force protection with account-aware throttling in `src/modules/auth/routes.ts`.
- [ ] Normalize auth failure messages so login does not reveal user state in `src/modules/auth/controller.ts`.
- [ ] Add event correlation/request IDs to all log lines and error responses in `src/lib/request-context.ts` and `src/lib/error-handler.ts`.
- [ ] Wire permission-cache invalidation to role/permission mutation paths in `src/modules/auth/repository.ts` and `src/modules/auth/service.ts`.
- [ ] Add explicit active-session revocation when a user is locked, suspended, or permissions change in `src/modules/auth/service.ts`.

## Infrastructure Assumptions
- [ ] Keep app-level rate limiting only as a temporary control; do not treat it as the primary defense.
- [ ] Reject spoofed forwarded headers unless the request comes from a trusted proxy.
- [ ] Restrict inbound ports at the host/firewall level to app, DB, and Redis only.
- [ ] Confirm TLS termination path and browser cookie security flags before release.

## Secrets and Rotation
- [ ] Move production secrets out of `.env` and into a vault-backed delivery path.
- [ ] Define rotation for session secret, Monnify credentials, R2 credentials, and DB credentials.
- [ ] Make secret rotation support overlap windows so old/new keys can coexist briefly.
- [ ] Ensure secrets never appear in logs, error bodies, or client responses.

## Safe Deferrals to Sprint 3
- [ ] JWTs: do not add them; opaque server sessions are enough for Sprint 2.
- [ ] Reverse proxy rate limiting: defer if NGINX/Cloudflare is not yet in the stack, but keep app-level throttles as temporary defense.
- [ ] Full OpenTelemetry/Prometheus/central log shipping.
- [ ] Full E2E security test suite.
- [ ] Vault automation if ops is not ready yet; document the target path now.
- [ ] Advanced MFA recovery flows beyond basic verification.

