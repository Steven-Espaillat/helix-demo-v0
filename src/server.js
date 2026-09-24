import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deriveEvidenceCase, loadCanonicalBundle } from "./evidence-case.js";
import { createHelixCodex } from "./helix-codex.js";
import { renderWorkbench } from "./render-workbench.js";
import { createStageRunner } from "./stage-runner.js";

const stylesheetPath = new URL("../public/styles.css", import.meta.url);
const workbenchScriptPath = new URL("../public/workbench.js", import.meta.url);
const maximumRequestBytes = 4096;
const demoSessionIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const unsupportedReleaseActions = new Map([
  ["approve", "Approval"],
  ["approval", "Approval"],
  ["sign", "Signature"],
  ["signature", "Signature"],
  ["checksum", "Checksum"],
  ["export", "Export"],
]);

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

class StageRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendStageFailure(response, status, kind, message) {
  send(
    response,
    status,
    "application/x-ndjson; charset=utf-8",
    `${JSON.stringify({ type: "stage.failed", kind, message })}\n`,
  );
}

async function readStageRunBody(request) {
  const contentType = request.headers["content-type"];
  const mediaType = typeof contentType === "string"
    ? contentType.split(";", 1)[0].trim().toLowerCase()
    : "";
  if (mediaType !== "application/json") {
    throw new StageRequestError(415, "Content-Type must be application/json");
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > maximumRequestBytes) {
      throw new StageRequestError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new StageRequestError(400, "Request body must be valid JSON");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new StageRequestError(400, "Invalid stage run request");
  }
  const fields = Object.keys(body);
  if (fields.length !== 1 || fields[0] !== "demoSessionId") {
    throw new StageRequestError(400, "Invalid stage run request");
  }
  if (typeof body.demoSessionId !== "string" || !demoSessionIdPattern.test(body.demoSessionId)) {
    throw new StageRequestError(400, "Invalid demo session ID");
  }

  return body;
}

async function streamNdjson(response, events) {
  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.flushHeaders();
  for await (const event of events) {
    if (response.destroyed) {
      return;
    }
    response.write(`${JSON.stringify(event)}\n`);
  }
  response.end();
}

async function handleStageRun(request, response, url, stageId, stageRunner) {
  if (url.search !== "") {
    throw new StageRequestError(400, "Stage run requests do not accept query parameters");
  }
  if (!stageRunner.hasStage(stageId)) {
    throw new StageRequestError(404, "Stage not found");
  }
  const { demoSessionId } = await readStageRunBody(request);
  await streamNdjson(response, stageRunner.run({ stageId, demoSessionId }));
}

export async function createWorkbenchServer({
  createCodex = createHelixCodex,
  sessions = new Map(),
  bundle: providedBundle,
  recordUnsafeSdkPayload,
} = {}) {
  const bundle = providedBundle ?? await loadCanonicalBundle();
  const evidenceCase = deriveEvidenceCase(bundle);
  const html = renderWorkbench(bundle, evidenceCase);
  const [stylesheet, workbenchScript] = await Promise.all([
    readFile(stylesheetPath, "utf8"),
    readFile(workbenchScriptPath, "utf8"),
  ]);
  const stageRunner = createStageRunner({
    bundle,
    createCodex,
    sessions,
    ...(recordUnsafeSdkPayload === undefined ? {} : { recordUnsafeSdkPayload }),
  });

  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", html);
      return;
    }

    if (request.method === "GET" && url.pathname === "/styles.css") {
      send(response, 200, "text/css; charset=utf-8", stylesheet);
      return;
    }

    if (request.method === "GET" && url.pathname === "/workbench.js") {
      send(response, 200, "text/javascript; charset=utf-8", workbenchScript);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/evidence-case") {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(evidenceCase));
      return;
    }

    const releaseActionMatch = /^\/api\/release\/(approve|approval|sign|signature|checksum|export)$/.exec(url.pathname);
    if (request.method === "POST" && releaseActionMatch) {
      const label = unsupportedReleaseActions.get(releaseActionMatch[1]);
      sendStageFailure(
        response,
        403,
        "out_of_scope",
        `${label} is unavailable in this slice. The release remains blocked.`,
      );
      return;
    }

    const stageRunMatch = /^\/api\/stages\/([^/]+)\/run$/.exec(url.pathname);
    if (request.method === "POST" && stageRunMatch) {
      handleStageRun(request, response, url, stageRunMatch[1], stageRunner).catch((error) => {
        if (response.headersSent) {
          response.end();
          return;
        }
        const requestError = error instanceof StageRequestError;
        sendStageFailure(
          response,
          requestError ? error.status : 500,
          requestError ? "invalid_request" : "run_failed",
          requestError
            ? error.message
            : "The stage run request could not be handled. The release remains blocked.",
        );
      });
      return;
    }

    send(response, 404, "text/plain; charset=utf-8", "Not found");
  });
}

export async function startWorkbench({ port = Number(process.env.PORT ?? 3000) } = {}) {
  const server = await createWorkbenchServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  console.log(`HELIX synthetic blocked-gate audit listening on http://127.0.0.1:${address.port}`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startWorkbench().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
