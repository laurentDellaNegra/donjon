# MVP v2 Implementation Checklist

## Phase 1: Sandcastle Compatibility

- [ ] Create `Tasks/sandcastle-api-notes.md`.
- [ ] Install or link a real Sandcastle test project.
- [ ] Capture current public exports.
- [ ] Capture current run option/result shapes.
- [ ] Capture current sandbox option/result shapes.
- [ ] Capture logging callback event shapes.
- [ ] Define minimum supported Sandcastle version.

## Phase 2: Wrapper Runtime

- [ ] Add schema version to Donjon events.
- [ ] Add richer session metadata.
- [ ] Improve run option extraction.
- [ ] Improve run result extraction.
- [ ] Emit commit events with message, author, branch, and timestamp when available.
- [ ] Emit worktree events when available.
- [ ] Emit branch events when available.
- [ ] Preserve all user logging callbacks.
- [ ] Add tests for pass-through behavior when Donjon is disabled.
- [ ] Add tests for wrapped logging behavior when Donjon is enabled.
- [ ] Add tests for error propagation.

## Phase 3: CLI

- [ ] Add `--no-open` flag.
- [ ] Add `--port` flag for deterministic local testing.
- [ ] Forward `SIGINT` and `SIGTERM` to the child process.
- [ ] Keep final dashboard state available long enough after child exit.
- [ ] Improve `tsx` resolution before falling back to `npx tsx`.
- [ ] Improve terminal summary after run completion/failure.
- [ ] Add CLI tests for run command environment variables.

## Phase 4: Server and Persistence

- [ ] Add event schema validation at ingestion boundaries.
- [ ] Add session state snapshot persistence.
- [ ] Add replay endpoint for saved sessions.
- [ ] Add health endpoint for doctor.
- [ ] Add bounded in-memory event retention.
- [ ] Make static asset serving test-covered.

## Phase 5: Dashboard

- [ ] Add session timeline.
- [ ] Improve graph layout for parallel runs.
- [ ] Add branch/commit panel.
- [ ] Add sandbox panel.
- [ ] Add iteration panel.
- [ ] Add disconnected state.
- [ ] Add replay mode.
- [ ] Add keyboard-friendly selection.
- [ ] Add responsive layout verification.

## Phase 6: Init and Doctor

- [ ] Replace string codemod with AST-based import codemod.
- [ ] Print dry-run diffs.
- [ ] Detect package manager.
- [ ] Detect Sandcastle version.
- [ ] Detect missing wrapper imports.
- [ ] Detect unsupported sandbox provider paths.
- [ ] Detect missing dashboard assets.
- [ ] Detect local server binding issues.

## Phase 7: Integration Fixture

- [ ] Create `examples/sandcastle-basic`.
- [ ] Add fixture package scripts.
- [ ] Add fixture Sandcastle script using Donjon imports.
- [ ] Add documented API-key path if real agents are required.
- [ ] Add no-key smoke path if Sandcastle supports a fake/test agent.
- [ ] Add integration smoke script.

## Phase 8: Documentation and Release

- [ ] Update README for MVP v2.
- [ ] Add compatibility matrix.
- [ ] Add troubleshooting guide.
- [ ] Add known limitations.
- [ ] Add release checklist.

