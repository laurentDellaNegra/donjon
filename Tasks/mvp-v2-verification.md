# MVP v2 Verification Plan

## Local Package Verification

Run from the Donjon repository:

```bash
npm install
npm run build
npm run typecheck
npm test
npx donjon doctor
npx donjon demo
```

Expected result:

- Build succeeds.
- Tests pass.
- Doctor prints actionable diagnostics.
- Demo opens the dashboard and shows a full fake workflow.

## Real Sandcastle Project Verification

Run from a separate Sandcastle project:

```bash
npm install
npx donjon init --dry-run
npx donjon init --apply
npm run sandcastle:donjon
```

Expected result:

- Imports are changed to Donjon wrapper imports.
- Package script is added.
- Dashboard opens.
- Sandcastle script runs normally.
- Terminal stdout/stderr are preserved.
- Donjon exits with the Sandcastle process exit code.

## Observability Verification

Use a Sandcastle script that exercises:

- Top-level `sandcastle.run()`.
- `sandcastle.createSandbox()`.
- `sandbox.run()`.
- `sandbox.interactive()` if practical.
- `sandbox.close()`.
- Successful run.
- Failed run.
- At least one commit-producing run.
- A run with file logging.
- A run with stdout logging.

Expected dashboard state:

- Session is visible.
- Runs are visible.
- Sandboxes are visible.
- Agent text is visible when Sandcastle emits stream events.
- Tool calls are visible when Sandcastle emits stream events.
- Failures are visible and not swallowed.
- Branches and commits are visible when returned by Sandcastle.
- Iteration counts are visible when available.

## Regression Verification

For wrapper safety:

- [ ] Donjon disabled: wrappers behave like direct Sandcastle imports.
- [ ] Donjon enabled, server unavailable: Sandcastle still runs.
- [ ] User `onAgentStreamEvent` still runs.
- [ ] User logging path is preserved.
- [ ] User stdout logging is preserved.
- [ ] Errors thrown by Sandcastle are re-thrown unchanged.
- [ ] Return values from Sandcastle are returned unchanged.

## Packaging Verification

Before release:

```bash
npm pack --dry-run
```

Expected package contents:

- `dist/cli/index.js`
- `dist/client/index.html`
- `dist/client/assets/*`
- wrapper subpath exports
- declaration files
- README
- package metadata

