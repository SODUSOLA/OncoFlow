# OncoFlow Regional Admin — Phased Build Guide

For AI coding agent consumption (Claude Code / OpenCode), one phase at a time. Read `ONCOFLOW_DESIGN_SYSTEM.md` before starting any phase — every token, color, spacing, and radius value below traces back to it. Never invent a value not in that doc; flag it instead.

**Standing rule for every phase:** build the shared/reusable component once; screens consume it via props. No copy-pasted sidebar/topbar per screen.

---

## Phase 1 — Shared Application Shell

### Scope
Sidebar navigation + TopAppBar + page layout wrapper. Every other phase renders inside this shell.

### Components

**`<Sidebar />`**
- Fixed width `256px`, `bg-white`, right border `#C4C6CF`
- Logo block: 24px padding, logo image (~131×54px) + "Oncology Portal" label below (14px/20px, 600, `#000A1E`)
- "New Consultation" button: full width minus 32px (16px margin each side), `bg-#002147`, white text, 12px/16px 600, 44px height, radius `4px`
- Nav list: each item 44px height, 12px/16px padding, radius `4px`
  - Default state: transparent bg, `#000A1E` text/icon
  - Active state: `bg-#FED65B`, `#745C00` text/icon
- Footer (pinned to bottom): top border `#2D476F`, 16px padding, avatar (32px circle, `#EFEDF1` bg) + "Regional Admin" label (12px/16px, 400, `#1A1B1E`)

**`<TopAppBar title={string} rightSlot={ReactNode} />`**
- Height `64px`, bg `#FAF9FD`, bottom border `#C4C6CF`
- Left: `title` prop, rendered per-screen type scale (H2 24/32/700 or H3 20/28/600 depending on screen — confirm per phase)
- Right cluster (default, overridable via `rightSlot`):
  - Search input: 256px wide, icon-left, bg `#F4F3F7`, border `#C4C6CF`, radius `4px` or `12px` (varies by screen — check Phase spec)
  - Notification bell icon button with unread-dot badge (`#C92A2A`, 8px)
  - "System Online" status pill: `bg-#E4E2E4` or transparent, green dot (`#2D6A4F`) + label
  - Profile avatar (32px) + name, right-aligned

**`<AppShell />`**
- Wraps `<Sidebar />` + main column
- Main column: `<TopAppBar />` (fixed) + scrollable content area, `bg-#F8F9FA`, padding `24-32px` (confirm per screen in later phases)

### Acceptance criteria
- [ ] Sidebar is a single component instance, reused across every route — not duplicated markup per page
- [ ] Active nav state driven by current route, not a hardcoded prop per screen
- [ ] Zero hardcoded hex/px values in these three components — everything pulled from design tokens (Tailwind theme extension, CSS variables, or equivalent per the target stack)
- [ ] Renders correctly at both 1024px and 1280px content widths (both appear across the 8 screens)

---

## Phase 2 — Dashboard / 7-Day Pre-Chemo Countdown
*(pending confirmation — draft below)*

### Scope
Global stats bar (4 metric cards) + 4-column Kanban board (Day 7 / Day 5 / Day 3 / Day 0), each column scrollable, Day 0 column visually distinct (terminal/success state).

### Components
- `<StatCard variant="neutral|danger|warning|success" label value icon />`
- `<KanbanColumn dayLabel count variant="default|terminal">` — header (bg `#EFEDF1` default / `#2D6A4F` for Day 0) + scrollable card list
- `<PatientCard>` — patient name, ID, protocol tag, status badge, optional SLA countdown, optional action button (Escalate/Nudge MD)
- `<SlaCountdown state="normal|warning|breached" time />`

### Open question for you
The countdown card's SLA badge has 3 visual states (normal gray, warning orange, breached red-bold-with-left-border). Should the breach state also trigger anything functionally (e.g., auto-escalation, notification), or is this phase purely visual/static for now?

---

*(Phases 3–8 to be specified after Phase 2 is confirmed)*
