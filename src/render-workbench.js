const stages = [
  { id: "authorize", label: "Authorize sources" },
  { id: "parse", label: "Parse inputs" },
  { id: "resolve", label: "Resolve study" },
  { id: "extract", label: "Extract claims" },
  { id: "validate", label: "Validate evidence" },
  { id: "draft", label: "Draft sections" },
  { id: "provenance", label: "Compile provenance" },
  { id: "gates", label: "Evaluate gates" },
  { id: "review", label: "Human review" },
  { id: "export", label: "Explicit export" },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findById(items, property, id) {
  return items.find((item) => item[property] === id);
}

export function renderWorkbench(bundle, evidenceCase) {
  const vr003 = findById(evidenceCase.validationResults, "result_id", "VR-003");
  const vr004 = findById(evidenceCase.validationResults, "result_id", "VR-004");
  const sectionGate = findById(evidenceCase.gateDecisions, "gate_id", "GATE-SECTION-S5");
  const releaseGate = findById(evidenceCase.gateDecisions, "gate_id", "GATE-RELEASE");
  const rail = stages
    .map(
      (stage, index) => `
        <li class="stage ${stage.id === "gates" ? "selected" : ""}" data-stage="${stage.id}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(stage.label)}</strong>
        </li>`,
    )
    .join("");
  const edges = evidenceCase.provenanceEdges
    .map(
      (edge) => `
        <li class="edge" data-provenance-edge="${escapeHtml(edge.edge_id)}">
          <span class="edge-order">${edge.order}</span>
          <div><strong>${escapeHtml(edge.edge_id)}</strong><br><code>${escapeHtml(edge.source_pointer)}</code></div>
          <div><span>${escapeHtml(edge.source_record_id)}</span><br><small>Authority tier ${edge.authority_tier}</small></div>
        </li>`,
    )
    .join("");
  const dispositions = evidenceCase.reviewDispositions
    .map(
      (disposition) => `
        <li>
          <strong>${escapeHtml(disposition.result_id)}</strong>
          <span class="pill open">${escapeHtml(disposition.decision)}</span>
          <p>${escapeHtml(findById(evidenceCase.humanActions, "resultId", disposition.result_id).action)}</p>
        </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HELIX blocked-gate audit</title>
  <link rel="stylesheet" href="/styles.css">
  <script defer src="/workbench.js"></script>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="brand">HELIX</p>
      <p>${escapeHtml(bundle.study.study_id)} · Blocked-gate audit workbench</p>
    </div>
    <div class="badges">
      <span class="badge synthetic">Synthetic data · not for submission</span>
      <span class="badge blocked" data-release-status>Release ${escapeHtml(evidenceCase.uiStatus)}</span>
    </div>
  </header>

  <main>
    <section class="notice" aria-label="Data status">
      <strong>Canonical synthetic bundle.</strong> Every study value on this page comes from the preflighted synthetic fixture. No CSV study data is loaded.
    </section>

    <section class="run-panel" aria-label="Gate audit run">
      <div>
        <p class="eyebrow">Server-validated stage run</p>
        <strong>Compile evidence and evaluate the blocked gates</strong>
        <p class="activity" data-stage-activity aria-live="polite">Ready to run the canonical gate audit.</p>
      </div>
      <button class="run-button" type="button" data-run-stage="gates">Run gate audit</button>
    </section>

    <nav aria-label="Ten-stage HELIX journey">
      <ol class="rail">${rail}</ol>
    </nav>

    <section class="hero">
      <div>
        <p class="eyebrow">Selected evidence case</p>
        <h1 data-case-id>${escapeHtml(evidenceCase.caseId)}</h1>
        <p>Terminal body weight for the synthetic high-dose group.</p>
      </div>
      <div class="claim-value">
        <span data-claim-value>${escapeHtml(evidenceCase.claim.value)} ${escapeHtml(evidenceCase.claim.unit)}</span>
        <small><span data-transform-id>${escapeHtml(evidenceCase.transform.id)}</span> · <span data-claim-status>${escapeHtml(evidenceCase.claim.status)}</span></small>
      </div>
      <div class="status-explanation">
        <strong>Validated means source reconciliation passed.</strong>
        <span>It does not mean release-ready. Open blocker rules keep this case and the release blocked.</span>
      </div>
    </section>

    <section class="grid two-column">
      <article class="card">
        <p class="eyebrow">Deterministic transform</p>
        <h2 data-transform-id>${escapeHtml(evidenceCase.transform.id)}</h2>
        <p data-transform-summary>${escapeHtml(evidenceCase.transform.summary)}</p>
        <dl>
          <div><dt>Claim grain</dt><dd data-claim-grain>${escapeHtml(evidenceCase.claim.grain)}</dd></div>
          <div><dt>Section</dt><dd data-claim-section>${escapeHtml(evidenceCase.claim.section_id)}</dd></div>
          <div><dt>Field</dt><dd data-claim-field>${escapeHtml(evidenceCase.claim.field_id)}</dd></div>
        </dl>
      </article>

      <article class="card gate-card">
        <p class="eyebrow">Gate decisions</p>
        <h2 data-gate-status>${escapeHtml(evidenceCase.uiStatus === "blocked" ? "Blocked" : evidenceCase.uiStatus)}</h2>
        <dl>
          <div data-gate-id="GATE-SECTION-S5"><dt>Section 5 gate</dt><dd>${escapeHtml(sectionGate.status)} by ${escapeHtml(sectionGate.blocking_result_ids.join(", "))}</dd></div>
          <div data-gate-id="GATE-RELEASE"><dt>Release gate</dt><dd>${escapeHtml(releaseGate.status)} by ${escapeHtml(releaseGate.blocking_result_ids.join(", "))}</dd></div>
        </dl>
      </article>
    </section>

    <section class="card validation-card">
      <div class="section-heading">
        <div><p class="eyebrow">Validation</p><h2>Traceability passes. Grain blocks.</h2></div>
        <span class="badge synthetic">Synthetic evidence</span>
      </div>
      <div class="validation-grid" data-validation-results>
        <article class="rule pass">
          <div><strong>${escapeHtml(vr003.result_id)}</strong><span class="pill pass">Passed</span></div>
          <p>${escapeHtml(vr003.message)}</p>
          <p>The claim traces to all ten terminal body-weight records.</p>
        </article>
        <article class="rule fail">
          <div><strong>${escapeHtml(vr004.result_id)}</strong><span class="pill fail">Failed blocker</span></div>
          <p>${escapeHtml(vr004.message)}</p>
          <p>Dose-group grain does not meet the required dose-group-by-sex grain.</p>
        </article>
      </div>
    </section>

    <section class="card provenance-card">
      <div class="section-heading">
        <div><p class="eyebrow">Ordered provenance</p><h2 data-provenance-heading>${evidenceCase.provenanceEdges.length} terminal records</h2></div>
        <span class="counter" data-provenance-count>${evidenceCase.provenanceEdges.length} of ${evidenceCase.provenanceEdges.length}</span>
      </div>
      <ol class="edge-list" data-provenance-list>${edges}</ol>
    </section>

    <section class="grid two-column">
      <article class="card">
        <p class="eyebrow">Open review dispositions</p>
        <h2>Human decisions remain</h2>
        <ul class="dispositions" data-review-dispositions>${dispositions}</ul>
      </article>

      <article class="card controls-card">
        <p class="eyebrow">Release controls</p>
        <h2>Unavailable in this slice</h2>
        <p>These static controls cannot change the blocked audit.</p>
        <div class="controls" aria-label="Unavailable release controls">
          <button disabled>Approve release</button>
          <button disabled>Add signature</button>
          <button disabled>Create checksum</button>
          <button disabled>Export package</button>
        </div>
      </article>
    </section>
  </main>
</body>
</html>`;
}
