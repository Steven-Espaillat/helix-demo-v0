# 06. Prove the plugin-to-UI blocked audit

**What to build:** Give the product owner one repeatable acceptance run that proves the real HELIX plugin, server-side Codex adapter, safe event boundary, and reviewer workbench tell the blocked-gate story without implying regulatory authority.

**Blocked by:** 04. Fail closed for invalid or unsafe runs. 05. Resume a stage run without duplicating it.

**Status:** ready-for-agent

- [ ] One command starts the application and runs the acceptance checks against the real plugin and canonical synthetic bundle.
- [ ] The acceptance run confirms discovery of all five skills, one direct trigger and one indirect trigger for each skill, incomplete-input refusal, and non-activation for unrelated requests.
- [ ] The acceptance run drives the `C-BW-HIGH` golden path through the browser and records the displayed `286.2 g` claim, ten provenance edges, `VR-003` pass, `VR-004` fail, and blocked release gate.
- [ ] The acceptance run disconnects and reconnects the browser and proves that no duplicate Codex turn starts.
- [ ] The acceptance run injects unsafe SDK content and proves that no reasoning, command output, environment data, absolute path, or unsafe tool payload reaches the browser.
- [ ] The acceptance run proves that no approval, signature, checksum, export, or submission package event is written.
- [ ] The acceptance output identifies each failed proof criterion and exits unsuccessfully when any criterion fails.
- [ ] The recorded evidence makes clear that MCP, app-server support, production regulatory controls, and human blocker disposition remain out of scope.
