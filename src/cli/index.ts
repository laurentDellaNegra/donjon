#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import open from "open";
import { runDoctor, runInit } from "../init/init.js";
import { normalizeError } from "../runtime/events.js";
import { sleep } from "../runtime/sleep.js";
import { startDonjonServer, type DonjonServer } from "../server/server.js";

type SpawnResult = {
  code: number;
  signal: NodeJS.Signals | null;
};

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "run":
      await commandRun(args);
      return;
    case "demo":
      await commandDemo();
      return;
    case "init":
      commandInit(args);
      return;
    case "doctor":
      runDoctor(process.cwd());
      return;
    case undefined:
    case "-h":
    case "--help":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

async function commandRun(args: string[]): Promise<void> {
  const [entry, ...entryArgs] = args;
  if (!entry) {
    console.error("Usage: donjon run <entry>");
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const sessionId = randomUUID();
  const token = randomUUID();
  const server = await startDonjonServer({ projectDir: cwd, sessionId, token });
  const startedAt = Date.now();

  server.emit("session.started", {
    level: "info",
    data: { cwd, entry },
  });
  server.emit("process.started", {
    level: "info",
    data: { entry, argv: entryArgs },
  });

  console.log(`Donjon dashboard: ${server.url}`);
  await openBrowser(server.url);

  const result = await spawnUserScript(entry, entryArgs, server);
  const durationMs = Date.now() - startedAt;

  if (result.code === 0) {
    server.emit("process.completed", {
      level: "info",
      data: { exitCode: result.code, signal: result.signal, durationMs },
    });
    server.emit("session.completed", {
      level: "info",
      data: { status: "completed", durationMs },
    });
  } else {
    server.emit("process.failed", {
      level: "error",
      data: { exitCode: result.code, signal: result.signal, durationMs },
    });
    server.emit("session.completed", {
      level: "error",
      data: { status: "failed", durationMs },
    });
  }

  await sleep(1_250);
  await server.close();
  process.exitCode = result.code;
}

async function commandDemo(): Promise<void> {
  const cwd = process.cwd();
  const sessionId = randomUUID();
  const token = randomUUID();
  const server = await startDonjonServer({ projectDir: cwd, sessionId, token });
  const startedAt = Date.now();

  console.log(`Donjon dashboard: ${server.url}`);
  console.log("Demo is running. Press Ctrl-C to stop the local server.");
  await openBrowser(server.url);

  await runDemoScenario(server);
  server.emit("session.completed", {
    level: "info",
    data: { status: "completed", durationMs: Date.now() - startedAt },
  });

  await waitForInterrupt(server);
}

function commandInit(args: string[]): void {
  const apply = args.includes("--apply");
  runInit({
    cwd: process.cwd(),
    apply,
  });
}

async function spawnUserScript(entry: string, entryArgs: string[], server: DonjonServer): Promise<SpawnResult> {
  const extension = extname(entry);
  const resolvedEntry = resolve(process.cwd(), entry);
  const env = {
    ...process.env,
    DONJON_ENABLED: "1",
    DONJON_PORT: String(server.port),
    DONJON_TOKEN: server.token,
    DONJON_SESSION_ID: server.sessionId,
    DONJON_PROJECT_DIR: process.cwd(),
  };

  if (extension === ".ts" || extension === ".mts" || extension === ".tsx" || extension === ".cts") {
    const firstAttempt = await spawnAndWait("tsx", [resolvedEntry, ...entryArgs], env, true);
    if (firstAttempt) {
      return firstAttempt;
    }

    return (await spawnAndWait("npx", ["tsx", resolvedEntry, ...entryArgs], env, false)) ?? { code: 1, signal: null };
  }

  return (await spawnAndWait(process.execPath, [resolvedEntry, ...entryArgs], env, false)) ?? { code: 1, signal: null };
}

function spawnAndWait(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  allowMissingCommandFallback: boolean,
): Promise<SpawnResult | undefined> {
  return new Promise((resolveSpawn) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let settled = false;

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;

      if (allowMissingCommandFallback && (error as NodeJS.ErrnoException).code === "ENOENT") {
        resolveSpawn(undefined);
        return;
      }

      console.error(error.message);
      resolveSpawn({ code: 1, signal: null });
    });

    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      resolveSpawn({ code: code ?? 1, signal });
    });
  });
}

async function runDemoScenario(server: DonjonServer): Promise<void> {
  server.emit("session.started", {
    level: "info",
    data: { cwd: process.cwd(), mode: "demo" },
  });
  server.emit("demo.started", {
    level: "info",
    message: "Demo workflow started",
  });

  const plannerRunId = randomUUID();
  server.emit("run.started", {
    runId: plannerRunId,
    level: "info",
    data: {
      name: "planner",
      agentName: "claudeCode",
      sandboxName: "docker",
      sandboxTag: "planner",
      maxIterations: 3,
      branchStrategy: "new-branch",
      cwd: process.cwd(),
      promptFile: ".sandcastle/plan.md",
      hasInlinePrompt: false,
    },
  });
  await sleep(400);
  server.emit("agent.text", {
    runId: plannerRunId,
    level: "info",
    message: "Reading the project shape and splitting implementation work.",
    data: { iteration: 1, message: "Reading the project shape and splitting implementation work." },
  });
  await sleep(600);
  server.emit("agent.tool_call", {
    runId: plannerRunId,
    level: "info",
    data: { iteration: 1, name: "rg", formattedArgs: "rg --files src" },
  });
  await sleep(450);
  server.emit("run.completed", {
    runId: plannerRunId,
    level: "info",
    data: {
      branch: "donjon/planner",
      iterationsRun: 2,
      completionSignal: "complete",
      commits: [],
      logFilePath: ".sandcastle/logs/donjon-planner.log",
      preservedWorktreePath: undefined,
    },
  });

  const implementers = [0, 1, 2].map((index) => ({
    runId: randomUUID(),
    sandboxId: randomUUID(),
    name: `implementer-${index + 1}`,
    branch: `donjon/implementer-${index + 1}`,
    shouldFail: index === 1,
  }));

  for (const item of implementers) {
    server.emit("sandbox.create.started", {
      sandboxId: item.sandboxId,
      runId: item.runId,
      level: "info",
      data: { name: "docker", tag: item.name },
    });
    server.emit("sandbox.create.completed", {
      sandboxId: item.sandboxId,
      runId: item.runId,
      level: "info",
      data: { name: "docker", tag: item.name },
    });
    server.emit("run.started", {
      runId: item.runId,
      sandboxId: item.sandboxId,
      parentId: plannerRunId,
      level: "info",
      data: {
        name: item.name,
        agentName: "claudeCode",
        sandboxName: "docker",
        sandboxTag: item.name,
        maxIterations: 5,
        branchStrategy: "new-branch",
        cwd: process.cwd(),
        promptFile: ".sandcastle/implement.md",
        hasInlinePrompt: false,
      },
    });
  }

  await Promise.all(
    implementers.map(async (item, index) => {
      await sleep(350 + index * 300);
      server.emit("agent.text", {
        runId: item.runId,
        sandboxId: item.sandboxId,
        level: "info",
        message: `${item.name} is applying its scoped changes.`,
        data: { iteration: 1, message: `${item.name} is applying its scoped changes.` },
      });
      await sleep(500 + index * 250);
      server.emit("agent.tool_call", {
        runId: item.runId,
        sandboxId: item.sandboxId,
        level: "info",
        data: { iteration: 2, name: "npm", formattedArgs: "npm run typecheck" },
      });
      await sleep(700);

      if (item.shouldFail) {
        server.emit("run.failed", {
          runId: item.runId,
          sandboxId: item.sandboxId,
          level: "error",
          data: {
            errorName: "Error",
            errorMessage: "Typecheck failed in isolated branch",
          },
        });
        return;
      }

      const commit = {
        sha: `demo${index}${randomUUID().replaceAll("-", "").slice(0, 8)}`,
        message: `${item.name} changes`,
      };
      server.emit("run.completed", {
        runId: item.runId,
        sandboxId: item.sandboxId,
        level: "info",
        data: {
          branch: item.branch,
          iterationsRun: 3,
          completionSignal: "complete",
          commits: [commit],
          logFilePath: `.sandcastle/logs/donjon-${item.name}.log`,
          preservedWorktreePath: `.sandcastle/worktrees/${item.name}`,
        },
      });
      server.emit("git.commit", {
        runId: item.runId,
        sandboxId: item.sandboxId,
        level: "info",
        data: { ...commit, branch: item.branch },
      });
    }),
  );

  const mergerRunId = randomUUID();
  server.emit("run.started", {
    runId: mergerRunId,
    parentId: plannerRunId,
    level: "info",
    data: {
      name: "merger",
      agentName: "claudeCode",
      sandboxName: "docker",
      sandboxTag: "merge",
      maxIterations: 2,
      branchStrategy: "existing-branch",
      cwd: process.cwd(),
      promptFile: ".sandcastle/merge.md",
      hasInlinePrompt: false,
    },
  });
  await sleep(700);
  server.emit("agent.text", {
    runId: mergerRunId,
    level: "info",
    message: "Merging successful branches and leaving failed branch untouched.",
    data: { iteration: 1, message: "Merging successful branches and leaving failed branch untouched." },
  });
  await sleep(600);
  server.emit("run.completed", {
    runId: mergerRunId,
    level: "info",
    data: {
      branch: "main",
      iterationsRun: 1,
      completionSignal: "complete",
      commits: [],
      logFilePath: ".sandcastle/logs/donjon-merger.log",
    },
  });

  server.emit("demo.completed", {
    level: "info",
    message: "Demo workflow completed",
  });
}

async function waitForInterrupt(server: DonjonServer): Promise<void> {
  await new Promise<void>((resolveStop) => {
    const stop = async () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await server.close();
      resolveStop();
    };

    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

async function openBrowser(url: string): Promise<void> {
  if (process.env.DONJON_NO_OPEN === "1") {
    return;
  }

  try {
    await open(url);
  } catch (error) {
    console.warn(`Unable to open browser: ${normalizeError(error).errorMessage}`);
  }
}

function printHelp(): void {
  console.log(`Donjon

Usage:
  donjon run <entry>
  donjon demo
  donjon init [--dry-run|--apply]
  donjon doctor`);
}

main().catch((error: unknown) => {
  const normalized = normalizeError(error);
  console.error(`${normalized.errorName}: ${normalized.errorMessage}`);
  process.exitCode = 1;
});
