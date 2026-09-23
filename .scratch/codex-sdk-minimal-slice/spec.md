# Codex SDK minimal slice spec

Status: ready-for-agent

## Problem Statement

A HELIX reviewer needs to trust why the synthetic report cannot be released. The current repository has a strong wireframe and a canonical synthetic bundle, but the demo story is still too broad. A ten-stage tour makes the integration look larger than it is and hides the one proof that matters.

The demo must show why `C-BW-HIGH` remains blocked. The reviewer must see the `286.2 g` claim, the ten provenance edges, `VR-003` passing, `VR-004` failing on grain, and the blocked release gate. The demo must not imply that Codex calculated an authoritative value, approved a release, signed a report, or exported a submission package.

## Solution

Build the first slice as a blocked-gate audit for a skeptical reviewer. The ten-stage journey stays in the interface as context, navigation, and integration coverage. The main story follows one evidence case from claim to provenance, validation, gate decision, and required human action.

The golden path is:

1. Open the HELIX workbench with the canonical synthetic bundle loaded.
2. Select the `C-BW-HIGH` evidence case from the ten-stage journey.
3. Run the `compile-evidence-and-gates` skill through the server-side Codex SDK adapter.
4. Stream only safe UI activity events while Codex reads the fixture and returns structured output.
5. Show the `286.2 g` claim and the `mean-v1` transform.
6. Show all ten provenance edges for `C-BW-HIGH`.
7. Show `VR-003` as pass because the claim traces to ten terminal records.
8. Show `VR-004` as fail because the report grain is dose group and the template requires dose group by sex.
9. Show the release gate as blocked because `VR-004`, `VR-005`, and `VR-006` remain open blockers.
10. Show approval and export controls as disabled or absent.

For the reviewer, this turns the demo into an audit of a concrete blocker. For the next engineer, this gives one canonical fixture, one evidence-case contract, one stage registry, and one event boundary to build against.

## User Stories

1. As a HELIX reviewer, I want to start from the blocked release state, so that I can audit the reason before I trust the demo.
2. As a HELIX reviewer, I want to inspect `C-BW-HIGH`, so that I can focus on the claim that demonstrates the blocker.
3. As a HELIX reviewer, I want to see the `286.2 g` value, so that I can compare the displayed claim with the source evidence.
4. As a HELIX reviewer, I want to see the `mean-v1` transform, so that I know the claim came from a deterministic transform and not model prose.
5. As a HELIX reviewer, I want to see all ten provenance edges, so that I can verify that the claim traces to the terminal body-weight records.
6. As a HELIX reviewer, I want to see `VR-003` pass, so that I can separate source traceability from release readiness.
7. As a HELIX reviewer, I want to see `VR-004` fail, so that I know the exact rule blocking the body-weight section.
8. As a HELIX reviewer, I want to see the grain mismatch in plain language, so that I know the table uses dose group and the template requires dose group by sex.
9. As a HELIX reviewer, I want to see the release gate stay blocked, so that the demo does not overstate the result.
10. As a HELIX reviewer, I want to see pending human actions, so that I know which decisions Codex cannot make.
11. As a HELIX reviewer, I want disabled approval controls, so that I do not mistake the demo for a signing workflow.
12. As a HELIX reviewer, I want disabled export controls, so that I do not mistake the demo for a submission package generator.
13. As a study director, I want the demo to label synthetic data clearly, so that no one treats the output as submission-ready.
14. As a study director, I want the release state to fail closed, so that an invalid Codex turn cannot change approval state.
15. As a Quality Assurance reviewer, I want every displayed evidence reference to exist in the canonical fixture, so that the UI cannot cite unknown evidence.
16. As a Quality Assurance reviewer, I want `validated` to mean source reconciliation only, so that the status does not imply release readiness.
17. As a product reviewer, I want the ten-stage rail to remain visible, so that I understand how the evidence case fits the whole HELIX journey.
18. As a product reviewer, I want the hero path to stay on one claim, so that the demo has one memorable audit story.
19. As a developer, I want a fixed `EvidenceCase` contract, so that the UI and server agree on the object being inspected.
20. As a developer, I want a fixed stage registry, so that the browser cannot submit arbitrary Codex prompts.
21. As a developer, I want the SDK to run server-side, so that browser code never imports the Codex SDK.
22. As a developer, I want a small UI event union, so that SDK internals do not leak into the browser.
23. As a developer, I want structured output validation, so that an invalid Codex response becomes a failure state.
24. As a developer, I want fixture preflight checks, so that the demo fails before runtime when the canonical data drifts.
25. As a developer, I want browser reconnection behavior defined, so that a dropped tab does not create a second story.
26. As a developer, I want plugin discovery included in proof criteria, so that the demo proves the real integration and not a static mock.
27. As a developer, I want unsafe SDK payloads filtered, so that command output, hidden reasoning, environment data, and raw paths stay server-side.
28. As a developer, I want focused tests at the stage-run seam, so that test coverage checks behavior without coupling to Codex internals.
29. As a product owner, I want MCP and app-server work deferred, so that the first slice proves the smallest useful integration.
30. As a product owner, I want production regulatory controls called out as deferred, so that the demo does not imply Part 11, SEND, or GLP compliance.
31. As a maintainer, I want the separate CSV study kept out of runtime, so that the demo does not mix incompatible studies.
32. As a maintainer, I want the wireframe values rebuilt from data, so that hard-coded stale values do not survive into the application.

## Implementation Decisions

- Center the demo on a reviewer auditing why `C-BW-HIGH` remains blocked.
- Keep the ten-stage rail as context, not as ten equal demo paths.
- Use the canonical synthetic bundle as the only runtime fixture for this slice.
- Treat the focused claim, validation, and retrieval files as test fixtures or generated views, not as runtime sources that the app reconciles.
- Keep five goal-oriented plugin skills. Do not create one skill per button.
- Use `compile-evidence-and-gates` as the primary golden-path skill.
- Run Codex through the TypeScript SDK on the server.
- Configure the replay turn as read-only, no approvals, and no network access.
- Resolve stage runs through an application-owned registry. The browser sends a stage ID and session ID, not a prompt.
- Store the Codex thread ID in the demo session. Do not expose Codex session files to the browser.
- Return structured output through a fixed schema. Reject output that does not match the application contract.
- Validate every evidence reference against the loaded fixture before the browser receives a completion event.
- Fail closed for invalid, incomplete, or unsafe runs. A failed run must not alter release, approval, signature, checksum, or export state.
- Disable or remove controls that imply working approval, signature, checksum, or export behavior.
- Keep static report or package previews only when the UI labels them as unavailable in the first slice.

### EvidenceCase contract

Use `EvidenceCase` as the domain object that the hero path inspects.

| Field | Meaning |
| --- | --- |
| `caseId` | The evidence case identifier. For the hero path, this is `C-BW-HIGH`. |
| `claim` | The claim value, unit, section, field, grain, and reconciliation status. |
| `transform` | The deterministic transform identifier and a short transform summary. |
| `provenanceEdges` | The ordered provenance edges that connect the claim to source records. |
| `validationResults` | The validation results that affect the case, including `VR-003` and `VR-004`. |
| `gateDecisions` | The section and release gate decisions that use the validation results. |
| `reviewDispositions` | The open human review decisions that keep blockers unresolved. |
| `humanActions` | The next human actions that the agent may list but not complete. |
| `uiStatus` | The UI status derived by the application from validation and gate state. |

The application derives `uiStatus`. Codex must not return release readiness as free text.

### Status semantics

| Status | Meaning in this slice |
| --- | --- |
| `validated` | Source reconciliation passed for the claim. This does not mean release-ready. |
| `blocked` | One or more blocker validation results keeps a section or release gate closed. |
| `needs_human` | A human review, disposition, approval, or signoff is required. |
| `pending_export` | An export artifact exists as a planned output and has no checksum yet. |
| `failed` | The Codex turn, schema validation, event filter, or evidence validation failed. |

### Fixture invariants

The app must preflight these invariants before any Codex turn starts:

- The workflow state is `gated`.
- The manifest has ten frozen inputs.
- The normalized record collections contain 1,662 records.
- The fixture has three claims and fourteen provenance edges.
- The `C-BW-HIGH` claim value is `286.2 g`.
- The `C-BW-HIGH` claim has exactly ten provenance edges.
- The `C-BW-HIGH` transform is `mean-v1`.
- `VR-003` has status `pass` and cites the ten provenance edges.
- `VR-004` has status `fail`, severity `blocker`, and cites `C-BW-HIGH`.
- The section gate for Section 5 is blocked by `VR-004`.
- The release gate is blocked and includes `VR-004`, `VR-005`, and `VR-006`.
- Review dispositions for the blocker results are open.
- Export artifacts are pending and have no checksums.

### UI event allowlist

The browser may receive only application-owned UI events.

| UI event | Payload allowed | Source SDK events |
| --- | --- | --- |
| `stage.started` | Stage ID and display label. | Thread and turn start events. |
| `activity` | A safe label from a server-owned catalog. | Item start, item update, or item completion after server translation. |
| `stage.completed` | A schema-valid stage result or evidence case. | Turn completion after schema and evidence validation. |
| `stage.failed` | A user-safe failure message and failure kind. | Turn failure, fatal error, schema failure, evidence failure, or browser session failure. |

The browser must not receive raw reasoning, command text, command output, environment variables, absolute paths, arbitrary tool payloads, MCP payloads, web-search payloads, or filesystem writes.

### Failure matrix

| Failure | Required behavior |
| --- | --- |
| Missing plugin or missing skill | Show `stage.failed`. Name the missing capability. Keep release blocked. |
| Codex turn failure | Show `stage.failed`. Keep the session recoverable. Keep release blocked. |
| Fatal SDK error | Show `stage.failed`. End the stream. Keep release blocked. |
| Invalid structured output | Reject the result. Do not render partial success. Keep release blocked. |
| Unknown evidence reference | Reject the result. Show the missing reference count. Keep release blocked. |
| Fixture preflight failure | Stop before Codex runs. Show the failing invariant. Keep release blocked. |
| Unsafe SDK event payload | Drop the payload. Log the filtered event server-side. Keep the UI stream safe. |
| Browser disconnect during a turn | Let the server finish or fail the turn. Keep the thread ID in the session. |
| Browser reconnect after completion | Replay the final safe stage event from server state. Do not start another turn. |
| Approval or export request in the first slice | Refuse the action. Show that approval and export are out of scope. |

## Testing Decisions

Good tests should exercise external behavior. They should not assert Codex internal event shapes beyond the server-owned translation contract.

The primary test seam is the stage-run seam. A test starts a stage through the application boundary, reads the safe event stream, and asserts the final `EvidenceCase` or failure event. This is the highest seam that proves the browser request, stage registry, server-side Codex adapter, output schema, evidence validation, and UI event filter together.

Use lower seams only where the app needs deterministic safety checks before an SDK turn:

- A fixture preflight check validates the canonical synthetic bundle invariants.
- A schema validation check rejects malformed stage results and evidence cases.
- An event filter check proves that unsafe SDK payloads do not reach the browser.

The first implementation is complete only when these proof criteria pass against the running application:

1. Install and enable the local HELIX plugin.
2. Confirm that Codex discovers all five skills.
3. Run one direct trigger and one indirect trigger for each skill.
4. Confirm that incomplete input stops without invented paths, claims, or stages.
5. Confirm that unrelated requests do not activate HELIX skills.
6. Run the golden path for `C-BW-HIGH` through the UI.
7. Confirm that the UI displays `286.2 g`, ten provenance edges, `VR-003` pass, `VR-004` fail, and a blocked release gate.
8. Confirm that a browser disconnect and reconnect does not start a duplicate turn.
9. Confirm that no reasoning text, command output, environment data, absolute path, or unsafe tool payload reaches the browser.
10. Confirm that no approval, signature, checksum, or export event is written.

The current repository has no package manifest, application scaffold, or test runner. The prior art is the verification list in the Codex SDK research note, the three-view wireframe, the canonical synthetic bundle, and the FDA-aligned workflow boundary note.

## Out of Scope

- MCP server support.
- Codex app-server support.
- Report editing.
- Approval workflows.
- Electronic signatures.
- Export package creation.
- Checksum creation.
- Submission package generation.
- Part 11 compliance.
- GLP validation.
- SEND conformance.
- Durable study selection between the two synthetic studies.
- Regenerating every derived artifact from one source study.
- Production identity, audit storage, retention, and authority controls.
- Authoritative statistical calculation by Codex or model prose.
- Human disposition of `VR-004`, `VR-005`, or `VR-006`.

## Further Notes

The repository is not a Git repository and has no remote issue tracker configured. This spec was published to the local Markdown issue tracker with status `ready-for-agent`.

Source evidence inspected for this spec:

- `codex-sdk-minimal-slice.md` describes the current recommendation, SDK constraints, plugin shape, core data shape, runtime flow, UI scope, alternatives, verification, build order, and deferred decisions.
- `fda-nonclinical-reporting.md` defines the HELIX regulatory boundaries for the synthetic prototype.
- `helix-e2e-workbenchv0.html` contains the ten-stage journey, evidence chain, report assembly view, hard-coded `READY FOR EXPORT` markup, and stale `263.8 g` display.
- `synthetic-e2e/helix-synthetic-bundle.json` is the canonical runtime fixture for this spec.
- `synthetic-e2e/report-claims.json`, `synthetic-e2e/validation-results.json`, and `synthetic-e2e/retrieval-index.json` are focused views that duplicate bundle data.
- `synthetic-e2e/data/study_data/` contains the separate `TOX-2025-0118-P` CSV study and must not be mixed into the live demo.

The `263.8 g` value exists in the canonical bundle as one animal-day body-weight record for `HXL-F303` in group `G3`. It is not the `C-BW-HIGH` claim. It is not either synthetic study's high-dose terminal mean.

The accepted product judgment from the grilling session is binding for this spec. The demo optimizes for reviewer trust in one blocked-gate audit rather than breadth across ten equal paths.
