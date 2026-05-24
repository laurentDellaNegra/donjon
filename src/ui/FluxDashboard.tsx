import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { DonjonEvent } from "../runtime/events.js";
import { reduceEvents, type CommitSummary, type DonjonState, type LogEntry, type RunSummary, type RunStatus, type SandboxSummary } from "./state.js";
import "./fluxDashboard.css";

export type LogFilter = "all" | "agent.text" | "agent.tool_call" | "errors" | "lifecycle";

type FluxDashboardProps = {
  events: DonjonEvent[];
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

type RunPhase = "queued" | "reasoning" | "tooling" | "testing" | "committed" | "completed" | "failed";

type RiskSignal = {
  label: string;
  detail: string;
  tone: "healthy" | "warning" | "failed";
};

type StatusFilter = "all" | RunStatus;

export function FluxDashboard({
  events,
  state,
  selectedRunId,
  logFilter,
  onLogFilterChange,
  onSelectRun,
}: FluxDashboardProps): ReactElement {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [failureFocus, setFailureFocus] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | undefined>();

  const replayLimit = replayIndex === undefined ? events.length : clamp(Math.min(replayIndex, events.length), 0, events.length);
  const isReplay = replayIndex !== undefined && replayLimit < events.length;
  const replayEvents = useMemo(() => events.slice(0, replayLimit), [events, replayLimit]);
  const visibleState = useMemo(
    () => (isReplay ? reduceEvents(replayEvents, selectedRunId) : state),
    [isReplay, replayEvents, selectedRunId, state],
  );

  const runs = getRuns(visibleState);
  const stats = getStats(visibleState);
  const logs = visibleState.logs;
  const commits = getCommits(visibleState);
  const sandboxes = getSandboxes(visibleState);
  const effectiveStatusFilter: StatusFilter = failureFocus ? "failed" : statusFilter;
  const filteredRuns = filterRuns(runs, logs, commits, query, effectiveStatusFilter);
  const selectedRun = pickSelectedRun(visibleState, filteredRuns, selectedRunId);
  const selectedRunLogs = selectedRun ? logs.filter((log) => log.runId === selectedRun.id) : [];
  const globalLogs = filterLogs(logs, logFilter).filter((log) => logMatchesQuery(log, query));
  const workflowColumns = buildWorkflowColumns(filteredRuns);
  const progressSignals = progressSignalsFor(selectedRun, selectedRunLogs);
  const healthLabel = stats.runs.failed > 0 || stats.sandboxes.failed > 0 ? "attention" : "healthy";
  const incidentSummary = summarizeIncident(runs, logs, commits);
  const riskSignals = buildRiskSignals(runs, logs, visibleState);
  const liveEvents = replayEvents.slice(-8).reverse();

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
            <span className="flux-kicker">Mission control</span>
            <h1>Donjon Flux Dashboard</h1>
            <p>Replay, inspect, compare, and diagnose planner, implementer, merger, sandbox, branch, commit, and agent activity.</p>
          </div>
          <div className="flux-header-actions">
            <div className="flux-filter">{isReplay ? `replay ${replayLimit}/${events.length}` : stats.sessionStatus}</div>
            <div className={`flux-health ${healthLabel}`}>
              <span />
              <strong>{healthLabel}</strong>
            </div>
          </div>
        </header>

        <ReplayControls
          eventCount={events.length}
          isReplay={isReplay}
          replayLimit={replayLimit}
          onReplayChange={setReplayIndex}
          onReturnLive={() => setReplayIndex(undefined)}
        />

        <section className="flux-kpis" aria-label="Session metrics">
          <FluxMetric glyph="E" label="events" value={String(replayLimit)} detail={`${events.length} total`} tone="cyan" />
          <FluxMetric glyph="R" label="runs" value={String(stats.totalRuns)} detail={`${stats.runs.active} active`} tone="lime" />
          <FluxMetric glyph="F" label="failures" value={String(stats.runs.failed)} detail="failed runs" tone="pink" />
          <FluxMetric glyph="C" label="commits" value={String(stats.commits)} detail="recorded commits" tone="cyan" />
        </section>

        <SearchControls
          failureCount={stats.runs.failed}
          failureFocus={failureFocus}
          query={query}
          statusFilter={statusFilter}
          onFailureFocusChange={setFailureFocus}
          onQueryChange={setQuery}
          onStatusFilterChange={setStatusFilter}
        />

        <section className="flux-workspace">
          <div className="flux-pipeline-list">
            <div className="flux-panel-title">
              <span>runs</span>
              <span className="flux-panel-action">{filteredRuns.length}/{stats.totalRuns} shown</span>
            </div>
            <div className="flux-filter-row">
              <span>active {stats.runs.active}</span>
              <span>completed {stats.runs.completed}</span>
              <span>failed {stats.runs.failed}</span>
            </div>
            <RunList runs={filteredRuns} logs={logs} selectedRun={selectedRun} onSelectRun={onSelectRun} />
          </div>

          <div className={`flux-flow-panel ${failureFocus ? "failure-focus" : ""}`}>
            <div className="flux-flow-head">
              <div>
                <span>workflow graph</span>
                <strong>{workflowSummary(filteredRuns)}</strong>
              </div>
              <span className="flux-panel-action">click a run to inspect</span>
            </div>
            <WorkflowGraph columns={workflowColumns} logs={logs} selectedRunId={selectedRun?.id} onSelectRun={onSelectRun} />
          </div>

          <aside className="flux-job-panel">
            <div className="flux-panel-title">
              <span>run drawer</span>
              <span className="flux-panel-action">{selectedRun ? shortId(selectedRun.id) : "none"}</span>
            </div>
            <h2>{selectedRun?.name ?? "No run selected"}</h2>
            <p>{selectedRun ? formatRunMeta(selectedRun) : "Waiting for workflow events"}</p>
            <div className={`flux-job-status ${selectedRun?.status ?? "idle"}`}>{selectedRun?.status ?? "idle"}</div>
            <RunDossier run={selectedRun} logCount={selectedRunLogs.length} phase={selectedRun ? phaseForRun(selectedRun, selectedRunLogs) : undefined} />
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
            <RunLogDrawer logs={selectedRunLogs} />
          </aside>
        </section>

        <section className="flux-intel-grid" aria-label="Diagnostics">
          <IncidentPanel summary={incidentSummary} />
          <RiskRadar risks={riskSignals} />
          <SandboxLane sandboxes={sandboxes} />
        </section>

        <section className="flux-bottom-grid">
          <ActivityPanel filter={logFilter} logs={globalLogs} onFilterChange={onLogFilterChange} />
          <RunComparison runs={filteredRuns} logs={logs} />
          <BranchMap runs={runs} commits={commits} />
          <CommitLineage commits={commits} runs={runs} />
        </section>

        <EventStream events={liveEvents} />
      </main>
    </div>
  );
}

function ReplayControls({
  eventCount,
  isReplay,
  replayLimit,
  onReplayChange,
  onReturnLive,
}: {
  eventCount: number;
  isReplay: boolean;
  replayLimit: number;
  onReplayChange: (index: number | undefined) => void;
  onReturnLive: () => void;
}): ReactElement {
  return (
    <section className="flux-replay-panel" aria-label="Run replay timeline">
      <div className="flux-panel-title">
        <span>mission replay</span>
        <span className="flux-panel-action">{isReplay ? "scrubbing" : "live"}</span>
      </div>
      <div className="flux-replay-controls">
        <button disabled={eventCount === 0} onClick={() => onReplayChange(0)} type="button">
          start
        </button>
        <button disabled={eventCount === 0} onClick={() => onReplayChange(Math.max(0, replayLimit - 1))} type="button">
          prev
        </button>
        <input
          aria-label="Replay event index"
          disabled={eventCount === 0}
          max={eventCount}
          min={0}
          onChange={(event) => onReplayChange(Number(event.currentTarget.value))}
          type="range"
          value={replayLimit}
        />
        <button disabled={eventCount === 0} onClick={() => onReplayChange(Math.min(eventCount, replayLimit + 1))} type="button">
          next
        </button>
        <button disabled={!isReplay} onClick={onReturnLive} type="button">
          live
        </button>
      </div>
    </section>
  );
}

function SearchControls({
  failureCount,
  failureFocus,
  query,
  statusFilter,
  onFailureFocusChange,
  onQueryChange,
  onStatusFilterChange,
}: {
  failureCount: number;
  failureFocus: boolean;
  query: string;
  statusFilter: StatusFilter;
  onFailureFocusChange: (enabled: boolean) => void;
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
}): ReactElement {
  return (
    <section className="flux-command-panel" aria-label="Search and filters">
      <label>
        <span>search</span>
        <input onChange={(event) => onQueryChange(event.currentTarget.value)} placeholder="run, branch, commit, tool, error..." value={query} />
      </label>
      <label>
        <span>status</span>
        <select
          disabled={failureFocus}
          onChange={(event) => onStatusFilterChange(event.currentTarget.value as StatusFilter)}
          value={statusFilter}
        >
          <option value="all">all</option>
          <option value="active">active</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
        </select>
      </label>
      <button
        aria-pressed={failureFocus}
        disabled={failureCount === 0}
        onClick={() => onFailureFocusChange(!failureFocus)}
        type="button"
      >
        failure focus {failureCount}
      </button>
    </section>
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

function RunList({
  runs,
  logs,
  selectedRun,
  onSelectRun,
}: {
  runs: RunSummary[];
  logs: LogEntry[];
  selectedRun?: RunSummary;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  return (
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
            <em>{phaseForRun(run, logsForRun(logs, run.id))}</em>
          </button>
        ))
      ) : (
        <div className="flux-empty">No matching runs</div>
      )}
    </div>
  );
}

function WorkflowGraph({
  columns,
  logs,
  selectedRunId,
  onSelectRun,
}: {
  columns: WorkflowColumn[];
  logs: LogEntry[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  if (columns.length === 0) {
    return (
      <div className="flux-flow-canvas empty">
        <div className="flux-empty">No workflow nodes match the current filters</div>
      </div>
    );
  }

  return (
    <div className="flux-flow-canvas">
      {columns.map((column, columnIndex) => (
        <section className="flux-flow-column" key={column.id}>
          <div className="flux-flow-column-title">{column.label}</div>
          <div className="flux-flow-column-runs">
            {column.runs.map((run) => {
              const phase = phaseForRun(run, logsForRun(logs, run.id));
              return (
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
                  <em>{phase}</em>
                </button>
              );
            })}
          </div>
          {columnIndex < columns.length - 1 ? <div className="flux-flow-connector" aria-hidden="true" /> : null}
        </section>
      ))}
    </div>
  );
}

function RunDossier({ run, logCount, phase }: { run?: RunSummary; logCount: number; phase?: RunPhase }): ReactElement {
  if (!run) {
    return <div className="flux-empty">No run selected</div>;
  }

  return (
    <dl className="flux-dossier">
      <dt>phase</dt>
      <dd>{phase ?? "queued"}</dd>
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

function RunLogDrawer({ logs }: { logs: LogEntry[] }): ReactElement {
  return (
    <div className="flux-run-drawer">
      <div className="flux-panel-title">
        <span>run log drawer</span>
        <span className="flux-panel-action">{logs.length} events</span>
      </div>
      {logs.length > 0 ? (
        logs.slice(-6).reverse().map((log) => (
          <div className={`flux-drawer-row ${logKindClass(log.kind)}`} key={log.id}>
            <span>{formatTime(log.timestamp)}</span>
            <strong>{log.kind}</strong>
            <p>{log.message}</p>
          </div>
        ))
      ) : (
        <div className="flux-empty">No events for this run yet</div>
      )}
    </div>
  );
}

function ActivityPanel({
  filter,
  logs,
  onFilterChange,
}: {
  filter: LogFilter;
  logs: LogEntry[];
  onFilterChange: (filter: LogFilter) => void;
}): ReactElement {
  return (
    <div className="flux-activity-panel">
      <div className="flux-panel-title">
        <span>event stream</span>
        <LogFilters filter={filter} onFilterChange={onFilterChange} />
      </div>
      {logs.length > 0 ? (
        logs.slice(-7).reverse().map((log) => (
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

function IncidentPanel({ summary }: { summary: string[] }): ReactElement {
  return (
    <div className="flux-incident-panel">
      <div className="flux-panel-title">
        <span>AI incident summary</span>
        <span className="flux-panel-action">derived</span>
      </div>
      {summary.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function RiskRadar({ risks }: { risks: RiskSignal[] }): ReactElement {
  return (
    <div className="flux-risk-panel">
      <div className="flux-panel-title">
        <span>risk radar</span>
        <span className="flux-panel-action">{risks.length} signals</span>
      </div>
      {risks.map((risk) => (
        <div className={`flux-risk-row ${risk.tone}`} key={`${risk.label}-${risk.detail}`}>
          <strong>{risk.label}</strong>
          <p>{risk.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SandboxLane({ sandboxes }: { sandboxes: SandboxSummary[] }): ReactElement {
  return (
    <div className="flux-sandbox-panel">
      <div className="flux-panel-title">
        <span>sandbox lane</span>
        <span className="flux-panel-action">{sandboxes.length} tracked</span>
      </div>
      {sandboxes.length > 0 ? (
        <div className="flux-sandbox-lane">
          {sandboxes.map((sandbox) => (
            <div className={`flux-sandbox-node ${sandbox.status}`} key={sandbox.id}>
              <strong>{sandbox.tag ?? shortId(sandbox.id)}</strong>
              <span>{sandbox.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flux-empty">No sandbox events yet</div>
      )}
    </div>
  );
}

function RunComparison({ runs, logs }: { runs: RunSummary[]; logs: LogEntry[] }): ReactElement {
  return (
    <div className="flux-comparison-panel">
      <div className="flux-panel-title">
        <span>run comparison</span>
        <span className="flux-panel-action">{runs.length} rows</span>
      </div>
      <div className="flux-comparison-table">
        <div className="flux-comparison-head">
          <span>run</span>
          <span>phase</span>
          <span>iter</span>
          <span>logs</span>
          <span>commits</span>
        </div>
        {runs.slice(0, 8).map((run) => {
          const runLogs = logsForRun(logs, run.id);
          return (
            <div className={`flux-comparison-row ${run.status}`} key={run.id}>
              <strong>{run.name ?? shortId(run.id)}</strong>
              <span>{phaseForRun(run, runLogs)}</span>
              <span>
                {run.iterationsRun ?? run.iterationsSeen}/{run.maxIterations ?? "?"}
              </span>
              <span>{runLogs.length}</span>
              <span>{run.commits.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchMap({ commits, runs }: { commits: CommitSummary[]; runs: RunSummary[] }): ReactElement {
  return (
    <div className="flux-branch-panel">
      <div className="flux-panel-title">
        <span>branch / worktree map</span>
        <span className="flux-panel-action">{commits.length} commits</span>
      </div>
      {runs.length > 0 ? (
        runs.slice(0, 6).map((run) => (
          <div className={`flux-branch-row ${run.status}`} key={run.id}>
            <span>{run.name ?? shortId(run.id)}</span>
            <strong>{run.branch ?? "branch n/a"}</strong>
            <p>{run.preservedWorktreePath ?? run.logFilePath ?? "worktree n/a"}</p>
          </div>
        ))
      ) : (
        <div className="flux-empty">No branches recorded yet</div>
      )}
    </div>
  );
}

function CommitLineage({ commits, runs }: { commits: CommitSummary[]; runs: RunSummary[] }): ReactElement {
  return (
    <div className="flux-commit-panel">
      <div className="flux-panel-title">
        <span>commit lineage</span>
        <span className="flux-panel-action">{commits.length} recorded</span>
      </div>
      {commits.length > 0 ? (
        commits.slice(0, 6).map((commit) => {
          const run = runs.find((candidate) => candidate.id === commit.runId);
          return (
            <div className="flux-commit-row" key={commit.id}>
              <span>{shortId(commit.sha)}</span>
              <strong>{run?.name ?? "unknown run"}</strong>
              <p>{commit.branch ?? "branch n/a"} / {commit.message ?? "commit"}</p>
            </div>
          );
        })
      ) : (
        <div className="flux-empty">No commits recorded yet</div>
      )}
    </div>
  );
}

function EventStream({ events }: { events: DonjonEvent[] }): ReactElement {
  return (
    <section className="flux-event-strip" aria-label="Live event stream">
      <span>live event stream</span>
      <div>
        {events.length > 0 ? (
          events.map((event) => (
            <p className={event.level === "error" || event.type.endsWith(".failed") ? "failed" : ""} key={event.id}>
              <strong>{formatTime(event.timestamp)}</strong> {event.type}
            </p>
          ))
        ) : (
          <p>waiting for events</p>
        )}
      </div>
    </section>
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

function getSandboxes(state: DonjonState): SandboxSummary[] {
  return Object.values(state.sandboxes).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
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

function filterRuns(
  runs: RunSummary[],
  logs: LogEntry[],
  commits: CommitSummary[],
  query: string,
  statusFilter: StatusFilter,
): RunSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  return runs.filter((run) => {
    if (statusFilter !== "all" && run.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const runLogs = logsForRun(logs, run.id);
    const runCommits = commits.filter((commit) => commit.runId === run.id);
    return [
      run.id,
      run.name,
      run.agentName,
      run.sandboxName,
      run.sandboxTag,
      run.branch,
      run.errorMessage,
      run.preservedWorktreePath,
      ...runLogs.map((log) => `${log.kind} ${log.message}`),
      ...runCommits.map((commit) => `${commit.sha} ${commit.branch ?? ""} ${commit.message ?? ""}`),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

function pickSelectedRun(state: DonjonState, runs: RunSummary[], selectedRunId?: string): RunSummary | undefined {
  const selected = selectedRunId ? state.runs[selectedRunId] : undefined;
  if (selected && runs.some((run) => run.id === selected.id)) {
    return selected;
  }
  return runs.find((run) => run.status === "active") ?? runs[0] ?? pickDefaultRun(state);
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

function phaseForRun(run: RunSummary, logs: LogEntry[]): RunPhase {
  if (run.status === "failed") {
    return "failed";
  }
  if (run.status === "completed" && run.commits.length > 0) {
    return "committed";
  }
  if (run.status === "completed") {
    return "completed";
  }
  const lastLog = logs[logs.length - 1];
  if (!lastLog) {
    return "queued";
  }
  const message = lastLog.message.toLowerCase();
  if (message.includes("test") || message.includes("typecheck") || message.includes("npm")) {
    return "testing";
  }
  if (lastLog.kind === "agent.tool_call") {
    return "tooling";
  }
  return "reasoning";
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

function buildRiskSignals(runs: RunSummary[], logs: LogEntry[], state: DonjonState): RiskSignal[] {
  const failedRuns = runs.filter((run) => run.status === "failed");
  const activeAtLimit = runs.filter((run) => run.status === "active" && run.maxIterations && run.iterationsSeen >= run.maxIterations);
  const completedWithoutBranch = runs.filter((run) => run.status === "completed" && !run.branch);
  const completedImplementersWithoutCommits = runs.filter(
    (run) => run.status === "completed" && roleForRun(run) === "implementer" && run.commits.length === 0,
  );
  const toolErrors = logs.filter((log) => log.kind === "error");
  const failedSandboxes = Object.values(state.sandboxes).filter((sandbox) => sandbox.status === "failed");
  const risks: RiskSignal[] = [];

  if (failedRuns.length > 0) {
    risks.push({ label: "failed runs", detail: failedRuns.map((run) => run.name ?? shortId(run.id)).join(", "), tone: "failed" });
  }
  if (toolErrors.length > 0) {
    risks.push({ label: "error events", detail: `${toolErrors.length} error event(s) in the stream`, tone: "failed" });
  }
  if (failedSandboxes.length > 0) {
    risks.push({ label: "sandbox failures", detail: `${failedSandboxes.length} sandbox failure(s) detected`, tone: "failed" });
  }
  if (activeAtLimit.length > 0) {
    risks.push({ label: "iteration pressure", detail: `${activeAtLimit.length} active run(s) at max iterations`, tone: "warning" });
  }
  if (completedWithoutBranch.length > 0) {
    risks.push({ label: "missing branch", detail: `${completedWithoutBranch.length} completed run(s) have no branch`, tone: "warning" });
  }
  if (completedImplementersWithoutCommits.length > 0) {
    risks.push({ label: "no commits", detail: `${completedImplementersWithoutCommits.length} implementer run(s) ended without commits`, tone: "warning" });
  }

  return risks.length > 0 ? risks : [{ label: "clear", detail: "No run, sandbox, branch, iteration, or commit risks detected", tone: "healthy" }];
}

function summarizeIncident(runs: RunSummary[], logs: LogEntry[], commits: CommitSummary[]): string[] {
  if (runs.length === 0) {
    return ["Waiting for workflow events.", "The incident summary will update as runs, logs, and commits arrive."];
  }
  const failedRuns = runs.filter((run) => run.status === "failed");
  const activeRuns = runs.filter((run) => run.status === "active");
  const completedRuns = runs.filter((run) => run.status === "completed");

  if (failedRuns.length > 0) {
    const firstFailure = failedRuns[0];
    const failureLogs = logsForRun(logs, firstFailure.id);
    const lastFailureLog = [...failureLogs].reverse().find((log) => log.kind === "error") ?? failureLogs[failureLogs.length - 1];
    return [
      `${failedRuns.length} run(s) failed: ${failedRuns.map((run) => run.name ?? shortId(run.id)).join(", ")}.`,
      lastFailureLog ? `Primary failure signal: ${lastFailureLog.message}.` : "The failed run did not emit a detailed error log.",
      `${commits.length} commit(s) were recorded before the incident state.`,
    ];
  }

  if (activeRuns.length > 0) {
    return [
      `${activeRuns.length} run(s) are still active: ${activeRuns.map((run) => run.name ?? shortId(run.id)).join(", ")}.`,
      `${completedRuns.length} run(s) have completed and ${commits.length} commit(s) have been recorded so far.`,
    ];
  }

  return [
    `Workflow completed with ${completedRuns.length} run(s) and ${commits.length} commit(s).`,
    "No failed runs are present in the current replay window.",
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

function logMatchesQuery(log: LogEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [log.type, log.kind, log.level, log.message, log.runId, log.sandboxId]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function logsForRun(logs: LogEntry[], runId: string): LogEntry[] {
  return logs.filter((log) => log.runId === runId);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
