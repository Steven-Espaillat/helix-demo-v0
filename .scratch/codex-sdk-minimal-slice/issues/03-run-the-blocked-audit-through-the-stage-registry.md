# 03. Run the blocked audit through the stage registry

**What to build:** Let a HELIX reviewer run `compile-evidence-and-gates` from the `C-BW-HIGH` audit. The browser names a registered stage and session, the server runs Codex, and the workbench replaces activity with a validated `EvidenceCase` that keeps the release blocked.

**Blocked by:** 01. Open the canonical blocked-gate audit. 02. Discover the five HELIX skills.

**Status:** ready-for-agent

- [ ] The browser submits only an application-owned stage ID and demo session ID. It cannot submit a prompt.
- [ ] The application resolves `compile-evidence-and-gates` through a fixed stage registry and runs the Codex SDK only on the server.
- [ ] The demo session stores the Codex thread ID without exposing Codex session files to the browser.
- [ ] The browser receives only `stage.started`, catalogued `activity`, `stage.completed`, and `stage.failed` events.
- [ ] A successful turn must match the fixed structured-output contract and reference only evidence that exists in the loaded fixture.
- [ ] The application derives `uiStatus` from validation results and gate decisions. Codex cannot supply release readiness as free text.
- [ ] The completed audit displays `286.2 g`, `mean-v1`, ten provenance edges, `VR-003` pass, `VR-004` fail, the blocked Section 5 gate, and the blocked release gate.
- [ ] The completed audit lists open review dispositions and human actions without completing them.
- [ ] The stage-run integration check starts through the application boundary, reads the safe event stream, and asserts the final `EvidenceCase`.
