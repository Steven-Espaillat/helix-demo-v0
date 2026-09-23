import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deriveEvidenceCase, loadCanonicalBundle } from "./evidence-case.js";
import { renderWorkbench } from "./render-workbench.js";

const stylesheetPath = new URL("../public/styles.css", import.meta.url);

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

export async function createWorkbenchServer() {
  const bundle = await loadCanonicalBundle();
  const evidenceCase = deriveEvidenceCase(bundle);
  const html = renderWorkbench(bundle, evidenceCase);
  const stylesheet = await readFile(stylesheetPath, "utf8");

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

    if (request.method === "GET" && url.pathname === "/api/evidence-case") {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(evidenceCase));
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
