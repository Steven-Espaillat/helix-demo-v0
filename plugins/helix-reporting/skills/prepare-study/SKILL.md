---
name: prepare-study
description: Prepare a HELIX study for source authorization, input parsing, or study resolution. Use when a request asks to inspect the frozen manifest, normalized study identity, or report pattern before evidence work. Requires an explicit stage ID and bundle path.
---

# Prepare a HELIX study

## Input boundary

Require an explicit `stageId` and `bundlePath` in the request. Accept only a stage listed below and bundle path `synthetic-e2e/helix-synthetic-bundle.json`.

Check both values before reading the bundle. If either value is missing, return only `HELIX_SKILL_STOPPED prepare-study` followed by `missing: <comma-separated field names>` on the next line.

If a supplied value is invalid, start with `HELIX_SKILL_STOPPED prepare-study`. Name only each invalid field and why its supplied value failed. Do not list replacements.

A stopped run does not read the bundle or search for input. A valid run reads only the named bundle. Report claims, paths, stages, and evidence references only when the bundle or the request contains them.

Allowed stage IDs:

- `authorize`
- `parse`
- `resolve`

For `authorize`, inspect the frozen manifest and report its recorded lock state. Leave source authorization as a human action.

For `parse`, describe the normalized record collections that already exist in the bundle. Do not create or replace normalized records.

For `resolve`, report the recorded study identity and the report-section template identifiers. Do not select a different study or report pattern.

Start a valid result with `HELIX_SKILL_ACTIVATED prepare-study`. Echo the accepted `stageId` and `bundlePath` before the findings. Never authorize a source on a person's behalf.
