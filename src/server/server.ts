import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvent, type DonjonEvent, type DonjonEventFields } from "../runtime/events.js";

export type DonjonServer = {
  port: number;
  sessionId: string;
  token: string;
  url: string;
  events: DonjonEvent[];
  emit: (type: string, fields?: DonjonEventFields) => DonjonEvent;
  recordEvent: (event: DonjonEvent) => void;
  close: () => Promise<void>;
};

export type StartDonjonServerOptions = {
  projectDir: string;
  sessionId: string;
  token: string;
};

type SseClient = {
  id: string;
  response: ServerResponse;
};

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

export async function startDonjonServer(options: StartDonjonServerOptions): Promise<DonjonServer> {
  const events: DonjonEvent[] = [];
  const clients = new Map<string, SseClient>();
  const runDir = join(options.projectDir, ".donjon", "runs", options.sessionId);
  const eventsPath = join(runDir, "events.ndjson");
  const metadataPath = join(runDir, "metadata.json");

  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        sessionId: options.sessionId,
        projectDir: options.projectDir,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  let serverRef: Server | undefined;

  const recordEvent = (event: DonjonEvent): void => {
    events.push(event);
    appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
    for (const client of clients.values()) {
      sendSse(client.response, event);
    }
  };

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, {
        token: options.token,
        events,
        clients,
        recordEvent,
      });
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "Internal server error");
    }
  });
  serverRef = server;

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine Donjon server port");
  }

  const api: DonjonServer = {
    port: address.port,
    sessionId: options.sessionId,
    token: options.token,
    url: `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(options.token)}`,
    events,
    emit(type, fields = {}) {
      const event = createEvent(type, {
        ...fields,
        sessionId: options.sessionId,
      });
      recordEvent(event);
      return event;
    },
    recordEvent,
    close() {
      return new Promise((resolveClose) => {
        for (const client of clients.values()) {
          client.response.end();
        }
        clients.clear();
        serverRef?.close(() => resolveClose());
      });
    },
  };

  return api;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    token: string;
    events: DonjonEvent[];
    clients: Map<string, SseClient>;
    recordEvent: (event: DonjonEvent) => void;
  },
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname.startsWith("/api/")) {
    if (url.searchParams.get("token") !== context.token) {
      response.statusCode = 401;
      response.end("Unauthorized");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, { events: context.events });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events/stream") {
      connectSse(request, response, context.clients);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      const event = await readJsonBody<DonjonEvent>(request);
      context.recordEvent(event);
      sendJson(response, { ok: true });
      return;
    }

    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  serveStatic(url.pathname, response);
}

function connectSse(
  request: IncomingMessage,
  response: ServerResponse,
  clients: Map<string, SseClient>,
): void {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream",
    connection: "keep-alive",
  });
  response.write(": connected\n\n");

  const keepAlive = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 25_000);

  clients.set(id, { id, response });
  request.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(id);
  });
}

function sendSse(response: ServerResponse, event: DonjonEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function serveStatic(pathname: string, response: ServerResponse): void {
  const clientDir = getClientDir();
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(clientDir, `.${decodeURIComponent(requestedPath)}`);

  if (!isInside(clientDir, filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallback = join(clientDir, "index.html");
    if (existsSync(fallback)) {
      sendFile(fallback, response);
      return;
    }

    response.statusCode = 503;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Donjon dashboard assets are missing. Run `npm run build` first.");
    return;
  }

  sendFile(filePath, response);
}

function sendFile(filePath: string, response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader("content-type", contentTypes[extname(filePath)] ?? "application/octet-stream");
  response.end(readFileSync(filePath));
}

function getClientDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const builtDir = resolve(currentDir, "../client");
  if (existsSync(builtDir)) {
    return builtDir;
  }

  return resolve(currentDir, "../../dist/client");
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}
