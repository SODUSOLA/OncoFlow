# OncoFlow Consulting Oncologist — Phased Build Guide

Read `ONCOFLOW_DESIGN_SYSTEM.md` first, including the Consulting Oncologist token reconciliation section, before starting any phase here.

---

## Architecture Decision Record — Video Consultation (Daily.co)

**Decision 1 — Integration mode: Daily Custom / Call Object mode (`@daily-co/daily-js`), not Prebuilt.**
Confirmed. The Video Consult Room design (dark video panel, floating self-view PiP with rounded corners and a live-recording badge, custom translucent control bar, live transcript sidebar, safety-check banner) requires full control over every visual element. Prebuilt's iframe would fight this at every step. Build a custom `DailyCall` React wrapper around the `daily-js` call object (`joinCall`, `leaveCall`, `toggleAudio`, `toggleVideo`, participant track subscriptions) rather than embedding Daily's own UI.

**Decision 2 — Room lifecycle needs a backend.**
Not asked directly, but implied by Decision 1: someone has to create/manage Daily rooms and issue meeting tokens per appointment. This is new backend surface, not just frontend:
- `POST /consultations/:id/room` — creates (or returns existing) Daily room tied to an appointment, returns a scoped meeting token
- Room should be created lazily (on "Join Call" from the Appointment Grid or Pre-call Briefing), not pre-provisioned for every scheduled appointment
- Token should be role-scoped (clinician token vs. patient token, if patients join via a separate link — worth confirming later whether patients use this same OncoFlow UI or a lighter-weight join page)

**Decision 3 — Transcription/AI summary source: OPEN, not blocking video mechanics.**
You flagged this as undecided. That's fine — it doesn't block Phases 1–3 below (join/leave/mute/camera/PiP all work identically regardless of transcription source). It **does** block the live transcript panel and the post-call AI summary from being real rather than static. Two real options when you're ready to decide:
- **Daily's native transcription** (Deepgram-powered, `startTranscription()` on the call object) — simplest integration, transcript events arrive through the same daily-js call object you're already using for video. Summary would need a separate LLM call over the finished transcript.
- **Separate pipeline** (e.g., record via Daily → pull recording/audio → Whisper or AssemblyAI → your own summarization) — more moving parts, but decouples transcription quality from Daily's offering and gives more control over the "Sync to EHR" summary format shown in the Post-call screen.
Recommendation when you're ready: start with Daily's native transcription for the live panel (fastest path to something real), and treat the *post-call structured summary* (Patient Assessment / Clinical Findings / Intervention & Plan sections) as a separate LLM summarization step over that transcript — those are naturally two different jobs even if Daily's raw transcript is the input to both.

**Decision 4 — HIPAA/BAA: business follow-up, not a build blocker.**
Noted. Build functionally now; the "Secure Gateway" / "All data is encrypted" copy in the sidebar should **not** be pointed at a specific compliance claim until the Daily HIPAA plan + BAA is actually in place. Flag this to whoever owns that copy — shipping compliance language ahead of the actual compliance status is a real liability, not just a nitpick.

---

## Phase order

1. Shared Consultant shell (sidebar + top nav — distinct from Regional Admin's shell, different nav items and branding treatment)
2. Appointment Grid
3. Patient File
4. Video Consult — Pre-call Briefing
5. Video Consult — Room (daily-js integration, mechanics only — mute/camera/leave/PiP/HUD)
6. Video Consult — Post-call Summary (static/editable for now; wire to real transcript once Decision 3 is made)
7. System Settings
8. Notification Center

---

## Phase 1 — Shared Consultant Shell

### Components
- `<ConsultantSidebar />` — logo + "Oncology Portal" label, nav (Live Video, Patient History, Lab Results, Imaging, Pharmacy), footer with Secure Export / Exit Room links, top-of-page contextual card (Patient Record ID chip when inside a patient context)
- `<ConsultantTopBar />` — search input, Patient Folder button, End Consult button (danger style, only present inside an active consult context), settings/help icons, avatar
- Note: **this is a different shell from Regional Admin's** — different nav items, different top-bar actions (no notification bell pattern here at top level; "End Consult" is context-specific). Don't try to unify these two shells into one generic component; they're different enough to warrant separate implementations sharing only design tokens.

### Acceptance criteria
- [ ] Sidebar swaps its top card between "generic" state (Patient Record placeholder) and "active patient" state (name, ID, avatar) based on route context
- [ ] "End Consult" only renders when inside a live/pre-call video context

---

## Phase 2 — Appointment Grid

### Components
- Page header: "Scheduled Consultations" title, subtitle, "Next Breach In" countdown card (reuses the SLA countdown pattern from Regional Admin — same 3-state logic, different visual container)
- `<QuickFiltersCard>` — Urgency Level checkboxes (High Priority / Routine, each with a count badge), Consultation Type toggle (Virtual Only), Sort By dropdown
- `<SecureGatewayCard>` — static compliance messaging, dark navy card, "View Compliance Logs" link (flag: don't wire a fake compliance claim here either, per the ADR note above)
- `<AppointmentCard variant="high-urgency|routine">` — patient avatar, name, ID, urgency badge, start-time countdown (high-urgency only), time & duration, primary diagnosis, footer with "Join Call" (primary, disabled/muted until near start time per the routine-card screenshot) and "Patient File" buttons
- `<AddSlotCard>` — dashed-border empty state, "Create Extra Slot" CTA

### Acceptance criteria
- [ ] "Join Call" button state (active navy vs. muted gray) is driven by proximity to appointment start time, not hardcoded per card
- [ ] High-urgency card gets the red border treatment automatically from an `urgency` field, not a separate manually-toggled variant

---

## Phase 3 — Patient File

### Components
- Patient header bento: avatar, name, ID badge, demographics/diagnosis line, attending physician, status chips (Critical Priority / Protocol Active), paired with an **SLA Breach Risk** card (red, large countdown) — same shared countdown primitive as everywhere else
- `<ActiveRegimenCard>` — circular progress ring (cycles complete), drug name, protocol code, "In Progress" status
- `<VitalsTrendCard>` — bar chart (weight) + line/sparkline (blood pressure), using real chart primitives, not decorative divs — this is actual patient data, treat it like the data-viz work it is rather than a static SVG
- `<CriticalLabPanelCard>` — 3 lab-value tiles (Creatinine/WBC/ANC pattern, but data-driven not fixed to these 3), each with a colored left-border by severity, value + unit + status label
- `<ClinicalActivityLogTable>` — timestamp, activity type (with icon), provider, status badge

### Acceptance criteria
- [ ] Lab panel tile count and severity coloring are data-driven (could be 2 tiles or 5, not hardcoded to 3)
- [ ] Vitals charts use a real charting approach (even a lightweight one) — the Figma's decorative bar divs are a visual reference, not the implementation target

---

## Phase 4 — Video Consult: Pre-call Briefing

### Scope
Waiting-room state before the patient joins. No daily-js call is active yet, but the room should already exist (created per Decision 2) so "Waiting for Patient to join" is real, not decorative.

### Components
- Left: static "Waiting for Patient" panel with a muted mic/camera preview control bar (disabled until join)
- Right: `<PreCallBriefingCard>` — primary diagnosis, blood type, last cycle date; `<LatestVitalsCard>` — heart rate, temp, BP, SpO2 with "updated at" timestamp; Next Action Recommendation callout (restyle per the design-system flag above)

### Acceptance criteria
- [ ] This screen actually polls/subscribes to the Daily room's participant state so "Waiting for Patient" transitions to the live Room (Phase 5) the moment the patient's client joins — it's not just a static screen the clinician manually clicks through

---

## Phase 5 — Video Consult: Room (daily-js integration)

### Scope
The actual call. Build the video mechanics fully; leave the transcript panel behind a clean interface so it can be wired to a real source once Decision 3 is made.

### Components
- `<DailyCallProvider>` — wraps the daily-js call object, exposes join/leave/local track state/remote participant state to children
- `<RemoteVideoTile>` — full-bleed remote participant video
- `<LocalVideoPiP>` — floating self-view, rounded corners, recording-indicator badge when applicable
- `<VideoHUD>` — top-left connection/encryption badges, call duration timer
- `<ControlBar>` — mic toggle, camera toggle, screen-share (if in scope), divider, "End Call" (red)
- `<SafetyCheckBanner>` — static/data-driven alert derived from patient data (e.g., elevated lab value), not video-related — keep this component decoupled from the daily-js layer entirely
- `<TranscriptPanel interface>` — **build this against a defined interface** (`{speaker, timestamp, text}[]`, streaming or polled) so Phase logic doesn't care whether it's fed by Daily's native transcription or a separate pipeline later. For now, this can render an empty/placeholder state honestly ("Transcription not yet connected") rather than fake data — same principle as how Settings' disabled toggles were handled in Regional Admin.
- Tabs: Live Transcript / Quick Summary — Quick Summary can similarly be a placeholder until Decision 3 lands
- `<ClinicalObservationsInput>` — free-text field, independent of transcription, saves to the patient record directly

### Acceptance criteria
- [ ] Mic/camera/leave controls are wired to the real daily-js call object, verified with two browser tabs/devices actually connecting
- [ ] `TranscriptPanel` and `Quick Summary` are honestly empty/placeholder, not fake data, until Decision 3 is resolved — do not simulate transcript content
- [ ] Clinical Observations field works and persists independently of the transcript feature

---

## Phase 6 — Video Consult: Post-call Summary

### Scope
Structured note editor, populated from the (eventual) transcript. Buildable now with manual/editable fields; auto-population is a follow-up once Decision 3 lands.

### Components
- `<SummaryEditor>` — rich-text-lite sections (Patient Assessment, Clinical Findings, Intervention & Plan as a bulleted list), "AI Transcript Synced" status pill (should reflect real state — greyed out / "Manual entry" until a real transcript source exists), Edit Draft / Sync to EHR & Finalize buttons
- `<QuickReferenceSidebar>` — vitals-during-session cards (reuses the vitals card pattern from Patient File), Post-Consult SLA countdown (shared primitive again)

### Acceptance criteria
- [ ] "AI Transcript Synced" badge only shows when there's an actual synced transcript backing it — don't ship a badge that always claims AI synthesis happened
- [ ] Sync to EHR & Finalize is a real state transition (locks the note, starts the post-consult SLA clock via the shared aggregator), not just a button

---

## Phase 7 — System Settings (Consultant)

Same pattern as Regional Admin's Settings phase: Profile Information (photo, name, specialization, read-only Clinical ID), Consultation Preferences (toggles, default video quality select, AI flagging sensitivity range slider), Alert Configuration (toggles, SLA threshold radio group, informational callout), Interface Settings (theme mode, font scaling). Reuse the shared `<Toggle>` component from Regional Admin's Settings phase rather than rebuilding it.

### Acceptance criteria
- [ ] Range slider (AI flagging sensitivity) is a real functional slider, not a static bar
- [ ] Same honesty rule as before: any preference without real backing data ships disabled, not fake-functional

---

## Phase 8 — Notification Center (Consultant)

Two-column + system log pattern: Critical Alerts (red) and a right-side Patient Messages + System Logs panel, distinct layout from Regional Admin's 3-column bento but same underlying principle — **this should read from the same kind of shared alert aggregator concept established in Regional Admin, extended to cover consult-specific alert types (safety checks, lab flags) rather than reinventing detection logic per persona.**

### Acceptance criteria
- [ ] Alert cards' action buttons route to the real source (patient file, video room), not a generic destination
- [ ] System log table is read-only, chronological, and doesn't duplicate the alert cards above it
