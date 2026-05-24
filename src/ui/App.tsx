import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { DonjonEvent } from "../runtime/events.js";
import { FluxDashboard, type LogFilter } from "./FluxDashboard.js";
import { reduceEvents } from "./state.js";

export function App(): ReactElement {
  const [events, setEvents] = useState<DonjonEvent[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const state = useMemo(() => reduceEvents(events, selectedRunId), [events, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId && state.selectedRunId) {
      setSelectedRunId(state.selectedRunId);
    }
  }, [selectedRunId, state.selectedRunId]);

  useEffect(() => {
    let closed = false;

    async function loadInitialState(): Promise<void> {
      const response = await fetch(`/api/state?token=${encodeURIComponent(token)}`);
      const body = (await response.json()) as { events: DonjonEvent[] };
      if (!closed) {
        setEvents(body.events);
      }
    }

    loadInitialState().catch(() => {
      // Keep the dashboard mounted; the empty state makes missing events visible.
    });

    const source = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as DonjonEvent;
      setEvents((current) => [...current, event]);
    };

    const knownTypes = [
      "session.started",
      "session.completed",
      "process.started",
      "process.completed",
      "process.failed",
      "run.started",
      "run.completed",
      "run.failed",
      "sandbox.create.started",
      "sandbox.create.completed",
      "sandbox.create.failed",
      "sandbox.run.started",
      "sandbox.run.completed",
      "sandbox.run.failed",
      "sandbox.close.started",
      "sandbox.close.completed",
      "sandbox.close.failed",
      "interactive.started",
      "interactive.completed",
      "interactive.failed",
      "agent.text",
      "agent.tool_call",
      "git.commit",
      "demo.started",
      "demo.completed",
    ];

    for (const type of knownTypes) {
      source.addEventListener(type, (message) => {
        const event = JSON.parse((message as MessageEvent).data) as DonjonEvent;
        setEvents((current) => [...current, event]);
      });
    }

    return () => {
      closed = true;
      source.close();
    };
  }, [token]);

  return (
    <FluxDashboard
      events={events}
      state={state}
      selectedRunId={selectedRunId}
      logFilter={logFilter}
      onLogFilterChange={setLogFilter}
      onSelectRun={setSelectedRunId}
    />
  );
}
