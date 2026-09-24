import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { AUDIT_SELECTION_SCHEMA } from "../src/evidence-case.js";
import {
  HELIX_CODEX_CONFIG,
  HELIX_PLUGIN,
  HELIX_REPLAY_THREAD_OPTIONS,
} from "../src/helix-codex.js";

const root = new URL("../", import.meta.url);
const pluginRoot = new URL("../plugins/helix-reporting/", import.meta.url);
const expectedStages = {
  "prepare-study": ["authorize", "parse", "resolve"],
  "extract-and-validate": ["extract", "validate"],
  "draft-report": ["draft"],
  "compile-evidence-and-gates": ["provenance", "gates"],
  "prepare-human-release": ["review", "export"],
};

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

function frontmatter(source) {
  const match = source.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
  assert.ok(match, "skill frontmatter must contain name and description");
  return { name: match[1], description: match[2] };
}

describe("HELIX plugin package", () => {
  test("declares and enables one local plugin", async () => {
    const marketplace = JSON.parse(await text(".agents/plugins/marketplace.json"));
    const config = await text(".codex/config.toml");
    const manifest = JSON.parse(await readFile(new URL("plugin.json", pluginRoot), "utf8"));

    assert.equal(marketplace.name, HELIX_PLUGIN.marketplaceName);
    assert.equal(marketplace.plugins.length, 1);
    assert.deepEqual(
      {
        name: marketplace.plugins[0].name,
        source: marketplace.plugins[0].source,
      },
      {
        name: HELIX_PLUGIN.pluginName,
        source: { source: "local", path: "./plugins/helix-reporting" },
      },
    );
    assert.match(config, new RegExp(`\\[plugins\\."${HELIX_PLUGIN.pluginId}"\\]\\nenabled = true`));
    assert.equal(manifest.name, HELIX_PLUGIN.pluginName);
    assert.equal(manifest.version, HELIX_PLUGIN.version);
    assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  });

  test("contains exactly five goal-oriented skills for the ten stages", async () => {
    const entries = await readdir(new URL("skills/", pluginRoot), { withFileTypes: true });
    const skillDirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(skillDirectories, [...HELIX_PLUGIN.skillNames].sort());
    assert.equal(skillDirectories.length, 5);
    assert.deepEqual(Object.values(expectedStages).flat(), [
      "authorize",
      "parse",
      "resolve",
      "extract",
      "validate",
      "draft",
      "provenance",
      "gates",
      "review",
      "export",
    ]);

    for (const [skillName, stages] of Object.entries(expectedStages)) {
      const source = await readFile(new URL(`skills/${skillName}/SKILL.md`, pluginRoot), "utf8");
      const metadata = frontmatter(source);
      assert.equal(metadata.name, skillName);
      assert.match(metadata.description, /Use when/);
      assert.match(metadata.description, /Requires an explicit stage ID and bundle path\.$/);
      assert.match(source, /## Input boundary/);
      assert.match(source, /Require an explicit `stageId` and `bundlePath`/);
      assert.match(source, /synthetic-e2e\/helix-synthetic-bundle\.json/);
      assert.match(source, /A stopped run does not read the bundle or search for input/);
      assert.match(source, new RegExp(`HELIX_SKILL_STOPPED ${skillName}`));
      assert.match(source, new RegExp(`HELIX_SKILL_ACTIVATED ${skillName}`));
      for (const stage of stages) {
        assert.match(source, new RegExp(`\\b${stage}\\b`));
      }
      if (skillName === "compile-evidence-and-gates") {
        assert.match(source, /## Structured application mode/);
        assert.match(source, /`applicationMode` is `audit-selection-v1`/);
        for (const field of Object.keys(AUDIT_SELECTION_SCHEMA.properties)) {
          assert.equal(source.includes(`\`${field}\``), true);
        }
      }
    }
  });
});

describe("Codex replay boundary", () => {
  test("fixes the turn to read-only, no approvals, no network, and a core shell environment", () => {
    assert.deepEqual(HELIX_REPLAY_THREAD_OPTIONS, {
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    assert.deepEqual(HELIX_CODEX_CONFIG, {
      shell_environment_policy: { inherit: "core" },
    });
  });

  test("keeps the SDK and Codex session storage out of browser code", async () => {
    const browserFiles = [
      "src/render-workbench.js",
      "public/styles.css",
      "public/workbench.js",
    ];

    for (const path of browserFiles) {
      const source = await text(path);
      assert.doesNotMatch(source, /@openai\/codex-sdk|\.codex\/sessions|thread[_-]?id/i);
    }
  });
});
