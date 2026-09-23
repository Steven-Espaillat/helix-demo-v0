# 05. Resume a stage run without duplicating it

**What to build:** Let a HELIX reviewer leave and reopen the workbench during a `compile-evidence-and-gates` run without creating a second Codex turn. The server owns the active run, and the returning browser receives the final safe event from session state.

**Blocked by:** 03. Run the blocked audit through the stage registry.

**Status:** ready-for-agent

- [ ] Closing the browser during a turn does not cancel the server-owned turn or start a replacement turn.
- [ ] The demo session retains the thread ID and enough application-owned run state to distinguish an active, completed, or failed stage.
- [ ] Reconnecting while the turn is active attaches to the existing run without invoking Codex again.
- [ ] Reconnecting after completion replays the final safe `stage.completed` event and restores the blocked audit.
- [ ] Reconnecting after failure replays a user-safe `stage.failed` event and leaves the session recoverable.
- [ ] Reconnect behavior never exposes raw SDK events or Codex session files.
- [ ] An integration check disconnects and reconnects a browser and proves that only one Codex turn starts.
