import { readdirSync, readFileSync } from 'node:fs';

const issuesUrl = new URL('./issues/', import.meta.url);
const files = readdirSync(issuesUrl)
  .filter((name) => /^\d{2}-.*\.md$/.test(name))
  .sort();

const tickets = files.map((file) => {
  const body = readFileSync(new URL(file, issuesUrl), 'utf8');
  const heading = body.match(/^# (\d{2})\. (.+)$/m);
  const blockedBy = body.match(/^\*\*Blocked by:\*\* (.+)$/m)?.[1] ?? '';
  return {
    file,
    body,
    number: heading?.[1] ?? '',
    title: heading?.[2] ?? '',
    blockers: [...blockedBy.matchAll(/\b(\d{2})\./g)].map((match) => match[1])
  };
});

const checks = [];
const check = (name, passed) => checks.push([name, passed]);
const expectedNumbers = tickets.map((_, index) => String(index + 1).padStart(2, '0'));
const numbers = tickets.map((ticket) => ticket.number);

check('six ticket files exist', tickets.length === 6);
check('ticket numbers are contiguous', JSON.stringify(numbers) === JSON.stringify(expectedNumbers));
check('ticket numbers are unique', new Set(numbers).size === numbers.length);

for (const ticket of tickets) {
  check(`${ticket.file} has a numbered title`, ticket.number !== '' && ticket.title !== '');
  check(`${ticket.file} has What to build`, /^\*\*What to build:\*\* .+/m.test(ticket.body));
  check(`${ticket.file} has Blocked by`, /^\*\*Blocked by:\*\* .+/m.test(ticket.body));
  check(`${ticket.file} is ready-for-agent`, /^\*\*Status:\*\* ready-for-agent$/m.test(ticket.body));
  check(`${ticket.file} has acceptance criteria`, (ticket.body.match(/^- \[ \] /gm) ?? []).length >= 2);
  check(`${ticket.file} has no em dash`, !ticket.body.includes('—'));
  check(`${ticket.file} blockers precede it`, ticket.blockers.every((blocker) => blocker < ticket.number));
  check(`${ticket.file} blockers exist`, ticket.blockers.every((blocker) => numbers.includes(blocker)));
}

const allText = tickets.map((ticket) => ticket.body).join('\n');
const requiredCoverage = [
  'canonical synthetic bundle',
  'C-BW-HIGH',
  '286.2 g',
  'mean-v1',
  'ten ordered provenance edges',
  'VR-003',
  'VR-004',
  'VR-005',
  'VR-006',
  'Section 5 gate',
  'release gate',
  'five goal-oriented skills',
  'compile-evidence-and-gates',
  'stage registry',
  'structured-output contract',
  'unknown evidence reference',
  'unsafe SDK payload',
  'Reconnecting after completion',
  'no duplicate Codex turn',
  'MCP',
  'app-server support'
];

for (const text of requiredCoverage) {
  check(`tickets cover ${text}`, allText.includes(text));
}

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
