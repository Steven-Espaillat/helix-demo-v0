import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { Codex } from "@openai/codex-sdk";

const require = createRequire(import.meta.url);
const codexCliPath = require.resolve("@openai/codex/bin/codex.js");
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const environmentKeys = [
  "ALL_PROXY",
  "COLORTERM",
  "HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOGNAME",
  "NODE_EXTRA_CA_CERTS",
  "NO_COLOR",
  "NO_PROXY",
  "PATH",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];
const skillNames = Object.freeze([
  "prepare-study",
  "extract-and-validate",
  "draft-report",
  "compile-evidence-and-gates",
  "prepare-human-release",
]);

export const HELIX_PLUGIN = Object.freeze({
  marketplaceName: "helix-local",
  pluginName: "helix-reporting",
  pluginId: "helix-reporting@helix-local",
  version: "0.1.0",
  skillNames,
});

export const HELIX_REPLAY_THREAD_OPTIONS = Object.freeze({
  sandboxMode: "read-only",
  approvalPolicy: "never",
  networkAccessEnabled: false,
  webSearchMode: "disabled",
});

export const HELIX_CODEX_CONFIG = Object.freeze({
  shell_environment_policy: Object.freeze({ inherit: "core" }),
});

function codexEnvironment(codexHome) {
  const environment = Object.fromEntries(
    environmentKeys
      .map((key) => [key, process.env[key]])
      .filter((entry) => typeof entry[1] === "string"),
  );

  if (codexHome !== undefined) {
    if (typeof codexHome !== "string" || !isAbsolute(codexHome)) {
      throw new TypeError("codexHome must be an absolute path");
    }
    environment.CODEX_HOME = codexHome;
  }

  return environment;
}

function runCodexCli(args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [codexCliPath, ...args], {
      cwd: projectRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`Codex plugin setup failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}

function parseCliJson(label, output) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Codex returned invalid JSON while ${label}`);
  }
}

export async function installHelixPlugin({ codexHome } = {}) {
  const environment = codexEnvironment(codexHome);
  if (codexHome !== undefined) {
    await mkdir(codexHome, { recursive: true });
  }

  const marketplace = parseCliJson(
    "adding the HELIX marketplace",
    await runCodexCli(["plugin", "marketplace", "add", projectRoot, "--json"], environment),
  );
  if (marketplace.marketplaceName !== HELIX_PLUGIN.marketplaceName) {
    throw new Error(`Codex added unexpected marketplace ${marketplace.marketplaceName}`);
  }

  const plugin = parseCliJson(
    "installing the HELIX plugin",
    await runCodexCli(["plugin", "add", HELIX_PLUGIN.pluginId, "--json"], environment),
  );
  if (plugin.pluginId !== HELIX_PLUGIN.pluginId) {
    throw new Error(`Codex installed unexpected plugin ${plugin.pluginId}`);
  }
  if (plugin.version !== HELIX_PLUGIN.version) {
    throw new Error(`Codex installed unexpected HELIX plugin version ${plugin.version}`);
  }

  return Object.freeze({
    marketplaceName: marketplace.marketplaceName,
    pluginId: plugin.pluginId,
    version: plugin.version,
  });
}

export async function createHelixCodex({ codexHome, apiKey, model } = {}) {
  const installation = await installHelixPlugin({ codexHome });
  const environment = codexEnvironment(codexHome);
  const resolvedApiKey = apiKey ?? process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
  const codex = new Codex({
    env: environment,
    config: HELIX_CODEX_CONFIG,
    ...(resolvedApiKey === undefined ? {} : { apiKey: resolvedApiKey }),
  });

  return Object.freeze({
    installation,
    startReplayThread() {
      return codex.startThread({
        ...HELIX_REPLAY_THREAD_OPTIONS,
        workingDirectory: projectRoot,
        ...(model === undefined ? {} : { model }),
      });
    },
  });
}
