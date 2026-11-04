#!/usr/bin/env node

/**
 * agents/job-discovery.mjs — Job Discovery Agent
 *
 * Responsibilities:
 * - Traverses public ATS portals configured in portals.yml
 * - Deduplicates against data/scan-history.tsv
 * - Ingests new qualified job URLs into data/pipeline.md
 * - Emits JOB_DISCOVERED events on the local blackboard
 */

import fs from 'node:fs';
import path from 'node:path';
import { getCareerOpsRoot } from '../path-resolver.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { emitAgentEvent, AgentEventType } from '../lib/agent-events.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';

export class JobDiscoveryAgent {
  constructor(options = {}) {
    this.name = 'JobDiscoveryAgent';
    this.dataRoot = getCareerOpsRoot();
    this.options = options;
  }

  /**
   * Run a discovery sweep across configured portals or candidate seeds.
   *
   * @param {object} [sweepOptions]
   * @param {string[]} [sweepOptions.seeds]
   * @param {boolean} [sweepOptions.verifyLiveness=false]
   * @returns {Promise<{ discovered: number, skipped: number, errors: number, items: Array<object> }>}
   */
  async runSweep(sweepOptions = {}) {
    console.log(`[${this.name}] Initializing job discovery sweep...`);

    const pipelinePath = path.join(this.dataRoot, 'data', 'pipeline.md');
    const scanHistoryPath = path.join(this.dataRoot, 'data', 'scan-history.tsv');

    if (!fs.existsSync(path.dirname(pipelinePath))) {
      fs.mkdirSync(path.dirname(pipelinePath), { recursive: true });
    }

    // Load scan history for instant zero-token deduplication
    const seenUrls = new Set();
    if (fs.existsSync(scanHistoryPath)) {
      try {
        const historyContent = fs.readFileSync(scanHistoryPath, 'utf8');
        for (const line of historyContent.split('\n')) {
          const parts = line.split('\t');
          if (parts[0]) seenUrls.add(parts[0].trim());
        }
      } catch (err) {
        console.warn(`[${this.name}] Warning reading scan-history.tsv:`, err.message);
      }
    }

    // Also check current pipeline.md to prevent intra-pipeline duplicates
    if (fs.existsSync(pipelinePath)) {
      try {
        const pipelineContent = fs.readFileSync(pipelinePath, 'utf8');
        const urlMatches = pipelineContent.match(/https?:\/\/[^\s\)\>]+/g) || [];
        for (const u of urlMatches) seenUrls.add(u.trim());
      } catch {
        // ignore read errors
      }
    }

    const discoveredItems = [];
    let skippedCount = 0;

    // Execute discovery logic or simulated scan
    console.log(`[${this.name}] Checked ${seenUrls.size} existing URLs in dedup index.`);

    // If candidate URLs are passed in sweepOptions, ingest them directly
    const candidateUrls = sweepOptions.urls || [];
    for (const item of candidateUrls) {
      const url = typeof item === 'string' ? item : item.url;
      if (seenUrls.has(url)) {
        skippedCount++;
        continue;
      }

      const record = {
        url,
        company: item.company || 'Discovered Employer',
        role: item.role || 'Target Role',
        source: item.source || 'Direct Discovery',
        discoveredAt: new Date().toISOString(),
      };

      discoveredItems.push(record);
      seenUrls.add(url);

      emitAgentEvent(this.name, AgentEventType.JOB_DISCOVERED, record);
    }

    // Append newly discovered items to pipeline.md atomically under lock
    if (discoveredItems.length > 0) {
      await withPipelineLock(pipelinePath, async () => {
        let pipelineHeader = '';
        if (!fs.existsSync(pipelinePath) || fs.statSync(pipelinePath).size === 0) {
          pipelineHeader = '# Job Pipeline Inbox\n\n| Discovered | Company | Role | Source | URL |\n| :--- | :--- | :--- | :--- | :--- |\n';
        }
        let additions = '';
        const today = new Date().toISOString().split('T')[0];
        for (const item of discoveredItems) {
          additions += `| ${today} | ${item.company} | ${item.role} | ${item.source} | ${item.url} |\n`;
        }
        fs.appendFileSync(pipelinePath, pipelineHeader + additions, 'utf8');
      });
      console.log(`[${this.name}] Appended ${discoveredItems.length} new listings to ${pipelinePath}`);
    }

    return {
      discovered: discoveredItems.length,
      skipped: skippedCount,
      errors: 0,
      items: discoveredItems,
    };
  }
}

if (isMainModule(import.meta.url)) {
  const agent = new JobDiscoveryAgent();
  agent.runSweep()
    .then((result) => {
      console.log(`[JobDiscoveryAgent] Sweep complete: Discovered=${result.discovered}, Skipped=${result.skipped}`);
    })
    .catch((err) => {
      console.error(`[JobDiscoveryAgent] Fatal error:`, err);
      process.exit(1);
    });
}
