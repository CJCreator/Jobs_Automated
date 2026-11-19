#!/usr/bin/env node

/**
 * set-status.mjs — canonical CLI to update a tracker row's status/note (#1428).
 *
 * data/applications.md is a shared surface with multiple readers and writers.
 * One canonical write path is safer than N agents hand-editing markdown, so
 * modes (apply Step 9, followup, batch) call this instead of editing the table.
 *
 * Usage:
 *   node set-status.mjs <tracker#|company> <state> [--note "..."] [--role "..."] [--force] [--dry-run] [--json]
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadCanonicalStates,
  resolveCanonicalState,
  cell,
  CLI_EXIT,
  makeCliFailWith,
  makeCliFailUsage,
} from './tracker-utils.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { executeSetStatus, TrackerServiceError, WRITER_SOURCES } from './lib/services/tracker-service.mjs';

const CODE_ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = getCareerOpsRoot();
const STATES_FILE = join(CODE_ROOT, 'templates/states.yml');

const { OK: EXIT_OK, USAGE: EXIT_USAGE } = CLI_EXIT;

const USAGE = `Usage: node set-status.mjs <tracker#|company> <state> [--note "..."] [--role "..."] [--on YYYY-MM-DD] [--force] [--dry-run] [--json]
       node set-status.mjs --row N <state> [...]        (explicit tracker row ID)
       node set-status.mjs --report N <state> [...]     (explicit report ID)
       node set-status.mjs --report-link N <state> [...] (strict Report-cell identity)
       node set-status.mjs <tracker#|company> --undo [--dry-run] [--json]

  <tracker#|company> Row selector: tracker # (exact) or company name (normalized match)
                     A list such as 14,78 is not a company. Run one command per row.
  <state>            Canonical state from templates/states.yml (aliases accepted)
  --row N            Select by tracker # explicitly (unambiguous; skips the mismatch guard)
  --report N         Select the row whose Report cell links report #N
  --report-link N    Select an exact numeric Report link; reject malformed cells
                     and unknown current states (used by the dashboard)
  --note "..."       Append to the Notes cell ("; "-separated, idempotent)
  --note=VALUE       Pass a literal note, including text beginning with --
  --replace-note "OLD" Replace whole OLD notes with --note text; fail if neither is present
  --role "..."       Disambiguate when several rows share the company (fuzzy match)
  --on YYYY-MM-DD    Real event date for the status-log entry (defaults to today —
                     pass it when the transition happened earlier than it's recorded)
  --source NAME      Attribution for the transition ledger: set-status (default)
                     or web (a caller delegating to this script)
  --expect-tracker HASH  Require the tracker's exact UTF-8 content to match this
                     lowercase SHA-256 hash; checked under the writer lock
  --expect-row HASH  Require the selected row, every cell but Status, to match this
                     hash (trackerRowIdentity in tracker-parse.mjs); checked under
                     the writer lock
  --expect-status STATE  Require the row's current status to be STATE, unless it
                     is already <state>; checked under the writer lock
  --undo             Take back the row's last logged status change: restore the
                     prior status and retract the change from status-log.tsv.
                     Replaces <state>
  --force            Allow a numeric selector despite a report-link mismatch, or despite a
                     report-less row whose number another row claims as its report link
  --dry-run          Resolve and validate, but write nothing
  --repair-status-log  On an idempotent Applied retry, repair a missing ledger observation
  --repair-followup  On an idempotent Applied retry, repair a missing follow-up pin
  --detach-jd-archive  On a transition into Interview, start the JD archive in the
                     background instead of waiting for it (used by the web UI
                     and the dashboard, whose status calls time out at 30s)
  --json             Machine-readable output on stdout (errors included)

  Tracker row IDs and report IDs are separate counters that diverge permanently
  once any row exists without a report. Prefer --row/--report (or the company
  name) over a bare number, and prefer any of them over --force.

Examples:
  node set-status.mjs --report 12 Applied
  node set-status.mjs --report 12 Interview --note "recruiter screen booked"
  node set-status.mjs "Acme Corp" Rejected --on 2026-08-01
  node set-status.mjs "Acme Corp" Applied --role "Platform Engineer"
  node set-status.mjs --row 7 Discarded --dry-run
  node set-status.mjs --row 7 --undo`;

function renderStatesSection() {
  let states;
  try {
    states = loadCanonicalStates(STATES_FILE);
  } catch {
    return `\nCanonical states: see ${STATES_FILE}`;
  }
  if (!states.length) return `\nCanonical states: see ${STATES_FILE}`;
  const width = Math.max(...states.map(st => st.label.length));
  const lines = states.map((st) => {
    const terminal = st.terminal ? '  (terminal)' : '';
    const desc = st.description ? `  ${st.description}` : '';
    return `  ${st.label.padEnd(width)}${desc}${terminal}`;
  });
  return [
    '',
    'Canonical states (aliases also accepted — see templates/states.yml):',
    ...lines,
    '',
    '  A terminal state ends the application. Discarded is YOUR decision or a',
    '  closed req; Rejected is theirs; SKIP means never applied for.',
  ].join('\n');
}

// ── argument parsing ─────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const positional = [];
const flags = {
  note: null,
  replaceNote: null,
  role: null,
  on: null,
  row: null,
  report: null,
  reportLink: null,
  source: null,
  force: false,
  dryRun: false,
  undo: false,
  repairStatusLog: false,
  repairFollowup: false,
  detachJdArchive: false,
  json: false,
  expectTracker: null,
  expectRow: null,
  expectStatus: null,
};
const VALUE_FLAGS = {
  '--note': 'note',
  '--replace-note': 'replaceNote',
  '--role': 'role',
  '--on': 'on',
  '--row': 'row',
  '--report': 'report',
  '--report-link': 'reportLink',
  '--source': 'source',
  '--expect-tracker': 'expectTracker',
  '--expect-row': 'expectRow',
  '--expect-status': 'expectStatus',
};

function wantsHelp(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (Object.hasOwn(VALUE_FLAGS, a)) { i++; continue; }
    if (a === '--help' || a === '-h') return true;
  }
  return false;
}

if (wantsHelp(rawArgs)) {
  console.log(`${USAGE}\n${renderStatesSection()}`);
  process.exit(EXIT_OK);
}

const failUsage = makeCliFailUsage({
  argv: rawArgs,
  usage: USAGE,
  defaultMessage: 'Expected 2 arguments: <tracker#|company> <state>',
});

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith('--note=')) {
    flags.note = a.slice('--note='.length);
  } else if (a in VALUE_FLAGS) {
    const value = rawArgs[i + 1];
    if (value === undefined || value.startsWith('--')) {
      failUsage(`Missing value for ${a}`);
    }
    if ((a === '--row' || a === '--report' || a === '--report-link') && !/^\d+$/.test(value)) {
      failUsage(`${a} expects a positive integer, got "${value}"`);
    }
    if (a === '--source' && !WRITER_SOURCES.has(value)) {
      failUsage(`--source expects one of ${[...WRITER_SOURCES].join(', ')}, got "${value}"`);
    }
    if ((a === '--expect-tracker' || a === '--expect-row') && (value.length !== 64 || !/^[a-f0-9]{64}$/.test(value))) {
      failUsage(`${a} expects a lowercase SHA-256 hash (64 hex characters)`);
    }
    flags[VALUE_FLAGS[a]] = value;
    i++;
  } else if (a === '--force') { flags.force = true; }
  else if (a === '--dry-run') { flags.dryRun = true; }
  else if (a === '--undo') { flags.undo = true; }
  else if (a === '--repair-status-log') { flags.repairStatusLog = true; }
  else if (a === '--repair-followup') { flags.repairFollowup = true; }
  else if (a === '--detach-jd-archive') { flags.detachJdArchive = true; }
  else if (a === '--json') { flags.json = true; }
  else if (a === '-h' || a.startsWith('--')) { failUsage(`Unknown flag: ${a}`); }
  else { positional.push(a); }
}

if (flags.replaceNote !== null && (!cell(flags.replaceNote) || flags.note === null || !cell(flags.note))) {
  failUsage('--replace-note requires non-empty OLD and --note NEW values');
}

if ([flags.row, flags.report, flags.reportLink].filter(value => value !== null).length > 1) {
  failUsage('--row, --report and --report-link are mutually exclusive selectors');
}
const explicitSelector = flags.row !== null || flags.report !== null || flags.reportLink !== null;

if (flags.undo) {
  const conflicting = [
    [flags.note !== null, '--note'], [flags.replaceNote !== null, '--replace-note'], [flags.on !== null, '--on'],
    [flags.repairStatusLog, '--repair-status-log'], [flags.repairFollowup, '--repair-followup'],
  ].filter(([set]) => set).map(([, name]) => name);
  if (conflicting.length) failUsage(`--undo cannot be combined with ${conflicting.join(', ')}`);
  if (positional.length !== (explicitSelector ? 0 : 1)) {
    failUsage('--undo takes the row selector only, not a state');
  }
} else if (explicitSelector) {
  if (positional.length !== 1) {
    failUsage(positional.length === 0
      ? `Expected the state after ${flags.row !== null ? '--row' : flags.report !== null ? '--report' : '--report-link'}`
      : `With ${flags.row !== null ? '--row' : flags.report !== null ? '--report' : '--report-link'} the only positional argument is the state, got ${positional.length}`);
  }
} else if (positional.length !== 2) {
  failUsage(positional.length === 0 ? null : `Expected 2 arguments (selector, state), got ${positional.length}`);
}

const selector = explicitSelector ? null : positional[0];
const stateInput = explicitSelector ? positional[0] : positional[1];

const failWith = makeCliFailWith(flags.json);

let states;
try {
  states = loadCanonicalStates(STATES_FILE);
} catch (err) {
  failWith(EXIT_USAGE, 'states-error', `Cannot load canonical states from ${STATES_FILE}: ${err.message}`);
}

let result;
try {
  result = await executeSetStatus({
    selector,
    state: stateInput,
    row: flags.row,
    report: flags.report,
    reportLink: flags.reportLink,
    role: flags.role,
    note: flags.note,
    replaceNote: flags.replaceNote,
    on: flags.on,
    source: flags.source ?? 'set-status',
    // Machine output owns stdout: the follow-up and archive progress lines stay off it.
    quiet: flags.json,
    json: flags.json,
    force: flags.force,
    dryRun: flags.dryRun,
    undo: flags.undo,
    repairStatusLog: flags.repairStatusLog,
    repairFollowup: flags.repairFollowup,
    detachJdArchive: flags.detachJdArchive,
    expectTracker: flags.expectTracker,
    expectRow: flags.expectRow,
    expectStatus: flags.expectStatus,
    codeRoot: CODE_ROOT,
    dataRoot: DATA_ROOT,
  });
} catch (err) {
  if (err instanceof TrackerServiceError) {
    failWith(err.exitCode, err.code, err.message, err.details);
  }
  failWith(EXIT_USAGE, 'unexpected-error', err.message);
}

const oldLabel = resolveCanonicalState(result.oldStatus, states);
if (!flags.undo && result.statusChanged && !flags.dryRun && states.find(s => s.label === oldLabel)?.terminal) {
  console.warn(`⚠ #${result.num} was ${oldLabel}, a terminal state. Reopened as ${result.newStatus}.`);
}

if (flags.json) {
  const jsonOutput = { ...result };
  delete jsonOutput.ok;
  console.log(JSON.stringify(jsonOutput, null, 2));
} else {
  const verb = flags.undo ? (flags.dryRun ? 'would undo' : 'undid') : flags.dryRun ? 'would set' : result.changed ? 'set' : 'already';
  console.log(`✅ #${result.num} ${result.company} — ${result.role}: ${verb} ${result.oldStatus} → ${result.newStatus}${result.note ? ` (note: ${result.note})` : ''}`);
  if (!flags.undo && result.statusChanged && !flags.dryRun && result.newStatus === 'Applied' && !result.followupSeeded?.seeded && result.followupSeeded?.reason !== 'disabled') {
    console.error('ℹ️  Status is Applied — consider seeding follow-ups in data/follow-ups.md (#1430: node followup-cadence.mjs)');
  }
}
process.exit(EXIT_OK);
