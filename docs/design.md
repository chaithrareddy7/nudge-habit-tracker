# Nudge — UI/UX Direction

What Nudge should look and feel like, and the design system that delivers it. Implementation lives in `src/styles/theme.css`, `src/ui/kit.tsx` and `src/ui/widgets.tsx`.

## 1. Personality

A **calm personal planner with a precise dashboard inside**. It should feel like a well-made paper planner that quietly does the maths, not a corporate BI tool and not a game.

- **Calm**: neutral surfaces, generous but efficient spacing, one accent colour.
- **Focused**: each screen has one hero (the timer, the timeline, the week board, the calendar); everything else supports it.
- **Encouraging, never judgmental**: progress is framed as information ("3h 25m to go"), never failure.
- **Fast**: capture anything in seconds; the main action is always visible.

## 2. Visual language

### Colour
| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Background `--bg` | `#f7f5f4` | `#121011` | page |
| Surface `--surface` | `#ffffff` | `#1a1719` | cards, inputs |
| Surface 2/3 | `#f6f3f3` / `#ece7e8` | `#211d20` / `#2a2528` | tiles, tracks, hovers |
| Ink `--ink` / 2 / 3 | `#231a1f` / `#5d5157` / `#8c8086` | `#f6ecf1` / `#c9b5c0` / `#8f838a` | text hierarchy |
| Accent `--accent` | `#c45d82` (blush) | `#e27aa0` | primary actions, selection, progress |
| Accent soft | `#fbe8ef` | `#3a2230` | selected chips, highlights |
| Planned `--planned` | `#cdbac4` | `#5b4a53` | "planned" series only |
| Status | good `#1d8a5a` · warn `#b86e00` · bad `#c23b3b` | lighter steps | status only, always with text/icon |
| Streak `--streak` | `#c8551f` | `#f08a55` | flame counts |

**Rules:** surfaces are neutral. Pink is reserved for actions, selection, progress and the one thing that needs attention, so if everything is pink, nothing is.

**Categorical palette** (categories, goals, habits; fixed order, colour-blind-safe): blue `#2a78d6`, orange `#eb6834`, aqua `#1baf7a`, yellow `#eda100`, magenta `#e87ba4`, green `#008300`, violet `#4a3aa7`, red `#e34948`. Dark mode uses matched steps via `useSeriesColor()`.

### Typography
| Font | Use |
| --- | --- |
| **DM Sans** (`--font-ui`) | body, controls (14 px base) |
| **Manrope** (`--font-head`) | headings, stat values (page title 20–24 px, card title 15 px) |
| **Fraunces** (`--font-display`) | greeting, main focus, hero numbers: the "planner" warmth |
| **JetBrains Mono** (`--font-mono`) | live clocks, keyboard hints |

Numbers use `font-variant-numeric: tabular-nums`. Eyebrows are 10–11 px uppercase with letter spacing.

### Shape and depth
Radius 10 / 16 / 22 px (small / card / modal). Shadows are very soft (`--shadow`); borders (`--line`) do most of the separating. Motion: 150–250 ms with `--ease`; `prefers-reduced-motion` disables it.

## 3. Layout

| Breakpoint | Behaviour |
| --- | --- |
| > 1024 px | Fixed 232 px sidebar + topbar (search, sync status, Quick add) |
| ≤ 1024 px | Sidebar becomes a drawer (menu button) |
| ≤ 720 px | Bottom tab bar (Today · Timer · Planner · Habits · More), floating + button, compact topbar |
| ≤ 640 px | Page subtitles hidden, cards 14 px padding, stat grids 2 columns, single-column layouts |
| 360 px | Minimum supported width; must not scroll horizontally |

- Content max-width 1280 px, 28 px gutters (16 px on phones).
- **Above-the-fold rule:** on a 1470×700 laptop the screen's hero (timeline, board, calendar, today's cards) starts within about 300–420 px of the top.
- Page header: eyebrow, title, optional one-line subtitle, actions on the right. Planner views use a slim header row (‹ › date, "Today" chip, actions) under the Planner tabs.

## 4. Navigation and information architecture

- **Plan**: Today, Focus timer, Planner (tabs: Day · Week · Month · Calendar; remembers the last view)
- **Track**: Goals, Habits, Tasks, Journal
- **Reflect**: Analytics, Insights, Guide
- Profile and Settings at the bottom of the sidebar; search and Quick Add in the topbar.
- Global shortcuts: `N` Quick Add, `T` timer, `/` search, `Esc` close.

## 5. Component patterns

| Pattern | Guidance |
| --- | --- |
| **Card** | White surface, 1 px line, 16 px padding, title 15 px plus optional sub and right-aligned action link |
| **Stat strip** | One compact row of small stats (label, value, sub) separated by dividers; 2-column grid on phones |
| **Empty state** | Compact: small icon, one-line title, one sentence, one action. Never a giant empty card. Never zero-axis charts |
| **First-run** | Getting started checklist (6 steps) on Today; templates on Goals and Habits; Guide link |
| **Lists** | 44 px rows on touch; round tick for habits, square tick for tasks; strike-through when done |
| **Modals** | Centered on desktop, bottom sheet on phones; footer with destructive action left, primary right |
| **Destructive actions** | Two-step `ConfirmButton` |
| **Toasts** | Bottom centre, short, optional Undo/Open action; "celebrate" variant only for streak milestones |
| **Live timer** | Floating dock on every screen except Today and Timer; pulsing dot when running |
| **Collapsible sections** | Day planner side column; state remembered per device |

## 6. Data visualisation

- Choose the form by job: stat tile (one number), bars (per day), lines (trends), horizontal bars (category share), heatmap (weekday × hour, single-hue accent ramp).
- Planned = `--planned`, actual = `--accent`, categories = their colour.
- Thin bars, 4 px rounded ends, recessive horizontal grid, no axis lines, no dual axes.
- Tooltip on every chart; legend for ≥ 2 series; "View as table" for accessibility.
- No data → one-line message, not an empty chart.

## 7. Voice and tone

| Do | Don't |
| --- | --- |
| "3h 25m to go — steady progress." | "You're behind!" |
| "An open day — nothing blocked out yet." | "No data." |
| "Check off a habit or track focus on consecutive days to start a streak." | "Streak lost 😢" |
| "Sessions under a minute aren't saved." | "Error: invalid duration" |

Sentence case everywhere; numbers and units are exact ("1h 35m", not "1.58 hours").

## 8. Accessibility

- WCAG AA contrast for text; status always paired with text or icon.
- Visible focus ring (`--focus-ring`); "Skip to content" link; `aria-label` on icon buttons; `role="checkbox"` + `aria-checked` on ticks; progress bars with `aria-valuenow`.
- Keyboard: timeline blocks movable with arrows (Shift to resize); every action reachable without a mouse.
- Respect `prefers-reduced-motion` and the light/dark/system theme preference.

## 9. Do / don't summary

- ✅ One hero per screen · neutral surfaces · pink for actions · compact empties · test at 360 px and 1470×700 · both themes.
- ❌ Pink tinted cards everywhere · tall stacked headers · duplicate titles (big date plus a stepper showing the same date) · zero-filled charts · multiple identical-looking switchers stacked · raw hex in screen CSS.
