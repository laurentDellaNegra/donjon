# Donjon

Donjon is a local dashboard companion for Sandcastle projects. It is installed beside `@ai-hero/sandcastle`, not as a fork, and wraps Sandcastle public APIs so a browser dashboard can observe local runs.

## MVP Limitations

MVP does not see all internal Sandcastle lifecycle events yet.
It can observe run/createSandbox boundaries, agent text/tool calls when file logging is used, commits returned by Sandcastle, branches, sandbox provider names, and failures.
A future Sandcastle upstream observability hook would make this more complete.

Donjon does not patch `node_modules`, monkey-patch Sandcastle, or require Docker/Podman for `donjon demo`.

## Installation From Git

In a Sandcastle project:

```json
{
  "devDependencies": {
    "@ai-hero/sandcastle": "latest",
    "donjon": "git+https://github.com/laurentDellaNegra/donjon.git"
  },
  "scripts": {
    "sandcastle:donjon": "donjon run .sandcastle/main.mts"
  }
}
```

Because this package is installed from Git during the MVP, its `prepare` script builds the CLI and dashboard assets during install.

## Update Imports

Change Sandcastle imports from:

```ts
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
```

to:

```ts
import * as sandcastle from "donjon/sandcastle";
import { docker } from "donjon/sandboxes/docker";
```

Example:

```ts
import * as sandcastle from "donjon/sandcastle";
import { docker } from "donjon/sandboxes/docker";

await sandcastle.run({
  sandbox: docker(),
  name: "implementer",
  maxIterations: 5,
  agent: sandcastle.claudeCode("claude-sonnet-4-6"),
  promptFile: "./.sandcastle/implement-prompt.md",
});
```

## Run

```bash
npm run sandcastle:donjon
```

or directly:

```bash
npx donjon run .sandcastle/main.mts
```

`donjon run` starts a local HTTP server bound to `127.0.0.1`, opens the dashboard, and executes the Sandcastle entry with Donjon environment variables. Child stdout/stderr are streamed to the terminal. The command exits with the same exit code as the Sandcastle script.

For `.ts`, `.mts`, `.tsx`, and `.cts` entries, Donjon first tries `tsx <entry>` and falls back to `npx tsx <entry>`.

## Demo

```bash
npx donjon demo
```

The demo starts the dashboard and emits simulated planner, implementer, and merger events. It does not require Sandcastle, API keys, Docker, or Podman.

## Init

Preview setup changes:

```bash
npx donjon init --dry-run
```

Apply setup changes:

```bash
npx donjon init --apply
```

The init command updates `.sandcastle/main.mts` when present:

```txt
@ai-hero/sandcastle                         -> donjon/sandcastle
@ai-hero/sandcastle/sandboxes/docker        -> donjon/sandboxes/docker
@ai-hero/sandcastle/sandboxes/podman        -> donjon/sandboxes/podman
@ai-hero/sandcastle/sandboxes/vercel        -> donjon/sandboxes/vercel
@ai-hero/sandcastle/sandboxes/daytona       -> donjon/sandboxes/daytona
```

It also adds:

```json
{
  "scripts": {
    "sandcastle:donjon": "donjon run .sandcastle/main.mts"
  }
}
```

Donjon does not mutate files unless `--apply` is passed. The default behavior is a dry run.

## Doctor

```bash
npx donjon doctor
```

Doctor prints the current directory, Node version, Sandcastle file presence, package presence, whether `@ai-hero/sandcastle` is resolvable, whether Donjon wrapper imports are present, and the suggested next command.

## How It Works

`donjon/sandcastle` re-exports `@ai-hero/sandcastle` and wraps:

- `sandcastle.run()`
- `sandcastle.createSandbox()`
- `sandbox.run()`
- `sandbox.interactive()`
- `sandbox.close()`

When `DONJON_ENABLED=1`, the wrappers POST structured events to the local Donjon server. If Donjon environment variables are absent, telemetry is disabled and the wrappers behave as transparent pass-throughs.

For run stream data, Donjon wraps Sandcastle's `logging.onAgentStreamEvent` callback. If logging is absent, Donjon sets file logging to `.sandcastle/logs/donjon-<runId>.log` so Sandcastle can emit stream events. If logging is `{ type: "stdout" }`, Donjon does not override it and only emits lifecycle events.

The local server stores events in memory, broadcasts live updates through SSE, and persists NDJSON events under:

```txt
.donjon/runs/<sessionId>/events.ndjson
```

with metadata at:

```txt
.donjon/runs/<sessionId>/metadata.json
```

## Troubleshooting

Run diagnostics:

```bash
npx donjon doctor
```

If the dashboard opens but stays empty, confirm the Sandcastle script imports from `donjon/sandcastle` and `donjon/sandboxes/...`.

If agent text/tool calls do not appear, check the run logging mode. The MVP observes stream events through Sandcastle file logging. `logging: { type: "stdout" }` is preserved and only lifecycle events are shown.

If a sandbox provider subpath fails to import, verify your installed Sandcastle version exports that provider path. Donjon includes the known provider re-exports for Docker, Podman, Vercel, and Daytona.
