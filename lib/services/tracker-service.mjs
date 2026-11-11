/**
 * lib/services/tracker-service.mjs — In-process service for tracker row status updates.
 *
 * Encapsulates the canonical, locked, validated, atomic read-modify-write workflow
 * for data/applications.md, status-log.tsv, and related hooks.
 * Both set-status.mjs (CLI) and web/src/app/api/status/route.ts (HTTP) delegate here.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';
import {
  extractTrackerReportNumbers,
  parseMarkdownLinks,
  soleMarkdownLink,
  resolveColumns,
  parseTrackerRow,
  normalizeTextKey,
  splitTrackerCells,
  trackerRowSeparator,
  trackerRowIdentity,
} from '../../tracker-parse.mjs';
import { roleFuzzyMatch } from '../../role-matcher.mjs';
import { localToday } from '../local-today.mjs';
import {
  resolveTrackerPath,
  writeFileAtomic,
  loadCanonicalStates,
  resolveCanonicalState,
  stripStatusDecoration,
  statusTextAfterDate,
  prependNote,
  hasNoteEntry,
  normalizeCompany,
  cell,
  CLI_EXIT,
  acquireTrackerLockForWriter,
  appendLedgerRows,
  companiesMatchIgnoringCorporateForm,
} from '../../tracker-utils.mjs';
import { getCareerOpsRoot, resolveTrackerPathForWrite } from '../../path-resolver.mjs';
import {
  claimStatusActivity,
  appendStatusTransition,
  statusLogPath,
  seedFollowupOnApplied,
  archiveJdOnInterview,
} from '../status-hooks.mjs';
import { parseStatusLog, replayObservations } from '../../funnel-velocity.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_CODE_ROOT = join(__dirname, '../../');

const { OK: EXIT_OK, USAGE: EXIT_USAGE, NOT_FOUND: EXIT_NOT_FOUND, AMBIGUOUS: EXIT_AMBIGUOUS } = CLI_EXIT;

export class TrackerServiceError extends Error {
  constructor(message, { code = 'error', exitCode = EXIT_USAGE, details = null } = {}) {
    super(message);
    this.name = 'TrackerServiceError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

// The only values a caller may pass as `source`. Exported so the CLI and any
// other entry point validate against this one set. 'agent' is not a writer
// source: it was never a real caller, and it would let an agent claim a write
// attributed to the agent ledger source (VALID_SOURCES in funnel-velocity.mjs).
export const WRITER_SOURCES = new Set(['set-status', 'web', 'reply-watch']);

function trackerIdList(value) {
  if (typeof value !== 'string' || !value.includes(',')) return null;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length < 2) return null;
  if (!parts.every((part) => part === '' || /^\d+$/.test(part))) return null;
  if (!parts.some((part) => /^\d+$/.test(part))) return null;
  return parts;
}

/**
 * Execute a status update or undo on the applications tracker in-process.
 *
 * @param {object} options
 * @returns {Promise<object>} Status update result payload
 */
export async function executeSetStatus(options = {}) {
  const codeRoot = options.codeRoot || DEFAULT_CODE_ROOT;
  const dataRoot = options.dataRoot || getCareerOpsRoot();
  const statesFile = join(codeRoot, 'templates/states.yml');

  const {
    selector: rawSelector = null,
    state: stateInput = null,
    row: rawRow = null,
    report: rawReport = null,
    reportLink: rawReportLink = null,
    role = null,
    note: rawNote = null,
    replaceNote: rawReplaceNote = null,
    on: eventDate = null,
    source: rawSource = 'set-status',
    quiet = false,
    json = false,
    force = false,
    dryRun = false,
    undo = false,
    repairStatusLog = false,
    repairFollowup = false,
    detachJdArchive = false,
    expectTracker = null,
    expectRow = null,
    expectStatus = null,
  } = options;

  const row = rawRow != null ? String(rawRow) : null;
  const report = rawReport != null ? String(rawReport) : null;
  const reportLink = rawReportLink != null ? String(rawReportLink) : null;
  const selector = rawSelector != null ? String(rawSelector) : null;
  const source = rawSource || 'set-status';

  if (!WRITER_SOURCES.has(source)) {
    throw new TrackerServiceError(`source expects one of ${[...WRITER_SOURCES].join(', ')}, got "${source}"`, {
      code: 'invalid-source',
      exitCode: EXIT_USAGE,
    });
  }

  if (row !== null && !/^\d+$/.test(row)) {
    throw new TrackerServiceError(`row expects a positive integer, got "${row}"`, {
      code: 'invalid-row',
      exitCode: EXIT_USAGE,
    });
  }
  if (report !== null && !/^\d+$/.test(report)) {
    throw new TrackerServiceError(`report expects a positive integer, got "${report}"`, {
      code: 'invalid-report',
      exitCode: EXIT_USAGE,
    });
  }
  if (reportLink !== null && !/^\d+$/.test(reportLink)) {
    throw new TrackerServiceError(`reportLink expects a positive integer, got "${reportLink}"`, {
      code: 'invalid-report-link',
      exitCode: EXIT_USAGE,
    });
  }

  if (expectTracker !== null && (expectTracker.length !== 64 || !/^[a-f0-9]{64}$/.test(expectTracker))) {
    throw new TrackerServiceError('expectTracker expects a lowercase SHA-256 hash (64 hex characters)', {
      code: 'invalid-hash',
      exitCode: EXIT_USAGE,
    });
  }
  if (expectRow !== null && (expectRow.length !== 64 || !/^[a-f0-9]{64}$/.test(expectRow))) {
    throw new TrackerServiceError('expectRow expects a lowercase SHA-256 hash (64 hex characters)', {
      code: 'invalid-hash',
      exitCode: EXIT_USAGE,
    });
  }

  const explicitSelector = row !== null || report !== null || reportLink !== null;
  if ([row, report, reportLink].filter((v) => v !== null).length > 1) {
    throw new TrackerServiceError('row, report and reportLink are mutually exclusive selectors', {
      code: 'conflicting-selectors',
      exitCode: EXIT_USAGE,
    });
  }

  if (!explicitSelector && selector === null) {
    throw new TrackerServiceError('Row selector required (row, report, reportLink, or company/id selector)', {
      code: 'missing-selector',
      exitCode: EXIT_USAGE,
    });
  }

  if (eventDate !== null) {
    const m = /^\d{4}-\d{2}-\d{2}$/.test(eventDate);
    const d = m ? new Date(`${eventDate}T00:00:00Z`) : null;
    const roundTrips = d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === eventDate;
    if (!roundTrips) {
      throw new TrackerServiceError(`on expects a real date as YYYY-MM-DD, got "${eventDate}"`, {
        code: 'invalid-date',
        exitCode: EXIT_USAGE,
      });
    }
    if (eventDate > localToday()) {
      throw new TrackerServiceError(`on date is in the future: "${eventDate}"`, {
        code: 'future-date',
        exitCode: EXIT_USAGE,
      });
    }
  }

  let states;
  try {
    states = loadCanonicalStates(statesFile);
  } catch (err) {
    throw new TrackerServiceError(`Cannot load canonical states from ${statesFile}: ${err.message}`, {
      code: 'states-error',
      exitCode: EXIT_USAGE,
    });
  }

  const requestedStatus = undo ? null : resolveCanonicalState(stateInput, states);
  if (!undo && !requestedStatus) {
    const valid = states.map((s) => s.label).join(' · ');
    throw new TrackerServiceError(`"${stateInput}" is not a canonical state. Valid states: ${valid}`, {
      code: 'invalid-state',
      exitCode: EXIT_USAGE,
    });
  }

  if (selector !== null) {
    const idList = trackerIdList(selector);
    if (idList) {
      // These numbers are tracker rows. A bare `14 Applied` is rejected when that
      // row's report id differs, so the command that means "tracker row" is --row.
      const nums = idList.filter((part) => /^\d+$/.test(part));
      const shown = nums.slice(0, 8);
      const action = undo ? '--undo' : requestedStatus;
      const lines = shown.map((id) => `node set-status.mjs --row ${id} ${action}`);
      const extra = nums.length - shown.length;
      const more = extra > 0 ? `\n... and ${extra} more` : '';
      const empty = idList.some((part) => part === '') ? ' The list has an empty slot.' : '';
      throw new TrackerServiceError(
        `set-status updates one row.${empty} Run one command per tracker number:\n${lines.join('\n')}${more}`,
        { code: 'usage', exitCode: EXIT_USAGE },
      );
    }
  }

  const appsFile = resolveTrackerPath(dataRoot);
  if (!existsSync(appsFile)) {
    const writePath = resolveTrackerPathForWrite(dataRoot);
    throw new TrackerServiceError(
      `No tracker found at ${writePath}. The tracker is created when you evaluate your first offer.`,
      { code: 'no-tracker', exitCode: EXIT_NOT_FOUND },
    );
  }

  const failWithService = (exitCode, code, message, details = null) => {
    throw new TrackerServiceError(message, { code, exitCode, details });
  };

  const lock = await acquireTrackerLockForWriter(appsFile, { dryRun, failWith: failWithService });
  try {
  let content;
  try {
    content = readFileSync(appsFile, 'utf-8');
  } catch (err) {
    throw new TrackerServiceError(`Cannot read tracker at ${appsFile}: ${err.message}`, {
      code: 'read-failure',
      exitCode: EXIT_NOT_FOUND,
    });
  }

  if (expectTracker !== null && createHash('sha256').update(content, 'utf8').digest('hex') !== expectTracker) {
    throw new TrackerServiceError('Tracker changed since review; review the current tracker before retrying', {
      code: 'tracker-changed',
      exitCode: EXIT_AMBIGUOUS,
    });
  }

  const lines = content.split('\n');
  const parseOptions = { allowTabs: true, allowIndentation: true };
  const colmap = resolveColumns(lines, parseOptions);

  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseTrackerRow(lines[i], colmap, parseOptions);
    if (r) rows.push({ ...r, lineIdx: i });
    else if (reportLink !== null && colmap.report != null) {
      const rep = splitTrackerCells(lines[i])[colmap.report] ?? '';
      if (parseMarkdownLinks(String(rep)).some((link) => link.label === reportLink)) {
        throw new TrackerServiceError(`Tracker row linking report #${reportLink} has missing cells`, {
          code: 'malformed-row',
          exitCode: EXIT_AMBIGUOUS,
        });
      }
    }
  }

  if (rows.length === 0) {
    throw new TrackerServiceError(`Tracker at ${appsFile} has no data rows`, {
      code: 'empty-tracker',
      exitCode: EXIT_NOT_FOUND,
    });
  }

  function resolveCandidates(matches, { notFound, ambiguous }) {
    if (matches.length === 0) {
      throw new TrackerServiceError(notFound, { code: 'not-found', exitCode: EXIT_NOT_FOUND });
    }
    if (matches.length > 1 && role) {
      const narrowed = matches.filter((r) => roleFuzzyMatch(r.role, role));
      if (narrowed.length === 1) return narrowed[0];
    }
    if (matches.length > 1) {
      const candidates = matches.map((r) => ({ num: r.num, company: r.company, role: r.role }));
      const listing = candidates.map((c) => `#${c.num}\t${c.company}\t${c.role}`).join('\n');
      throw new TrackerServiceError(ambiguous(matches.length, listing), {
        code: 'ambiguous',
        exitCode: EXIT_AMBIGUOUS,
        details: { candidates },
      });
    }
    return matches[0];
  }

  function resolveRow() {
    if (reportLink !== null) {
      const matches = [];
      for (const r of rows) {
        if (!parseMarkdownLinks(String(r.report ?? '')).some((link) => link.label === reportLink)) continue;
        if (!soleMarkdownLink(r.report)) {
          throw new TrackerServiceError(
            `Malformed Report cell for report #${reportLink}: expected exactly one report link`,
            { code: 'malformed-report', exitCode: EXIT_AMBIGUOUS },
          );
        }
        matches.push(r);
      }
      return resolveCandidates(matches, {
        notFound: `No tracker row has Report link #${reportLink}`,
        ambiguous: () => `Report #${reportLink} occurs in multiple tracker rows`,
      });
    }

    if (report !== null) {
      const num = parseInt(report, 10);
      return resolveCandidates(
        rows.filter((r) => extractTrackerReportNumbers(r.report, r.notes).includes(num)),
        {
          notFound: `No tracker row links report #${num}. (Report IDs and tracker row IDs differ — use --row N to select by tracker #.)`,
          ambiguous: (count, listing) =>
            `Report #${num} is linked by ${count} tracker rows — pass role to disambiguate:\n${listing}`,
        },
      );
    }

    const isBareNumericSelector = selector !== null && /^\d+$/.test(selector);
    if (row !== null || isBareNumericSelector) {
      const num = parseInt(row !== null ? row : selector, 10);
      return resolveCandidates(
        rows.filter((r) => r.num === num),
        {
          notFound: `No tracker row with #${num}`,
          ambiguous: (count, listing) =>
            `#${num} is a duplicate tracker number shared by ${count} rows — pass role to disambiguate:\n${listing}`,
        },
      );
    }

    const key = normalizeCompany(selector);
    if (!key) {
      throw new TrackerServiceError(`Selector "${selector}" is empty after normalization`, {
        code: 'empty-company',
        exitCode: EXIT_USAGE,
      });
    }
    let matches = rows.filter((r) => normalizeCompany(r.company) === key);
    if (matches.length === 0) {
      matches = rows.filter((r) => companiesMatchIgnoringCorporateForm(selector, r.company));
    }
    return resolveCandidates(matches, {
      notFound: `No tracker row with company matching "${selector}"`,
      ambiguous: (count, listing) =>
        `Company "${selector}" matches ${count} rows — pass the # or narrow with role:\n${listing}`,
    });
  }

  const target = resolveRow();

  const isBareNumericSelector = selector !== null && /^\d+$/.test(selector);
  if (isBareNumericSelector && !force) {
    const reportNums = extractTrackerReportNumbers(target.report, target.notes);
    const mismatched = reportNums.filter((num) => num !== target.num);
    if (mismatched.length > 0) {
      throw new TrackerServiceError(
        `Tracker #${target.num} points to report ID(s) ${reportNums.map((n) => `#${n}`).join(', ')}. ` +
          `Specify row or report explicitly.`,
        {
          code: 'report-number-mismatch',
          exitCode: EXIT_AMBIGUOUS,
          details: { trackerNum: target.num, reportNums },
        },
      );
    }
    if (reportNums.length === 0) {
      const num = parseInt(selector, 10);
      const linkers = rows.filter((r) => r !== target && extractTrackerReportNumbers(r.report, r.notes).includes(num));
      if (linkers.length > 0) {
        const listing = linkers.map((r) => `#${r.num}\t${r.company}\t${r.role}`).join('\n');
        throw new TrackerServiceError(
          `"${num}" is ambiguous: tracker row #${num} (${target.company} — ${target.role}) has no report, ` +
            `but report #${num} is linked by:\n${listing}\n` +
            `Say which you meant: --row ${num} (the row) or --report ${num} (the report).`,
          {
            code: 'report-number-ambiguous',
            exitCode: EXIT_AMBIGUOUS,
            details: {
              trackerNum: target.num,
              reportNum: num,
              linkedBy: linkers.map((r) => ({ num: r.num, company: r.company, role: r.role })),
            },
          },
        );
      }
    }
  }

  const normalizeRoleText = (s) =>
    normalizeTextKey(
      String(s ?? '')
        .normalize('NFKC')
        .replace(/\+\+/g, ' plusplus ')
        .replace(/#/g, ' sharp '),
      ' ',
    );

  const roleMatchesTarget =
    !role ||
    normalizeRoleText(target.role) === normalizeRoleText(role) ||
    roleFuzzyMatch(target.role, role);

  if (role && !force && !roleMatchesTarget) {
    throw new TrackerServiceError(
      `Tracker #${target.num} (${target.company}) is "${target.role}", which does not match role "${role}".`,
      {
        code: 'role-mismatch',
        exitCode: EXIT_AMBIGUOUS,
        details: { trackerNum: target.num, rowRole: target.role, requestedRole: role },
      },
    );
  }

  const oldStatus = target.status;
  const statusKey = (value) => resolveCanonicalState(value, states) ?? String(value ?? '').trim();
  const ledgerState = (value) => resolveCanonicalState(stripStatusDecoration(value), states) ?? '-';

  let undone = null;
  if (undo) {
    let ledger = '';
    try {
      ledger = readFileSync(statusLogPath(appsFile), 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new TrackerServiceError(`Cannot read status log: ${err.message}`, {
          code: 'read-failure',
          exitCode: EXIT_USAGE,
        });
      }
    }
    undone = replayObservations(parseStatusLog(ledger, states).observations).get(target.num)?.at(-1) ?? null;
    if (!undone) {
      throw new TrackerServiceError(`#${target.num} has no logged status change to undo`, {
        code: 'nothing-to-undo',
        exitCode: EXIT_NOT_FOUND,
      });
    }
    if (statusKey(oldStatus) !== undone.to) {
      throw new TrackerServiceError(
        `#${target.num} is ${oldStatus}, but its last logged change was to ${undone.to}.`,
        {
          code: 'undo-stale',
          exitCode: EXIT_AMBIGUOUS,
          details: { currentStatus: oldStatus, lastLogged: undone.to },
        },
      );
    }
    if (!undone.from) {
      throw new TrackerServiceError(
        `#${target.num}'s last logged change (to ${undone.to}) has no recorded prior status.`,
        { code: 'undo-unknown-prior', exitCode: EXIT_USAGE },
      );
    }
  }

  const newStatus = undone ? undone.from : requestedStatus;
  if (reportLink !== null && !resolveCanonicalState(oldStatus, states)) {
    throw new TrackerServiceError(
      `Tracker #${target.num} has an unrecognized current status: "${oldStatus}"`,
      { code: 'invalid-current-state', exitCode: EXIT_USAGE },
    );
  }

  if (expectRow !== null && trackerRowIdentity(target) !== expectRow) {
    throw new TrackerServiceError(`Tracker #${target.num} changed since review; review it again before retrying`, {
      code: 'row-changed',
      exitCode: EXIT_AMBIGUOUS,
    });
  }

  if (
    expectStatus !== null &&
    statusKey(oldStatus) !== newStatus &&
    statusKey(oldStatus) !== statusKey(expectStatus)
  ) {
    throw new TrackerServiceError(
      `Tracker #${target.num} is now ${oldStatus}, not ${expectStatus}; review it again before retrying`,
      {
        code: 'status-changed',
        exitCode: EXIT_AMBIGUOUS,
        details: { currentStatus: oldStatus },
      },
    );
  }

  const rawLine = lines[target.lineIdx];
  const separator = trackerRowSeparator(rawLine);
  const note = rawNote != null ? cell(separator === '\t' ? rawNote.replace(/\t/g, ' ') : rawNote) : null;
  const replacedNote = rawReplaceNote !== null ? cell(rawReplaceNote) : null;

  const releaseActivityClaim = dryRun ? () => {} : claimStatusActivity(target, `set-status → ${newStatus}`);

  let statusChanged = false;
  let noteChanged = false;
  let statusLogged = false;
  let statusLogRepaired = false;
  let statusLogRepair = null;

  try {
    const parts = splitTrackerCells(rawLine);
    while (parts.length <= Math.max(colmap.status, colmap.notes ?? 0)) parts.push('');

    const replaceCellValue = (index, value) => {
      const original = parts[index] ?? '';
      const trimmed = original.trim();
      if (trimmed) {
        const start = original.indexOf(trimmed);
        parts[index] = original.slice(0, start) + value + original.slice(start + trimmed.length);
      } else if (original.length >= 2) {
        const half = Math.floor(original.length / 2);
        parts[index] = original.slice(0, half) + value + original.slice(half);
      } else {
        parts[index] = ` ${value} `;
      }
    };

    statusChanged = parts[colmap.status].trim() !== newStatus;
    if (statusChanged) replaceCellValue(colmap.status, newStatus);

    if (statusChanged && colmap.notes != null && statusTextAfterDate(oldStatus)) {
      const kept = (parts[colmap.notes] ?? '').trim();
      const moved = oldStatus.trim();
      if (!hasNoteEntry(kept, moved)) replaceCellValue(colmap.notes, prependNote(kept, moved));
    }

    if (note) {
      if (colmap.notes == null) {
        throw new TrackerServiceError('Tracker has no Notes column — cannot apply note', {
          code: 'no-notes-column',
          exitCode: EXIT_USAGE,
        });
      }
      const existing = (parts[colmap.notes] ?? '').trim();
      if (replacedNote !== null) {
        const alternatives = [note, replacedNote]
          .sort((a, b) => b.length - a.length)
          .map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const wholeNotes = new RegExp(`(^|; )(${alternatives.join('|')})(?=; |$)`, 'g');
        let found = false;
        const updated = existing.replace(wholeNotes, (_match, prefix, entry) => {
          found = true;
          return prefix + (entry === replacedNote ? note : entry);
        });
        if (!found) {
          throw new TrackerServiceError(
            'Neither replaceNote nor note matches a whole note in the Notes cell',
            { code: 'replace-note-not-found', exitCode: EXIT_USAGE },
          );
        }
        replaceCellValue(colmap.notes, updated);
        noteChanged = updated !== existing;
      } else {
        if (!hasNoteEntry(existing, note)) {
          replaceCellValue(
            colmap.notes,
            existing && existing !== '—' && existing !== '-' ? `${existing}; ${note}` : note,
          );
          noteChanged = true;
        }
      }
    }

    if ((statusChanged || noteChanged) && !dryRun) {
      if (separator === '\t') {
        const closing = rawLine.trimEnd().endsWith('|');
        lines[target.lineIdx] =
          parts[0] +
          '|' +
          parts.slice(1, closing ? -1 : undefined).join('\t') +
          (closing ? '|' + parts.at(-1) : '');
      } else {
        lines[target.lineIdx] = parts.join('|');
      }
      try {
        writeFileAtomic(appsFile, lines.join('\n'));
      } catch (err) {
        throw new TrackerServiceError(`Cannot write tracker at ${appsFile}: ${err.message}`, {
          code: 'write-failure',
          exitCode: EXIT_USAGE,
        });
      }
    }

    if (undone && !dryRun) {
      statusLogged = appendStatusTransition(appsFile, {
        num: target.num,
        date: localToday(),
        from: '-',
        to: '-',
        source,
        note: `undo ${undone.from} → ${undone.to}`,
      });
      if (!statusLogged) {
        let restored = !statusChanged;
        if (statusChanged) {
          lines[target.lineIdx] = rawLine;
          try {
            writeFileAtomic(appsFile, lines.join('\n'));
            restored = true;
          } catch {
            /* reported below */
          }
        }
        throw new TrackerServiceError(
          restored
            ? `Could not log the undo for #${target.num}, so it stays ${oldStatus}`
            : `Could not log the undo for #${target.num}, and could not put it back to ${oldStatus}; it now reads ${newStatus}`,
          { code: 'undo-not-logged', exitCode: EXIT_USAGE },
        );
      }
    } else if (statusChanged && !dryRun) {
      statusLogged = appendStatusTransition(appsFile, {
        num: target.num,
        date: eventDate ?? localToday(),
        from: ledgerState(oldStatus),
        to: newStatus,
        source,
      });
    }

    if (repairStatusLog && !statusChanged && newStatus === 'Applied' && !dryRun) {
      const logPath = statusLogPath(appsFile);
      const timeline = [];
      let inspectionError = null;
      try {
        const log = readFileSync(logPath, 'utf-8');
        for (const line of log.split(/\r?\n/)) {
          const cells = line.trimEnd().split('\t');
          if (cells[0] !== String(target.num) || cells.length < 5) continue;
          const to = cells[3];
          const src = cells[4];
          if (to === '-') {
            timeline.pop();
          } else if (src === 'correction') {
            const index = timeline.map((entry) => entry.to).lastIndexOf(to);
            if (index >= 0) timeline[index] = { to, date: cells[1] };
            else timeline.push({ to, date: cells[1] });
          } else {
            timeline.push({ to, date: cells[1] });
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') inspectionError = err;
      }
      if (inspectionError) {
        statusLogRepair = { attempted: true, repaired: false, error: inspectionError.message };
      } else if (timeline.at(-1)?.to === 'Applied') {
        statusLogRepair = { attempted: true, repaired: false, reason: 'already-present' };
      } else if (timeline.length === 0) {
        statusLogRepair = { attempted: true, repaired: false, reason: 'no-history' };
      } else {
        const targetEventDate = eventDate ?? timeline.at(-1).date;
        if (!targetEventDate) {
          statusLogRepair = {
            attempted: true,
            repaired: false,
            error: 'status-log repair needs an event date',
          };
        } else {
          try {
            appendLedgerRows(logPath, `${target.num}\t${targetEventDate}\t-\tApplied\tcorrection\t\n`);
            statusLogged = true;
            statusLogRepaired = true;
            statusLogRepair = { attempted: true, repaired: true };
          } catch (err) {
            statusLogRepair = { attempted: true, repaired: false, error: err.message };
          }
        }
      }
    }
  } finally {
    releaseActivityClaim();
  }
  } finally {
  }

  const changed = statusChanged || noteChanged;

  let followupSeeded = null;
  if (!undone && (statusChanged || repairFollowup) && newStatus === 'Applied') {
    followupSeeded = await seedFollowupOnApplied(target.num, {
      trackerPath: appsFile,
      date: eventDate,
      statusChangeDate: statusChanged ? localToday() : undefined,
      dryRun,
      quiet: true,
    });
  }

  let jdArchiveTriggered = null;
  if (!undone && statusChanged && newStatus === 'Interview' && !dryRun) {
    jdArchiveTriggered = archiveJdOnInterview(target, {
      trackerPath: appsFile,
      detach: detachJdArchive,
      json: true,
    });
  }

  return {
    ok: true,
    changed,
    num: target.num,
    company: target.company,
    role: target.role,
    oldStatus,
    newStatus,
    ...(note != null ? { note } : {}),
    ...(replacedNote !== null ? { replacedNote } : {}),
    ...(dryRun ? { dryRun: true } : {}),
    ...(undone ? { undone: { from: undone.from, to: undone.to, date: undone.date } } : {}),
    ...(!undone && statusChanged && newStatus === 'Applied' ? { followupSeedCandidate: true } : {}),
    ...(followupSeeded ? { followupSeeded } : {}),
    ...(jdArchiveTriggered ? { jdArchiveTriggered } : {}),
    ...(statusChanged && !dryRun ? { statusLogged } : {}),
    ...(statusLogRepaired ? { statusLogRepaired } : {}),
    ...(statusLogRepair ? { statusLogRepair } : {}),
    tracker: appsFile,
  };
}

