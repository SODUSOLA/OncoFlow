# OncoFlow — Security Gates, Registration → Disbursement

Every point in the pipeline where something needs protecting, in the order data/money actually flows through the system, referencing the architecture already locked in (`00-global-conventions...md` through `09-stakeholder-trigger-web.md`). I'm not a lawyer — the compliance notes here (especially the data-residency one in Gate 13) are flags for you to run past actual legal/compliance counsel, not legal advice.

**One framing point before the gates:** OncoFlow processes health data on Nigerian patients, which the **Nigeria Data Protection Act 2023 (NDPA)** — the current operative law, successor to the older NDPR — classifies as **sensitive personal data**, subject to a higher bar than ordinary PII: explicit lawful basis, stricter breach-notification timelines, and cross-border transfer restrictions. That last one matters directly for a decision already made in this project (flagged in Gate 13).

---

## Gate 1 — Registration / Identity Creation

**What's at risk:** fraudulent duplicate identities, PII exposure at the point of collection, bot-driven mass account creation, unauthorized enrollment.

**Controls:**
- FR-01's duplicate check (name + DOB + facility) needs to actually be robust — a fuzzy/normalized match, not exact-string, or it's trivially defeated by "Jon" vs "John."
- Rate-limit the public registration endpoint; CAPTCHA on the public-facing form specifically (this is the one endpoint reachable with zero authentication).
- Server-side validation on every field — DOB plausibility, phone format, email format — never trust client-side validation alone.
- No PII (name, DOB, phone) in URLs, query strings, or application logs. This needs to be a logging-layer rule (scrub before write), not a per-developer habit.
- TLS in "Full Strict" mode between Cloudflare and the origin server, not just at the Cloudflare edge — the Hetzner-to-Cloudflare hop needs to be encrypted too, not just client-to-Cloudflare.

---

## Gate 2 — Authentication

**What's at risk:** credential stuffing, brute force, session hijacking, MFA bypass, account takeover.

**Controls:**
- Password hashing: **Argon2id**, not bcrypt if you have the choice — better resistance to GPU-based cracking. Never log a password, hashed or not, anywhere, including error stack traces on a failed hash comparison.
- **MFA should be mandatory, not optional, for every staff role** — Patient can stay optional for onboarding friction reasons, but a Virtual MO, Oncologist, QA Officer, or Director account without MFA is a disproportionate amount of risk for one factor to carry, given what those accounts can do (prescribe, approve chemo, close cases, see clinical records).
- Rate-limit login attempts per account and per IP; wire actual lockout into `AccountLock` (the `24H_ADMIN` type) after N failed attempts, not just as a manually-invoked admin action.
- Session tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies if the frontend is browser-based — never `localStorage`, which is readable by any injected script (XSS turns into instant session theft otherwise).
- `Session.device`/`Session.ip` (already in the schema) should feed a **new-device login notification** to the user — cheap to build, catches account-takeover attempts early.
- Session invalidation on logout, password change, and role change needs to actually flush the Redis permission cache built in `F0.5` — a revoked session that's still "warm" in cache is a real gap, not a theoretical one.

---

## Gate 3 — Authorization / RBAC

**What's at risk:** privilege escalation, cross-facility data leakage (the QA-scoping issue already identified), IDOR — an authenticated Oncologist pulling up a patient they were never assigned to just by guessing/incrementing an ID.

**Controls:**
- `requirePermission()` (role-level) is necessary but not sufficient — pair it with **object-level authorization**: before returning any `Patient`, `LabResult`, `PhysicalCase`, etc., verify the requesting user has an actual assignment relationship to that specific record, not just the right role in general. Role-level-only checks are exactly how one clinician ends up able to browse another clinician's entire patient panel.
- The facility-scoping pattern built for QA-officer case-closing (`00-global-conventions...md` §1.4) should be the **template**, applied everywhere a role's authority is meant to be facility-bound, not a one-off special case.
- Extend the CI RBAC-coverage check (`F0.6`) beyond "does this route have a permission check" to also flag routes touching facility-scoped resources (`PhysicalCase`, `AppointmentCard`, `ClinicalDecision`) that **don't** use the facility-scoped variant — a route with *a* permission check that's the wrong *kind* of check passes today's CI gate and shouldn't.
- Deny-by-default at the router level: a new route with no explicit permission decorator should fail to even register, not just fail CI on the next PR.

---

## Gate 4 — Patient Data at Rest & in Transit

**What's at risk:** database breach exposing clinical/financial records, backup exposure, insider snooping by someone with legitimate DB access but no legitimate reason to look at a specific record.

**Controls:**
- Disk-level encryption on both Hetzner VPS (LUKS or equivalent) — data at rest on the physical disk, not just "Postgres is password-protected."
- **Field-level encryption for the highest-sensitivity columns** — `Patient.phone`, `PayeeBankAccount.accountNumber` — so a `SELECT *` by someone with raw DB access (an ops engineer debugging, a compromised read-replica credential) doesn't hand over plaintext. This is a step beyond what's currently planned (soft-delete + serializer-level restriction handles *application-layer* exposure, but not someone querying the DB directly).
- `sslmode=require` on every Postgres connection, including PgBouncer↔Postgres on the private network — private network isn't the same as trusted network; defense in depth here is cheap.
- Backups: encrypted, access-controlled, retention policy explicitly defined (not "keep everything forever" by default), and **restore-tested** — an untested backup is a hypothesis, not a control.
- The Admin-scoped `LabResult` DTO (`{file_id, test_date, possible_duplicate}` only, already built) is the right pattern — data minimization at the response layer. Apply the same discipline anywhere a role sees a narrower slice of a record than the full clinical picture.

---

## Gate 5 — Messaging (patient ↔ MO/Admin)

**What's at risk:** conversation content leakage, impersonation, one clinician reading another's assigned patient's side-effect reports.

**Controls:**
- `Conversation`/`Message` access restricted to actual `Participant` rows for that conversation — object-level check, same principle as Gate 3.
- Message content is clinical (side-effect reports) — encrypt at rest, same tier of sensitivity as `LabResult` content, not treated as "just chat."
- Rate-limit message sending to prevent inbox flooding/abuse of the MO queue (a griefing vector against the 2-minute SLA — someone spamming the inbox could make the SLA unmeetable for real patients).

---

## Gate 6 — File Upload / Documents

**What's at risk:** malware upload, path traversal, unauthorized access to a file via a guessable storage key, PHI leakage through an accidentally-public bucket link, tampered lab results.

**Controls:**
- ClamAV scan + quarantine (already planned, `F4.6`) — good baseline.
- **Never a public R2 bucket.** Every file access goes through a **short-TTL signed URL**, generated server-side after an object-level authorization check — the same person who shouldn't see another patient's `LabResult` row also shouldn't be able to fetch its file via a leaked/logged URL that stays valid indefinitely.
- `storage_key` should be a non-guessable UUID-derived key, never a predictable pattern based on patient ID or name — prevents enumeration attacks against the bucket even if a signed-URL mechanism has a flaw somewhere.
- Validate file type by **content sniffing (magic bytes), not just extension or declared MIME type** — a `.pdf` extension proves nothing about what's actually in the file; this is exactly the disguised-executable vector antivirus scanning alone doesn't fully close (scanning happens after upload; content-type validation happens before, as a cheap first filter).
- File size limits, enforced server-side.
- `file_hash` is currently used for duplicate detection — extend it to **integrity verification on read** too (recompute and compare on download for anything clinically load-bearing), catching silent corruption or tampering between upload and later access.

---

## Gate 7 — Video Consultation

**What's at risk:** unauthorized meeting join, transcript leakage or tampering, exposed Daily.co credentials.

**Controls:**
- Daily.co room tokens generated **server-side only**, scoped per-appointment, short-lived/single-use — never expose the Daily.co API key to the frontend.
- Before issuing a join token, verify the requesting user is an actual `AppointmentParticipant` for that specific appointment — object-level check again, same pattern as Gates 3/5.
- Webhook signature verification on both Daily.co's meeting-status and transcription webhooks (already flagged in `04-sprint3-clinical-messaging-video.md` — worth restating here as a security control, not just a data-integrity one).
- `Transcript.edited_by`/`edited_at` already tracks who last touched a transcript — consider whether a **correction should append a new version rather than overwrite**, given a video-consult transcript is effectively a clinical record; an overwritten transcript with no history is harder to trust or audit later.

---

## Gate 8 — Billing & Wallet (collection side)

**What's at risk:** webhook spoofing/replay, wallet balance manipulation, invoice amount tampering.

**Controls:**
- Monnify webhook signature verification + idempotency via `Payment.reference` (already planned, `F2.3`) — this is the core control and it's already right.
- Server always computes `Invoice.total_kobo` from `Tariff`, never accepts a client-supplied amount (FR-51, already enforced) — this is genuinely the single best control in the whole billing flow; the pattern should be held up as the standard everywhere else money is involved.
- Periodic **reconciliation job** comparing Monnify's own transaction records against the local `Payment`/`WalletTransaction` ledger — catches a lost webhook or a discrepancy that idempotency alone wouldn't surface (idempotency prevents double-processing a webhook you *did* receive; it doesn't catch one you never received).
- Rate-limit wallet top-up attempts per account — a probing/fraud vector against the payment gateway, not just a UX concern.

---

## Gate 9 — Clinical Decision Integrity (QA → Director)

**What's at risk:** bypassing the two-stage gate, silent tampering with a recommendation or final decision after the fact, an old/stale decision being treated as current.

**Controls:**
- The hard sequencing rule (reject `final_decision` before `qa_decided_at`, already planned in `F3.6`) is the core control here and it's correctly scoped at the service layer.
- **Make `ClinicalDecision` effectively immutable once both stages are set.** A decision on whether a patient proceeds to chemotherapy is exactly the kind of record that should never be silently `UPDATE`-able after the fact — a correction should be a new versioned record with a reason and a link back to the original, preserving the full history. This matters as much for legal/clinical defensibility as for security.
- MFA should be **non-negotiable** for QA Officer and State Clinical Director accounts specifically — these are the two roles whose compromised credentials would let an attacker approve or decline chemotherapy for a real patient.

---

## Gate 10 — Physical Case / Facility-Scoped Operations

**What's at risk:** cross-facility bypass, forged Appointment Card data, unclear accountability on who actually checked which item.

**Controls:**
- The facility-scoped close() check (`F4.1`) needs to apply to **every** action a QA officer or Nurse takes on a case, not just the final close — read access to another facility's `PhysicalCase` detail should be blocked the same way write access is.
- **Gap worth closing:** `AppointmentCardChecklistItem` currently records `checked_at` but not `checked_by` — if more than one nurse could plausibly touch the same card, there's no way to attribute which specific person checked which specific item. Worth adding `checked_by` alongside `checked_at` before this ships, given how directly it feeds the QA review/close gate.

---

## Gate 11 — Payout / Disbursement (the highest-stakes gate — real money leaving the system)

**What's at risk:** bank-account substitution fraud (an attacker or malicious insider changes a `PayeeBankAccount` to redirect funds), double payout, insider abuse of a manual override, compromised Monnify credentials.

**Controls:**
- Monnify Name Enquiry verification before trusting a `PayeeBankAccount` (already planned) — good baseline, but consider it necessary, not sufficient.
- **Bank-account changes need a maker-checker control, not an immediate-effect update.** A changed `PayeeBankAccount` should hold in a pending state, trigger a notification to the payee through a *separate, previously-established channel* (SMS to the number on file, not the one just entered), and require a second-party confirmation before it can receive a payout — this is standard fraud-prevention practice for exactly this attack, and right now nothing in the build files specifies it.
- `PayoutLineItem.source_id UNIQUE` (already planned) correctly prevents double-paying a single fee split — keep this as a hard DB constraint, not just a service-layer check, so it holds even against a bug or a direct DB write.
- Monnify API secrets belong in a proper secrets manager (Coolify's secret store, at minimum — never in a committed `.env` file), rotated on a schedule, and scoped to the minimum permission Monnify's API allows.
- Any manual payout override (re-running a failed batch, force-completing a stuck payout) should require **Super Admin authorization with a logged justification** — this should never be a routine action any role can take casually.
- Basic anomaly monitoring on payout batches — a sudden spike in batch size, a payout to a newly-added bank account, or a payout amount far outside the historical range for a given role are all worth alerting on, even with simple threshold rules rather than anything sophisticated.

---

## Gate 12 — Audit & Compliance

**What's at risk:** audit log tampering (the record meant to catch fraud/abuse becomes untrustworthy itself), insufficient logging making a real incident unreconstructable, NDPA non-compliance.

**Controls:**
- `AuditLog` is already specced append-only with no soft delete (`F4.8`) — enforce this **at the database permission level**, not just in application code: the app's normal DB role should have `INSERT`-only privilege on `audit_log`, with `UPDATE`/`DELETE` revoked entirely at the Postgres grant level. An application-layer "reject the update" check is defeated by any bug or any direct DB access; a revoked DB grant isn't.
- Consider shipping audit logs to a separate write-only destination (a log aggregation service, or at minimum a different DB instance) so a full compromise of the primary Postgres instance doesn't also compromise the historical record of what happened before the compromise.
- **NDPA compliance items to run past legal counsel specifically:** lawful basis for processing sensitive health data, data-subject access/erasure rights (note the tension: erasure requests conflict with medical-record retention obligations and the append-only design — this needs a legal answer, not an engineering one), and breach-notification timelines.
- Regular (quarterly, at minimum) review of who has which `RolePermission` grants — permission creep is a slow, quiet risk, not a single event to catch once.

---

## Gate 13 — Infrastructure

**What's at risk:** server compromise, unauthorized network access to the DB/Redis tier, DDoS, a misconfigured Coolify instance being the weak link in an otherwise solid design.

**Controls:**
- SSH: key-only authentication, no password auth at all, `fail2ban` or equivalent, restrict access to known IPs where feasible.
- Coolify's own admin panel needs to be locked down at least as hard as anything it manages — strong auth, MFA if the version in use supports it, ideally not reachable from the open internet at all (VPN or IP-allowlist).
- Confirm via actual firewall rules (not just "they're on a private network") that PgBouncer, Postgres, and Redis reject any connection that isn't from the app server's private IP — the private network Hetzner provides is a start, not a substitute for an explicit deny-by-default firewall policy.
- The application's own Postgres role should not be a superuser — least privilege, scoped to exactly the schemas/tables it needs (and, per Gate 12, explicitly denied `UPDATE`/`DELETE` on `audit_log`).
- Dependency patching cadence for the OS and for npm packages — `npm audit` (or equivalent) wired into CI, not a manual occasional check.

**Flagging a genuine open compliance question, not just a technical one:** Hetzner's VPS offerings are physically hosted in Germany/Finland/the US, not Nigeria. Storing Nigerian patients' sensitive health data on servers outside Nigeria may trigger **NDPA's cross-border data transfer restrictions**, which require either an adequacy determination, standard contractual clauses, or explicit consent, depending on how the data is classified and transferred. This is a direct consequence of the Hetzner hosting decision (ADR-0013) that I don't think has been checked against Nigerian law yet — worth doing before Pilot launch, not after, since "we'll move the data later" is a much harder retrofit than deciding server location up front.

---

## Gate 14 — Third-Party Integrations (Monnify, Daily.co, ClamAV, npm ecosystem)

**What's at risk:** API key leakage, supply-chain compromise via a malicious/compromised dependency, webhook spoofing across any integration (a cross-cutting concern, consolidating what's mentioned per-integration above).

**Controls:**
- Every webhook endpoint (Monnify, Daily.co) verifies a cryptographic signature before processing — this has been called out per-integration in the sprint files; treat it here as a **non-negotiable cross-cutting standard**, not a per-feature detail that could get missed on a future integration.
- Automated dependency vulnerability scanning in CI (`npm audit`, or a tool like Snyk/Dependabot) — the module-boundary and RBAC-coverage checks already planned for CI (`F0.6`) are the right place to add this alongside them.
- Scope every third-party API key to the minimum permission the provider allows, and rotate on a schedule — not "set once at provisioning and never touched again."

---

## Summary — the five I'd prioritize first if build time is tight

Everything above matters, but if Sprint time forces triage, these five carry the most risk relative to build cost:

1. **Object-level authorization** (Gate 3) — the single biggest gap between "role has permission" and "role has permission *for this specific record*," and it touches nearly every module.
2. **Mandatory MFA for staff roles**, especially QA Officer and State Clinical Director (Gates 2, 9) — cheap to build, disproportionately high value given what those accounts can approve.
3. **Signed-URL-only file access, never a public bucket** (Gate 6) — a one-time architectural decision that's much cheaper to get right from Foundation Sprint than to retrofit later.
4. **DB-level (not just app-level) write restriction on `AuditLog`** (Gate 12) — a one-line `GRANT` change that meaningfully raises the bar against a whole class of compromise.
5. **Maker-checker on `PayeeBankAccount` changes** (Gate 11) — this is the one gate where a missed control translates directly into stolen money, not just leaked data.

Want these folded into the sprint files as security requirements attached to their respective features (same treatment as the earlier `[PLAN AMENDMENT]` items), or kept as a standalone reference doc your OpenCode instructions point to?
