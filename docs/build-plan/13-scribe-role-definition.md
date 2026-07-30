# OncoFlow — Scribe Role Definition

Resolves the open item flagged across `08-stakeholder-role-matrix.md`, `09-stakeholder-trigger-web.md` (Chain E, step 4), and `11-ddd-security-architecture-blueprint.md` §3.5 — Scribe had a job description but no confirmed place in the identity model, and its corrected work product had no defined downstream consumer. This is a concrete proposal for both, not just a restatement of the gap — flag anything below you'd rather Valerie weigh in on before it's locked, same as every other clinical-adjacent judgment call in this build.

---

## 1. Identity model placement

**Recommendation: `SCRIBE` becomes a real `RoleName` enum value, not a tag on an existing role.**

Reasoning: Scribe has genuinely distinct authority — editing `Transcript` content — that shouldn't be conflated with any clinical role's existing permission set. Piggybacking it onto, say, "Virtual MO" would mean either over-granting (an MO account that can also edit transcripts it has no clinical reason to touch) or under-granting (a workaround that bypasses RBAC entirely). A real, independently-assignable role is the only version of this that's actually least-privilege.

```typescript
// src/db/enums.ts — add to roleNameEnum
'SCRIBE',
```

---

## 2. Permissions & scope

**Can:**
- View `Transcript` segments and the parent `Meeting`/`Appointment` metadata (patient name, date, participants) for meetings they've **claimed from the transcription queue** — not a blanket view of all transcripts platform-wide.
- Access the underlying Daily.co recording for a claimed meeting, **mediated through the app's own signed-URL mechanism** (same pattern as file access in `10-security-gates.md` Gate 6/7) — never direct Daily.co dashboard/API credentials. Re-listening to the recording is how accuracy corrections actually get made, so this access is necessary, not incidental.
- Edit `Transcript.content` — **corrections only**. A correction must reflect what was actually said (fixing mis-transcribed oncology terminology, garbled audio-to-text errors), never added clinical interpretation or annotation. This is a hard rule, not a style guideline — a Scribe introducing content that wasn't in the original recording is a data-integrity risk on a document that may later inform clinical decisions.
- Claim an item from the shared transcription queue, and release it back if they can't complete it.
- Mark a meeting's transcript as **finalized** once review is complete (see §4 — this is the piece that closes the "no downstream consumer" gap).

**Cannot:**
- View any clinical content outside the specific meeting's transcript context — no `LabResult`, no `Prescription` rationale, no `ClinicalDecision`, no other patient data. Scope is the transcript, not the patient's chart.
- Join a live call as a participant with clinical authority, prescribe, or author a `ClinicalNote`.
- Access another scribe's claimed queue items, or claim beyond their own backlog cap (§3).
- Delete a `Transcript` segment or a `Meeting` record — corrections only, never removal.
- Access Daily.co credentials or dashboard directly.

**Authorization matrix:**

| Action | Scribe |
|---|---|
| View own claimed `Transcript`/`Meeting` | ✅ |
| View another scribe's queue/claims | ❌ |
| Edit `Transcript.content` (correction) | ✅, own claims only |
| Add clinical interpretation to a transcript | ❌ — hard rule, not just unscoped |
| Claim/release queue items | ✅, up to backlog cap |
| Finalize a meeting's transcript | ✅, own claims only |
| Access recording via signed URL | ✅, own claims only |
| Access Daily.co credentials directly | ❌ |
| View `LabResult`/`Prescription`/other clinical data | ❌ |

---

## 3. Schema additions

Two changes: a new small aggregate for queue/SLA tracking, and two new columns on `Meeting` for finalization.

### New table: `TranscriptionAssignment`

This is deliberately its own aggregate, not fields bolted onto `Transcript` or `Meeting` — assignment/workflow state (who's working on it, by when) is a different concern from the transcript content itself, same reasoning as keeping `Transcript` separate from `Meeting` in `06-drizzle-schema.md`.

```typescript
export const transcriptionAssignmentStatusEnum = pgEnum('transcription_assignment_status', [
  'QUEUED', 'CLAIMED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED',
]);

export const transcriptionAssignment = pgTable('transcription_assignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meeting.id), // UNIQUE (1:1) — one assignment per meeting
  scribeId: uuid('scribe_id').references(() => user.id), // NULL until claimed
  status: transcriptionAssignmentStatusEnum('status').notNull().default('QUEUED'),
  queuedAt: timestamp('queued_at').notNull().defaultNow(), // meeting ended, transcript ready for review
  claimedAt: timestamp('claimed_at'),
  completedAt: timestamp('completed_at'),
  slaDeadline: timestamp('sla_deadline'), // computed from queuedAt at creation
  slaBreached: boolean('sla_breached').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  meetingIdUnique: uniqueIndex('transcription_assignment_meeting_id_unique').on(t.meetingId),
  scribeStatusIdx: index('transcription_assignment_scribe_status_idx').on(t.scribeId, t.status), // powers backlog-cap check
  slaIdx: index('transcription_assignment_sla_idx').on(t.slaDeadline), // powers SLA breach job, mirrors Conversation's pattern
}));
```

### `Meeting` gains two columns (in `messaging/schema.ts`)

```typescript
transcriptFinalizedAt: timestamp('transcript_finalized_at'),
transcriptFinalizedBy: uuid('transcript_finalized_by').references(() => user.id), // the Scribe
```

Finalization lives on `Meeting`, not on individual `Transcript` rows — a meeting typically has many transcript segments (one per utterance), and "has this meeting's transcript been reviewed" is a meeting-level state, not something that makes sense per-segment.

---

## 4. What "finalized" actually triggers — closing the trigger-web gap

This is the piece `09-stakeholder-trigger-web.md` Chain E flagged as a dead end. Resolution:

1. Scribe completes corrections on all segments for a meeting → sets `Meeting.transcriptFinalizedAt`/`transcriptFinalizedBy` → `TranscriptionAssignment.status → COMPLETED`.
2. This publishes `TranscriptFinalized` (per the event catalog in `11-ddd-security-architecture-blueprint.md` §4) → triggers a Notification to the **Consulting Oncologist** ("transcript ready for reference").
3. Only a **finalized** transcript becomes eligible to be referenced/linked from a `ClinicalNote` — an in-progress or unclaimed transcript shouldn't be citable in the actual medical record yet.

**One judgment call worth flagging explicitly:** this treats the transcript as *reference material the Oncologist may consult*, not as something requiring the Oncologist's own sign-off before it's "official." The `ClinicalNote` remains the actual medical-legal record, independently authored — the transcript supports it but isn't part of the chain of clinical authority itself. If Valerie's expectation is that a clinician must review/approve the corrected transcript before it's trusted (rather than just being notified it's ready), that's a different, stricter workflow — worth a direct check rather than assuming the lighter version is right.

---

## 5. SLA window & backlog cap — proposed defaults, not confirmed values

Nothing in the source docs specifies an actual SLA duration or backlog size for this role (unlike the Messaging SLA, which FR-31 pins at 2/5 minutes) — these are genuinely new numbers, not values I'm recovering from an existing spec.

**Proposed SLA window: 24 hours from `queuedAt`.** Reasoning: unlike the MO side-effect chat (patient actively waiting, real-time urgency), transcript correction is a reference-quality task with no patient waiting on it in the moment — same-day-but-not-instant is proportionate. Flag for Valerie to confirm or override.

**Proposed backlog cap: 5 concurrent `CLAIMED`/`IN_PROGRESS` assignments per scribe**, enforced at claim time (`count of this scribe's non-terminal assignments < 5`, checked in the service layer before allowing a new claim). A global constant for MVP — per-scribe override (faster scribes handling more) is a reasonable later enhancement, not worth building now (YAGNI, given there's no evidence yet of scribes actually having different throughput).

**SLA breach handling:** mirrors the `Conversation.sla_breached` pattern already built for Messaging — a scheduled job flips `slaBreached` when `now() > slaDeadline` with no `completedAt`. Unlike the MO/Admin SLA breach gaps flagged in `09-stakeholder-trigger-web.md`, this one should have a defined recipient from the start: **Notification to whichever role manages the scribe pool** — if that's the Super Admin (no dedicated "scribe lead" role exists), route it there for now rather than leaving another undefined-recipient gap in the system.

---

## 6. What this changes in existing files

- **`06-drizzle-schema.md`** — add `SCRIBE` to `roleNameEnum`, add the `TranscriptionAssignment` table and its enum to `messaging/schema.ts` (or a new small file in the same module — it's messaging-domain-adjacent, tied to `Meeting`), add the two new `Meeting` columns.
- **`04-sprint3-clinical-messaging-video.md`, `F3.11`** — currently just says "Scribe role + SLA/backlog-cap fields," P1, "per the Valerie conversation." Update its build sequence to reference this file directly rather than leaving the fields undefined.
- **`08-stakeholder-role-matrix.md`** — Scribe's entry can drop its "open item" flag now that this exists; the summary table's `RoleName` gap is resolved.
- **`09-stakeholder-trigger-web.md`** — Chain E, step 4's `[UNSPECIFIED]` dead end resolves per §4 above.

Want these folded into `06` and `04` now, along with whatever else is still pending from the earlier batches?
