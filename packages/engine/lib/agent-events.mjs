import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { getCareerOpsRoot } from '../path-resolver.mjs';

export const AgentEventType = Object.freeze({
  JOB_DISCOVERED: 'JOB_DISCOVERED',
  JOB_SCORED: 'JOB_SCORED',
  RESUME_OPTIMIZED: 'RESUME_OPTIMIZED',
  COVER_LETTER_COMPILED: 'COVER_LETTER_COMPILED',
  COMPANY_RESEARCH_COMPLETED: 'COMPANY_RESEARCH_COMPLETED',
  INTERVIEW_PREP_READY: 'INTERVIEW_PREP_READY',
  NEGOTIATION_PLAN_GENERATED: 'NEGOTIATION_PLAN_GENERATED',
  STATUS_TRANSITIONED: 'STATUS_TRANSITIONED',
  PIPELINE_ERROR: 'PIPELINE_ERROR',
});

class AgentEventBus extends EventEmitter {
  constructor() {
    super();
  }

  getEventLogPath() {
    const root = getCareerOpsRoot();
    const dataDir = path.join(root, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'agent-events.jsonl');
  }

  /**
   * Publish an event to the local blackboard and notify in-process listeners.
   *
   * @param {string} agent - Name of the reporting agent.
   * @param {string} type - Member of AgentEventType.
   * @param {Record<string, any>} payload - Structured event metadata.
   * @returns {Record<string, any>} The created event record.
   */
  emitEvent(agent, type, payload = {}) {
    const event = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      agent,
      type,
      payload,
    };

    const logPath = this.getEventLogPath();
    const line = JSON.stringify(event) + '\n';
    try {
      fs.appendFileSync(logPath, line, 'utf8');
    } catch (err) {
      console.warn(`[agent-events] Failed to append event log to ${logPath}:`, err.message);
    }

    this.emit(type, event);
    this.emit('*', event);
    return event;
  }

  /**
   * Read recent events from the blackboard.
   *
   * @param {object} [filter]
   * @param {string} [filter.type]
   * @param {string} [filter.agent]
   * @param {number} [filter.limit=50]
   * @returns {Array<Record<string, any>>}
   */
  readEvents(filter = {}) {
    const logPath = this.getEventLogPath();
    if (!fs.existsSync(logPath)) return [];

    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      let events = lines.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (filter.type) {
        events = events.filter((e) => e.type === filter.type);
      }
      if (filter.agent) {
        events = events.filter((e) => e.agent === filter.agent);
      }
      const limit = filter.limit || 50;
      return events.slice(-limit);
    } catch (err) {
      console.warn(`[agent-events] Error reading event log:`, err.message);
      return [];
    }
  }
}

export const agentEventBus = new AgentEventBus();
export const emitAgentEvent = (agent, type, payload) => agentEventBus.emitEvent(agent, type, payload);
export const readAgentEvents = (filter) => agentEventBus.readEvents(filter);

