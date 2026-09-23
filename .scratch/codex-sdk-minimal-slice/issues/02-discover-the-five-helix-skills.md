# 02. Discover the five HELIX skills

**What to build:** Give a developer a local HELIX plugin that Codex can discover through the TypeScript SDK. The plugin exposes five goal-oriented skills, including `compile-evidence-and-gates`, without turning each workbench control into a skill.

**Blocked by:** 01. Open the canonical blocked-gate audit.

**Status:** ready-for-agent

- [ ] The server-side Codex integration installs and enables one local HELIX plugin with exactly five goal-oriented skills.
- [ ] Codex discovers all five skills through the real plugin discovery path.
- [ ] One direct trigger and one indirect trigger activate each skill with complete fixture input.
- [ ] Incomplete input stops without invented paths, claims, stages, or evidence references.
- [ ] Unrelated requests do not activate a HELIX skill.
- [ ] The replay turn is read-only, has no approval capability, and has no network access.
- [ ] Browser code does not import the Codex SDK or receive Codex session files.
- [ ] Automated integration checks exercise discovery and activation through the SDK rather than a static plugin mock.
