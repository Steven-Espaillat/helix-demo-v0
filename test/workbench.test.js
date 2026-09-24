import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  AUDIT_SELECTION_SCHEMA,
  assertAuditSelectionMatchesFixture,
  assertFixtureInvariants,
  deriveEvidenceCase,
  loadCanonicalBundle,
  parseAuditSelection,
} from "../src/evidence-case.js";
import { createWorkbenchServer } from "../src/server.js";
import { STAGE_ACTIVITY_LABELS } from "../src/stage-runner.js";

function clone(value) {
  return structuredClone(value);
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function validation(bundle, id) {
  return (bundle.validation_results ?? bundle.validationResults).find(
    (result) => result.result_id === id,
  );
}

function gate(bundle, id) {
  return (bundle.gate_decisions ?? bundle.gateDecisions).find(
    (decision) => decision.gate_id === id,
  );
}

const canonicalAuditSelection = Object.freeze({
  caseId: "C-BW-HIGH",
  transformId: "mean-v1",
  provenanceEdgeIds: Array.from({ length: 10 }, (_, index) => `PE-BW-${index + 1}`),
  validationResultIds: ["VR-003", "VR-004"],
  gateDecisionIds: ["GATE-SECTION-S5", "GATE-RELEASE"],
  reviewDispositionIds: ["RD-1", "RD-2", "RD-3"],
});

function parseNdjson(serializedEvents) {
  return serializedEvents.trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function regulatorySnapshot(bundle) {
  return JSON.stringify({
    workflowState: bundle.workflow_state,
    gateDecisions: bundle.gate_decisions,
    reviewDispositions: bundle.review_dispositions,
    exportArtifacts: bundle.export_artifacts,
    events: bundle.events,
  });
}

function createMockCodex(eventsFactory, onRun = () => {}) {
  return async () => ({
    startReplayThread() {
      return {
        async runStreamed(prompt, turnOptions) {
          onRun({ prompt, turnOptions });
          return { events: eventsFactory() };
        },
      };
    },
  });
}

async function postStageRun(origin, demoSessionId) {
  const response = await fetch(`${origin}/api/stages/gates/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ demoSessionId }),
  });
  return { response, serializedEvents: await response.text() };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

describe("fixture preflight", () => {
  test("accepts the canonical synthetic bundle", async () => {
    const bundle = await loadCanonicalBundle();
    assert.doesNotThrow(() => assertFixtureInvariants(bundle));
  });

  test("derives UI status from validation results and gate decisions", async () => {
    const bundle = clone(await loadCanonicalBundle());
    validation(bundle, "VR-004").status = "pass";
    gate(bundle, "GATE-SECTION-S5").status = "ready";
    gate(bundle, "GATE-RELEASE").status = "ready";

    assert.equal(deriveEvidenceCase(bundle).uiStatus, "validated");

    validation(bundle, "VR-004").status = "fail";
    assert.equal(deriveEvidenceCase(bundle).uiStatus, "blocked");
  });

  test("accepts only the fixed AuditSelection with fixture-backed references", async () => {
    const bundle = await loadCanonicalBundle();
    const selection = parseAuditSelection(JSON.stringify(canonicalAuditSelection));
    assert.doesNotThrow(() => assertAuditSelectionMatchesFixture(bundle, selection));
    assert.equal(JSON.stringify(AUDIT_SELECTION_SCHEMA).includes("uniqueItems"), false);

    assert.throws(
      () => parseAuditSelection(JSON.stringify({ ...canonicalAuditSelection, uiStatus: "ready" })),
      /Invalid AuditSelection fields/,
    );
    assert.throws(
      () => parseAuditSelection(JSON.stringify({
        ...canonicalAuditSelection,
        provenanceEdgeIds: [
          ...canonicalAuditSelection.provenanceEdgeIds.slice(0, -1),
          canonicalAuditSelection.provenanceEdgeIds[0],
        ],
      })),
      /Invalid AuditSelection field: provenanceEdgeIds/,
    );

    const missingEvidence = clone(bundle);
    missingEvidence.provenance_edges = missingEvidence.provenance_edges.filter(
      (edge) => edge.edge_id !== canonicalAuditSelection.provenanceEdgeIds[0],
    );
    assert.throws(
      () => assertAuditSelectionMatchesFixture(missingEvidence, selection),
      /AuditSelection references 1 missing fixture item/,
    );
  });

  test("names every failed invariant", async () => {
    const canonical = await loadCanonicalBundle();
    const cases = [
      ["workflow state is gated", (bundle) => { bundle.workflow_state = "ready"; }],
      ["manifest has ten frozen inputs", (bundle) => { bundle.manifest[0].locked = false; }],
      ["normalized record count is 1,662", (bundle) => { bundle.records.animals.pop(); }],
      ["fixture has three claims and fourteen provenance edges", (bundle) => { bundle.claims.pop(); }],
      ["C-BW-HIGH claim is 286.2 g", (bundle) => { bundle.claims[0].value = 263.8; }],
      ["C-BW-HIGH has exactly ten provenance edges", (bundle) => { bundle.provenance_edges[0].claim_id = "C-MI-LIVER"; }],
      ["C-BW-HIGH transform is mean-v1", (bundle) => { bundle.provenance_edges[0].transform_id = "model-prose"; }],
      ["VR-003 passes and cites the ten provenance edges", (bundle) => { validation(bundle, "VR-003").status = "fail"; }],
      ["VR-004 is a blocker failure citing C-BW-HIGH", (bundle) => { validation(bundle, "VR-004").severity = "warning"; }],
      ["Section 5 gate is blocked by VR-004", (bundle) => { gate(bundle, "GATE-SECTION-S5").status = "open"; }],
      ["release gate is blocked by VR-004, VR-005, and VR-006", (bundle) => { gate(bundle, "GATE-RELEASE").blocking_result_ids.pop(); }],
      ["blocker review dispositions are open", (bundle) => { bundle.review_dispositions[0].decision = "closed"; }],
      ["export artifacts are pending without checksums", (bundle) => { bundle.export_artifacts[0].checksum = "sha256:not-allowed"; }],
    ];

    for (const [name, mutate] of cases) {
      const bundle = clone(canonical);
      mutate(bundle);
      assert.throws(() => assertFixtureInvariants(bundle), (error) => {
        assert.match(error.message, new RegExp(`^Fixture invariant failed: ${name}`));
        return true;
      });
    }
  });
});

describe("running blocked-gate audit", () => {
  let server;
  let origin;

  before(async () => {
    server = await createWorkbenchServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("serves the canonical blocked EvidenceCase", async () => {
    const response = await fetch(`${origin}/api/evidence-case`);
    assert.equal(response.status, 200);
    const evidenceCase = await response.json();

    assert.equal(evidenceCase.caseId, "C-BW-HIGH");
    assert.deepEqual(
      { value: evidenceCase.claim.value, unit: evidenceCase.claim.unit, status: evidenceCase.claim.status },
      { value: 286.2, unit: "g", status: "validated" },
    );
    assert.equal(evidenceCase.transform.id, "mean-v1");
    assert.equal(evidenceCase.provenanceEdges.length, 10);
    assert.deepEqual(evidenceCase.provenanceEdges.map((edge) => edge.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(validation(evidenceCase, "VR-003").status, "pass");
    assert.equal(validation(evidenceCase, "VR-004").status, "fail");
    assert.deepEqual(gate(evidenceCase, "GATE-SECTION-S5").blocking_result_ids, ["VR-004"]);
    assert.deepEqual(gate(evidenceCase, "GATE-RELEASE").blocking_result_ids, ["VR-004", "VR-005", "VR-006"]);
    assert.equal(evidenceCase.reviewDispositions.every((item) => item.decision === "open"), true);
    assert.equal(evidenceCase.uiStatus, "blocked");
  });

  test("serves the browser stage runner without browser-side SDK access", async () => {
    const response = await fetch(`${origin}/workbench.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/javascript\b/);
    const source = await response.text();

    assert.match(source, /JSON\.stringify\(\{ demoSessionId \}\)/);
    assert.match(source, /helix\.demoSessionId/);
    assert.match(source, /event\.type === "stage\.completed"/);
    assert.match(source, /helix\.stage\.gates\.runSessionId/);
    assert.match(source, /resumeGateAudit/);
    assert.match(source, /\.textContent =/);
    assert.match(source, /document\.createElement/);
    assert.doesNotMatch(source, /innerHTML|@openai\/codex-sdk|\.codex\/sessions|thread[_-]?id/i);
  });

  test("renders the focused audit and ten-stage context", async () => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.match(html, /Canonical synthetic bundle/);
    assert.match(html, /Synthetic data · not for submission/);
    assert.equal((html.match(/data-stage=/g) ?? []).length, 10);
    assert.match(html, /C-BW-HIGH/);
    assert.match(html, /286\.2 g/);
    assert.match(html, /mean-v1/);
    assert.equal((html.match(/data-provenance-edge=/g) ?? []).length, 10);
    assert.match(html, /VR-003/);
    assert.match(html, /The claim traces to all ten terminal body-weight records/);
    assert.match(html, /VR-004/);
    assert.match(html, /Dose-group grain does not meet the required dose-group-by-sex grain/);
    assert.match(html, /Section 5 gate<\/dt><dd>blocked by VR-004/);
    assert.match(html, /Release gate<\/dt><dd>blocked by VR-004, VR-005, VR-006/);
    assert.match(html, /Validated means source reconciliation passed/);
    assert.match(html, /It does not mean release-ready/);
    assert.equal((html.match(/class="pill open"/g) ?? []).length, 3);
    assert.match(html, /Unavailable in this slice/);
    assert.equal((html.match(/<button disabled>/g) ?? []).length, 4);
    assert.match(html, /data-run-stage="gates"/);
    assert.match(html, /data-stage-activity/);
    assert.match(html, /<script defer src="\/workbench\.js"><\/script>/);
    assert.doesNotMatch(html, /263\.8 g/);
    assert.doesNotMatch(html, /TOX-2025-0118-P|body_weights\.csv/);
  });
});

describe("stage-run application boundary", () => {
  const demoSessionId = "c9f5d77c-6ba6-4b83-9654-cb8037c60751";
  const privateThreadId = "thread-private-unsafe-sentinel";
  const unsafeSentinels = [
    privateThreadId,
    "UNSAFE_REASONING_SENTINEL",
    "UNSAFE_COMMAND_SENTINEL",
    "UNSAFE_OUTPUT_SENTINEL",
    "/private/unsafe/fixture-path",
    "UNSAFE_AGENT_ITEM_ID",
  ];
  let server;
  let origin;
  let factoryCalls;
  let threadStarts;
  let streamedInvocations;
  let sessions;

  before(async () => {
    factoryCalls = 0;
    threadStarts = 0;
    streamedInvocations = [];
    sessions = new Map();

    const createCodex = async () => {
      factoryCalls += 1;
      return {
        startReplayThread() {
          threadStarts += 1;
          return {
            async runStreamed(prompt, turnOptions) {
              streamedInvocations.push({ prompt, turnOptions });
              async function* events() {
                yield { type: "thread.started", thread_id: privateThreadId };
                yield { type: "turn.started" };
                yield {
                  type: "item.started",
                  item: {
                    id: "unsafe-reasoning",
                    type: "reasoning",
                    text: "UNSAFE_REASONING_SENTINEL /private/unsafe/fixture-path",
                  },
                };
                yield {
                  type: "item.completed",
                  item: {
                    id: "unsafe-command",
                    type: "command_execution",
                    command: "UNSAFE_COMMAND_SENTINEL",
                    aggregated_output: "UNSAFE_OUTPUT_SENTINEL",
                    exit_code: 0,
                    status: "completed",
                  },
                };
                yield {
                  type: "item.completed",
                  item: {
                    id: "UNSAFE_AGENT_ITEM_ID",
                    type: "agent_message",
                    text: JSON.stringify(canonicalAuditSelection),
                  },
                };
                yield {
                  type: "turn.completed",
                  usage: {
                    input_tokens: 123,
                    cached_input_tokens: 0,
                    cache_write_input_tokens: 0,
                    output_tokens: 45,
                    reasoning_output_tokens: 6,
                  },
                };
              }
              return { events: events() };
            },
          };
        },
      };
    };

    server = await createWorkbenchServer({ createCodex, sessions });
    origin = await listen(server);
  });

  after(async () => {
    if (server) {
      await close(server);
    }
  });

  test("runs the fixed gate stage as safe NDJSON and materializes the canonical case", async () => {
    const response = await fetch(`${origin}/api/stages/gates/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoSessionId }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/x-ndjson\b/);
    const serializedEvents = await response.text();
    const events = serializedEvents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.equal(
      [...new Set(events.map((event) => event.type))].every((type) =>
        ["stage.started", "activity", "stage.completed", "stage.failed"].includes(type)),
      true,
    );
    assert.deepEqual(events[0], {
      type: "stage.started",
      stageId: "gates",
      label: "Evaluate gates",
    });
    assert.deepEqual(
      events.filter((event) => event.type === "activity").map((event) => event.label),
      STAGE_ACTIVITY_LABELS,
    );
    assert.equal(events.some((event) => event.type === "stage.failed"), false);

    for (const sentinel of unsafeSentinels) {
      assert.equal(serializedEvents.includes(sentinel), false);
    }
    assert.doesNotMatch(serializedEvents, /input_tokens|command_execution|reasoning/);

    assert.equal(factoryCalls, 1);
    assert.equal(threadStarts, 1);
    assert.equal(streamedInvocations.length, 1);
    const [{ prompt, turnOptions }] = streamedInvocations;
    assert.match(prompt, /\$helix-reporting:compile-evidence-and-gates/);
    assert.match(prompt, /applicationMode is `audit-selection-v1`/);
    assert.match(prompt, /stageId is `gates`/);
    assert.match(prompt, /bundlePath is `synthetic-e2e\/helix-synthetic-bundle\.json`/);
    assert.doesNotMatch(prompt, new RegExp(demoSessionId));
    assert.strictEqual(turnOptions.outputSchema, AUDIT_SELECTION_SCHEMA);
    assert.deepEqual(Object.keys(turnOptions.outputSchema.properties).sort(), [
      "caseId",
      "gateDecisionIds",
      "provenanceEdgeIds",
      "reviewDispositionIds",
      "transformId",
      "validationResultIds",
    ]);
    assert.equal("uiStatus" in turnOptions.outputSchema.properties, false);
    assert.equal(sessions.get(demoSessionId).codexThreadId, privateThreadId);

    const completed = events.at(-1);
    assert.equal(completed.type, "stage.completed");
    assert.equal(completed.stageId, "gates");
    const evidenceCase = completed.result;
    assert.deepEqual(
      { value: evidenceCase.claim.value, unit: evidenceCase.claim.unit },
      { value: 286.2, unit: "g" },
    );
    assert.equal(evidenceCase.transform.id, "mean-v1");
    assert.deepEqual(
      evidenceCase.provenanceEdges.map((edge) => [edge.edge_id, edge.order]),
      canonicalAuditSelection.provenanceEdgeIds.map((edgeId, index) => [edgeId, index + 1]),
    );
    assert.equal(validation(evidenceCase, "VR-003").status, "pass");
    assert.equal(validation(evidenceCase, "VR-004").status, "fail");
    assert.deepEqual(gate(evidenceCase, "GATE-SECTION-S5").blocking_result_ids, ["VR-004"]);
    assert.deepEqual(
      gate(evidenceCase, "GATE-RELEASE").blocking_result_ids,
      ["VR-004", "VR-005", "VR-006"],
    );
    assert.deepEqual(
      evidenceCase.reviewDispositions.map((item) => [item.disposition_id, item.decision]),
      [["RD-1", "open"], ["RD-2", "open"], ["RD-3", "open"]],
    );
    assert.equal(evidenceCase.humanActions.length, 3);
    assert.equal(evidenceCase.humanActions.every((item) => item.action.length > 0), true);
    assert.equal(evidenceCase.uiStatus, "blocked");
  });

  test("rejects caller prompts and extra fields before invoking Codex", async () => {
    const factoryCallsBeforeRejections = factoryCalls;
    const callsBeforeRejections = streamedInvocations.length;
    const threadStartsBeforeRejections = threadStarts;
    const bodies = [
      { demoSessionId, prompt: "UNSAFE_CALLER_PROMPT" },
      { demoSessionId, stageId: "gates" },
    ];

    for (const body of bodies) {
      const response = await fetch(`${origin}/api/stages/gates/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.match(response.headers.get("content-type"), /^application\/x-ndjson\b/);
      assert.deepEqual(JSON.parse((await response.text()).trim()), {
        type: "stage.failed",
        kind: "invalid_request",
        message: "Invalid stage run request",
      });
    }

    const wrongStage = await fetch(`${origin}/api/stages/export/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoSessionId }),
    });
    assert.equal(wrongStage.status, 404);
    assert.equal(JSON.parse((await wrongStage.text()).trim()).type, "stage.failed");

    const queryParameters = await fetch(`${origin}/api/stages/gates/run?prompt=unsafe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoSessionId }),
    });
    assert.equal(queryParameters.status, 400);
    assert.equal(JSON.parse((await queryParameters.text()).trim()).type, "stage.failed");

    assert.equal(factoryCalls, factoryCallsBeforeRejections);
    assert.equal(streamedInvocations.length, callsBeforeRejections);
    assert.equal(threadStarts, threadStartsBeforeRejections);
  });
});

describe("resumable stage runs", () => {
  const demoSessionId = "e1e1695c-3a31-419c-aa9d-fe741af159c2";

  test("keeps one server-owned turn alive across a browser disconnect", async () => {
    const finishTurn = deferred();
    const sessions = new Map();
    let factoryCalls = 0;
    let threadStarts = 0;
    let turnStarts = 0;
    let sdkIteratorFinished = false;
    const createCodex = async () => {
      factoryCalls += 1;
      return {
        startReplayThread() {
          threadStarts += 1;
          return {
            async runStreamed() {
              turnStarts += 1;
              async function* events() {
                try {
                  yield { type: "thread.started", thread_id: "private-resumable-thread" };
                  yield { type: "turn.started" };
                  await finishTurn.promise;
                  yield {
                    type: "item.completed",
                    item: {
                      type: "agent_message",
                      text: JSON.stringify(canonicalAuditSelection),
                    },
                  };
                  yield { type: "turn.completed", usage: {} };
                } finally {
                  sdkIteratorFinished = true;
                }
              }
              return { events: events() };
            },
          };
        },
      };
    };
    const server = await createWorkbenchServer({ createCodex, sessions });
    const origin = await listen(server);

    try {
      const firstResponse = await fetch(`${origin}/api/stages/gates/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoSessionId }),
      });
      const firstReader = firstResponse.body.getReader();
      const firstChunk = await firstReader.read();
      assert.match(new TextDecoder().decode(firstChunk.value), /"type":"stage\.started"/);
      await firstReader.cancel();
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(sdkIteratorFinished, false);
      assert.equal(sessions.get(demoSessionId).stageRun.status, "active");

      const reconnectResponse = await fetch(`${origin}/api/stages/gates/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoSessionId }),
      });
      assert.equal(factoryCalls, 1);
      assert.equal(threadStarts, 1);
      assert.equal(turnStarts, 1);

      finishTurn.resolve();
      const reconnectEvents = parseNdjson(await reconnectResponse.text());
      const completed = reconnectEvents.at(-1);
      assert.equal(completed.type, "stage.completed");
      assert.equal(completed.result.uiStatus, "blocked");
      assert.equal(sdkIteratorFinished, true);

      const session = sessions.get(demoSessionId);
      assert.equal(session.codexThreadId, "private-resumable-thread");
      assert.equal(session.stageRun.status, "completed");
      assert.deepEqual(session.stageRun.terminalEvent, completed);

      const replayResponse = await fetch(`${origin}/api/stages/gates/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoSessionId }),
      });
      assert.deepEqual(parseNdjson(await replayResponse.text()), [completed]);
      assert.equal(factoryCalls, 1);
      assert.equal(threadStarts, 1);
      assert.equal(turnStarts, 1);
    } finally {
      finishTurn.resolve();
      await close(server);
    }
  });

  test("replays a safe failure and retains recoverable session state", async () => {
    const sessions = new Map();
    let turnStarts = 0;
    const createCodex = async () => ({
      startReplayThread() {
        return {
          async runStreamed() {
            turnStarts += 1;
            async function* events() {
              yield { type: "thread.started", thread_id: "private-failed-thread" };
              yield { type: "turn.started" };
              yield {
                type: "error",
                message: "UNSAFE_RAW_SDK_FAILURE",
                environment: "UNSAFE_RAW_ENVIRONMENT",
              };
            }
            return { events: events() };
          },
        };
      },
    });
    const server = await createWorkbenchServer({ createCodex, sessions });
    const origin = await listen(server);

    try {
      const request = () => fetch(`${origin}/api/stages/gates/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoSessionId }),
      });
      const firstEvents = parseNdjson(await (await request()).text());
      const failed = firstEvents.at(-1);
      assert.deepEqual(failed, {
        type: "stage.failed",
        kind: "run_failed",
        message: "The gate audit could not be completed. The release remains blocked.",
      });
      assert.doesNotMatch(JSON.stringify(firstEvents), /UNSAFE_RAW/);

      const session = sessions.get(demoSessionId);
      assert.equal(session.codexThreadId, "private-failed-thread");
      assert.equal(session.stageRun.status, "failed");
      assert.deepEqual(session.stageRun.terminalEvent, failed);

      assert.deepEqual(parseNdjson(await (await request()).text()), [failed]);
      assert.equal(turnStarts, 1);
    } finally {
      await close(server);
    }
  });
});

describe("stage-run failure paths", () => {
  const demoSessionId = "6adf6469-25cf-4ebb-bc6f-942af7786603";

  async function withServer(options, callback) {
    const server = await createWorkbenchServer(options);
    const origin = await listen(server);
    try {
      await callback(origin);
    } finally {
      await close(server);
    }
  }

  test("fails closed when the HELIX plugin or skill is missing", async () => {
    const cases = [
      [
        Object.assign(new Error("helix-reporting plugin is not installed"), { code: "HELIX_PLUGIN_MISSING" }),
        "helix-reporting plugin",
      ],
      [
        Object.assign(new Error("compile-evidence-and-gates skill is not installed"), { code: "HELIX_SKILL_MISSING" }),
        "compile-evidence-and-gates skill",
      ],
    ];

    for (const [error, capability] of cases) {
      await withServer({ createCodex: async () => { throw error; } }, async (origin) => {
        const { response, serializedEvents } = await postStageRun(origin, demoSessionId);
        const events = parseNdjson(serializedEvents);

        assert.equal(response.status, 200);
        assert.deepEqual(events, [{
          type: "stage.failed",
          kind: "missing_capability",
          message: `Missing HELIX capability: ${capability}. The release remains blocked.`,
        }]);
        assert.equal(serializedEvents.includes("stage.completed"), false);
      });
    }
  });

  test("ends a turn failure with a safe failure and keeps the session for retry", async () => {
    const sessions = new Map();
    const privateThreadId = "thread-private-failure-sentinel";
    const createCodex = createMockCodex(async function* events() {
      yield { type: "thread.started", thread_id: privateThreadId };
      yield { type: "turn.started" };
      yield {
        type: "turn.failed",
        error: { message: "UNSAFE_FATAL_SDK_DETAIL /private/sdk/path" },
      };
    });

    await withServer({ createCodex, sessions }, async (origin) => {
      const { serializedEvents } = await postStageRun(origin, demoSessionId);
      const events = parseNdjson(serializedEvents);

      assert.deepEqual(events.at(-1), {
        type: "stage.failed",
        kind: "run_failed",
        message: "The gate audit could not be completed. The release remains blocked.",
      });
      assert.equal(serializedEvents.includes("UNSAFE_FATAL_SDK_DETAIL"), false);
      assert.equal(serializedEvents.includes("/private/sdk/path"), false);
      assert.equal(events.some((event) => event.type === "stage.completed"), false);
      assert.equal(sessions.get(demoSessionId).codexThreadId, privateThreadId);
    });
  });

  test("rejects malformed, incomplete, and unknown-reference structured output", async () => {
    const cases = [
      ["{}", "invalid_result", "Codex returned invalid audit data. The release remains blocked.", []],
      [
        JSON.stringify({
          ...canonicalAuditSelection,
          provenanceEdgeIds: [
            ...canonicalAuditSelection.provenanceEdgeIds.slice(0, -1),
            "PE-BW-UNKNOWN-SENTINEL",
          ],
        }),
        "missing_references",
        "The gate audit referenced 1 missing fixture item. The release remains blocked.",
        ["PE-BW-UNKNOWN-SENTINEL"],
      ],
    ];

    for (const [agentText, kind, message, hiddenSentinels] of cases) {
      const createCodex = createMockCodex(async function* events() {
        yield { type: "thread.started", thread_id: "thread-structured-failure" };
        yield { type: "turn.started" };
        yield {
          type: "item.completed",
          item: { id: "agent", type: "agent_message", text: agentText },
        };
        yield { type: "turn.completed", usage: null };
      });

      await withServer({ createCodex }, async (origin) => {
        const { serializedEvents } = await postStageRun(origin, demoSessionId);
        const events = parseNdjson(serializedEvents);

        assert.deepEqual(events.at(-1), { type: "stage.failed", kind, message });
        assert.equal(events.some((event) => event.type === "stage.completed"), false);
        for (const sentinel of hiddenSentinels) {
          assert.equal(serializedEvents.includes(sentinel), false);
        }
      });
    }
  });

  test("runs fixture preflight before Codex and returns stage.failed", async () => {
    const bundle = clone(await loadCanonicalBundle());
    bundle.workflow_state = "ready";
    let codexStarted = false;

    await withServer({
      bundle,
      createCodex: async () => {
        codexStarted = true;
        return {};
      },
    }, async (origin) => {
      const { serializedEvents } = await postStageRun(origin, demoSessionId);
      const events = parseNdjson(serializedEvents);

      assert.deepEqual(events, [{
        type: "stage.failed",
        kind: "fixture_preflight_failed",
        message: "Fixture invariant failed: workflow state is gated. The release remains blocked.",
      }]);
      assert.equal(codexStarted, false);
    });
  });

  test("records unsafe SDK payloads while exposing only safe failure events", async () => {
    const unsafeCases = [
      {
        item: {
          id: "patch",
          type: "file_change",
          changes: [{ path: "/private/unsafe-write.js", kind: "add" }],
          status: "completed",
        },
        sentinel: "/private/unsafe-write.js",
      },
      {
        item: {
          id: "mcp",
          type: "mcp_tool_call",
          server: "unsafe-server",
          tool: "unsafe-tool",
          arguments: { secret: "UNSAFE_MCP_PAYLOAD" },
          status: "completed",
        },
        sentinel: "UNSAFE_MCP_PAYLOAD",
      },
      {
        item: { id: "search", type: "web_search", query: "UNSAFE_WEB_SEARCH_PAYLOAD" },
        sentinel: "UNSAFE_WEB_SEARCH_PAYLOAD",
      },
    ];

    for (const { item, sentinel } of unsafeCases) {
      const records = [];
      const createCodex = createMockCodex(async function* events() {
        yield { type: "thread.started", thread_id: "thread-unsafe-payload" };
        yield { type: "turn.started" };
        yield { type: "item.completed", item };
        yield {
          type: "item.completed",
          item: {
            id: "agent",
            type: "agent_message",
            text: JSON.stringify(canonicalAuditSelection),
          },
        };
        yield { type: "turn.completed", usage: null };
      });

      await withServer({
        createCodex,
        recordUnsafeSdkPayload(record) {
          records.push(record);
        },
      }, async (origin) => {
        const { serializedEvents } = await postStageRun(origin, demoSessionId);
        const events = parseNdjson(serializedEvents);

        assert.deepEqual(events.at(-1), {
          type: "stage.failed",
          kind: "unsafe_sdk_payload",
          message: "The Codex stream included an unsafe event. The release remains blocked.",
        });
        assert.equal(serializedEvents.includes(sentinel), false);
        assert.equal(events.some((event) => event.type === "stage.completed"), false);
        assert.deepEqual(records, [{
          stageId: "gates",
          eventType: "item.completed",
          itemType: item.type,
          reason: "unsafe_payload",
        }]);
      });
    }
  });

  test("refuses regulatory actions without changing approval, signature, checksum, or export state", async () => {
    const bundle = clone(await loadCanonicalBundle());
    const before = regulatorySnapshot(bundle);
    const actions = ["approve", "sign", "checksum", "export"];

    await withServer({ bundle }, async (origin) => {
      for (const action of actions) {
        const response = await fetch(`${origin}/api/release/${action}`, { method: "POST" });
        const events = parseNdjson(await response.text());

        assert.equal(response.status, 403);
        assert.equal(events[0].type, "stage.failed");
        assert.equal(events[0].kind, "out_of_scope");
        assert.match(events[0].message, /unavailable in this slice/);
      }

      const evidenceResponse = await fetch(`${origin}/api/evidence-case`);
      const evidenceCase = await evidenceResponse.json();
      assert.equal(evidenceCase.uiStatus, "blocked");
    });

    assert.equal(regulatorySnapshot(bundle), before);
  });
});
