import { readFileSync } from 'node:fs';

const spec = readFileSync(new URL('./spec.md', import.meta.url), 'utf8');
const bundle = JSON.parse(readFileSync(new URL('../../synthetic-e2e/helix-synthetic-bundle.json', import.meta.url), 'utf8'));

const claim = bundle.claims.find((item) => item.claim_id === 'C-BW-HIGH');
const edges = bundle.provenance_edges.filter((item) => item.claim_id === 'C-BW-HIGH');
const vr003 = bundle.validation_results.find((item) => item.result_id === 'VR-003');
const vr004 = bundle.validation_results.find((item) => item.result_id === 'VR-004');
const sectionGate = bundle.gate_decisions.find((item) => item.gate_id === 'GATE-SECTION-S5');
const releaseGate = bundle.gate_decisions.find((item) => item.gate_id === 'GATE-RELEASE');
const recordCount = Object.values(bundle.records).reduce((total, records) => total + records.length, 0);
const blockerIds = ['VR-004', 'VR-005', 'VR-006'];
let record2638 = null;
for (const collection of Object.values(bundle.records)) {
  for (const record of collection) {
    if (record.value === 263.8) record2638 = record;
  }
}

const requiredText = [
  'Status: ready-for-agent',
  '## Problem Statement',
  '## Solution',
  '## User Stories',
  '## Implementation Decisions',
  '## Testing Decisions',
  '## Out of Scope',
  '## Further Notes',
  'C-BW-HIGH',
  '286.2 g',
  'VR-003',
  'VR-004',
  'EvidenceCase contract',
  'Status semantics',
  'Fixture invariants',
  'UI event allowlist',
  'Failure matrix',
  'approval and export controls as disabled or absent',
  'MCP server support',
  'Codex app-server support'
];

const checks = [];
for (const text of requiredText) checks.push([`spec contains ${text}`, spec.includes(text)]);
checks.push(['spec contains no em dash', !spec.includes('—')]);
checks.push(['workflow state is gated', bundle.workflow_state === 'gated']);
checks.push(['manifest has ten frozen inputs', bundle.manifest.length === 10 && bundle.manifest.every((item) => item.locked)]);
checks.push(['normalized collections contain 1,662 records', recordCount === 1662]);
checks.push(['fixture has three claims', bundle.claims.length === 3]);
checks.push(['fixture has fourteen provenance edges', bundle.provenance_edges.length === 14]);
checks.push(['claim value is 286.2', claim?.value === 286.2]);
checks.push(['claim unit is g', claim?.unit === 'g']);
checks.push(['claim status is validated', claim?.status === 'validated']);
checks.push(['C-BW-HIGH has ten provenance edges', edges.length === 10]);
checks.push(['C-BW-HIGH uses mean-v1', edges.length > 0 && edges.every((edge) => edge.transform_id === 'mean-v1')]);
checks.push(['VR-003 passes', vr003?.status === 'pass']);
checks.push(['VR-003 cites ten evidence edges', vr003?.evidence_ids?.length === 10]);
checks.push(['VR-004 fails', vr004?.status === 'fail']);
checks.push(['VR-004 is a blocker', vr004?.severity === 'blocker']);
checks.push(['VR-004 cites C-BW-HIGH', vr004?.evidence_ids?.includes('C-BW-HIGH')]);
checks.push(['Section 5 gate is blocked by VR-004', sectionGate?.status === 'blocked' && sectionGate?.blocking_result_ids?.length === 1 && sectionGate.blocking_result_ids[0] === 'VR-004']);
checks.push(['release gate is blocked', releaseGate?.status === 'blocked']);
checks.push(['release gate has all three blockers', blockerIds.every((id) => releaseGate?.blocking_result_ids?.includes(id))]);
checks.push(['blocker review dispositions are open', blockerIds.every((id) => bundle.review_dispositions.some((item) => item.result_id === id && item.decision === 'open'))]);
checks.push(['export artifacts are pending without checksums', bundle.export_artifacts.length > 0 && bundle.export_artifacts.every((item) => item.status === 'pending' && item.checksum === null)]);
checks.push(['263.8 is an animal-day record', record2638?.grain === 'animal_x_day']);
checks.push(['263.8 is not C-BW-HIGH', claim?.value !== record2638?.value]);

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
