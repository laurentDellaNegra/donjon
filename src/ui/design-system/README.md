# Flux Design System

Flux is Donjon's selected dashboard design: a dark, dense operational cockpit for AI orchestration and sandbox/run telemetry.

## Source Files

- `tokens.css`: global Flux design tokens.
- `../FluxDashboard.tsx`: production dashboard composition.
- `../fluxDashboard.css`: production dashboard component CSS.
- `../FLUX_DESIGN_SYSTEM.md`: design-system notes, component inventory, and production guardrails.

## Usage Rules

- Consume tokens first; avoid hard-coded Flux colors, spacing, radii, shadows, or type sizes in components.
- Use cyan for active telemetry, green for healthy/completed states, pink for failed/error states, and amber for warnings.
- Pair every status color with text. Never rely on color alone.
- Keep panel radii at `--flux-radius-md` or smaller.
- Keep typography fixed by role. Do not scale font size with viewport width.
- Prefer semantic HTML regions and real buttons/links for interactive controls.
- Keep fixture-only metrics out of production. Derived values must be based on real state and labeled clearly.

## Production Components

The current production surface is consolidated in `FluxDashboard` while the app is still small. Extract these primitives only when reuse or complexity justifies it:

- `AppShell`
- `NavRail`
- `PageHeader`
- `KpiCard`
- `Panel`
- `StatusBadge`
- `RunList`
- `WorkflowGraph`
- `RunInspector`
- `ActivityPanel`
- `ProgressStack`
