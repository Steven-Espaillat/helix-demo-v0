# 04. Fail closed for invalid or unsafe runs

**What to build:** Give a HELIX reviewer a clear failure state whenever the plugin, Codex turn, structured result, fixture, or event stream is unsafe. Every failure leaves the section and release gates blocked and preserves the session for a safe retry when possible.

**Blocked by:** 03. Run the blocked audit through the stage registry.

**Status:** ready-for-agent

- [ ] A missing plugin or missing skill produces `stage.failed`, names the missing capability, and does not start a false success state.
- [ ] A turn failure or fatal SDK error ends the stream with a user-safe failure and keeps the release blocked.
- [ ] Malformed or incomplete structured output is rejected without rendering partial success.
- [ ] An unknown evidence reference is rejected. The failure reports the number of missing references without exposing raw references or paths.
- [ ] Fixture preflight runs before Codex. A failed invariant prevents the turn and appears as `stage.failed`.
- [ ] Raw reasoning, command text, command output, environment data, absolute paths, arbitrary tool payloads, MCP payloads, web-search payloads, and filesystem writes never reach the browser.
- [ ] The server drops and records an unsafe SDK payload while the browser receives only a safe failure or safe catalogued activity.
- [ ] A request to approve, sign, checksum, or export is refused as out of scope and writes no regulatory state.
- [ ] Failure-path integration checks prove that release, approval, signature, checksum, and export state do not change.
