---
name: draft-report
description: Inspect an existing HELIX report section and its review state. Use when a request asks to present fixture-backed section content or identify review markers for drafting. Requires an explicit stage ID and bundle path.
---

# Draft a report section

## Input boundary

Require an explicit `stageId` and `bundlePath` in the request. Accept only stage `draft` and bundle path `synthetic-e2e/helix-synthetic-bundle.json`.

Check both values before reading the bundle. If either value is missing, return only `HELIX_SKILL_STOPPED draft-report` followed by `missing: <comma-separated field names>` on the next line.

If a supplied value is invalid, start with `HELIX_SKILL_STOPPED draft-report`. Name only each invalid field and why its supplied value failed. Do not list replacements.

A stopped run does not read the bundle or search for input. A valid run reads only the named bundle. Report claims, paths, stages, and evidence references only when the bundle or the request contains them.

The only allowed stage ID is `draft`.

Report the existing section metadata, linked claims, and open review markers found in the bundle. Keep each value at its recorded grain and status. Distinguish source reconciliation from release readiness.

Start a valid result with `HELIX_SKILL_ACTIVATED draft-report`. Echo the accepted `stageId` and `bundlePath` before the findings. Never invent a value, rewrite a claim, or remove a review marker.
