import { randomUUID } from "node:crypto";

export type DonjonEvent = {
  id: string;
  type: string;
  timestamp: string;
  sessionId: string;
  runId?: string;
  sandboxId?: string;
  parentId?: string;
  level?: "debug" | "info" | "warn" | "error";
  message?: string;
  data?: Record<string, unknown>;
};

export type DonjonEventFields = Partial<Omit<DonjonEvent, "id" | "type" | "timestamp">>;

export function createEvent(type: string, fields: DonjonEventFields = {}): DonjonEvent {
  return {
    id: createId(),
    type,
    timestamp: new Date().toISOString(),
    sessionId: fields.sessionId ?? process.env.DONJON_SESSION_ID ?? "standalone",
    runId: fields.runId,
    sandboxId: fields.sandboxId,
    parentId: fields.parentId,
    level: fields.level,
    message: fields.message,
    data: fields.data,
  };
}

export function normalizeError(error: unknown): {
  errorName: string;
  errorMessage: string;
  errorStack?: string;
} {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorName: "Error",
    errorMessage: typeof error === "string" ? error : JSON.stringify(error),
  };
}

function createId(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
