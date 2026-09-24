---
name: compile-evidence-and-gates
description: Audit HELIX claim provenance, validation evidence, and gate decisions. Use when a request asks why a section or release gate is blocked, or asks to trace a claim to source records. Requires an explicit stage ID and bundle path.
---

# Compile evidence and gates

## Input boundary

Require an explicit `stageId` and `bundlePath` in the request. Accept only a stage listed below and bundle path `synthetic-e2e/helix-synthetic-bundle.json`.

Check both values before reading the bundle. If either value is missing, return only `HELIX_SKILL_STOPPED compile-evidence-and-gates` followed by `missing: <comma-separated field names>` on the next line.

If a supplied value is invalid, start with `HELIX_SKILL_STOPPED compile-evidence-and-gates`. Name only each invalid field and why its supplied value failed. Do not list replacements.

A stopped run does not read the bundle or search for input. A valid run reads only the named bundle. Report claims, paths, stages, and evidence references only when the bundle or the request contains them.

Allowed stage IDs:

- `provenance`
- `gates`

Follow identifiers already present in the bundle from claims to provenance edges, validation results, review dispositions, and gate decisions. Preserve provenance order when the bundle records one. State each open blocker and the human action that remains.

## Structured application mode

Use structured application mode only when the request says `applicationMode` is `audit-selection-v1`. Apply the same input checks and read boundary. Return one JSON object that matches the supplied schema.

Include only `caseId`, `transformId`, ordered `provenanceEdgeIds`, `validationResultIds`, `gateDecisionIds`, and `reviewDispositionIds`. Copy each identifier from the named bundle. Omit claim values, statuses, readiness, `uiStatus`, summaries, human-action prose, and the activation prefix.

Outside structured application mode, start a valid result with `HELIX_SKILL_ACTIVATED compile-evidence-and-gates`. Echo the accepted `stageId` and `bundlePath` before the findings. Never mark a blocked section or release gate as ready.
