# MVP v2: Complete Sandcastle Integration

## Goal

Donjon MVP v2 should feel like a complete local control room for real Sandcastle projects:

1. A user installs Donjon from Git or npm.
2. A user updates Sandcastle imports to Donjon wrapper imports.
3. A user runs `donjon run .sandcastle/main.mts`.
4. Donjon opens a live dashboard.
5. Donjon shows all relevant Sandcastle activity with reliable event correlation.
6. Donjon preserves Sandcastle behavior, failures, return values, and exit codes.

## Product Scope

MVP v2 should integrate with Sandcastle as a companion package, not as a fork.

In scope:

- Full wrapper coverage for public Sandcastle APIs used by normal projects.
- Rich event capture from Sandcastle run lifecycle, sandbox lifecycle, logging callbacks, branches, commits, worktrees, tool calls, and iteration state.
- A dashboard that can inspect a real multi-agent Sandcastle run end to end.
- Persistent run history and replay from `.donjon/runs/<sessionId>`.
- A robust `init`, `doctor`, and `run` workflow for existing projects.
- Integration tests against a real Sandcastle fixture project.

Out of scope:

- Forking Sandcastle.
- Patching `node_modules`.
- Depending only on log-file parsing as the primary event source.
- Requiring Docker/Podman for dashboard demo mode.

## Integration Principles

- Sandcastle remains the source of truth.
- Donjon telemetry must be best effort and must never crash a Sandcastle run.
- Donjon must preserve user callbacks, options, return values, thrown errors, stdout, stderr, and exit codes.
- Donjon should prefer public Sandcastle APIs and documented hooks.
- Any behavior that depends on undocumented Sandcastle internals must be isolated, documented, and tested.

## Required Workstreams

### 1. Sandcastle API Audit

Audit the currently installed Sandcastle package and document:

- Public exports from `@ai-hero/sandcastle`.
- Public sandbox provider exports.
- `run()` option shape.
- `createSandbox()` option shape.
- Sandbox object methods and return values.
- `logging.onAgentStreamEvent` event shapes.
- Result shapes for branches, commits, iterations, completion signals, logs, and preserved worktrees.

Deliverable: a compatibility note in `Tasks/sandcastle-api-notes.md`.

### 2. Wrapper Completeness

Extend `donjon/sandcastle` wrappers so Donjon captures every observable public boundary:

- `sandcastle.run()`
- `sandcastle.createSandbox()`
- `sandbox.run()`
- `sandbox.interactive()`
- `sandbox.close()`
- Any additional public Sandcastle orchestration helpers discovered during the audit.

Required behavior:

- Transparent pass-through when `DONJON_ENABLED !== "1"`.
- Preserve file logging paths and user callbacks.
- Preserve stdout logging behavior without forcing file logging.
- Add Donjon-compatible file logging only when logging is absent and Sandcastle supports stream callbacks through file logging.
- Emit correlated `runId`, `sandboxId`, and `parentId` where possible.

### 3. Event Model v2

Expand the event model beyond MVP v1 while keeping backward compatibility.

Required additions:

- Stable schema version.
- Session metadata.
- Run parent/child relationships.
- Agent identity.
- Sandbox provider identity.
- Iteration started/completed state if observable.
- Branch metadata.
- Commit metadata.
- Worktree metadata.
- Tool-call start/end/error if observable.
- Process signal and exit metadata.

### 4. Dashboard v2

Make the dashboard useful for real Sandcastle runs:

- Session timeline.
- Run graph with parent/child relationships.
- Branch and commit graph.
- Sandbox inspector.
- Run inspector.
- Iteration inspector.
- Live log stream with filters.
- Error-focused view.
- Persisted run replay from saved NDJSON events.
- Empty, loading, disconnected, and completed states.

### 5. CLI v2

Harden `donjon run`:

- Signal forwarding.
- Graceful server shutdown.
- Robust child-process exit handling.
- Configurable open/no-open behavior.
- Stable project directory handling.
- Better `tsx` resolution.
- Clear terminal output.
- Useful failure messages.

Improve `donjon init`:

- AST-based import codemod.
- Dry-run diff output.
- Safe package script mutation.
- Detection of unsupported project shapes.

Improve `donjon doctor`:

- Check package manager.
- Check Sandcastle version.
- Check wrapper import coverage.
- Check sandbox provider availability.
- Check dashboard asset availability.
- Check local port binding.
- Print exact next command.

### 6. Persistence and Replay

Persist enough data to reopen a completed session:

- `metadata.json`
- `events.ndjson`
- Optional state snapshot for fast dashboard load.

Dashboard should support:

- Live mode.
- Replay mode from a saved session.
- Clear indication when a session is no longer live.

### 7. Real Integration Fixture

Create a fixture project that represents real target usage:

- Has `@ai-hero/sandcastle`.
- Installs Donjon as a local package.
- Uses `donjon/sandcastle` imports.
- Exercises at least one top-level run and one sandbox run.
- Can run without real API keys where possible using a fake/test agent path, or documents required credentials.

### 8. Documentation

Update README and add docs for:

- Installation from Git and npm.
- Migration from Sandcastle imports.
- Real Sandcastle example.
- Demo mode.
- Doctor output.
- Troubleshooting missing stream events.
- Limitations and compatibility matrix.

## MVP v2 Acceptance Criteria

- `npm install` works in this repo.
- `npm run build` works.
- `npm test` works.
- `npx donjon demo` opens a useful dashboard.
- `npx donjon run .sandcastle/main.mts` works in a real Sandcastle project.
- Dashboard shows run lifecycle, sandbox lifecycle, agent text, tool calls, failures, branches, commits, worktrees, and iteration counts when Sandcastle exposes them.
- Donjon exits with the child script exit code.
- Donjon does not crash or alter Sandcastle behavior when the dashboard server is unavailable.
- Donjon does not require source changes inside Sandcastle or `node_modules`.

