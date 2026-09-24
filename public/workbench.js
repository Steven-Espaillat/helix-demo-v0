(() => {
  const stageId = "gates";
  const storageKey = "helix.demoSessionId";
  const runSessionStorageKey = "helix.stage.gates.runSessionId";
  const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const eventTypes = new Set([
    "stage.started",
    "activity",
    "stage.completed",
    "stage.failed",
  ]);
  let inMemorySessionId;

  function createUuid() {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function getOrCreateDemoSessionId() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && uuidPattern.test(stored)) {
        return stored;
      }
      const created = createUuid();
      localStorage.setItem(storageKey, created);
      return created;
    } catch {
      inMemorySessionId ??= createUuid();
      return inMemorySessionId;
    }
  }

  function rememberStageRun(demoSessionId) {
    try {
      localStorage.setItem(runSessionStorageKey, demoSessionId);
    } catch {
    }
  }

  function hasStageRun(demoSessionId) {
    try {
      return localStorage.getItem(runSessionStorageKey) === demoSessionId;
    } catch {
      return false;
    }
  }

  function parseLine(line) {
    const event = JSON.parse(line);
    if (!event || typeof event !== "object" || !eventTypes.has(event.type)) {
      throw new Error("Unexpected stage event");
    }
    return event;
  }

  async function* readNdjson(stream) {
    if (!stream) {
      throw new Error("Missing stage event stream");
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim()) {
            yield parseLine(line);
          }
        }
        if (done) {
          break;
        }
      }
      if (buffer.trim()) {
        yield parseLine(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  function setText(selector, value) {
    for (const node of document.querySelectorAll(selector)) {
      node.textContent = String(value);
    }
  }

  function createTextElement(tagName, text, className) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = String(text);
    return element;
  }

  function renderValidations(evidenceCase) {
    const container = document.querySelector("[data-validation-results]");
    const fragment = document.createDocumentFragment();

    for (const result of evidenceCase.validationResults) {
      const passed = result.status === "pass";
      const article = document.createElement("article");
      article.className = `rule ${passed ? "pass" : "fail"}`;
      const heading = document.createElement("div");
      heading.append(
        createTextElement("strong", result.result_id),
        createTextElement(
          "span",
          passed ? "Passed" : "Failed blocker",
          `pill ${passed ? "pass" : "fail"}`,
        ),
      );
      article.append(heading, createTextElement("p", result.message));
      if (result.result_id === "VR-003") {
        article.append(createTextElement("p", "The claim traces to all ten terminal body-weight records."));
      }
      if (result.result_id === "VR-004") {
        article.append(createTextElement("p", "Dose-group grain does not meet the required dose-group-by-sex grain."));
      }
      fragment.append(article);
    }

    container.replaceChildren(fragment);
  }

  function renderProvenance(evidenceCase) {
    const fragment = document.createDocumentFragment();
    for (const edge of evidenceCase.provenanceEdges) {
      const item = document.createElement("li");
      item.className = "edge";
      item.dataset.provenanceEdge = edge.edge_id;
      item.append(createTextElement("span", edge.order, "edge-order"));

      const identity = document.createElement("div");
      identity.append(
        createTextElement("strong", edge.edge_id),
        document.createElement("br"),
        createTextElement("code", edge.source_pointer),
      );
      const source = document.createElement("div");
      source.append(
        createTextElement("span", edge.source_record_id),
        document.createElement("br"),
        createTextElement("small", `Authority tier ${edge.authority_tier}`),
      );
      item.append(identity, source);
      fragment.append(item);
    }

    document.querySelector("[data-provenance-list]").replaceChildren(fragment);
    setText("[data-provenance-heading]", `${evidenceCase.provenanceEdges.length} terminal records`);
    setText(
      "[data-provenance-count]",
      `${evidenceCase.provenanceEdges.length} of ${evidenceCase.provenanceEdges.length}`,
    );
  }

  function renderGates(evidenceCase) {
    const rows = document.querySelectorAll("[data-gate-id]");
    for (const gate of evidenceCase.gateDecisions) {
      const row = [...rows].find((candidate) => candidate.dataset.gateId === gate.gate_id);
      if (row) {
        row.querySelector("dd").textContent = `${gate.status} by ${gate.blocking_result_ids.join(", ")}`;
      }
    }
  }

  function renderDispositions(evidenceCase) {
    const fragment = document.createDocumentFragment();
    for (const disposition of evidenceCase.reviewDispositions) {
      const item = document.createElement("li");
      item.append(
        createTextElement("strong", disposition.result_id),
        createTextElement("span", disposition.decision, "pill open"),
      );
      const humanAction = evidenceCase.humanActions.find(
        (candidate) => candidate.resultId === disposition.result_id,
      );
      if (humanAction) {
        item.append(createTextElement("p", humanAction.action));
      }
      fragment.append(item);
    }
    document.querySelector("[data-review-dispositions]").replaceChildren(fragment);
  }

  function renderEvidenceCase(evidenceCase) {
    setText("[data-case-id]", evidenceCase.caseId);
    setText("[data-claim-value]", `${evidenceCase.claim.value} ${evidenceCase.claim.unit}`);
    setText("[data-transform-id]", evidenceCase.transform.id);
    setText("[data-claim-status]", evidenceCase.claim.status);
    setText("[data-transform-summary]", evidenceCase.transform.summary);
    setText("[data-claim-grain]", evidenceCase.claim.grain);
    setText("[data-claim-section]", evidenceCase.claim.section_id);
    setText("[data-claim-field]", evidenceCase.claim.field_id);

    const displayedStatus = evidenceCase.uiStatus === "blocked"
      ? "Blocked"
      : evidenceCase.uiStatus === "needs_human"
        ? "Needs human review"
        : "Validated";
    setText("[data-gate-status]", displayedStatus);
    setText("[data-release-status]", `Release ${evidenceCase.uiStatus}`);
    renderGates(evidenceCase);
    renderValidations(evidenceCase);
    renderProvenance(evidenceCase);
    renderDispositions(evidenceCase);
  }

  function showActivity(message) {
    document.querySelector("[data-stage-activity]").textContent = message;
  }

  function applyUiEvent(event) {
    if (event.type === "stage.started") {
      if (event.stageId !== stageId || event.label !== "Evaluate gates") {
        throw new Error("Unexpected stage start");
      }
      showActivity("Gate audit started.");
      return false;
    }
    if (event.type === "activity") {
      if (typeof event.label !== "string") {
        throw new Error("Unexpected activity");
      }
      showActivity(event.label);
      return false;
    }
    if (event.type === "stage.completed") {
      if (event.stageId !== stageId || !event.result) {
        throw new Error("Unexpected stage completion");
      }
      renderEvidenceCase(event.result);
      showActivity("Gate audit completed. Release remains blocked.");
      return true;
    }
    if (event.type === "stage.failed") {
      showActivity(event.message);
      return true;
    }
  }

  async function runGateAudit(button, demoSessionId, reconnecting = false) {
    button.disabled = true;
    button.textContent = reconnecting ? "Restoring gate audit…" : "Running gate audit…";
    showActivity(
      reconnecting
        ? "Reconnecting to the server-owned gate audit."
        : "Starting the server-validated gate audit.",
    );
    let terminalEventReceived = false;

    try {
      const response = await fetch(`/api/stages/${stageId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoSessionId }),
      });
      if (!response.ok) {
        throw new Error("Stage request failed");
      }
      for await (const event of readNdjson(response.body)) {
        terminalEventReceived = applyUiEvent(event) || terminalEventReceived;
      }
      if (!terminalEventReceived) {
        throw new Error("Stage stream ended early");
      }
    } catch {
      showActivity("The gate audit could not be completed. The release remains blocked.");
    } finally {
      button.disabled = false;
      button.textContent = "Run gate audit";
    }
  }

  function resumeGateAudit(button) {
    const demoSessionId = getOrCreateDemoSessionId();
    if (hasStageRun(demoSessionId)) {
      runGateAudit(button, demoSessionId, true);
    }
  }

  const runButton = document.querySelector('[data-run-stage="gates"]');
  runButton?.addEventListener("click", () => {
    const demoSessionId = getOrCreateDemoSessionId();
    rememberStageRun(demoSessionId);
    runGateAudit(runButton, demoSessionId);
  });
  if (runButton) {
    resumeGateAudit(runButton);
  }
})();
