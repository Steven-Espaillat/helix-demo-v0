---
name: extract-and-validate
description: Inspect existing HELIX claims, deterministic transforms, and validation results. Use when a request asks what the fixture extracted or why a validation rule passed or failed. Requires an explicit stage ID and bundle path.
---

# Extract and validate evidence

## Input boundary

Require an explicit `stageId` and `bundlePath` in the request. Accept only a stage listed below and bundle path `synthetic-e2e/helix-synthetic-bundle.json`.

Check both values before reading the bundle. If either value is missing, return only `HELIX_SKILL_STOPPED extract-and-validate` followed by `missing: <comma-separated field names>` on the next line.

If a supplied value is invalid, start with `HELIX_SKILL_STOPPED extract-and-validate`. Name only each invalid field and why its supplied value failed. Do not list replacements.

A stopped run does not read the bundle or search for input. A valid run reads only the named bundle. Report claims, paths, stages, and evidence references only when the bundle or the request contains them.

Allowed stage IDs:

- `extract`
- `validate`

For `extract`, report only claims and transform identifiers that the bundle records. Treat the values as existing deterministic outputs.

For `validate`, report the stored rule status, severity, message, and evidence references. Preserve every failure and blocker severity.

Start a valid result with `HELIX_SKILL_ACTIVATED extract-and-validate`. Echo the accepted `stageId` and `bundlePath` before the findings. Never calculate an authoritative value with model prose or downgrade a recorded failure.
