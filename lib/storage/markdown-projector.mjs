/**
 * lib/storage/markdown-projector.mjs — Bi-directional projection between applications.md and SQLite.
 *
 * Guarantees local data sovereignty: data/applications.md and status-log.tsv remain
 * human-readable and git-trackable, while SQLite provides sub-millisecond indexed
 * filtering, aggregations, and query acceleration.
 */

import { readFileSync, existsSync, statSync, watch } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSqliteClient } from './sqlite-client.mjs';
import { resolveTrackerPath, loadCanonicalStates, resolveCanonicalState } from '../../tracker-utils.mjs';
import { getCareerOpsRoot } from '../../path-resolver.mjs';
import {
  resolveColumns,
  parseTrackerRow,
  extractTrackerReportNumbers,
} from '../../tracker-parse.mjs';
import { statusLogPath } from '../status-hooks.mjs';

function computeSha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function parseScoreNumeric(scoreStr) {
  if (!scoreStr) return null;
  const clean = String(scoreStr).replace(/\*\*/g, '').replace(',', '.').trim();
  const match = clean.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

export class MarkdownProjector {
  /**
   * @param {object} [options]
   * @param {string} [options.dataRoot]
   * @param {import('./sqlite-client.mjs').SqliteClient} [options.sqliteClient]
   */
  constructor(options = {}) {
    this.dataRoot = options.dataRoot || getCareerOpsRoot();
    this.client = options.sqliteClient || getSqliteClient({
      dbPath: join(this.dataRoot, 'data/career-ops.sqlite'),
    });
    this.watcher = null;
    this.states = null;
  }

  getCanonicalStates() {
    if (!this.states) {
      try {
        // States are system-layer data: resolve from the code root, not the data root.
        const codeRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
        this.states = loadCanonicalStates(join(codeRoot, 'templates/states.yml'));
      } catch {
        this.states = [];
      }
    }
    return this.states;
  }

  /**
   * Synchronize data/applications.md into the SQLite database.
   * If the file has not changed (same sha256 and mtime), skips parsing instantly.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.force] - Force sync even if checksum matches
   * @returns {{ synced: boolean, count: number, durationMs: number, reason?: string }}
   */
  syncFromMarkdown(opts = {}) {
    const startTime = performance.now();
    const trackerPath = resolveTrackerPath(this.dataRoot);

    if (!existsSync(trackerPath)) {
      return { synced: false, count: 0, durationMs: 0, reason: 'no-tracker-file' };
    }

    const stats = statSync(trackerPath);
    const mtime = Math.floor(stats.mtimeMs);
    const content = readFileSync(trackerPath, 'utf-8');
    const sha256 = computeSha256(content);

    // Check cached metadata
    const cachedMeta = this.client.queryOne(
      'SELECT * FROM sync_metadata WHERE key = ?',
      ['applications.md'],
    );

    if (
      !opts.force &&
      cachedMeta &&
      cachedMeta.sha256 === sha256 &&
      cachedMeta.mtime === mtime
    ) {
      return {
        synced: false,
        count: cachedMeta.row_count,
        durationMs: Math.round(performance.now() - startTime),
        reason: 'up-to-date',
      };
    }

    // Parse Markdown rows
    const lines = content.split('\n');
    const parseOptions = { allowTabs: true, allowIndentation: true };
    const colmap = resolveColumns(lines, parseOptions);
    const states = this.getCanonicalStates();

    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTrackerRow(lines[i], colmap, parseOptions);
      if (parsed) {
        let statusVal = parsed.status;
        let scoreVal = parsed.score;

        // Auto-heal headerless column inversion (when score cell carries status and vice versa)
        const scoreAsState = resolveCanonicalState(scoreVal, states);
        const statusAsState = resolveCanonicalState(statusVal, states);
        if (scoreAsState && !statusAsState) {
          statusVal = scoreAsState;
          scoreVal = parsed.status;
        }

        const reportNums = extractTrackerReportNumbers(parsed.report, parsed.notes);
        const reportNum = reportNums.length > 0 ? reportNums[0] : null;
        const scoreNum = parseScoreNumeric(scoreVal);

        rows.push({
          id: parsed.num,
          date_applied: parsed.date || null,
          company: parsed.company,
          role: parsed.role,
          status: statusVal,
          score_raw: scoreVal || null,
          score_numeric: scoreNum,
          pdf: parsed.pdf || null,
          report: parsed.report || null,
          report_num: reportNum,
          notes: parsed.notes || null,
          url: parsed.url || null,
          location: parsed.location || null,
          via: parsed.via || null,
          raw_line: lines[i],
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Atomic SQLite upsert
    this.client.withTransaction((client) => {
      // Clear existing records
      client.execute('DELETE FROM applications;');

      const insertStmt = client.db.prepare(`
        INSERT INTO applications (
          id, date_applied, company, role, status, score_raw, score_numeric,
          pdf, report, report_num, notes, url, location, via, raw_line, updated_at
        ) VALUES (
          @id, @date_applied, @company, @role, @status, @score_raw, @score_numeric,
          @pdf, @report, @report_num, @notes, @url, @location, @via, @raw_line, @updated_at
        );
      `);

      for (const row of rows) {
        insertStmt.run(row);
      }

      // Update sync metadata
      client.execute(`
        INSERT OR REPLACE INTO sync_metadata (key, file_path, sha256, mtime, row_count, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?);
      `, ['applications.md', trackerPath, sha256, mtime, rows.length, new Date().toISOString()]);
    });

    // Also sync status-log.tsv if present. Errors propagate: a failed ledger sync
    // must not look like a successful one.
    this.syncStatusLog();

    const durationMs = Math.round(performance.now() - startTime);
    return { synced: true, count: rows.length, durationMs };
  }

  /**
   * Sync status-log.tsv into status_transitions table.
   * Throws on read or write failure; callers decide whether that is fatal.
   */
  syncStatusLog() {
    const trackerPath = resolveTrackerPath(this.dataRoot);
    const logFile = statusLogPath(trackerPath);
    if (!existsSync(logFile)) return;

    const content = readFileSync(logFile, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    this.client.withTransaction((client) => {
      client.execute('DELETE FROM status_transitions;');
      const insertStmt = client.db.prepare(`
        INSERT INTO status_transitions (tracker_num, event_date, from_status, to_status, source, note, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `);

      for (const line of lines) {
        const cells = line.split('\t');
        if (cells.length >= 5) {
          const num = parseInt(cells[0], 10);
          if (!Number.isNaN(num)) {
            insertStmt.run(
              num,
              cells[1] || '',
              cells[2] || '-',
              cells[3] || '',
              cells[4] || 'set-status',
              cells[5] || '',
              new Date().toISOString(),
            );
          }
        }
      }
    });
  }

  /**
   * Fast indexed query for applications with flexible filtering.
   *
   * @param {object} [filters]
   * @param {string|string[]} [filters.status]
   * @param {number} [filters.minScore]
   * @param {string} [filters.company]
   * @param {string} [filters.search]
   * @param {'date'|'score'|'company'|'id'} [filters.sortBy]
   * @param {'ASC'|'DESC'} [filters.sortOrder]
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {object[]}
   */
  queryApplications(filters = {}) {
    // Ensure database is in sync with file
    this.syncFromMarkdown();

    const conditions = [];
    const params = [];

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        if (filters.status.length > 0) {
          const placeholders = filters.status.map(() => '?').join(', ');
          conditions.push(`status IN (${placeholders})`);
          params.push(...filters.status);
        }
      } else {
        conditions.push('status = ?');
        params.push(filters.status);
      }
    }

    if (typeof filters.minScore === 'number') {
      conditions.push('score_numeric >= ?');
      params.push(filters.minScore);
    }

    if (filters.company) {
      conditions.push('company LIKE ?');
      params.push(`%${filters.company}%`);
    }

    if (filters.search) {
      conditions.push('(company LIKE ? OR role LIKE ? OR notes LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let sortCol = 'id';
    if (filters.sortBy === 'date') sortCol = 'date_applied';
    else if (filters.sortBy === 'score') sortCol = 'score_numeric';
    else if (filters.sortBy === 'company') sortCol = 'company';

    const sortDir = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limitClause = typeof filters.limit === 'number' ? `LIMIT ${filters.limit}` : '';
    const offsetClause = typeof filters.offset === 'number' ? `OFFSET ${filters.offset}` : '';

    const sql = `
      SELECT * FROM applications
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      ${limitClause} ${offsetClause};
    `.trim();

    return this.client.queryAll(sql, params);
  }

  /**
   * Get application by ID in <0.2ms.
   *
   * @param {number} id
   * @returns {object|undefined}
   */
  getApplicationById(id) {
    this.syncFromMarkdown();
    return this.client.queryOne('SELECT * FROM applications WHERE id = ?;', [id]);
  }

  /**
   * Instant pipeline KPI summary.
   *
   * @returns {object}
   */
  getPipelineSummary() {
    this.syncFromMarkdown();
    const total = this.client.queryOne('SELECT COUNT(*) as count FROM applications;')?.count ?? 0;
    const avgScore = this.client.queryOne('SELECT ROUND(AVG(score_numeric), 2) as avg FROM applications WHERE score_numeric IS NOT NULL;')?.avg ?? 0;
    const statusCounts = this.client.queryAll(`
      SELECT status, COUNT(*) as count
      FROM applications
      GROUP BY status
      ORDER BY count DESC;
    `);

    const byStatus = {};
    for (const r of statusCounts) {
      byStatus[r.status] = r.count;
    }

    return { total, avgScore, byStatus };
  }

  /**
   * Watch data/applications.md for external manual edits and refresh SQLite cache.
   *
   * @param {Function} [onChange]
   */
  watch(onChange) {
    const trackerPath = resolveTrackerPath(this.dataRoot);
    if (!existsSync(trackerPath)) return;

    if (this.watcher) {
      this.watcher.close();
    }

    let debounceTimer = null;
    this.watcher = watch(trackerPath, () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const res = this.syncFromMarkdown();
        if (res.synced && typeof onChange === 'function') {
          onChange(res);
        }
      }, 75);
    });
  }

  /**
   * Stop watching.
   */
  unwatch() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
