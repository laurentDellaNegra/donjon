# Flux Design System

Status: implemented as the default Donjon dashboard.

Reference:

- Local image: `proto/ChatGPT Image May 24, 2026, 02_42_55 PM.png`
- Production dashboard: `src/ui/FluxDashboard.tsx`
- Production CSS: `src/ui/fluxDashboard.css`
- Design tokens: `src/ui/design-system/tokens.css`

## Goal

Apply the Flux Observatory design to the whole Donjon dashboard while preserving live runtime behavior.

Success criteria:

- The default dashboard route uses the Flux visual system without requiring a query param.
- The app keeps live data behavior: event stream, run selection, logs, inspector, and workflow graph context.
- Visual styling is expressed through reusable design tokens and scoped component classes.
- Fixture data and temporary visual alternatives are removed from production.
- The UI works at desktop, tablet, and mobile widths without overlapping text or broken controls.

## Design Language

Flux is a dark operational cockpit for local AI orchestration.

Core visual traits:

- Dense data surface with restrained neon accents.
- Dark blue-black panels, fine cyan grid lines, and thin glowing dividers.
- Cyan for active telemetry and primary emphasis.
- Green for healthy/completed states.
- Pink for failed/error states.
- Amber for warnings and secondary highlights.
- Small uppercase labels for scanability.
- Compact panels with 8px radius or less.
- Functional panels only; no nested decorative cards.

## Tokens

Use CSS custom properties first. Component CSS should consume tokens instead of hard-coded values.

Primary token file: `src/ui/design-system/tokens.css`

State mapping:

- `active`: cyan.
- `completed`, `healthy`, `success`: green.
- `failed`, `error`, `critical`: pink.
- `warning`, `attention`: amber.
- `idle`, `unknown`, `empty`: muted text and low-contrast panel surface.

Typography:

- Body: Inter/system UI.
- Metric values: 23px, 850 weight, line-height 1.05.
- Page title: 34px desktop, 28px mobile, line-height 1.05.
- Panel titles and labels: 11-12px uppercase, 760-850 weight.
- Body copy: 12-14px, no negative letter spacing.

## Layout System

Primary shell:

- Desktop: fixed left nav rail, content grid on the right.
- Main content rows: header, KPI strip, workspace, bottom telemetry.
- Workspace columns: run list, workflow graph, selected run inspector.
- Bottom row: recent activity, run timeline, session health overview.

Responsive behavior:

- Below 1180px: collapse workspace to one column and KPI/bottom panels to two columns.
- Below 760px: move nav rail to a compact top rail and collapse all major grids to one column.
- Preserve stable dimensions for KPI cards, run rows, and workflow nodes.

## Production Surface

`FluxDashboard` currently owns the production composition:

- Summary rail with live run/log counts and no fake navigation.
- Header with live session status and health.
- KPI strip backed by event, failure, duration, and active-run state.
- Run list with selection behavior.
- Workflow graph backed by real run relationships, roles, commits, and log state.
- Run inspector with operational details and progress.
- Activity panel with existing log filters.
- Session health overview backed by live run and sandbox counts.

The current consolidation is intentional while the UI is small. Extract primitives such as `Panel`, `StatusBadge`, `KpiCard`, `RunList`, `TopologyPanel`, and `ActivityPanel` only when reuse or complexity justifies it.

## Accessibility And Interaction

Baseline requirements:

- Use semantic regions: `header`, `nav`, `main`, `section`, `aside`.
- Every clickable control must be a real `button` or link.
- Active navigation and selected run state must be exposed with `aria-current` or equivalent state.
- Do not rely on color alone for status; pair status color with text labels or glyphs.
- Maintain visible focus styles using Flux tokens.
- Keep contrast readable on dark panels, especially muted text.
- Respect `prefers-reduced-motion`; glows are fine, required animation is not.
- Avoid viewport-scaling fonts. Use responsive layout, not responsive type.

## Guardrails

- Keep fixture data and temporary visual alternatives out of production.
- Do not add nonfunctional controls; use labels for unavailable navigation until routes exist.
- Derived values must come from real state and be labeled clearly.
- Keep all visual primitives token-driven.
- Keep CSS scoped by component/system classes; avoid broad element selectors outside the app root.
- Preserve current behavior before changing information architecture.

## Verification

For UI changes, run:

- `npm run typecheck`
- `npm test`
- `npm run build:ui`

Manual checks should cover empty state, active run, completed run, failed run, long branch names, long log lines, desktop/tablet/mobile widths, and no query-param fallback.
