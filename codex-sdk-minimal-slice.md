# Codex SDK minimal slice for the HELIX wireframe

Research date: 2026-09-23.

## Recommendation

Build a replayable evidence-workflow demo before building report automation.

The first usable slice should let a reviewer select any HELIX stage, run the matching installed skill through the Codex TypeScript SDK, watch safe progress events, and inspect a structured result backed by `synthetic-e2e/helix-synthetic-bundle.json`. The demo must preserve the current blocked release state. It must not claim that Codex produced the supplied data or that the output is suitable for submission.

This slice proves the uncertain integration points:

- Codex loads the HELIX plugin skills.
- A browser action starts a server-side Codex turn.
- SDK events reach the browser while the turn runs.
- The final response matches a fixed JSON schema.
- Every displayed claim points to data in the synthetic bundle.
- Human approval and export stay outside the agent turn.

Do not add an MCP server yet. The first slice reads local files and performs no remote action. OpenAI recommends starting with the smallest plugin shape that supports the use case. A skills-only plugin is sufficient when existing tools can complete the workflow. An MCP server becomes useful when the product needs authentication, a controlled service API, or server-managed actions. [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)

## What exists in the repository

The repository is a design-data package. It has no application scaffold, package manifest, test runner, or server.

### The wireframe

`helix-e2e-workbenchv0.html` defines three views:

- Study journey.
- Evidence chain.
- Report assembly.

The journey has ten stages. Each stage records an owner, a summary, inputs, outputs, a boundary, checks, and an activity log in the `stages` array at `helix-e2e-workbenchv0.html:170`. The UI already distinguishes agent work, shared work, and human-controlled work.

The saved HTML cannot be the application base without cleanup. It contains the ten journey buttons that JavaScript previously rendered, then runs `stages.forEach` again at line 187. A browser load therefore appends a second set. The saved DOM also shows stage 10 and `READY FOR EXPORT`, while the script starts at stage index 6 and recalculates the release as blocked. The initial value `263.8 g` at lines 152 and 153 disagrees with the canonical claim value `286.2 g` in the bundle.

Keep the visual language. Rebuild the state from data rather than adapting this saved DOM in place.

### The canonical demo data

Use `synthetic-e2e/helix-synthetic-bundle.json` as the only runtime fixture for the first slice. It contains these top-level domains:

- A ten-item frozen manifest.
- Study identity and four dose groups.
- Seven normalized record collections with 1,662 total records.
- Eight report sections.
- Three claims and fourteen provenance edges.
- Six validation results.
- Three review dispositions.
- Two gate decisions.
- Four pending export artifacts.
- Eight workflow events.

The bundle says `workflow_state` is `gated` at line 4. It records the high-dose terminal body-weight claim as `286.2 g` at lines 18164 through 18169. It also records three failed blocker rules at lines 18362 through 18389. The release gate remains blocked.

`report-claims.json`, `validation-results.json`, and `retrieval-index.json` are useful focused views. They duplicate data from the bundle. The application should not load all four files and reconcile them at runtime. Generate those views from the bundle later, or treat them as test fixtures that must equal bundle projections.

### Two incompatible synthetic studies

The files under `synthetic-e2e/data/study_data/` describe study `TOX-2025-0118-P`. The bundle describes `STUDY-HLX-028`. Their high-dose day-28 body weights also differ.

A direct calculation from `data/study_data/body_weights.csv` gives:

| Source | Male mean | Female mean | Pooled mean |
|---|---:|---:|---:|
| CSV files | 287.22 g | 219.08 g | 253.15 g |
| Bundle records | 310.72 g | 261.76 g | 286.24 g |

The rounded bundle value is the `286.2 g` claim. The wireframe value `263.8 g` matches neither source.

The minimal slice must not combine the CSV study with the bundle study. Use the bundle for the live demo. Label the other files as a separate source-data fixture until the project chooses one study and regenerates every derived artifact.

## Codex SDK facts that shape the design

The official TypeScript package is `@openai/codex-sdk`. Version `0.156.1` was the current [npm release](https://www.npmjs.com/package/@openai/codex-sdk) on the research date. The package requires Node.js 18 or later. The SDK wraps the Codex CLI, starts it as a child process, and exchanges JSONL over standard input and output. [Codex SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) [Package manifest](https://github.com/openai/codex/blob/main/sdk/typescript/package.json)

The SDK runs on the server. OpenAI's SDK guide says to use the TypeScript library server-side. Browser code should call an application endpoint rather than import the SDK. [Codex SDK guide](https://developers.openai.com/codex/sdk/)

A thread can run several turns and can be resumed by ID. Threads persist under `~/.codex/sessions`. The server should store the thread ID in the demo session, not expose the Codex session files to the browser. [Codex SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md)

`runStreamed()` yields structured events. The SDK event union includes thread start, turn start, item start, item update, item completion, turn completion, turn failure, and fatal error. Item types include agent messages, reasoning summaries, command execution, file changes, MCP calls, web searches, todo lists, and errors. [SDK events](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts) [SDK items](https://github.com/openai/codex/blob/main/sdk/typescript/src/items.ts)

The application should not send raw reasoning, commands, environment data, or arbitrary tool payloads to the browser. Translate SDK events into a small UI event union.

Each turn can require a JSON Schema response through `outputSchema`. This is the right contract for a stage result. The application must parse the final response and reject a response that does not match the application schema. [Codex SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md)

Thread options include the working directory, sandbox mode, approval policy, network access, web search mode, and Git repository check. The current directory is not a Git repository, so a prototype must either initialize Git or set `skipGitRepoCheck: true`. Use `sandboxMode: "read-only"`, `approvalPolicy: "never"`, and disabled network access for the replay demo. [Thread options](https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts)

The SDK is enough for this slice. OpenAI positions the app server for deeper clients that need built-in authentication, conversation history, interactive approvals, and the full event protocol. Move to the app server only if the UI must handle those features. [Codex app server](https://developers.openai.com/codex/app-server)

## Plugin shape

Use a portable plugin with five focused skills. OpenAI's current portable format uses a root `plugin.json` and discovers skills under the root `skills/` directory. Each skill requires `SKILL.md`. Supporting schemas belong in `references/`, and deterministic processing belongs in `scripts/`. [Package your plugin](https://developers.openai.com/plugins/build/plugins) [Build skills](https://developers.openai.com/plugins/build/skills)

```text
plugins/helix-reporting/
  plugin.json
  skills/
    prepare-study/
      SKILL.md
    extract-and-validate/
      SKILL.md
    draft-report/
      SKILL.md
    compile-evidence-and-gates/
      SKILL.md
    prepare-human-release/
      SKILL.md
```

Do not create one skill per screen button. Five skills keep each user goal recognizable while covering all ten process stages.

| Skill | HELIX stages | Demo responsibility | Hard stop |
|---|---|---|---|
| `prepare-study` | 1 through 3 | Inspect the manifest, normalized study identity, and selected report pattern. | Never authorize a source on a person's behalf. |
| `extract-and-validate` | 4 and 5 | Read existing claims and rule results. Explain the deterministic transform and failed rules. | Never calculate an authoritative value with model prose or downgrade a failure. |
| `draft-report` | 6 | Present the existing section and review markers. | Never invent a value or remove a review marker. |
| `compile-evidence-and-gates` | 7 and 8 | Traverse claim, provenance, validation, and gate records. | Never mark a blocked gate as ready. |
| `prepare-human-release` | 9 and 10 | Prepare the review packet and list pending export artifacts. | Never sign, approve, or export. |

Each skill should accept a stage ID and bundle path. Each skill should return the same `StageResult` shape. A small shared contract is better than five custom response formats.

## Core data shape

The server owns a stage registry. The registry maps each visible stage to one skill and one prompt template.

```ts
type StageId =
  | "authorize"
  | "parse"
  | "resolve"
  | "extract"
  | "validate"
  | "draft"
  | "provenance"
  | "gates"
  | "review"
  | "export";

type StageStatus = "complete" | "blocked" | "needs_human";

type StageResult = {
  stageId: StageId;
  status: StageStatus;
  summary: string;
  inputRefs: string[];
  outputRefs: string[];
  checks: Array<{
    id: string;
    status: "pass" | "fail" | "pending";
    evidenceRefs: string[];
    message: string;
  }>;
  provenanceRefs: string[];
  humanActions: string[];
  boundary: string;
};

type UiEvent =
  | { type: "stage.started"; stageId: StageId }
  | { type: "activity"; label: string }
  | { type: "stage.completed"; result: StageResult }
  | { type: "stage.failed"; message: string };
```

Do not let the model return release readiness as a free-form phrase. `StageStatus` has no `ready_for_export` value. The replay fixture is blocked, and only application-owned human actions may change approval state in a later slice.

## Runtime flow

1. The browser loads a read-only summary from the canonical bundle.
2. The reviewer selects a stage and clicks **Run stage**.
3. The browser sends the stage ID and demo session ID to `POST /api/stages/:stageId/run`.
4. The server resolves the stage through its registry. The browser cannot submit an arbitrary Codex prompt.
5. The server starts or resumes one Codex thread with the repository as its working directory.
6. The prompt invokes the mapped HELIX skill and names the canonical bundle path.
7. `runStreamed()` emits SDK events. The server maps allowed events to `UiEvent` records and sends them over server-sent events or newline-delimited JSON.
8. The turn returns a `StageResult` through `outputSchema`.
9. The server validates evidence references against the loaded bundle before it sends `stage.completed`.
10. The UI renders the result in the current three-column workbench.

Human review and export are separate application commands. The stage-9 skill can list required decisions. The stage-10 skill can prepare an export checklist. Neither skill can mutate approvals or create an export event.

## Minimal UI

Keep the current visual structure and reduce the first build to two views.

### Study journey

Use the ten-stage rail and three-column workbench. Replace hard-coded stage content with the stage registry and `StageResult`. Add these visible runtime states:

- Idle.
- Running.
- Complete.
- Blocked.
- Needs human action.
- Failed.

The activity column should show safe labels such as `Reading frozen manifest` and `Checking provenance edges`. Do not display hidden reasoning or raw command output.

### Evidence chain

Drive the evidence chain from the selected claim. For `C-BW-HIGH`, show the ten provenance edges, `mean-v1`, the rounded `286.2 g` claim, and failed rule `VR-004`. This view proves traceability and also makes the grain defect visible.

Defer report editing and package export. Static previews can remain, but working controls would imply product capabilities that this slice does not have.

## Alternatives

| Option | Benefit | Cost | Judgment |
|---|---|---|---|
| Static wireframe only | Fastest visual result. | Does not prove Codex, plugin loading, streaming, or contracts. | Reject. The repository already has this. |
| Skills-only plugin with the TypeScript SDK | Proves the requested integration with little infrastructure. | The application must own browser transport and event filtering. | Choose for the first slice. |
| MCP server with skills and UI resources | Gives controlled tools and a portable MCP-backed component. | Adds schemas, server deployment, authentication, and more failure modes before they are needed. | Defer until live systems or controlled writes exist. |
| Codex app-server client | Supports a richer Codex client with approvals and thread management. | The protocol is much larger. WebSocket transport is documented as experimental and unsupported for production. | Defer unless the product becomes a general Codex client. |

## Verification

The first build is complete only when these checks pass against the running application.

1. Install and enable the local plugin. Confirm that Codex discovers all five skills.
2. Run one direct trigger and one indirect trigger for each skill. Confirm that the expected skill activates.
3. Run incomplete input. Confirm that the skill stops without inventing a bundle path or stage.
4. Run an unrelated request. Confirm that no HELIX skill activates.
5. Run all ten UI stages. Confirm that each starts a Codex turn and returns a schema-valid `StageResult`.
6. Disconnect the browser during a turn, reconnect with the demo session, and confirm that the server retains the thread ID.
7. Confirm that the browser never receives reasoning text, environment variables, command output, or filesystem paths outside the allowed repository-relative references.
8. Confirm that `C-BW-HIGH` displays `286.2 g`, has ten provenance edges, and remains blocked by `VR-004`.
9. Confirm that the release status stays blocked after stages 8, 9, and 10.
10. Confirm that no approval, signature, checksum, or export event is written.

OpenAI recommends testing direct triggers, indirect triggers, incomplete inputs, non-matching requests, and unsupported edge cases for every skill. [Build skills](https://developers.openai.com/plugins/build/skills)

## Build order

1. Normalize the demo around `helix-synthetic-bundle.json` and remove conflicting values from the new UI.
2. Add the portable plugin and test its five skills through Codex CLI.
3. Add the server-side SDK adapter with a fixed stage registry and `StageResult` schema.
4. Add the two-view UI and stream translated events.
5. Add the end-to-end checks above.

The next engineer should inherit one canonical fixture, one response contract, and one stage registry. The reviewer should see exactly which skill ran, which evidence it read, why the stage is blocked, and which decision still belongs to a person.

## Deferred decisions

The investigation does not select a production web framework. Any Node.js framework that can keep the SDK server-side and stream HTTP responses can support this slice.

The project must later choose whether `STUDY-HLX-028` or `TOX-2025-0118-P` is the durable demo study. That choice requires regenerating the report claims, validation results, provenance, retrieval index, and UI copy from one source set.

A production system also needs a decision on identity, audit storage, electronic signatures, retention, and validated deterministic transforms. The Codex SDK and a skills plugin do not provide those regulated controls.
