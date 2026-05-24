import type { ReactElement } from "react";
import type { CommitSummary, DonjonState, LogEntry, RunSummary, RunStatus } from "./state.js";
import "./fluxDashboard.css";

export type LogFilter = "all" | "agent.text" | "agent.tool_call" | "errors" | "lifecycle";

type FluxDashboardProps = {
  state: DonjonState;
  selectedRunId?: string;
  logFilter: LogFilter;
  onLogFilterChange: (filter: LogFilter) => void;
  onSelectRun: (runId: string) => void;
};

type StatusStat = {
  active: number;
  completed: number;
  failed: number;
};

type WorkflowColumn = {
  id: string;
  label: string;
  runs: RunSummary[];
};

type ProgressSignal = {
  label: string;
  value: string;
  percent: number;
  status: "healthy" | "failed" | "running";
};

export function FluxDashboard({
  state,
  selectedRunId,
  logFilter,
  onLogFilterChange,
  onSelectRun,
}: FluxDashboardProps): ReactElement {
  const selectedRun = (selectedRunId ? state.runs[selectedRunId] : undefined) ?? pickDefaultRun(state);
  const runs = getRuns(state);
  const stats = getStats(state);
  const filteredLogs = filterLogs(state.logs, logFilter);
  const recentLogs = filteredLogs.slice(-5).reverse();
  const commits = getCommits(state);
  const selectedRunLogs = selectedRun ? state.logs.filter((log) => log.runId === selectedRun.id) : [];
  const workflowColumns = buildWorkflowColumns(runs);
  const progressSignals = progressSignalsFor(selectedRun, selectedRunLogs);
  const healthLabel = stats.runs.failed > 0 || stats.sandboxes.failed > 0 ? "attention" : "healthy";

  return (
    <div className="flux-dashboard">
      <aside className="flux-rail" aria-label="Session summary">
        <div className="flux-logo">D</div>
        <div className="flux-rail-stat">
          <span>runs</span>
          <strong>{stats.totalRuns}</strong>
        </div>
        <div className="flux-rail-stat">
          <span>logs</span>
          <strong>{stats.logs}</strong>
        </div>
      </aside>

      <main className="flux-main">
        <header className="flux-header">
          <div>
            <span className="flux-kicker">Live observability</span>
            <h1>Donjon Flux Dashboard</h1>
            <p>Real-time visibility into planner, implementer, merger, sandbox, commit, and agent activity.</p>
          </div>
          <div className="flux-header-actions">
            <div className="flux-filter">{stats.sessionStatus}</div>
            <div className={`flux-health ${healthLabel}`}>
              <span />
              <strong>{healthLabel}</strong>
            </div>
          </div>
        </header>

        <section className="flux-kpis" aria-label="Session metrics">
          <FluxMetric glyph="E" label="events" value={String(stats.logs)} detail="received events" tone="cyan" />
          <FluxMetric glyph="R" label="runs" value={String(stats.totalRuns)} detail={`${stats.runs.active} active`} tone="lime" />
          <FluxMetric glyph="F" label="failures" value={String(stats.runs.failed)} detail="failed runs" tone="pink" />
          <FluxMetric glyph="C" label="commits" value={String(stats.commits)} detail="recorded commits" tone="cyan" />
        </section>

        <section className="flux-workspace">
          <div className="flux-pipeline-list">
            <div className="flux-panel-title">
              <span>runs</span>
              <span className="flux-panel-action">{stats.totalRuns} total</span>
            </div>
            <div className="flux-filter-row">
              <span>active {stats.runs.active}</span>
              <span>completed {stats.runs.completed}</span>
              <span>failed {stats.runs.failed}</span>
            </div>
            <div className="flux-run-list">
              {runs.length > 0 ? (
                runs.map((run) => (
                  <button
                    aria-pressed={run.id === selectedRun?.id}
                    className={`flux-run-row ${run.status} ${run.id === selectedRun?.id ? "selected" : ""}`}
                    key={run.id}
                    onClick={() => onSelectRun(run.id)}
                    type="button"
                  >
                    <span>{statusToken(run.status)}</span>
                    <strong>{run.name ?? shortId(run.id)}</strong>
                    <small>{formatRunMeta(run)}</small>
                    <em>{run.status}</em>
                  </button>
                ))
              ) : (
                <div className="flux-empty">Waiting for run events</div>
              )}
            </div>
          </div>

          <div className="flux-flow-panel">
            <div className="flux-flow-head">
              <div>
                <span>workflow graph</span>
                <strong>{workflowSummary(runs)}</strong>
              </div>
              <span className="flux-panel-action">click a run to inspect</span>
            </div>
            <WorkflowGraph columns={workflowColumns} selectedRunId={selectedRun?.id} onSelectRun={onSelectRun} />
          </div>

          <aside className="flux-job-panel">
            <div className="flux-panel-title">
              <span>selected run</span>
              <span className="flux-panel-action">{selectedRun ? shortId(selectedRun.id) : "none"}</span>
            </div>
            <h2>{selectedRun?.name ?? "No run selected"}</h2>
            <p>{selectedRun ? formatRunMeta(selectedRun) : "Waiting for workflow events"}</p>
            <div className={`flux-job-status ${selectedRun?.status ?? "idle"}`}>{selectedRun?.status ?? "idle"}</div>
            <RunDossier run={selectedRun} logCount={selectedRunLogs.length} />
            <div className="flux-progress-stack">
              {progressSignals.map((signal) => (
                <div className={`flux-progress ${signal.status}`} key={signal.label}>
                  <div>
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                  <p>
                    <span style={{ width: `${signal.percent}%` }} />
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="flux-bottom-grid">
          <div className="flux-activity-panel">
            <div className="flux-panel-title">
              <span>recent activity</span>
              <LogFilters filter={logFilter} onFilterChange={onLogFilterChange} />
            </div>
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div className={`flux-activity-row ${logKindClass(log.kind)}`} key={log.id}>
                  <span>{formatTime(log.timestamp)}</span>
                  <strong>{log.level ?? log.kind}</strong>
                  <p>{log.message}</p>
                </div>
              ))
            ) : (
              <div className="flux-empty">No log entries for this filter</div>
            )}
          </div>

          <div className="flux-schedule-panel">
            <div className="flux-panel-title">
              <span>run timeline</span>
              <span className="flux-panel-action">{runs.length} tracked</span>
            </div>
            {runs.length > 0 ? (
              runs.slice(0, 5).map((run) => (
                <div className="flux-schedule-row" key={run.id}>
                  <span>{formatOptionalTime(run.startedAt)}</span>
                  <strong>{run.name ?? shortId(run.id)}</strong>
                  <em>{run.status}</em>
                </div>
              ))
            ) : (
              <div className="flux-empty">Waiting for run events</div>
            )}
          </div>

          <div className="flux-commit-panel">
            <div className="flux-panel-title">
              <span>commits</span>
              <span className="flux-panel-action">{stats.commits} recorded</span>
            </div>
            {commits.length > 0 ? (
              commits.slice(0, 5).map((commit) => (
                <div className="flux-commit-row" key={commit.id}>
                  <span>{shortId(commit.sha)}</span>
                  <strong>{commit.message ?? "commit"}</strong>
                  <p>{commit.branch ?? "branch n/a"}</p>
                </div>
              ))
            ) : (
              <div className="flux-empty">No commits recorded yet</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function FluxMetric({
  glyph,
  label,
  value,
  detail,
  tone,
}: {
  glyph: string;
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "pink" | "lime";
}): ReactElement {
  return (
    <div className={`flux-metric-card ${tone}`}>
      <div className="flux-metric-glyph">{glyph}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function WorkflowGraph({
  columns,
  selectedRunId,
  onSelectRun,
}: {
  columns: WorkflowColumn[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  if (columns.length === 0) {
    return (
      <div className="flux-flow-canvas empty">
        <div className="flux-empty">Waiting for workflow events</div>
      </div>
    );
  }

  return (
    <div className="flux-flow-canvas">
      {columns.map((column, columnIndex) => (
        <section className="flux-flow-column" key={column.id}>
          <div className="flux-flow-column-title">{column.label}</div>
          <div className="flux-flow-column-runs">
            {column.runs.map((run) => (
              <button
                aria-pressed={run.id === selectedRunId}
                className={`flux-workflow-node ${run.status} ${run.id === selectedRunId ? "selected" : ""}`}
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                type="button"
              >
                <span>{statusToken(run.status)}</span>
                <strong>{run.name ?? shortId(run.id)}</strong>
                <small>{run.branch ?? run.sandboxTag ?? shortId(run.id)}</small>
                <em>{run.commits.length} commits</em>
              </button>
            ))}
          </div>
          {columnIndex < columns.length - 1 ? <div className="flux-flow-connector" aria-hidden="true" /> : null}
        </section>
      ))}
    </div>
  );
}

function LogFilters({
  filter,
  onFilterChange,
}: {
  filter: LogFilter;
  onFilterChange: (filter: LogFilter) => void;
}): ReactElement {
  const filters: Array<[LogFilter, string]> = [
    ["all", "all"],
    ["agent.text", "text"],
    ["agent.tool_call", "tools"],
    ["errors", "errors"],
    ["lifecycle", "lifecycle"],
  ];

  return (
    <div className="flux-log-filters">
      {filters.map(([key, label]) => (
        <button className={filter === key ? "active" : ""} key={key} onClick={() => onFilterChange(key)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

function RunDossier({ run, logCount }: { run?: RunSummary; logCount: number }): ReactElement {
  if (!run) {
    return <div className="flux-empty">No run selected</div>;
  }

  return (
    <dl className="flux-dossier">
      <dt>agent</dt>
      <dd>{run.agentName ?? "n/a"}</dd>
      <dt>sandbox</dt>
      <dd>{[run.sandboxName, run.sandboxTag].filter(Boolean).join(" / ") || "n/a"}</dd>
      <dt>branch</dt>
      <dd>{run.branch ?? "n/a"}</dd>
      <dt>iterations</dt>
      <dd>
        {run.iterationsRun ?? run.iterationsSeen}/{run.maxIterations ?? "?"}
      </dd>
      <dt>logs</dt>
      <dd>{logCount}</dd>
      <dt>duration</dt>
      <dd>{formatDuration(run.durationMs)}</dd>
      <dt>completion</dt>
      <dd>{run.completionSignal ?? "n/a"}</dd>
      <dt>error</dt>
      <dd>{run.errorMessage ?? "none"}</dd>
    </dl>
  );
}

function getRuns(state: DonjonState): RunSummary[] {
  const statusRank: Record<RunStatus, number> = {
    active: 0,
    failed: 1,
    completed: 2,
  };

  return Object.values(state.runs).sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
  });
}

function getCommits(state: DonjonState): CommitSummary[] {
  return Object.values(state.commits).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function getStats(state: DonjonState): {
  totalRuns: number;
  runs: StatusStat;
  sandboxes: StatusStat;
  commits: number;
  logs: number;
  sessionStatus: string;
} {
  const runs = getRuns(state);
  const sandboxes = Object.values(state.sandboxes);
  const sessions = Object.values(state.sessions);
  const session = sessions[sessions.length - 1];

  return {
    totalRuns: runs.length,
    runs: {
      active: runs.filter((run) => run.status === "active").length,
      completed: runs.filter((run) => run.status === "completed").length,
      failed: runs.filter((run) => run.status === "failed").length,
    },
    sandboxes: {
      active: sandboxes.filter((sandbox) => sandbox.status === "active" || sandbox.status === "creating").length,
      completed: sandboxes.filter((sandbox) => sandbox.status === "closed").length,
      failed: sandboxes.filter((sandbox) => sandbox.status === "failed").length,
    },
    commits: Object.keys(state.commits).length,
    logs: state.logs.length,
    sessionStatus: session?.status ?? "waiting",
  };
}

function buildWorkflowColumns(runs: RunSummary[]): WorkflowColumn[] {
  if (runs.length === 0) {
    return [];
  }

  const plannerRuns = runs.filter((run) => roleForRun(run) === "planner");
  const implementerRuns = runs.filter((run) => roleForRun(run) === "implementer");
  const mergerRuns = runs.filter((run) => roleForRun(run) === "merger");
  const knownRoleIds = new Set([...plannerRuns, ...implementerRuns, ...mergerRuns].map((run) => run.id));
  const otherRuns = runs.filter((run) => !knownRoleIds.has(run.id));

  if (plannerRuns.length > 0 || implementerRuns.length > 0 || mergerRuns.length > 0) {
    return [
      { id: "planner", label: "planner", runs: plannerRuns.length > 0 ? plannerRuns : otherRuns.filter((run) => !run.parentId) },
      { id: "implementers", label: "implementers", runs: implementerRuns },
      { id: "merger", label: "merger", runs: mergerRuns },
      { id: "other", label: "other", runs: otherRuns.filter((run) => run.parentId || plannerRuns.length > 0) },
    ].filter((column) => column.runs.length > 0);
  }

  return buildDepthColumns(runs);
}

function buildDepthColumns(runs: RunSummary[]): WorkflowColumn[] {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const byDepth = new Map<number, RunSummary[]>();

  for (const run of runs) {
    const depth = runDepth(run, byId);
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), run]);
  }

  return [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, depthRuns]) => ({
      id: `depth-${depth}`,
      label: depth === 0 ? "root" : `stage ${depth + 1}`,
      runs: depthRuns,
    }));
}

function runDepth(run: RunSummary, byId: Map<string, RunSummary>, seen = new Set<string>()): number {
  if (!run.parentId || seen.has(run.id)) {
    return 0;
  }
  const parent = byId.get(run.parentId);
  if (!parent) {
    return 0;
  }
  return 1 + runDepth(parent, byId, new Set([...seen, run.id]));
}

function roleForRun(run: RunSummary): "planner" | "implementer" | "merger" | "other" {
  const name = (run.name ?? "").toLowerCase();
  if (name.includes("planner")) {
    return "planner";
  }
  if (name.includes("implementer")) {
    return "implementer";
  }
  if (name.includes("merger") || name.includes("merge")) {
    return "merger";
  }
  return "other";
}

function pickDefaultRun(state: DonjonState): RunSummary | undefined {
  const runs = getRuns(state);
  return runs.find((run) => run.status === "active") ?? runs[0];
}

function workflowSummary(runs: RunSummary[]): string {
  if (runs.length === 0) {
    return "waiting";
  }
  const active = runs.filter((run) => run.status === "active").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  if (active > 0) {
    return `${active} active`;
  }
  if (failed > 0) {
    return `${failed} failed`;
  }
  return `${runs.length} completed`;
}

function progressSignalsFor(run: RunSummary | undefined, logs: LogEntry[]): ProgressSignal[] {
  if (!run) {
    return [
      { label: "iterations", value: "0", percent: 0, status: "running" },
      { label: "commits", value: "0", percent: 0, status: "running" },
      { label: "logs", value: "0", percent: 0, status: "running" },
    ];
  }

  const logErrors = logs.filter((log) => log.kind === "error").length;

  return [
    {
      label: "iterations",
      value: `${run.iterationsRun ?? run.iterationsSeen}/${run.maxIterations ?? "?"}`,
      percent: runProgress(run),
      status: statusTone(run.status),
    },
    {
      label: "commits",
      value: String(run.commits.length),
      percent: run.commits.length > 0 ? 100 : 0,
      status: run.status === "failed" ? "failed" : run.commits.length > 0 ? "healthy" : "running",
    },
    {
      label: "logs",
      value: String(logs.length),
      percent: logs.length > 0 ? 100 : 0,
      status: logErrors > 0 ? "failed" : logs.length > 0 ? "healthy" : "running",
    },
  ];
}

function runProgress(run?: RunSummary): number {
  if (!run) {
    return 0;
  }
  const maxIterations = run.maxIterations ?? Math.max(run.iterationsSeen, run.iterationsRun ?? 0, 1);
  return clamp(((run.iterationsRun ?? run.iterationsSeen) / maxIterations) * 100, 0, 100);
}

function statusTone(status: RunStatus): "healthy" | "failed" | "running" {
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "healthy";
  }
  return "running";
}

function statusToken(status: RunStatus): string {
  if (status === "active") {
    return "RUN";
  }
  if (status === "failed") {
    return "ERR";
  }
  return "OK";
}

function logKindClass(kind: LogEntry["kind"]): string {
  return kind.replace(/[^a-z]+/g, "-");
}

function filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
  if (filter === "all") {
    return logs;
  }
  if (filter === "errors") {
    return logs.filter((log) => log.kind === "error");
  }
  return logs.filter((log) => log.kind === filter);
}

function formatRunMeta(run: RunSummary): string {
  return [run.agentName, run.sandboxName, run.branch].filter(Boolean).join(" / ") || shortId(run.id);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) {
    return "running";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatOptionalTime(timestamp?: string): string {
  return timestamp ? formatTime(timestamp) : "--:--";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
