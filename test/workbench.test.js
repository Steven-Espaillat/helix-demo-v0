import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { assertFixtureInvariants, loadCanonicalBundle } from "../src/evidence-case.js";
import { createWorkbenchServer } from "../src/server.js";

function clone(value) {
  return structuredClone(value);
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

describe("fixture preflight", () => {
  test("accepts the canonical synthetic bundle", async () => {
    const bundle = await loadCanonicalBundle();
    assert.doesNotThrow(() => assertFixtureInvariants(bundle));
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
    assert.doesNotMatch(html, /263\.8 g/);
    assert.doesNotMatch(html, /TOX-2025-0118-P|body_weights\.csv/);
  });
});
