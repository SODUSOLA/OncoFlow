# OncoFlow Regional Admin — Design System (extracted from Figma)

Source: real CSS specs pulled from the ONCOFLOW Figma file (node IDs listed at the bottom), not inferred from screenshots. Treat every value below as ground truth — Claude Code should not substitute a "close enough" Tailwind default.

---

## ✅ Palette decision — LOCKED

The file contained two divergent token sets (Countdown/Scheduling/Invoice/Clinical Message vs. Inquiry Inbox/Notification Center/Settings). **Palette A is canonical for the entire build.** Any screen originally specced in Palette B (`#BA1A1A` red, `#FDDD7C` warning, `#1B5E20`/`#525F76` green, `#C5C6CD` border, `#1B1B1D`/`#1A1B1E` text) is remapped to Palette A's equivalents below. Claude Code must never reintroduce the Palette B values.

---

## Typography

Font: **Public Sans** everywhere (weights 400, 500, 600, 700 in active use; a couple of stray 800/900 headers that should probably just be 700 — likely accidental).

| Role | Size / Line-height | Weight | Tracking |
|---|---|---|---|
| H1 (page title) | 32px / 40px | 600–700 | -0.64px |
| H2 (brand/app title) | 24px / 32px | 700 | — |
| H3 (section/card header) | 20px / 28px | 600 | — |
| H4 (card title) | 16px / 24px | 600 | — |
| Body | 16px / 24px | 400 | — |
| Body small | 14px / 20px | 400–600 | 0.14px (when 600) |
| Caption / label | 12px / 16px | 400–700 | 0.6px (uppercase labels) |
| Micro badge | 10px / 20px | 400 | uppercase |

## Spacing & Shape

- Base grid: **4px** (4, 8, 12, 16, 24, 32 in practice)
- Sidebar width: **256px**, fixed, on every screen
- Top bar height: **64px**
- Border radius: `2px` buttons/badges · `4px` cards · `8px` large containers/columns · `12px` avatars, toggle pills, nav icon buttons
- Card shadow (default): `0px 1px 2px rgba(0,0,0,0.05)`
- Elevated/warning shadow: `0px 2px 8px rgba(230,126,34,0.15)` (or equivalent tint for danger/success elevation)

## Core colors (Palette A — recommended canonical)

```
Page bg:            #FAF9FD
Canvas bg:           #F8F9FA
Card bg:            #FFFFFF
Card alt bg:        #F4F3F7
Border:             #C4C6CF
Sidebar footer border: #2D476F   (dark navy — distinct from the general #C4C6CF border, sidebar footer only)
Text primary:       #000A1E
Text secondary:     #44474E
Text alt (icon/label on light chips): #1A1B1E   (used on avatar-chip labels, not a general text-primary substitute)
Disabled/readonly:  #E3E2E6 / #E9E7EB
Icon-button hover/pressed bg: #EFEDF1
Alt chip/badge bg:  #E4E2E4
Danger:             #C92A2A   (deep text-on-tint: #93000A)
Warning:            #E67E22
Success:            #2D6A4F
Sidebar CTA:        #002147
Sidebar active nav: #FED65B bg / #745C00 text
```

**Added 2026-09 after Phase 1/2 build:** `#2D476F`, `#EFEDF1`, `#E4E2E4`, `#1A1B1E` were present in the real Figma CSS specs (sidebar footer border, icon-button states, alt chip bg, chip text) but missing from the original token table above. Claude Code correctly flagged rather than guessed — these are now canonical, not substitutions.

---

## Component inventory (state-complete)

1. **Sidebar nav** — logo, "New Consultation" CTA (`#002147`), nav list (default / active `#FED65B`), user footer card. Identical structure across all 8 screens — build once, reuse everywhere.
2. **Top app bar** — page/section title, search input, icon buttons (bell w/ unread dot, status/shield icon), "System Online" pill, profile avatar + name. Structure repeats; content varies per screen.
3. **Stat/metric card** — label + big number + icon. Variants: neutral border, danger left-border+red number, warning border+orange number, success accent.
4. **Kanban day column** (7-Day Countdown) — column header (day label, count badge), patient card (protocol tag, status badge, countdown, action button), plus a fully-styled "Day 0" terminal column (dark green header, locked/checked-off cards, primary CTA).
5. **SLA countdown/badge** — 3 states: normal (gray), warning (orange, ~5min), breached (red, bold, often with a colored left-border strip on the parent card).
6. **Allocation data table** — header row, alternating-opacity day columns, avatar-chip cells for assigned nurses, a highlighted "conflict day" column (red border + tint), row action buttons (Assign/Reassign/Review).
7. **Wizard stepper** (Invoice Generator) — step states: completed (green icon, left border), active (dark border, expanded form fields), locked (dimmed, non-interactive).
8. **Computed preview panel** — pending line items (italic, "--"), locked total, disabled submit button, diagonal "DRAFT" watermark at 5% opacity.
9. **Three-pane clinical chat** — thread list (active highlight, unread badge), message bubble (plain / with file-attachment card), right-rail patient context (identity card, clinical summary, allergy chips).
10. **Inquiry inbox list item** — 4 states: SLA breached (red left-border + tinted bg), unread/new (bold text, yellow "ACTION REQUIRED" tag), normal/ongoing (checkmark icon), auto-replied (italic body, gray "AUTO-REPLIED" tag).
11. **Notification bento grid** — 3 fixed columns (Critical / Action Required / System Log), each with its own card variant and accent color.
12. **Settings/Configuration page** — avatar + form card, toggle switch (on/off/disabled), segmented control (Light/Dark), primary save button.

---

## Consulting Oncologist persona — token reconciliation (2026-09)

Same split as Regional Admin: Appointment Grid, Patient File, and the Video Consult screens use Palette A. System Settings and Notification Center for this persona were specced in Palette B again. Remapped to Palette A per the established rule:

```
#BA1A1A (danger)         → #C92A2A
#C5C6CD (border)         → #C4C6CF
#F5F3F5 (input/card bg)  → #F4F3F7
#E1E4E8 (light border)   → #C4C6CF
#2E7D32 (toggle-on green)→ #2D6A4F
#EF6C00 (warning alt)    → #E67E22
#0F1C30 (dark button)    → #002147
```

New tokens genuinely not covered by existing Palette A (kept, not remapped):
```
Info/ID accent:          #D6E3FF bg / #001B3D text   (patient ID badges)
Dark-surface label text: #708AB5                      (labels on dark/video-room-only surfaces)
```

**Flagged for simplification, not carried forward as a token:** the pre-call briefing's "Next Action Recommendation" box used a one-off dark-amber treatment (`#3D1500` bg / `#B97958` text) found nowhere else in the file. Recommend using the standard warning treatment (light amber tint + dark text, same as other warning callouts) instead of introducing a dark-mode-only pattern for one component. Flag to design if intentional.

## Source node IDs (for re-verification against Figma)

| Screen | node-id |
|---|---|
| 7-Day Pre-Chemo Countdown | `188-6577` |
| Scheduling & Allocation | `188-7113` |
| Invoice Generator | `192-8268` |
| Clinical Message (3-pane chat) | `202-8497` |
| Inquiry Chat Inbox (state set 1) | `253-2` |
| Inquiry Chat Inbox (state set 2) | `253-1344` |
| Notification Center | `253-206` |
| System Settings / Configuration | `253-417` (also `253-419`) |
