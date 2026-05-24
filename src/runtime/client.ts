import { createEvent, type DonjonEventFields } from "./events.js";

export async function emitDonjonEvent(type: string, payload: DonjonEventFields = {}): Promise<void> {
  if (process.env.DONJON_ENABLED !== "1") {
    return;
  }

  const port = process.env.DONJON_PORT;
  const token = process.env.DONJON_TOKEN;
  const sessionId = process.env.DONJON_SESSION_ID;

  if (!port || !token || !sessionId || typeof fetch !== "function") {
    return;
  }

  try {
    const event = createEvent(type, { ...payload, sessionId });
    await fetch(`http://127.0.0.1:${port}/api/events?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Donjon is intentionally best-effort telemetry. Sandcastle runs must never
    // fail because the local dashboard is unavailable or slow.
  }
}
