import * as sandcastle from "@ai-hero/sandcastle";
import { randomUUID } from "node:crypto";
import { emitDonjonEvent } from "../runtime/client.js";
import { normalizeError } from "../runtime/events.js";

export * from "@ai-hero/sandcastle";

type AnyRecord = Record<string, any>;
type AgentStreamEvent = {
  type?: string;
  message?: string;
  name?: string;
  formattedArgs?: string;
  iteration?: number;
  timestamp?: Date | string;
};

const originalRun = (sandcastle as AnyRecord).run;
const originalCreateSandbox = (sandcastle as AnyRecord).createSandbox;

export function run(options: AnyRecord = {}): any {
  if (!isDonjonEnabled()) {
    return originalRun(options);
  }

  return executeSandcastleRun({
    eventPrefix: "run",
    runId: randomUUID(),
    options,
    invoke: (wrappedOptions) => originalRun(wrappedOptions),
  });
}

export function createSandbox(options: AnyRecord = {}): any {
  if (!isDonjonEnabled()) {
    return originalCreateSandbox(options);
  }

  const sandboxId = randomUUID();

  void emitDonjonEvent("sandbox.create.started", {
    sandboxId,
    level: "info",
    data: {
      name: options?.name,
      tag: options?.tag,
      provider: options?.provider,
    },
  });

  try {
    const result = originalCreateSandbox(options);
    if (isPromiseLike(result)) {
      return result.then((sandbox: unknown) => {
        const sandboxRecord = sandbox as AnyRecord;
        void emitDonjonEvent("sandbox.create.completed", {
          sandboxId,
          level: "info",
          data: describeSandbox(sandboxRecord),
        });
        return wrapSandbox(sandboxRecord, sandboxId);
      }, (error: unknown) => {
        void emitDonjonEvent("sandbox.create.failed", {
          sandboxId,
          level: "error",
          data: normalizeError(error),
        });
        throw error;
      });
    }

    void emitDonjonEvent("sandbox.create.completed", {
      sandboxId,
      level: "info",
      data: describeSandbox(result),
    });
    return wrapSandbox(result, sandboxId);
  } catch (error) {
    void emitDonjonEvent("sandbox.create.failed", {
      sandboxId,
      level: "error",
      data: normalizeError(error),
    });
    throw error;
  }
}

function wrapSandbox<T extends AnyRecord>(sandbox: T, sandboxId: string): T {
  if (!sandbox || typeof sandbox !== "object") {
    return sandbox;
  }

  return new Proxy(sandbox, {
    get(target, property, receiver) {
      if (property === "run" && typeof target.run === "function") {
        return (options: AnyRecord = {}) => executeSandcastleRun({
          eventPrefix: "sandbox.run",
          runId: randomUUID(),
          sandboxId,
          options,
          invoke: (wrappedOptions) => target.run.call(target, wrappedOptions),
        });
      }

      if (property === "close" && typeof target.close === "function") {
        return (...args: any[]) => executeLifecycleMethod({
          startedType: "sandbox.close.started",
          completedType: "sandbox.close.completed",
          failedType: "sandbox.close.failed",
          sandboxId,
          invoke: () => target.close.apply(target, args),
        });
      }

      if (property === "interactive" && typeof target.interactive === "function") {
        return (...args: any[]) => executeLifecycleMethod({
          startedType: "interactive.started",
          completedType: "interactive.completed",
          failedType: "interactive.failed",
          sandboxId,
          invoke: () => target.interactive.apply(target, args),
        });
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function executeSandcastleRun(args: {
  eventPrefix: "run" | "sandbox.run";
  runId: string;
  sandboxId?: string;
  options: AnyRecord;
  invoke: (options: AnyRecord) => any;
}): any {
  const wrappedOptions = withDonjonLogging(args.options, args.runId, args.sandboxId);

  void emitDonjonEvent(`${args.eventPrefix}.started`, {
    runId: args.runId,
    sandboxId: args.sandboxId,
    level: "info",
    data: describeRunOptions(wrappedOptions),
  });

  try {
    const result = args.invoke(wrappedOptions);
    if (isPromiseLike(result)) {
      return result.then((value: unknown) => {
        const runResult = value as AnyRecord;
        emitRunCompleted(args.eventPrefix, args.runId, args.sandboxId, runResult);
        return runResult;
      }, (error: unknown) => {
        emitRunFailed(args.eventPrefix, args.runId, args.sandboxId, error);
        throw error;
      });
    }

    emitRunCompleted(args.eventPrefix, args.runId, args.sandboxId, result);
    return result;
  } catch (error) {
    emitRunFailed(args.eventPrefix, args.runId, args.sandboxId, error);
    throw error;
  }
}

function withDonjonLogging(options: AnyRecord, runId: string, sandboxId?: string): AnyRecord {
  const logging = options?.logging;

  if (!logging) {
    return {
      ...options,
      logging: {
        type: "file",
        path: `.sandcastle/logs/donjon-${runId}.log`,
        onAgentStreamEvent: createAgentStreamCallback(undefined, runId, sandboxId),
      },
    };
  }

  if (logging.type !== "file") {
    return options;
  }

  return {
    ...options,
    logging: {
      ...logging,
      // Sandcastle exposes rich agent text/tool-call events through the file
      // logging callback. Donjon wraps it instead of parsing logs so the user
      // callback still runs and Sandcastle remains the source of truth.
      onAgentStreamEvent: createAgentStreamCallback(logging.onAgentStreamEvent, runId, sandboxId),
    },
  };
}

function createAgentStreamCallback(
  originalCallback: ((event: AgentStreamEvent) => unknown) | undefined,
  runId: string,
  sandboxId?: string,
): (event: AgentStreamEvent) => unknown {
  return (event: AgentStreamEvent) => {
    try {
      if (event?.type === "text") {
        void emitDonjonEvent("agent.text", {
          runId,
          sandboxId,
          level: "info",
          message: event.message,
          data: {
            iteration: event.iteration,
            message: event.message,
          },
        });
      }

      if (event?.type === "toolCall") {
        void emitDonjonEvent("agent.tool_call", {
          runId,
          sandboxId,
          level: "info",
          data: {
            iteration: event.iteration,
            name: event.name,
            formattedArgs: event.formattedArgs,
          },
        });
      }
    } catch {
      // Telemetry must not affect the Sandcastle callback chain.
    }

    return originalCallback?.(event);
  };
}

function executeLifecycleMethod(args: {
  startedType: string;
  completedType: string;
  failedType: string;
  sandboxId: string;
  invoke: () => any;
}): any {
  void emitDonjonEvent(args.startedType, {
    sandboxId: args.sandboxId,
    level: "info",
  });

  try {
    const result = args.invoke();
    if (isPromiseLike(result)) {
      return result.then((value: unknown) => {
        void emitDonjonEvent(args.completedType, {
          sandboxId: args.sandboxId,
          level: "info",
        });
        return value;
      }, (error: unknown) => {
        void emitDonjonEvent(args.failedType, {
          sandboxId: args.sandboxId,
          level: "error",
          data: normalizeError(error),
        });
        throw error;
      });
    }

    void emitDonjonEvent(args.completedType, {
      sandboxId: args.sandboxId,
      level: "info",
    });
    return result;
  } catch (error) {
    void emitDonjonEvent(args.failedType, {
      sandboxId: args.sandboxId,
      level: "error",
      data: normalizeError(error),
    });
    throw error;
  }
}

function emitRunCompleted(eventPrefix: string, runId: string, sandboxId: string | undefined, result: AnyRecord): void {
  const data = describeRunResult(result);
  void emitDonjonEvent(`${eventPrefix}.completed`, {
    runId,
    sandboxId,
    level: "info",
    data,
  });

  const commits = Array.isArray(result?.commits) ? result.commits : [];
  for (const commit of commits) {
    const sha = typeof commit === "string" ? commit : commit?.sha;
    void emitDonjonEvent("git.commit", {
      runId,
      sandboxId,
      level: "info",
      data: {
        ...(typeof commit === "object" && commit ? commit : {}),
        sha,
        branch: result?.branch,
      },
    });
  }
}

function emitRunFailed(eventPrefix: string, runId: string, sandboxId: string | undefined, error: unknown): void {
  void emitDonjonEvent(`${eventPrefix}.failed`, {
    runId,
    sandboxId,
    level: "error",
    data: normalizeError(error),
  });
}

function describeRunOptions(options: AnyRecord): Record<string, unknown> {
  return {
    name: options?.name,
    agentName: options?.agent?.name,
    sandboxName: options?.sandbox?.name,
    sandboxTag: options?.sandbox?.tag,
    maxIterations: options?.maxIterations ?? 1,
    branchStrategy: options?.branchStrategy,
    cwd: options?.cwd ?? process.cwd(),
    promptFile: options?.promptFile,
    hasInlinePrompt: Boolean(options?.prompt),
  };
}

function describeRunResult(result: AnyRecord): Record<string, unknown> {
  return {
    branch: result?.branch,
    iterationsRun: Array.isArray(result?.iterations) ? result.iterations.length : undefined,
    completionSignal: result?.completionSignal,
    commits: result?.commits,
    logFilePath: result?.logFilePath,
    preservedWorktreePath: result?.preservedWorktreePath,
  };
}

function describeSandbox(sandbox: AnyRecord): Record<string, unknown> {
  return {
    name: sandbox?.name,
    tag: sandbox?.tag,
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as PromiseLike<unknown>).then === "function");
}

function isDonjonEnabled(): boolean {
  return process.env.DONJON_ENABLED === "1";
}
