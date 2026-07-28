# OncoFlow — Accounts & Payments Setup

**Prepared:** July 22, 2026
**Purpose:** Every account and payment needed to run OncoFlow's technology stack, reported in NGN for finance review, with original billing currency shown in brackets.

---

## Budget Assumptions

- **Exchange rate used throughout this document:** €1 ≈ ₦1,900, US$1 ≈ ₦1,550 — **update before final approval if rates have moved.**
- International vendors (Hetzner, Cloudflare, Daily.co, Amazon SES) bill in EUR/USD; this document converts to NGN for reporting only — actual charges will fluctuate slightly with real-time rates at the moment each vendor bills.
- **SMS (Termii) has been removed from this budget** — per MD's decision, notifications run through **email + in-app messaging only**. See note at the end on what this means operationally.

---

## 1. Fixed Operational Costs (predictable — bill every month regardless of usage)

| Service | Monthly (₦) | Annual (₦) | Original billing |
|---|---|---|---|
| Hetzner Cloud — 2x CX23 (App + DB server) | ₦22,800 | ₦273,600 | €11.98/mo, €143.76/yr |
| Coolify | ₦0 | ₦0 | Self-hosted, open-source |
| Cloudflare Pages | ₦0 | ₦0 | Free tier |
| Cloudflare DNS / WAF | ₦0 | ₦0 | Free tier |
| Cloudflare R2 | ₦1,550–₦4,650 | ₦18,600–₦55,800 | $1–3/mo |
| Sentry | ₦0 | ₦0 | Free tier at Pilot scale |
| Amazon SES (email — now the primary notification channel, see note below) | ₦0–₦500 | ₦0–₦6,000 | ~$0–0.30/mo at Pilot volume |
| **Fixed Infrastructure Total** | **₦24,350–₦27,950** | **₦292,200–₦335,400** | |

**Hetzner detail** — confirmed current pricing: **CX23** (2 shared Intel/AMD vCPU, 4GB RAM, 40GB NVMe SSD, 20TB traffic included) at €5.99/month per server. Two servers (App + Database, per ADR-0013) = €11.98/month total.

---

## 2. Domains (Annual)

With research, the pricing we checked during the last meeting on TRUEHOST.com is attractive but the renewal fee is about 3x higher. Since domains are long-term assets, I always evaluate based on 5-year total cost of ownership, not the first-year price.

### My Option - Hybrid 

- Cloudflare Registrar for registering international domain like (oncoflow.com)
- QServers for registering nigerian domains like (oncoflow.com.ng)

Then move all DNS management to Cloudflare.

Cloudflare takes a different approach. They sell domains at cost and they don't profit from renewals.

That means:

- No promotional pricing
- No inflated renewal fees

You generally pay close to the registry wholesale cost plus mandatory fees.

| Item | Annual (₦) | Original billing |
|---|---|---| 
| .com (Cloudflare Registrar) | ~₦16,213 | ~$10.26/yr |
| .com.ng (NIRA-accredited registrar) | ₦5,500 | NGN-native |
| **Domains Total** | **~₦22,000** | |

---

## 3. Variable / Usage-Based Costs

No fixed monthly fee on either of these — genuinely pay-only-for-what's-used, not a flat bill.

**Monnify** (payment collection + payout, ADR-0010)
- Fixed cost: ₦0/month, no setup fee
- Collection fee: 1.5%, capped at ₦2,000 per transaction; free under ₦2,500
- Payout fee: from ₦10/transfer
- This scales with real revenue, not a budget line to estimate — it's a cut of money already flowing through the platform

**Daily.co** (video consultations + transcription)
- Fixed cost: ₦0/month
- Free tier: first 10,000 participant-minutes/month
- Overage: $0.004/participant-minute; transcription add-on $0.0059/min
- **Estimated Pilot budget: ₦0–₦46,500/month** — one hospital's consult volume likely stays near the free tier initially; this is a placeholder range until real usage data exists, not a committed number

| Category | Monthly (₦) | Annual (₦) |
|---|---|---|
| Usage Estimate (Daily.co) | ₦0–₦46,500 | ₦0–₦558,000 |

---

## 4. Overall Budget Summary

| Category | Monthly (₦) | Annual (₦) |
|---|---|---|
| Fixed Infrastructure | ₦24,350–₦27,950 | ₦292,200–₦335,400 |
| Domains | — | ₦22,000 |
| Usage Estimate (Daily.co) | ₦0–₦46,500 | ₦0–₦558,000 |
| **Estimated Operating Cost** | **₦24,350–₦74,450/month** | **₦314,200–₦915,400/year** |

Plus Monnify's transaction-linked fees (comes out of collected patient payments, not a separate bill) — not included in the total above since it's not a fixed operating cost.

---

## 5. Pilot vs. Production Scale — How This Changes

| Item | Pilot (1 hospital) | Production (multi-facility) |
|---|---|---|
| Hetzner | 2x CX23 sufficient | Likely upgrade to CX33/CPX tier as concurrent load grows — revisit with real usage data, not pre-emptively |
| Cloudflare R2 | ₦1,550–4,650/mo | Grows with document volume (more patients, more facilities uploading) |
| Daily.co | Near free tier | Grows directly with consult volume — the largest variable cost at scale |
| Monnify fees | Small, revenue-linked | Grows with revenue — a good problem, not a budget risk |
| Email (SES) | Negligible | Grows with patient count, still cheap per-unit |

---

## 6. Accounts Checklist — Owner & Priority

**P0 = before Pilot launch. P1 = shortly after launch. P2 = future, not urgent.**

| Account | Owner | Priority |
|---|---|---|
| Hetzner Cloud | Engineering | P0 |
| Cloudflare (DNS, R2, Pages) | Engineering | P0 |
| Monnify (business KYC: BVN, CAC docs, settlement account) | Finance + Engineering (joint — Finance provides documents) | P0 |
| Daily.co | Engineering | P0 |
| Amazon SES (now the primary notification channel — see note below) | Engineering | **P0**, not P1 |
| Domain registrars (.com + .com.ng) | Engineering/Operations | P0 |
| GitHub | Engineering | P0 |
| Sentry | Engineering | P1 |

---

## 7. Note on Removing Termii (SMS)

Per the MD's decision, SMS is out — notifications now run through **email and in-app messaging only**. One thing worth flagging, not to block sending this today, but to have an answer ready if asked: patients without reliable data access or who don't open the app regularly will have a weaker safety net for time-sensitive reminders (7-day countdown, payment prompts) than SMS would have provided, since SMS reaches a phone with zero data/app requirement. Email + in-app is the right call for cost and simplicity — just worth a shared understanding that it trades some reach for that.
