#!/usr/bin/env node

/**
 * agents/application-tracking.mjs — Application Tracking & Funnel Agent
 *
 * Responsibilities:
 * - Maintains canonical applications.md and append-only status-log.tsv
 * - Syncs the derived SQLite index (data/applications.db)
 * - Emits STATUS_TRANSITIONED event on the local blackboard
 * - Alerts candidate when follow-ups are due
 */

import fs from 'node:fs';
import path from 'node:path';
import { getCareerOpsRoot } from '../path-resolver.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { emitAgentEvent, AgentEventType } from '../lib/agent-events.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';

export class ApplicationTrackingAgent {
  constructor(options = {}) {
    this.name = 'ApplicationTrackingAgent';
    this.dataRoot = getCareerOpsRoot();
    this.options = options;
  }

  /**
   * Add a newly evaluated application to data/applications.md.
   *
   * @param {object} input
   * @param {number} input.reportNum
   * @param {string} input.company
   * @param {string} input.role
   * @param {number} input.score
   * @param {string} [input.url='']
   * @param {string} [input.status='Evaluated']
   * @param {string} [input.notes='']
   * @returns {Promise<{ trackerId: number, status: string }>}
   */
  async registerApplication(input) {
    const { reportNum, company, role, score, url = '', status = 'Evaluated', notes = '' } = input;
    console.log(`[${this.name}] Registering application #${reportNum} (${company})...`);

    const trackerPath = path.join(this.dataRoot, 'data', 'applications.md');
    const ledgerPath = path.join(this.dataRoot, 'data', 'status-log.tsv');
    const today = new Date().toISOString().split('T')[0];

    await withPipelineLock(trackerPath, async () => {
      let trackerContent = '';
      if (!fs.existsSync(trackerPath) || fs.statSync(trackerPath).size === 0) {
        trackerContent = '# Application Tracker\n\n| # | Date | Company | Role | Status | Score | PDF | Report | Notes | URL |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';
      } else {
        trackerContent = fs.readFileSync(trackerPath, 'utf8');
      }

      const reportLink = `[#${reportNum}](reports/${String(reportNum).padStart(3, '0')}-${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today}.md)`;
      const pdfCell = score >= 4.0 ? '✅' : '—';
      const cleanNotes = (notes || '').replace(/\|/g, '\\|');
      const cleanUrl = url.trim();

      const newRow = `| ${reportNum} | ${today} | ${company} | ${role} | ${status} | ${score.toFixed(1)} | ${pdfCell} | ${reportLink} | ${cleanNotes} | ${cleanUrl} |\n`;

      fs.appendFileSync(trackerPath, newRow, 'utf8');

      // Append to status-log.tsv
      const ledgerRow = `${reportNum}\t${today}\t-\t${status}\tmulti-agent\t${cleanNotes}\n`;
      fs.appendFileSync(ledgerPath, ledgerRow, 'utf8');
    });

    console.log(`[${this.name}] Registered row in ${trackerPath} and transition in ${ledgerPath}`);

    emitAgentEvent(this.name, AgentEventType.STATUS_TRANSITIONED, {
      reportNum,
      company,
      role,
      status,
    });

    return { trackerId: reportNum, status };
  }
}

if (isMainModule(import.meta.url)) {
  const agent = new ApplicationTrackingAgent();
  agent.registerApplication({
    reportNum: 42,
    company: 'Stripe',
    role: 'Staff Infrastructure Engineer',
    score: 4.5,
    url: 'https://stripe.com/jobs/sample',
    status: 'Evaluated',
    notes: 'High-signal match evaluated via multi-agent pipeline.',
  }).then((res) => {
    console.log(`[ApplicationTrackingAgent] Success:`, res);
  }).catch((err) => {
    console.error(`[ApplicationTrackingAgent] Error:`, err);
    process.exit(1);
  });
}
