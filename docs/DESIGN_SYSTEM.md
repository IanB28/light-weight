# Light-Weight visual system

`apps/web/src/index.css` is the visual authority. Shared primitives in `apps/web/src/components/ui/` and `ViewHeader` consume its semantic tokens. This document describes the implemented foundation, not a screen redesign or a future theme proposal.

## Themes

Midnight is the `:root` default. `html[data-theme]` supplies Carbon, Sunset, Frost, Aurora, and Amethyst. Every shared primitive uses the same semantic roles in all six contexts; no component branches on a theme name. Frost is a light theme with its own text, border, focus, overlay, and opaque-surface values. The Frost compatibility rules for legacy hardcoded classes remain temporary and are not dependencies of the shared primitives.

## Semantic roles and surface levels

| Level | Purpose | Tokens / classes |
| --- | --- | --- |
| 0 | App canvas | `--app-bg`, `--app-gradient` |
| 1 | Main card | `--surface`, `--border-subtle`, `.glass-surface`, `AppCard` |
| 2 | Nested control or input | `--surface-input`, `--border-subtle`, `.glass-subcard`, `SearchInput` |
| 3 | Elevated card, floating surface, dialog | `--surface-elevated`, `--border-active`, `.ui-elevated-surface`, `.ui-modal-surface` |
| Active | Selected or pressed control | `--surface-active`, `--border-active`; selection can use `--accent-color` and `--accent-fg` |

The elevated roles have explicit CSS rules, so a base glass class cannot silently override their background, border, or shadow. Main glass is moderately blurred; nested inputs are not blurred; floating panels have restrained additional elevation. `--surface-solid` and `--surface-elevated-solid` provide readable opaque fallbacks when blur is unsupported or reduced transparency is requested. Frost overrides both opaque values. Existing `--shadow-card`, `--shadow-floating`, `--shadow-modal`, and `--shadow-accent` express elevation, not decoration to stack indiscriminately.

Other shared roles are `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-color`, `--accent-fg`, `--accent-soft`, `--danger`, `--danger-soft`, `--success`, `--warning`, `--warning-soft`, `--focus-ring`, `--overlay-backdrop`, and `--overlay-backdrop-solid`. `--border-glass` remains available for legacy surfaces, while shared elevated surfaces use the stronger `--border-active` boundary. Avoid raw theme-specific colors inside shared components.

## Typography, spacing, and radii

The shared type hierarchy is `.ui-screen-title` for top-level view titles, `.ui-section-title` for section titles, `.ui-card-title` for card and feedback titles, `.ui-body` for ordinary copy, `.ui-body-secondary` for supporting copy, and `.ui-caption` for metadata. `.ui-metric` uses tabular numerals and strong weight; `.ui-unit` is smaller and muted. Components may use ordinary Tailwind utilities when this hierarchy does not warrant a wrapper component.

`--page-horizontal`, `--section-gap`, `--card-padding`, and `--compact-card-padding` provide layout rhythm. The 320px breakpoint tightens the page and card spacing. Radius roles are `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-xl`; shared components use the corresponding `rounded-ui-*` utilities. Long titles and control labels wrap or truncate deliberately, rather than widening the viewport.

## Shared controls and feedback

`Button` keeps primary, secondary, ghost, and danger variants, with sm/md/lg heights. The primary role is reserved for prominent actions. Native disabled semantics and `aria-busy` for loading remain intact. `IconButton` requires an accessible `aria-label` and provides 44px/48px circular targets. `.ui-pressable` gives a small non-layout-shifting press response; the global reduced-motion rule suppresses transitions.

`Badge` is passive metadata. `Chip` is an interactive filter with `aria-pressed`; `SegmentedControl` has stable equal-width segments and `aria-pressed`. Its icons yield to full labels in narrow containers. `SearchInput` and `OptionPicker` use the same input surface, border, radius, and `.ui-focus-visible` treatment. Option selection follows the current accent, while focus remains a separate accessibility role. `OptionPicker` retains its dialog trigger and listbox/option selection semantics. `SectionHeader` places a distinct section title beside optional metadata and a width-bounded action. `ViewHeader` owns the responsive screen-title hierarchy and preserves its workout, profile, settings, and sync affordances.

`EmptyState`, `LoadingState`, and `ErrorState` share icon geometry, title and description hierarchy, and action spacing. Loading reserves a stable icon area; error uses restrained danger colors and an explicit retry action when supplied.

## Overlays, motion, and accessibility

`Modal` portals to `document.body`, locks scrolling, traps Tab focus, closes on Escape, restores prior focus, and connects its title and optional description with `aria-labelledby` / `aria-describedby`. `.ui-modal-backdrop` uses semantic overlay tokens; `.ui-modal-surface` uses the elevated panel role. `BottomSheet` retains bottom anchoring, safe-area bottom padding, internal scrolling, and desktop modal behavior. It does not claim drag-to-dismiss.

Keyboard focus uses `.ui-focus-visible` with `--focus-ring`, including a Frost-specific ring and forced-colors fallback. The existing global `prefers-reduced-motion` rule remains authoritative and also removes the button press transform. Shared glass and modal surfaces use opaque alternatives for `prefers-reduced-transparency: reduce` and `prefers-contrast: more`; shared controls receive stronger borders in high contrast. A no-`backdrop-filter` fallback covers browsers without blur support. `prefers-reduced-transparency` is not universal, so readable opaque fallbacks do not depend on that media query alone.

BottomNav uses a single bounded 20px backdrop blur, translucent theme tint, restrained inset reflection and an internal selected glass pill. `--nav-sheen` controls the reflection independently of accent; Frost has a light tint and its own elevation. Decorative layers are rounded, clipped to the capsule and pointer-inert. Selection changes opacity and color only; all five slots retain equal widths and touch targets. Forced colors uses system colors and an explicit selected border; increased contrast/reduced transparency remove blur and reflection.

The navigation portal remains directly under `document.body`, fixed to the viewport bottom. No scroll listeners or per-frame positioning are used. `--bottom-nav-surface-height` and `--bottom-nav-bottom-gap` define its occupancy, with page clearance retaining `--bottom-nav-height` compatibility. `.bottom-above-nav` uses the same height/gap so the rest timer respects safe-area without adding it twice. Coarse-pointer editable focus intentionally hides and makes the navigation inert; pending focus timers are canceled on teardown. Browser chrome, physical keyboard and pinch zoom remain browser-managed viewport changes rather than content-height positioning signals.

## Migration boundary

VP.1 updates only the shared foundation. The legacy Frost compatibility shim stays until page-specific hardcodes are migrated. Remaining manual colors, blur, shadows, and radii belong to later scoped work: VP.2 Home/Plan, VP.3 Workout, VP.4 Stats/charts, VP.5 Library, VP.6 Profile/Friends, VP.7 specialized sheets/modals/feedback, and VP.8 final cross-app cleanup. No business logic or navigation-positioning change is implied by this document.
