import { readFile } from "node:fs/promises";

export const CANONICAL_BUNDLE_PATH = new URL(
  "../synthetic-e2e/helix-synthetic-bundle.json",
  import.meta.url,
);

const CASE_ID = "C-BW-HIGH";
const REQUIRED_RELEASE_BLOCKERS = ["VR-004", "VR-005", "VR-006"];

const humanActionByResultId = {
  "VR-004": "Resolve the dose-group versus dose-group-by-sex grain mismatch and record a review disposition.",
  "VR-005": "Reconcile the draft microscopic severity with the source findings and record a review disposition.",
  "VR-006": "Obtain study director interpretation and peer review for the NOAEL, then record a review disposition.",
};

function invariant(name, condition, detail) {
  if (!condition) {
    throw new Error(`Fixture invariant failed: ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every((item) => actual.includes(item));
}

export function assertFixtureInvariants(bundle) {
  const claim = bundle.claims?.find((item) => item.claim_id === CASE_ID);
  const edges = bundle.provenance_edges?.filter((edge) => edge.claim_id === CASE_ID) ?? [];
  const validationById = new Map(
    (bundle.validation_results ?? []).map((result) => [result.result_id, result]),
  );
  const vr003 = validationById.get("VR-003");
  const vr004 = validationById.get("VR-004");
  const sectionGate = bundle.gate_decisions?.find((gate) => gate.gate_id === "GATE-SECTION-S5");
  const releaseGate = bundle.gate_decisions?.find((gate) => gate.gate_id === "GATE-RELEASE");
  const recordCount = Object.values(bundle.records ?? {}).reduce(
    (total, records) => total + (Array.isArray(records) ? records.length : 0),
    0,
  );

  invariant("workflow state is gated", bundle.workflow_state === "gated");
  invariant(
    "manifest has ten frozen inputs",
    bundle.manifest?.length === 10 && bundle.manifest.every((item) => item.locked === true),
  );
  invariant("normalized record count is 1,662", recordCount === 1662, `found ${recordCount}`);
  invariant(
    "fixture has three claims and fourteen provenance edges",
    bundle.claims?.length === 3 && bundle.provenance_edges?.length === 14,
  );
  invariant(
    "C-BW-HIGH claim is 286.2 g",
    claim?.value === 286.2 && claim?.unit === "g",
  );
  invariant("C-BW-HIGH has exactly ten provenance edges", edges.length === 10, `found ${edges.length}`);
  invariant(
    "C-BW-HIGH transform is mean-v1",
    edges.every((edge) => edge.transform_id === "mean-v1"),
  );
  invariant(
    "VR-003 passes and cites the ten provenance edges",
    vr003?.status === "pass" &&
      vr003.evidence_ids?.length === 10 &&
      sameMembers(vr003.evidence_ids, edges.map((edge) => edge.edge_id)),
  );
  invariant(
    "VR-004 is a blocker failure citing C-BW-HIGH",
    vr004?.status === "fail" &&
      vr004.severity === "blocker" &&
      vr004.evidence_ids?.includes(CASE_ID),
  );
  invariant(
    "Section 5 gate is blocked by VR-004",
    sectionGate?.status === "blocked" &&
      sameMembers(sectionGate.blocking_result_ids ?? [], ["VR-004"]),
  );
  invariant(
    "release gate is blocked by VR-004, VR-005, and VR-006",
    releaseGate?.status === "blocked" &&
      sameMembers(releaseGate.blocking_result_ids ?? [], REQUIRED_RELEASE_BLOCKERS),
  );
  invariant(
    "blocker review dispositions are open",
    REQUIRED_RELEASE_BLOCKERS.every((resultId) =>
      bundle.review_dispositions?.some(
        (disposition) => disposition.result_id === resultId && disposition.decision === "open",
      ),
    ),
  );
  invariant(
    "export artifacts are pending without checksums",
    bundle.export_artifacts?.length > 0 &&
      bundle.export_artifacts.every(
        (artifact) => artifact.status === "pending" && artifact.checksum === null,
      ),
  );
}

export async function loadCanonicalBundle() {
  const source = await readFile(CANONICAL_BUNDLE_PATH, "utf8");
  const bundle = JSON.parse(source);
  assertFixtureInvariants(bundle);
  return bundle;
}

export function deriveEvidenceCase(bundle) {
  const claim = bundle.claims.find((item) => item.claim_id === CASE_ID);
  const provenanceEdges = bundle.provenance_edges.filter((edge) => edge.claim_id === CASE_ID);
  const validationResults = bundle.validation_results.filter((result) =>
    ["VR-003", "VR-004"].includes(result.result_id),
  );
  const gateDecisions = bundle.gate_decisions.filter((gate) =>
    ["GATE-SECTION-S5", "GATE-RELEASE"].includes(gate.gate_id),
  );
  const blockerIds = gateDecisions
    .flatMap((gate) => gate.blocking_result_ids)
    .filter((resultId, index, all) => all.indexOf(resultId) === index);
  const reviewDispositions = bundle.review_dispositions.filter((disposition) =>
    blockerIds.includes(disposition.result_id),
  );

  return {
    caseId: CASE_ID,
    claim: { ...claim },
    transform: {
      id: provenanceEdges[0].transform_id,
      summary: "High-dose day-28 terminal body-weight arithmetic mean from ten source records.",
    },
    provenanceEdges: provenanceEdges.map((edge, index) => ({ ...edge, order: index + 1 })),
    validationResults: validationResults.map((result) => ({ ...result })),
    gateDecisions: gateDecisions.map((gate) => ({ ...gate })),
    reviewDispositions: reviewDispositions.map((disposition) => ({ ...disposition })),
    humanActions: reviewDispositions.map((disposition) => ({
      resultId: disposition.result_id,
      action: humanActionByResultId[disposition.result_id],
    })),
    uiStatus: "blocked",
  };
}
