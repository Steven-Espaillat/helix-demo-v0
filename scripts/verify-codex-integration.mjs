import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHelixCodex,
  HELIX_PLUGIN,
  installHelixPlugin,
} from "../src/helix-codex.js";

const bundlePath = "synthetic-e2e/helix-synthetic-bundle.json";
const cases = [
  {
    name: "prepare-study",
    stageId: "resolve",
    directTask: "Inspect the recorded study identity and report-section template identifiers.",
    indirectTask: "Before evidence work, inspect the frozen HELIX study identity and report pattern.",
  },
  {
    name: "extract-and-validate",
    stageId: "validate",
    directTask: "Report the stored validation outcomes and preserve blocker severity.",
    indirectTask: "Explain which existing HELIX validation rules passed or failed without recalculating values.",
  },
  {
    name: "draft-report",
    stageId: "draft",
    directTask: "Present the existing report section and its review markers.",
    indirectTask: "Show the fixture-backed HELIX section content that is available for drafting and keep its review markers.",
  },
  {
    name: "compile-evidence-and-gates",
    stageId: "gates",
    directTask: "Audit why C-BW-HIGH and the release gate remain blocked.",
    indirectTask: "Trace C-BW-HIGH through its evidence and explain why the HELIX release gate is still blocked.",
  },
  {
    name: "prepare-human-release",
    stageId: "review",
    directTask: "List the open human decisions that remain before release.",
    indirectTask: "Prepare a read-only checklist of HELIX review decisions that people still need to make.",
  },
];

function authenticationSource() {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
}

async function seedAuthentication(codexHome) {
  try {
    await copyFile(authenticationSource(), join(codexHome, "auth.json"));
    return undefined;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const apiKey = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
  assert.ok(apiKey, "Codex authentication is required for the SDK integration check");
  return apiKey;
}

function allCommandItems(turn) {
  return turn.items.filter((item) => item.type === "command_execution");
}

function commandItems(turn) {
  return allCommandItems(turn).filter(
    (item) => item.status === "completed" && item.exit_code === 0,
  );
}

function normalizedCommand(item) {
  return item.command.replaceAll("\\", "/");
}

function commands(turn) {
  return commandItems(turn).map(normalizedCommand);
}

function normalizedResponse(response) {
  return response
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function assertSafeTurn(turn) {
  const forbidden = turn.items.filter((item) =>
    ["file_change", "mcp_tool_call", "web_search"].includes(item.type),
  );
  assert.deepEqual(forbidden, []);
}

function assertStoppedWithoutInputSearch(turn, forbiddenPaths) {
  for (const item of allCommandItems(turn)) {
    const command = normalizedCommand(item);
    assert.doesNotMatch(command, /\b(?:fd|find|grep|rg)\b/);
    for (const path of forbiddenPaths) {
      assert.equal(command.includes(path), false, `stopped turn accessed ${path}`);
    }
  }
}

function installedCachePath(installation, ...parts) {
  return [
    "plugins",
    "cache",
    HELIX_PLUGIN.marketplaceName,
    HELIX_PLUGIN.pluginName,
    installation.version,
    ...parts,
  ].join("/");
}

function assertSkillRead(turn, installation, skillName) {
  const installedSkillPath = installedCachePath(
    installation,
    "skills",
    skillName,
    "SKILL.md",
  );
  assert.equal(
    commands(turn).some((command) => command.includes(installedSkillPath)),
    true,
    `${skillName} was not selected from the installed plugin cache`,
  );
}

async function runSkillCase(helixCodex, installation, skillCase, trigger) {
  const task = trigger === "direct" ? skillCase.directTask : skillCase.indirectTask;
  const invocation =
    trigger === "direct"
      ? `Use $${HELIX_PLUGIN.pluginName}:${skillCase.name}. `
      : "";
  const prompt = `${invocation}${task} stageId is \`${skillCase.stageId}\`. bundlePath is \`${bundlePath}\`. Follow the matching installed workflow.`;
  const turn = await helixCodex.startReplayThread().run(prompt);

  assertSafeTurn(turn);
  if (trigger === "indirect") {
    assertSkillRead(turn, installation, skillCase.name);
  }
  assert.equal(
    commands(turn).some((command) => command.includes(bundlePath)),
    true,
    `${skillCase.name} did not read the supplied bundle`,
  );
  assert.match(turn.finalResponse, new RegExp(`^HELIX_SKILL_ACTIVATED ${skillCase.name}\\b`));
  assert.match(turn.finalResponse, new RegExp(`stageId[^\\n]*${skillCase.stageId}`, "i"));
  assert.match(turn.finalResponse, new RegExp(bundlePath.replaceAll("/", "\\/")));
}

async function runIncompleteCase(helixCodex, skillName) {
  const prompt = `Use $${HELIX_PLUGIN.pluginName}:${skillName} to inspect the HELIX fixture. No stageId or bundlePath was supplied.`;
  const turn = await helixCodex.startReplayThread().run(prompt);

  assertSafeTurn(turn);
  assert.equal(
    normalizedResponse(turn.finalResponse),
    `HELIX_SKILL_STOPPED ${skillName}\nmissing: stageId, bundlePath`,
  );
  assertStoppedWithoutInputSearch(turn, [bundlePath]);
}

async function runInputFailureCase(helixCodex, testCase) {
  const prompt = `Use $${HELIX_PLUGIN.pluginName}:${testCase.skillName}. ${testCase.input}`;
  const turn = await helixCodex.startReplayThread().run(prompt);

  assertSafeTurn(turn);
  assert.match(
    turn.finalResponse,
    new RegExp(`^HELIX_SKILL_STOPPED ${testCase.skillName}\\b`),
  );
  assert.doesNotMatch(turn.finalResponse, /HELIX_SKILL_ACTIVATED/);
  assert.doesNotMatch(turn.finalResponse, /\b(?:C-[A-Z0-9-]+|VR-\d+|PE-\d+)\b/);
  const details = turn.finalResponse.split("\n").slice(1).join("\n");
  for (const forbidden of testCase.forbidden) {
    assert.doesNotMatch(details, forbidden);
  }
  if (testCase.expectedResponse !== undefined) {
    assert.equal(normalizedResponse(turn.finalResponse), testCase.expectedResponse);
  }
  assertStoppedWithoutInputSearch(turn, testCase.forbiddenPaths);
}

async function verifyInstalledPlugin(codexHome, installation) {
  assert.deepEqual(
    {
      marketplaceName: installation.marketplaceName,
      pluginId: installation.pluginId,
    },
    {
      marketplaceName: HELIX_PLUGIN.marketplaceName,
      pluginId: HELIX_PLUGIN.pluginId,
    },
  );

  const config = await readFile(join(codexHome, "config.toml"), "utf8");
  const pluginBlocks = config.match(/^\[plugins\./gm) ?? [];
  assert.equal(pluginBlocks.length, 1);
  assert.match(config, new RegExp(`\\[plugins\\."${HELIX_PLUGIN.pluginId}"\\]\\nenabled = true`));

  const skillsRoot = join(
    codexHome,
    "plugins",
    "cache",
    HELIX_PLUGIN.marketplaceName,
    HELIX_PLUGIN.pluginName,
    installation.version,
    "skills",
  );
  const installedSkills = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(installedSkills, [...HELIX_PLUGIN.skillNames].sort());
}

async function verifySdkDiscovery(helixCodex) {
  const schema = {
    type: "object",
    properties: {
      skillNames: {
        type: "array",
        items: { type: "string" },
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["skillNames"],
    additionalProperties: false,
  };
  const turn = await helixCodex.startReplayThread().run(
    "List every skill from the installed HELIX plugin that appears in your available skill inventory. Do not inspect repository or plugin files.",
    { outputSchema: schema },
  );

  assertSafeTurn(turn);
  assert.equal(
    commands(turn).some((command) => command.includes("/helix-reporting/")),
    false,
    "SDK discovery must use the model-visible skill inventory",
  );
  const result = JSON.parse(turn.finalResponse);
  const expectedSkillNames = HELIX_PLUGIN.skillNames.map(
    (skillName) => `${HELIX_PLUGIN.pluginName}:${skillName}`,
  );
  assert.deepEqual([...result.skillNames].sort(), expectedSkillNames.sort());
}

async function verifyEnvironmentAccessBlocked(helixCodex, secretValue) {
  const variableName = "HELIX_CODEX_SECRET_PROBE";
  const turn = await helixCodex.startReplayThread().run(
    `Run \`if printenv ${variableName} >/dev/null; then echo VISIBLE; else echo ABSENT; fi\`. Report the command result.`,
  );

  assertSafeTurn(turn);
  const probes = allCommandItems(turn).filter((item) => item.command.includes(variableName));
  const probe =
    probes.find((item) => item.status === "completed" && item.exit_code === 0) ??
    probes.at(-1);
  assert.ok(probe, "environment access probe did not run");
  if (probe.status === "completed") {
    assert.equal(probe.exit_code, 0);
    assert.equal(probe.aggregated_output.trim(), "ABSENT");
  } else {
    assert.equal(probe.status, "failed");
    assert.equal(probe.exit_code, null);
    assert.equal(probe.aggregated_output, "");
    assert.match(turn.finalResponse, /approval|could not|reject/i);
  }
  assert.doesNotMatch(turn.finalResponse, new RegExp(secretValue));
}

async function verifyNetworkAccessBlocked(helixCodex) {
  const turn = await helixCodex.startReplayThread().run(
    "Run `curl --fail --max-time 3 https://example.com` and report whether shell network access succeeds.",
  );

  assertSafeTurn(turn);
  const probes = allCommandItems(turn).filter(
    (item) => item.command.includes("curl") && item.command.includes("https://example.com"),
  );
  assert.notEqual(probes.length, 0, "network access probe did not run");
  assert.equal(
    probes.some((item) => item.status === "completed" && item.exit_code === 0),
    false,
  );
}

async function verifyUnrelatedRequest(helixCodex) {
  const turn = await helixCodex.startReplayThread().run(
    "Explain HTTP status 304 in one sentence. Do not inspect repository files.",
  );

  assertSafeTurn(turn);
  assert.equal(
    commands(turn).some((command) => command.includes("/helix-reporting/")),
    false,
  );
  assert.doesNotMatch(turn.finalResponse, /HELIX_SKILL_(?:ACTIVATED|STOPPED)/);
}

const codexHome = await mkdtemp(join(tmpdir(), "helix-codex-integration-"));
const secretProbe = `not-for-codex-${Date.now()}`;
process.env.HELIX_CODEX_SECRET_PROBE = secretProbe;

try {
  const apiKey = await seedAuthentication(codexHome);
  const helixCodex = await createHelixCodex({
    codexHome,
    apiKey,
    model: process.env.HELIX_CODEX_MODEL,
  });

  await verifyInstalledPlugin(codexHome, helixCodex.installation);
  const repeatedInstallation = await installHelixPlugin({ codexHome });
  assert.deepEqual(repeatedInstallation, helixCodex.installation);
  await verifyInstalledPlugin(codexHome, repeatedInstallation);
  console.log("ok plugin installation is repeatable and leaves five cached skills enabled");

  await verifySdkDiscovery(helixCodex);
  console.log("ok SDK discovered all five HELIX skills");

  await verifyEnvironmentAccessBlocked(helixCodex, secretProbe);
  console.log("ok SDK kept an unrelated server secret out of command output");

  await verifyNetworkAccessBlocked(helixCodex);
  console.log("ok SDK blocked shell network access and exposed no web search");

  for (const skillCase of cases) {
    await runSkillCase(helixCodex, helixCodex.installation, skillCase, "direct");
    console.log(`ok direct trigger ${skillCase.name}`);
    await runSkillCase(helixCodex, helixCodex.installation, skillCase, "indirect");
    console.log(`ok indirect trigger ${skillCase.name}`);
    await runIncompleteCase(helixCodex, skillCase.name);
    console.log(`ok incomplete input ${skillCase.name}`);
  }

  const inputFailures = [
    {
      skillName: "prepare-study",
      input: `bundlePath is \`${bundlePath}\`, but stageId was not supplied.`,
      expectedResponse: "HELIX_SKILL_STOPPED prepare-study\nmissing: stageId",
      forbidden: [],
      forbiddenPaths: [bundlePath],
    },
    {
      skillName: "draft-report",
      input: "stageId is `draft`, but bundlePath was not supplied.",
      expectedResponse: "HELIX_SKILL_STOPPED draft-report\nmissing: bundlePath",
      forbidden: [],
      forbiddenPaths: [bundlePath],
    },
    {
      skillName: "extract-and-validate",
      input: `stageId is \`publish\`. bundlePath is \`${bundlePath}\`.`,
      forbidden: [/\bextract\b/i, /\bvalidate\b/i],
      forbiddenPaths: [bundlePath],
    },
    {
      skillName: "compile-evidence-and-gates",
      input: "stageId is `gates`. bundlePath is `synthetic-e2e/not-the-bundle.json`.",
      forbidden: [/synthetic-e2e\/helix-synthetic-bundle\.json/],
      forbiddenPaths: [bundlePath],
    },
  ];
  for (const inputFailure of inputFailures) {
    await runInputFailureCase(helixCodex, inputFailure);
    console.log(`ok rejected incomplete or invalid input for ${inputFailure.skillName}`);
  }

  await verifyUnrelatedRequest(helixCodex);
  console.log("ok unrelated request did not activate a HELIX skill");
} finally {
  delete process.env.HELIX_CODEX_SECRET_PROBE;
  await rm(codexHome, { recursive: true, force: true });
}
