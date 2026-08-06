# OncoFlow — Patient App: Full Screen Inventory

I went through all 25 files in the zip. Before the list — one thing worth confirming, since it changes what you're actually building.

## Platform check

Every screen is phone-shaped, and there's a `BottomNavBar` component — this is a **mobile app UI**, not a desktop website, whatever the framing in your message. Given the locked stack (`apps/web` — React + Tailwind + shadcn, deployed to Cloudflare Pages, per `01-foundation-sprint.md`/`12-monorepo-structure.md`), my assumption is this is meant to be a **mobile-first responsive web build inside the existing `apps/web`** — a PWA-style experience, not a separate native iOS/Android app. That's the far cheaper, faster path and fits everything already locked in. If you actually want a native app (React Native, separate app store deployment), that's a real stack decision nobody's made yet and changes `12-monorepo-structure.md` meaningfully — flag it now if that's the intent, otherwise I'm proceeding on "mobile-first web" as the working assumption.

## What's in the 25 files

Grouped by flow, not by filename — several files are states/steps of the same feature:

| Flow | Files | States covered |
|---|---|---|
| Registration | `Patient Registration`, `-2`, `-3`, `-4`, `-9` | Multi-step form + a jump to step 9 |
| Post-registration | `Registration Complete` | Success state |
| Auth | `Login`, `Forgot Password`, `MFA Verification` | Standard auth flow |
| Home | `Dashboard` | Primary landing screen |
| Wallet | `Wallet`, `Insufficient balance`, `Payment unsuccessful`, `Transaction Verified` | Balance/funding + 3 outcome states |
| Messaging | `Chat`, `Chat Box` | Conversation list + thread |
| Video | `Video Consultation`, `-1`, `-2` | 3 states (pre-call/in-call/post-call, by naming) |
| Labs | `Lab Upload`, `Upload successful` | Submission + success state |
| Account | `Patient Profile`, `Settings`, `Notifications` | Profile view, settings, notification list |
| Component | `BottomNavBar` | Nav chrome, not a page |

**⚠️ Flag before anything else:** Registration goes `1, 2, 3, 4, 9` — **steps 5 through 8 are missing.** That's either a designer export gap (ask before assuming) or those steps got merged/renumbered and step "9" is actually step 5 mislabeled. Either way, don't guess at what's supposed to be between step 4 and whatever "9" actually is — go back to your designer on this specifically before building the registration flow, since building against a guessed middle section is exactly the kind of thing that costs you a rebuild later.

---

## Complete Patient App IA — every screen, designed or not

Organized the way a patient would actually navigate it, cross-referenced against every Patient capability already established in `08-stakeholder-role-matrix.md`, `09-stakeholder-trigger-web.md`, and the DB schema. ✅ = designed, ⚠️ = partially covered / needs confirmation, ❌ = not designed yet. Route paths match `apps/web/src/routes/patient/` from `12-monorepo-structure.md`.

### Auth & Onboarding
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Registration (multi-step) | ⚠️ steps 5–8 missing | `/register` | `F1.8`, FR-01 duplicate check |
| Duplicate-match hold state | ❌ | `/register/duplicate-found` | The Chain A gap from `09` — if FR-01 flags a possible match, the patient needs to see *something*, not a silent failure |
| Registration Complete | ✅ | `/register/complete` | `F1.8` |
| Login | ✅ | `/login` | `F1.7` |
| Forgot Password | ✅ | `/forgot-password` | Not explicitly in any sprint file yet — worth adding to `F1.1`'s scope |
| MFA Verification | ✅ | `/mfa-challenge` | `F1.1`, `F1.7` |

### Home
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Dashboard | ✅ | `/home` | `F1.9` |
| 7-Day Countdown widget/tracker | ⚠️ unclear if inside Dashboard or its own screen | `/home` or `/countdown` | `F2.4` — patient-facing view of `CountdownCase.currentDay`/`status`. This is one of the highest-value missing pieces — the whole pre-chemo workflow is invisible to the patient without it. |
| Full Timeline / Medical History | ❌ | `/timeline` | `F1.5`, `F3.10` — Dashboard likely shows a *recent* slice; a patient with months of history needs a full scrollable/filterable timeline, not just what fits on the home screen |
| Empty states (no timeline entries yet) | ❌ | — | `F1.9`'s own DoD calls for this explicitly — confirm it's actually designed, not assumed |

### Wallet & Billing
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Wallet (balance + top-up) | ✅ | `/wallet` | `F2.7` |
| Insufficient balance | ✅ | — (modal/state) | `F2.7` |
| Payment unsuccessful | ✅ | — (modal/state) | `F2.3` |
| Transaction Verified | ✅ | — (modal/state) | `F2.3` |
| **Invoice list** | **❌** | `/invoices` | **You named this one explicitly and it's not in the 25 files.** Patient needs to see what's owed — outstanding vs. paid, each invoice's `status` (`DRAFT`/`SENT`/`PAID`/`OVERDUE`). |
| **Invoice detail / itemized breakdown** | **❌** | `/invoices/:id` | Needs to show the `InvoiceItem` breakdown (network fee, facility fee, professional fee, drug cost per FR-51/§18.1) — this is what makes a charge legible rather than just "you owe ₦X" |
| Pay-invoice confirmation flow | ⚠️ | `/invoices/:id/pay` | Wallet screen may cover the mechanics, but the "which invoice, how much, confirm" step before funds move isn't clearly separate from generic top-up |
| Wallet transaction history | ⚠️ | `/wallet/history` | `WalletTransaction` ledger — Wallet screen may show recent activity, but a full filterable history (by date, credit/debit) is a distinct need |
| Subscription management | ❌ | `/subscription` | `Subscription` entity exists in the schema; Patient capability list explicitly includes "enroll in/manage own Subscription" — nothing in the 25 files touches this at all |

### Appointments & Video
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Video Consultation (3 states) | ✅ | `/appointments/:id/call` | `F3.9`, `F3.7` |
| **Appointments list (upcoming/past)** | **❌** | `/appointments` | No screen shows a patient their scheduled appointments outside of actually being in a call — this is a basic, load-bearing gap |
| Appointment detail (pre-join) | ❌ | `/appointments/:id` | Where a "Join Call" button, physical-visit details, or reschedule/cancel-request action would live |
| Physical visit detail (non-video) | ❌ | `/appointments/:id` (physical type) | `PhysicalCase`-linked appointments need their own view — physical appointments don't have a "join" action, they need location/prep info instead |

### Messaging
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Chat (conversation list) | ✅ | `/messages` | `F3.8`/messaging |
| Chat Box (thread) | ✅ | `/messages/:id` | `F3.1` |
| ⚠️ Confirm both `conversationType`s are handled | ⚠️ | — | Side-effect reports (→ MO) and general inquiries (→ Admin) are two different conversation types with different SLAs (2 min vs 5 min per FR-31) — worth confirming the design distinguishes them, since a patient starting a "side effect" thread vs. a billing question shouldn't look identical |

### Clinical / Health Records
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Lab Upload | ✅ | `/labs/upload` | `F3.0`, `F3.5` |
| Upload successful | ✅ | — (state) | `F3.0` |
| **Lab results / status view** | **❌** | `/labs` | Upload is one-directional in the current design — nothing shows the patient their submitted labs' status (`PENDING`/`UPLOADED`/`REVIEWED`) or history. They can submit but can't check back. |
| **Prescriptions list** | **❌** | `/prescriptions` | Prescriptions currently only surface as generic Timeline entries per the structured-entry rule from `F3.10` — worth confirming whether that's sufficient or whether active medications need their own dedicated, more detailed view |
| CountdownCase outcome detail (Cleared/Declined) | ❌ | `/countdown/:id` | A declined chemo case is a significant moment — probably deserves more than a push notification and a timeline row. Worth a dedicated "here's what this means, here's what happens next" screen. |

### Account
| Screen | Status | Route | Maps to |
|---|---|---|---|
| Patient Profile | ✅ | `/profile` | `Patient`, `PatientAddress`, `EmergencyContact` |
| Settings | ✅ | `/settings` | — |
| ⚠️ Confirm Settings covers change-password + MFA management | ⚠️ | `/settings/security` | In-app password change and MFA enroll/disable are distinct from the pre-login `Forgot Password` flow — confirm Settings actually has these, not just notification/display preferences |
| Notifications (list) | ✅ | `/notifications` | `Notification` entity |
| Notification preferences | ❌ | `/settings/notifications` | Toggling SMS/email/push per category — not the same as the list view |

---

## Priority order, matched to what the backend actually needs first

Since the backend build is already sequenced (`02` through `05`), build the frontend gaps in the order the backend will actually be ready to support them, not in whatever order feels natural:

1. **Invoice list + detail** — Sprint 2 (`F2.2`–`F2.7`) is already P0 and needs this to be a complete patient experience; right now the designed Wallet screens only cover funding, not what's actually owed.
2. **7-Day Countdown widget** and **Appointments list** — also Sprint 2/3 territory (`F2.4`, `F2.5`), and currently the biggest "patient can't see what's happening to them" gap.
3. **Lab results/status view** — pairs directly with the already-designed Lab Upload; Sprint 3.
4. **Subscription management** — lower urgency, no sprint file currently even schedules the backend for this beyond the bare `Subscription` table existing (`F2.2`) — flag to Valerie whether it's actually in MVP scope or a later addition.

Send this back to your product designer with the ❌ rows as the "still needed" list — and get the registration-steps-5-through-8 question answered before anyone starts building that flow specifically.
