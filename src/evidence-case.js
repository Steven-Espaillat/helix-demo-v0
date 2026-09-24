import { readFile } from "node:fs/promises";

export const CANONICAL_BUNDLE_PATH = new URL(
  "../synthetic-e2e/helix-synthetic-bundle.json",
  import.meta.url,
);

export const CANONICAL_BUNDLE_RELATIVE_PATH =
  "synthetic-e2e/helix-synthetic-bundle.json";
export const EVIDENCE_CASE_ID = "C-BW-HIGH";

const CASE_ID = EVIDENCE_CASE_ID;
const REQUIRED_PROVENANCE_EDGE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `PE-BW-${index + 1}`),
);
const REQUIRED_VALIDATION_RESULT_IDS = Object.freeze(["VR-003", "VR-004"]);
const REQUIRED_GATE_DECISION_IDS = Object.freeze(["GATE-SECTION-S5", "GATE-RELEASE"]);
const REQUIRED_REVIEW_DISPOSITION_IDS = Object.freeze(["RD-1", "RD-2", "RD-3"]);
const REQUIRED_RELEASE_BLOCKERS = ["VR-004", "VR-005", "VR-006"];
const AUDIT_SELECTION_FIELDS = Object.freeze([
  "caseId",
  "transformId",
  "provenanceEdgeIds",
  "validationResultIds",
  "gateDecisionIds",
  "reviewDispositionIds",
]);

function freezeJson(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeJson(child);
    }
  }
  return value;
}

export const AUDIT_SELECTION_SCHEMA = freezeJson({
  type: "object",
  properties: {
    caseId: { type: "string", enum: [CASE_ID] },
    transformId: { type: "string", enum: ["mean-v1"] },
    provenanceEdgeIds: {
      type: "array",
      items: { type: "string", enum: [...REQUIRED_PROVENANCE_EDGE_IDS] },
      minItems: REQUIRED_PROVENANCE_EDGE_IDS.length,
      maxItems: REQUIRED_PROVENANCE_EDGE_IDS.length,
    },
    validationResultIds: {
      type: "array",
      items: { type: "string", enum: [...REQUIRED_VALIDATION_RESULT_IDS] },
      minItems: REQUIRED_VALIDATION_RESULT_IDS.length,
      maxItems: REQUIRED_VALIDATION_RESULT_IDS.length,
    },
    gateDecisionIds: {
      type: "array",
      items: { type: "string", enum: [...REQUIRED_GATE_DECISION_IDS] },
      minItems: REQUIRED_GATE_DECISION_IDS.length,
      maxItems: REQUIRED_GATE_DECISION_IDS.length,
    },
    reviewDispositionIds: {
      type: "array",
      items: { type: "string", enum: [...REQUIRED_REVIEW_DISPOSITION_IDS] },
      minItems: REQUIRED_REVIEW_DISPOSITION_IDS.length,
      maxItems: REQUIRED_REVIEW_DISPOSITION_IDS.length,
    },
  },
  required: [...AUDIT_SELECTION_FIELDS],
  additionalProperties: false,
});

const humanActionByResultId = {
  "VR-004": "Resolve the dose-group versus dose-group-by-sex grain mismatch and record a review disposition.",
  "VR-005": "Reconcile the draft microscopic severity with the source findings and record a review disposition.",
  "VR-006": "Obtain study director interpretation and peer review for the NOAEL, then record a review disposition.",
};

export class MissingAuditReferencesError extends Error {
  constructor(missingCount) {
    super(`AuditSelection references ${missingCount} missing fixture item${missingCount === 1 ? "" : "s"}`);
    this.name = "MissingAuditReferencesError";
    this.missingCount = missingCount;
  }
}

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIdArray(name, value, allowedIds) {
  if (
    !Array.isArray(value) ||
    value.length !== allowedIds.length ||
    value.some((id) => typeof id !== "string") ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`Invalid AuditSelection field: ${name}`);
  }

  const missingCount = value.filter((id) => !allowedIds.includes(id)).length;
  if (missingCount > 0) {
    throw new MissingAuditReferencesError(missingCount);
  }
}

function assertAuditSelectionShape(selection) {
  if (!isRecord(selection)) {
    throw new Error("Invalid AuditSelection object");
  }

  const fields = Object.keys(selection).sort();
  const expectedFields = [...AUDIT_SELECTION_FIELDS].sort();
  if (fields.length !== expectedFields.length || fields.some((field, index) => field !== expectedFields[index])) {
    throw new Error("Invalid AuditSelection fields");
  }
  if (selection.caseId !== CASE_ID) {
    throw new Error("Invalid AuditSelection field: caseId");
  }
  if (selection.transformId !== "mean-v1") {
    throw new Error("Invalid AuditSelection field: transformId");
  }

  assertIdArray("provenanceEdgeIds", selection.provenanceEdgeIds, REQUIRED_PROVENANCE_EDGE_IDS);
  assertIdArray("validationResultIds", selection.validationResultIds, REQUIRED_VALIDATION_RESULT_IDS);
  assertIdArray("gateDecisionIds", selection.gateDecisionIds, REQUIRED_GATE_DECISION_IDS);
  assertIdArray(
    "reviewDispositionIds",
    selection.reviewDispositionIds,
    REQUIRED_REVIEW_DISPOSITION_IDS,
  );
}

function assertOrderedIds(name, actual, expected) {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`AuditSelection does not match the fixture: ${name}`);
  }
}

export function parseAuditSelection(agentMessage) {
  if (typeof agentMessage !== "string") {
    throw new Error("AuditSelection response must be JSON text");
  }

  let selection;
  try {
    selection = JSON.parse(agentMessage);
  } catch {
    throw new Error("AuditSelection response is not valid JSON");
  }
  assertAuditSelectionShape(selection);
  return selection;
}

export function assertAuditSelectionMatchesFixture(bundle, selection) {
  assertAuditSelectionShape(selection);

  const claimById = new Map((bundle.claims ?? []).map((claim) => [claim.claim_id, claim]));
  const edgeById = new Map((bundle.provenance_edges ?? []).map((edge) => [edge.edge_id, edge]));
  const validationById = new Map(
    (bundle.validation_results ?? []).map((result) => [result.result_id, result]),
  );
  const gateById = new Map((bundle.gate_decisions ?? []).map((gate) => [gate.gate_id, gate]));
  const dispositionById = new Map(
    (bundle.review_dispositions ?? []).map((item) => [item.disposition_id, item]),
  );

  const missingReferences = new Set();
  if (!claimById.has(selection.caseId)) {
    missingReferences.add(`claim:${selection.caseId}`);
  }
  for (const edgeId of selection.provenanceEdgeIds) {
    if (!edgeById.has(edgeId)) {
      missingReferences.add(`provenance:${edgeId}`);
    }
  }
  for (const resultId of selection.validationResultIds) {
    if (!validationById.has(resultId)) {
      missingReferences.add(`validation:${resultId}`);
    }
  }
  for (const gateId of selection.gateDecisionIds) {
    if (!gateById.has(gateId)) {
      missingReferences.add(`gate:${gateId}`);
    }
  }
  for (const dispositionId of selection.reviewDispositionIds) {
    if (!dispositionById.has(dispositionId)) {
      missingReferences.add(`disposition:${dispositionId}`);
    }
  }
  if (missingReferences.size > 0) {
    throw new MissingAuditReferencesError(missingReferences.size);
  }

  const expectedEdges = (bundle.provenance_edges ?? []).filter(
    (edge) => edge.claim_id === selection.caseId && edge.transform_id === selection.transformId,
  );
  const expectedValidations = (bundle.validation_results ?? []).filter((result) =>
    REQUIRED_VALIDATION_RESULT_IDS.includes(result.result_id),
  );
  const expectedGates = (bundle.gate_decisions ?? []).filter((gate) =>
    REQUIRED_GATE_DECISION_IDS.includes(gate.gate_id),
  );
  const blockerIds = new Set(expectedGates.flatMap((gate) => gate.blocking_result_ids ?? []));
  const expectedDispositions = (bundle.review_dispositions ?? []).filter((item) =>
    blockerIds.has(item.result_id),
  );

  assertOrderedIds(
    "provenanceEdgeIds",
    selection.provenanceEdgeIds,
    expectedEdges.map((edge) => edge.edge_id),
  );
  assertOrderedIds(
    "validationResultIds",
    selection.validationResultIds,
    expectedValidations.map((result) => result.result_id),
  );
  assertOrderedIds(
    "gateDecisionIds",
    selection.gateDecisionIds,
    expectedGates.map((gate) => gate.gate_id),
  );
  assertOrderedIds(
    "reviewDispositionIds",
    selection.reviewDispositionIds,
    expectedDispositions.map((item) => item.disposition_id),
  );

  const sourceRecordIds = new Set(
    Object.values(bundle.records ?? {})
      .flatMap((records) => (Array.isArray(records) ? records : []))
      .map((record) => record.record_id),
  );
  const artifactIds = new Set((bundle.manifest ?? []).map((artifact) => artifact.artifact_id));
  for (const edge of expectedEdges) {
    const sourceArtifactId = String(edge.source_pointer).split("#", 1)[0];
    if (
      edge.claim_id !== selection.caseId ||
      edge.transform_id !== selection.transformId ||
      !sourceRecordIds.has(edge.source_record_id) ||
      !artifactIds.has(sourceArtifactId)
    ) {
      throw new Error("AuditSelection provenance does not resolve through the fixture");
    }
  }
  for (const result of expectedValidations) {
    if (
      (result.evidence_ids ?? []).some(
        (id) => !claimById.has(id) && !edgeById.has(id) && !artifactIds.has(id),
      )
    ) {
      throw new Error("AuditSelection validation evidence does not resolve through the fixture");
    }
  }
  for (const gate of expectedGates) {
    if ((gate.blocking_result_ids ?? []).some((id) => !validationById.has(id))) {
      throw new Error("AuditSelection gate blockers do not resolve through the fixture");
    }
  }
  for (const disposition of expectedDispositions) {
    if (!validationById.has(disposition.result_id)) {
      throw new Error("AuditSelection disposition does not resolve through the fixture");
    }
  }
}

export function deriveUiStatus(validationResults, gateDecisions) {
  if (
    gateDecisions.some((gate) => gate.status === "blocked") ||
    validationResults.some(
      (result) => result.status === "fail" && result.severity === "blocker",
    )
  ) {
    return "blocked";
  }
  if (
    validationResults.some((result) => result.status !== "pass") ||
    gateDecisions.some((gate) => ["pending", "needs_review", "needs_human"].includes(gate.status))
  ) {
    return "needs_human";
  }
  return "validated";
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
    uiStatus: deriveUiStatus(validationResults, gateDecisions),
  };
}
