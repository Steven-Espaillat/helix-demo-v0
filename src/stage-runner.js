import {
  AUDIT_SELECTION_SCHEMA,
  CANONICAL_BUNDLE_RELATIVE_PATH,
  MissingAuditReferencesError,
  assertAuditSelectionMatchesFixture,
  assertFixtureInvariants,
  deriveEvidenceCase,
  parseAuditSelection,
} from "./evidence-case.js";

export const STAGE_ACTIVITY_LABELS = Object.freeze([
  "Running the registered Codex stage",
  "Received the structured stage output",
  "Validating the structured audit",
]);

function createGatesDefinition() {
  const definition = {
    id: "gates",
    label: "Evaluate gates",
    pluginName: "helix-reporting",
    skillName: "compile-evidence-and-gates",
    bundlePath: CANONICAL_BUNDLE_RELATIVE_PATH,
    outputSchema: AUDIT_SELECTION_SCHEMA,
  };
  const prompt = [
    `Use $${definition.pluginName}:${definition.skillName}. applicationMode is \`audit-selection-v1\`.`,
    `stageId is \`${definition.id}\`.`,
    `bundlePath is \`${definition.bundlePath}\`.`,
    "Read only that bundle and return only the AuditSelection JSON required by the supplied output schema.",
    "Select the canonical C-BW-HIGH case, its transform, ordered provenance edges, focused validation results, gate decisions, and open review dispositions.",
    "Do not return claim values, statuses, uiStatus, release readiness, summaries, or human-action prose.",
  ].join("\n");
  return Object.freeze({ ...definition, prompt });
}

export const STAGE_DEFINITIONS = Object.freeze({
  gates: createGatesDefinition(),
});

const stageRegistry = new Map(Object.entries(STAGE_DEFINITIONS));
const knownSdkEventTypes = new Set([
  "thread.started",
  "turn.started",
  "item.started",
  "item.updated",
  "item.completed",
  "turn.completed",
  "turn.failed",
  "error",
]);
const runningSdkEventTypes = new Set([
  "turn.started",
  "item.started",
  "item.updated",
  "item.completed",
]);
const droppedItemTypes = new Set([
  "reasoning",
  "command_execution",
  "todo_list",
]);
const unsafeItemTypes = new Set([
  "file_change",
  "mcp_tool_call",
  "web_search",
]);
const runFailure = Object.freeze({
  type: "stage.failed",
  kind: "run_failed",
  message: "The gate audit could not be completed. The release remains blocked.",
});

class FixturePreflightError extends Error {
  constructor(cause) {
    super(cause instanceof Error ? cause.message : "Fixture invariant failed");
    this.name = "FixturePreflightError";
  }
}

class InvalidStructuredOutputError extends Error {
  constructor() {
    super("Invalid structured output");
    this.name = "InvalidStructuredOutputError";
  }
}

class UnsafeSdkPayloadError extends Error {
  constructor() {
    super("Unsafe SDK payload");
    this.name = "UnsafeSdkPayloadError";
  }
}

function stageFailure(kind, message) {
  return Object.freeze({ type: "stage.failed", kind, message });
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function safeCapabilityLabel(error, definition) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const capability = typeof error?.missingCapability === "string"
    ? error.missingCapability.toLowerCase()
    : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const text = `${code} ${capability} ${message}`;

  if (text.includes(definition.skillName) || text.includes("skill")) {
    return `${definition.skillName} skill`;
  }
  if (text.includes(definition.pluginName) || text.includes("plugin")) {
    return `${definition.pluginName} plugin`;
  }
  return undefined;
}

function failureForError(error, definition) {
  if (error instanceof FixturePreflightError) {
    return stageFailure(
      "fixture_preflight_failed",
      `${error.message}. The release remains blocked.`,
    );
  }
  if (error instanceof MissingAuditReferencesError) {
    const item = pluralize(error.missingCount, "fixture item");
    return stageFailure(
      "missing_references",
      `The gate audit referenced ${error.missingCount} missing ${item}. The release remains blocked.`,
    );
  }
  if (error instanceof InvalidStructuredOutputError) {
    return stageFailure(
      "invalid_result",
      "Codex returned invalid audit data. The release remains blocked.",
    );
  }
  if (error instanceof UnsafeSdkPayloadError) {
    return stageFailure(
      "unsafe_sdk_payload",
      "The Codex stream included an unsafe event. The release remains blocked.",
    );
  }

  const capability = safeCapabilityLabel(error, definition);
  if (capability) {
    return stageFailure(
      "missing_capability",
      `Missing HELIX capability: ${capability}. The release remains blocked.`,
    );
  }

  return runFailure;
}

function sdkPayloadRecord(definition, sdkEvent, reason) {
  const itemType = typeof sdkEvent?.item?.type === "string" ? sdkEvent.item.type : "none";
  const eventType = typeof sdkEvent?.type === "string" ? sdkEvent.type : "unknown";
  return Object.freeze({ stageId: definition.id, eventType, itemType, reason });
}

function recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, reason) {
  try {
    recordUnsafeSdkPayload(sdkPayloadRecord(definition, sdkEvent, reason));
  } catch {
  }
}

function checkSdkEventSafety(sdkEvent, definition, recordUnsafeSdkPayload) {
  if (!knownSdkEventTypes.has(sdkEvent?.type)) {
    recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, "unknown_event");
    throw new UnsafeSdkPayloadError();
  }

  if (sdkEvent?.type === "turn.failed" || sdkEvent?.type === "error") {
    recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, "dropped_failure_payload");
    return;
  }

  if (!sdkEvent?.item || typeof sdkEvent.item !== "object") {
    return;
  }

  const itemType = sdkEvent.item.type;
  if (itemType === "agent_message") {
    return;
  }
  if (droppedItemTypes.has(itemType)) {
    recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, "dropped_hidden_payload");
    return;
  }
  if (unsafeItemTypes.has(itemType)) {
    recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, "unsafe_payload");
    throw new UnsafeSdkPayloadError();
  }

  recordDroppedSdkPayload(recordUnsafeSdkPayload, definition, sdkEvent, "unknown_item");
  throw new UnsafeSdkPayloadError();
}

function validateStructuredResult(bundle, agentMessage) {
  try {
    const selection = parseAuditSelection(agentMessage);
    assertAuditSelectionMatchesFixture(bundle, selection);
  } catch (error) {
    if (error instanceof MissingAuditReferencesError) {
      throw error;
    }
    throw new InvalidStructuredOutputError();
  }
}

async function* replayEvent(event) {
  yield event;
}

function createStageRun(stageId, execute) {
  const safeEvents = [];
  const waiters = new Set();
  const stageRun = {
    stageId,
    status: "active",
    terminalEvent: null,
  };

  function publish(event) {
    if (stageRun.status !== "active") {
      return;
    }

    safeEvents.push(event);
    if (event.type === "stage.completed" || event.type === "stage.failed") {
      stageRun.status = event.type === "stage.completed" ? "completed" : "failed";
      stageRun.terminalEvent = event;
    }

    for (const wake of waiters) {
      wake();
    }
    waiters.clear();
  }

  async function* readActiveRun() {
    let cursor = 0;
    while (true) {
      while (cursor < safeEvents.length) {
        yield safeEvents[cursor];
        cursor += 1;
      }
      if (stageRun.status !== "active") {
        return;
      }
      await new Promise((resolve) => waiters.add(resolve));
    }
  }

  Object.defineProperties(stageRun, {
    attach: {
      enumerable: false,
      value() {
        return stageRun.terminalEvent
          ? replayEvent(stageRun.terminalEvent)
          : readActiveRun();
      },
    },
    completion: {
      enumerable: false,
      value: Promise.resolve()
        .then(() => execute(publish))
        .catch(() => publish({ ...runFailure })),
    },
  });

  return stageRun;
}

export function createStageRunner({
  bundle,
  createCodex,
  sessions = new Map(),
  recordUnsafeSdkPayload = () => {},
}) {
  if (typeof createCodex !== "function") {
    throw new TypeError("createCodex must be a function");
  }
  if (!(sessions instanceof Map)) {
    throw new TypeError("sessions must be a Map");
  }
  if (typeof recordUnsafeSdkPayload !== "function") {
    throw new TypeError("recordUnsafeSdkPayload must be a function");
  }

  let codexPromise;
  function getCodex() {
    codexPromise ??= Promise.resolve().then(() => createCodex());
    return codexPromise;
  }

  async function executeStageRun(definition, session, publish) {
    let emittedStageStarted = false;
    let agentMessage;
    const emittedActivity = new Set();

    try {
      try {
        assertFixtureInvariants(bundle);
      } catch (error) {
        throw new FixturePreflightError(error);
      }

      const codex = await getCodex();
      const thread = codex.startReplayThread();
      const streamedTurn = await thread.runStreamed(definition.prompt, {
        outputSchema: definition.outputSchema,
      });

      for await (const sdkEvent of streamedTurn.events) {
        checkSdkEventSafety(sdkEvent, definition, recordUnsafeSdkPayload);

        if (sdkEvent?.type === "thread.started") {
          if (typeof sdkEvent.thread_id !== "string" || sdkEvent.thread_id.length === 0) {
            throw new Error("Codex did not provide a thread identifier");
          }
          session.codexThreadId = sdkEvent.thread_id;
          if (!emittedStageStarted) {
            emittedStageStarted = true;
            publish({
              type: "stage.started",
              stageId: definition.id,
              label: definition.label,
            });
          }
          continue;
        }

        if (sdkEvent?.type === "turn.failed" || sdkEvent?.type === "error") {
          publish({ ...runFailure });
          return;
        }

        if (sdkEvent?.type === "turn.started" && !emittedStageStarted) {
          emittedStageStarted = true;
          publish({
            type: "stage.started",
            stageId: definition.id,
            label: definition.label,
          });
        }

        if (
          emittedStageStarted &&
          runningSdkEventTypes.has(sdkEvent?.type) &&
          !emittedActivity.has(STAGE_ACTIVITY_LABELS[0])
        ) {
          emittedActivity.add(STAGE_ACTIVITY_LABELS[0]);
          publish({ type: "activity", label: STAGE_ACTIVITY_LABELS[0] });
        }

        if (
          sdkEvent?.type === "item.completed" &&
          sdkEvent.item?.type === "agent_message" &&
          typeof sdkEvent.item.text === "string"
        ) {
          agentMessage = sdkEvent.item.text;
          if (!emittedActivity.has(STAGE_ACTIVITY_LABELS[1])) {
            emittedActivity.add(STAGE_ACTIVITY_LABELS[1]);
            publish({ type: "activity", label: STAGE_ACTIVITY_LABELS[1] });
          }
        }

        if (sdkEvent?.type === "turn.completed") {
          if (!emittedStageStarted || !session.codexThreadId) {
            throw new Error("Codex turn completed without a stored session");
          }
          const validationActivity = STAGE_ACTIVITY_LABELS[2];
          if (!emittedActivity.has(validationActivity)) {
            emittedActivity.add(validationActivity);
            publish({ type: "activity", label: validationActivity });
          }
          validateStructuredResult(bundle, agentMessage);
          publish({
            type: "stage.completed",
            stageId: definition.id,
            result: deriveEvidenceCase(bundle),
          });
          return;
        }
      }
    } catch (error) {
      publish({ ...failureForError(error, definition) });
      return;
    }

    publish({ ...runFailure });
  }

  return Object.freeze({
    hasStage(stageId) {
      return stageRegistry.has(stageId);
    },

    run({ stageId, demoSessionId }) {
      const definition = stageRegistry.get(stageId);
      if (!definition) {
        return replayEvent({ ...runFailure });
      }

      let session = sessions.get(demoSessionId);
      if (!session) {
        session = { codexThreadId: null, stageRun: null };
        sessions.set(demoSessionId, session);
      }

      if (!session.stageRun) {
        session.stageRun = createStageRun(
          definition.id,
          (publish) => executeStageRun(definition, session, publish),
        );
      }

      if (session.stageRun.stageId !== definition.id) {
        return replayEvent({ ...runFailure });
      }
      return session.stageRun.attach();
    },
  });
}
