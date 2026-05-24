import { describe, expect, it } from "vitest";
import { reduceEvents } from "./state.js";
import type { DonjonEvent } from "../runtime/events.js";

describe("reduceEvents", () => {
  it("tracks a run, agent output, commits, and completion", () => {
    const events: DonjonEvent[] = [
      event("run.started", {
        runId: "run-1",
        data: { name: "implementer", maxIterations: 5 },
      }),
      event("agent.text", {
        runId: "run-1",
        message: "hello",
        data: { iteration: 2, message: "hello" },
      }),
      event("run.completed", {
        runId: "run-1",
        data: {
          branch: "feature",
          iterationsRun: 3,
          commits: [{ sha: "abc123" }],
        },
      }),
      event("git.commit", {
        runId: "run-1",
        data: { sha: "abc123", branch: "feature" },
      }),
    ];

    const state = reduceEvents(events);

    expect(state.runs["run-1"].status).toBe("completed");
    expect(state.runs["run-1"].iterationsSeen).toBe(3);
    expect(state.runs["run-1"].commits).toEqual(["abc123"]);
    expect(state.commits.abc123.branch).toBe("feature");
    expect(state.logs.some((log) => log.kind === "agent.text")).toBe(true);
  });
});

function event(type: string, partial: Partial<DonjonEvent>): DonjonEvent {
  return {
    id: `${type}-${Math.random()}`,
    type,
    timestamp: new Date(0).toISOString(),
    sessionId: "session-1",
    ...partial,
  };
}
