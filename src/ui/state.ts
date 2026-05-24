import type { DonjonEvent } from "../runtime/events.js";

export type RunStatus = "active" | "completed" | "failed";
export type LogKind = "agent.text" | "agent.tool_call" | "error" | "lifecycle";

export type RunSummary = {
  id: string;
  status: RunStatus;
  name?: string;
  agentName?: string;
  sandboxName?: string;
  sandboxTag?: string;
  branch?: string;
  maxIterations?: number;
  iterationsSeen: number;
  iterationsRun?: number;
  completionSignal?: string;
  logFilePath?: string;
  preservedWorktreePath?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  commits: string[];
  errorMessage?: string;
  parentId?: string;
  sandboxId?: string;
};

export type SandboxSummary = {
  id: string;
  status: "creating" | "active" | "closed" | "failed";
  name?: string;
  tag?: string;
  startedAt?: string;
  endedAt?: string;
  errorMessage?: string;
};

export type CommitSummary = {
  id: string;
  sha: string;
  branch?: string;
  runId?: string;
  timestamp: string;
  message?: string;
};

export type LogEntry = {
  id: string;
  type: string;
  kind: LogKind;
  timestamp: string;
  runId?: string;
  sandboxId?: string;
  level?: DonjonEvent["level"];
  message: string;
  data?: Record<string, unknown>;
};

export type DonjonState = {
  sessions: Record<string, { id: string; status: "active" | "completed" | "failed"; startedAt?: string; endedAt?: string }>;
  runs: Record<string, RunSummary>;
  sandboxes: Record<string, SandboxSummary>;
  commits: Record<string, CommitSummary>;
  logs: LogEntry[];
  selectedRunId?: string;
};

export function reduceEvents(events: DonjonEvent[], selectedRunId?: string): DonjonState {
  const state: DonjonState = {
    sessions: {},
    runs: {},
    sandboxes: {},
    commits: {},
    logs: [],
    selectedRunId,
  };

  for (const event of events) {
    applyEvent(state, event);
  }

  if (!state.selectedRunId || !state.runs[state.selectedRunId]) {
    state.selectedRunId = pickDefaultRunId(state);
  }

  return state;
}

function applyEvent(state: DonjonState, event: DonjonEvent): void {
  if (event.type === "session.started") {
    state.sessions[event.sessionId] = {
      id: event.sessionId,
      status: "active",
      startedAt: event.timestamp,
    };
  }

  if (event.type === "session.completed") {
    const session = state.sessions[event.sessionId] ?? {
      id: event.sessionId,
      status: "active" as const,
    };
    state.sessions[event.sessionId] = {
      ...session,
      status: event.level === "error" || event.data?.status === "failed" ? "failed" : "completed",
      endedAt: event.timestamp,
    };
  }

  if (event.type === "run.started" || event.type === "sandbox.run.started") {
    const runId = event.runId ?? event.id;
    state.runs[runId] = {
      ...state.runs[runId],
      id: runId,
      status: "active",
      name: stringValue(event.data?.name) ?? state.runs[runId]?.name,
      agentName: stringValue(event.data?.agentName) ?? state.runs[runId]?.agentName,
      sandboxName: stringValue(event.data?.sandboxName) ?? state.runs[runId]?.sandboxName,
      sandboxTag: stringValue(event.data?.sandboxTag) ?? state.runs[runId]?.sandboxTag,
      maxIterations: numberValue(event.data?.maxIterations) ?? state.runs[runId]?.maxIterations,
      startedAt: event.timestamp,
      iterationsSeen: state.runs[runId]?.iterationsSeen ?? 0,
      commits: state.runs[runId]?.commits ?? [],
      parentId: event.parentId,
      sandboxId: event.sandboxId,
    };
  }

  if (event.type === "run.completed" || event.type === "sandbox.run.completed") {
    updateRunCompletion(state, event, "completed");
  }

  if (event.type === "run.failed" || event.type === "sandbox.run.failed") {
    updateRunCompletion(state, event, "failed");
  }

  if (event.type === "sandbox.create.started") {
    const sandboxId = event.sandboxId ?? event.id;
    state.sandboxes[sandboxId] = {
      id: sandboxId,
      status: "creating",
      name: stringValue(event.data?.name),
      tag: stringValue(event.data?.tag),
      startedAt: event.timestamp,
    };
  }

  if (event.type === "sandbox.create.completed") {
    const sandboxId = event.sandboxId ?? event.id;
    const existing = state.sandboxes[sandboxId];
    state.sandboxes[sandboxId] = {
      id: sandboxId,
      status: "active",
      name: stringValue(event.data?.name) ?? existing?.name,
      tag: stringValue(event.data?.tag) ?? existing?.tag,
      startedAt: existing?.startedAt,
    };
  }

  if (event.type === "sandbox.close.completed") {
    const sandboxId = event.sandboxId ?? event.id;
    const existing = state.sandboxes[sandboxId];
    state.sandboxes[sandboxId] = {
      id: sandboxId,
      status: "closed",
      name: existing?.name,
      tag: existing?.tag,
      startedAt: existing?.startedAt,
      endedAt: event.timestamp,
    };
  }

  if (event.type.endsWith(".failed") && event.sandboxId) {
    const sandbox = state.sandboxes[event.sandboxId];
    if (sandbox) {
      state.sandboxes[event.sandboxId] = {
        ...sandbox,
        status: "failed",
        errorMessage: stringValue(event.data?.errorMessage),
      };
    }
  }

  if (event.type === "agent.text" || event.type === "agent.tool_call") {
    const runId = event.runId;
    if (runId && state.runs[runId]) {
      const iteration = numberValue(event.data?.iteration);
      state.runs[runId] = {
        ...state.runs[runId],
        iterationsSeen: Math.max(state.runs[runId].iterationsSeen, iteration ?? 0),
      };
    }
  }

  if (event.type === "git.commit") {
    const sha = stringValue(event.data?.sha) ?? event.id;
    state.commits[sha] = {
      id: sha,
      sha,
      branch: stringValue(event.data?.branch),
      runId: event.runId,
      timestamp: event.timestamp,
      message: stringValue(event.data?.message),
    };
    if (event.runId && state.runs[event.runId] && !state.runs[event.runId].commits.includes(sha)) {
      state.runs[event.runId] = {
        ...state.runs[event.runId],
        commits: [...state.runs[event.runId].commits, sha],
      };
    }
  }

  const log = toLogEntry(event);
  if (log) {
    state.logs.push(log);
  }
}

function updateRunCompletion(state: DonjonState, event: DonjonEvent, status: RunStatus): void {
  const runId = event.runId ?? event.id;
  const existing = state.runs[runId] ?? {
    id: runId,
    status: "active" as RunStatus,
    iterationsSeen: 0,
    commits: [],
  };
  const commitShas = commitsFromData(event.data?.commits);

  state.runs[runId] = {
    ...existing,
    status,
    endedAt: event.timestamp,
    durationMs: existing.startedAt ? new Date(event.timestamp).getTime() - new Date(existing.startedAt).getTime() : undefined,
    branch: stringValue(event.data?.branch) ?? existing.branch,
    iterationsRun: numberValue(event.data?.iterationsRun),
    iterationsSeen: Math.max(existing.iterationsSeen, numberValue(event.data?.iterationsRun) ?? 0),
    completionSignal: stringValue(event.data?.completionSignal),
    logFilePath: stringValue(event.data?.logFilePath),
    preservedWorktreePath: stringValue(event.data?.preservedWorktreePath),
    errorMessage: stringValue(event.data?.errorMessage),
    commits: unique([...existing.commits, ...commitShas]),
  };
}

function toLogEntry(event: DonjonEvent): LogEntry | undefined {
  if (event.type === "agent.text") {
    return {
      id: event.id,
      type: event.type,
      kind: "agent.text",
      timestamp: event.timestamp,
      runId: event.runId,
      sandboxId: event.sandboxId,
      level: event.level,
      message: event.message ?? stringValue(event.data?.message) ?? "",
      data: event.data,
    };
  }

  if (event.type === "agent.tool_call") {
    return {
      id: event.id,
      type: event.type,
      kind: "agent.tool_call",
      timestamp: event.timestamp,
      runId: event.runId,
      sandboxId: event.sandboxId,
      level: event.level,
      message: `${stringValue(event.data?.name) ?? "tool"} ${stringValue(event.data?.formattedArgs) ?? ""}`.trim(),
      data: event.data,
    };
  }

  if (event.level === "error" || event.type.endsWith(".failed")) {
    return {
      id: event.id,
      type: event.type,
      kind: "error",
      timestamp: event.timestamp,
      runId: event.runId,
      sandboxId: event.sandboxId,
      level: event.level,
      message: event.message ?? stringValue(event.data?.errorMessage) ?? event.type,
      data: event.data,
    };
  }

  return {
    id: event.id,
    type: event.type,
    kind: "lifecycle",
    timestamp: event.timestamp,
    runId: event.runId,
    sandboxId: event.sandboxId,
    level: event.level,
    message: event.message ?? event.type,
    data: event.data,
  };
}

function pickDefaultRunId(state: DonjonState): string | undefined {
  const runs = Object.values(state.runs);
  return runs.find((run) => run.status === "active")?.id ?? runs[0]?.id;
}

function commitsFromData(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((commit) => {
      if (typeof commit === "string") {
        return commit;
      }
      if (commit && typeof commit === "object" && "sha" in commit) {
        return stringValue(commit.sha);
      }
      return undefined;
    })
    .filter((sha): sha is string => Boolean(sha));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
