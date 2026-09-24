---
name: prepare-human-release
description: Prepare a read-only HELIX human-review or export-readiness checklist. Use when a request asks which review decisions or pending export artifacts remain before release. Requires an explicit stage ID and bundle path.
---

# Prepare human release

## Input boundary

Require an explicit `stageId` and `bundlePath` in the request. Accept only a stage listed below and bundle path `synthetic-e2e/helix-synthetic-bundle.json`.

Check both values before reading the bundle. If either value is missing, return only `HELIX_SKILL_STOPPED prepare-human-release` followed by `missing: <comma-separated field names>` on the next line.

If a supplied value is invalid, start with `HELIX_SKILL_STOPPED prepare-human-release`. Name only each invalid field and why its supplied value failed. Do not list replacements.

A stopped run does not read the bundle or search for input. A valid run reads only the named bundle. Report claims, paths, stages, and evidence references only when the bundle or the request contains them.

Allowed stage IDs:

- `review`
- `export`

For `review`, list recorded open dispositions and the human decisions they require.

For `export`, list pending export artifacts and their recorded checksum status. Describe them as planned outputs only.

Start a valid result with `HELIX_SKILL_ACTIVATED prepare-human-release`. Echo the accepted `stageId` and `bundlePath` before the findings. Never sign, approve, create a checksum, or export an artifact.
