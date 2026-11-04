#!/usr/bin/env node

/**
 * agents/supervisor.mjs — Master CareerOps Supervisor Agent
 *
 * Responsibilities:
 * - Coordinates the 8 specialized agents
 * - Dispatches end-to-end evaluation, tailoring, tracking, and interview preparation workflows
 * - Enforces the local blackboard coordination model and deterministic verification
 *
 * CLI Usage:
 *   node agents/supervisor.mjs evaluate <url|company> [role]
 *   node agents/supervisor.mjs sweep
 *   node agents/supervisor.mjs status
 */

import { isMainModule } from '../lib/is-main-module.mjs';
import { readAgentEvents } from '../lib/agent-events.mjs';
import { JobDiscoveryAgent } from './job-discovery.mjs';
import { AtsScoringAgent } from './ats-scoring.mjs';
import { ResumeOptimizationAgent } from './resume-optimization.mjs';
import { CoverLetterAgent } from './cover-letter.mjs';
import { RecruiterResearchAgent } from './recruiter-research.mjs';
import { InterviewCoachAgent } from './interview-coach.mjs';
import { SalaryNegotiationAgent } from './salary-negotiation.mjs';
import { ApplicationTrackingAgent } from './application-tracking.mjs';

export class CareerOpsSupervisor {
  constructor() {
    this.name = 'CareerOpsSupervisor';
    this.discoveryAgent = new JobDiscoveryAgent();
    this.scoringAgent = new AtsScoringAgent();
    this.resumeAgent = new ResumeOptimizationAgent();
    this.coverLetterAgent = new CoverLetterAgent();
    this.researchAgent = new RecruiterResearchAgent();
    this.interviewCoachAgent = new InterviewCoachAgent();
    this.negotiationAgent = new SalaryNegotiationAgent();
    this.trackingAgent = new ApplicationTrackingAgent();
  }

  /**
   * Run end-to-end evaluation and asset preparation for a target opportunity.
   *
   * @param {object} input
   * @param {string} input.company
   * @param {string} input.role
   * @param {string} [input.url='']
   * @param {string} [input.jdText='']
   * @returns {Promise<object>}
   */
  async processOpportunity(input) {
    console.log(`\n======================================================`);
    console.log(`[${this.name}] Starting Orchestrated Workflow`);
    console.log(`Target: ${input.role} at ${input.company}`);
    console.log(`======================================================\n`);

    // Step 1: ATS Scoring & Evaluation
    const evalResult = await this.scoringAgent.evaluateJob(input);
    if (evalResult.skipped) {
      console.log(`[${this.name}] Opportunity skipped by pre-flight gate: ${evalResult.skipReason}`);
      return { skipped: true, reason: evalResult.skipReason };
    }

    const { reportNum, score } = evalResult;
    let resumeResult = null;
    let coverResult = null;
    let researchResult = null;
    let interviewResult = null;

    // Step 2: High-Fit Asset Generation (Score >= 4.0)
    if (score >= 4.0) {
      console.log(`[${this.name}] Score ${score} >= 4.0. Dispatching asset preparation agents in parallel...`);

      // Resume Tailoring & Fact Verification
      resumeResult = await this.resumeAgent.optimizeResume({
        reportNum,
        company: input.company,
        role: input.role,
        score,
      });

      // Cover Letter Synthesis
      coverResult = await this.coverLetterAgent.draftCoverLetter({
        reportNum,
        company: input.company,
        role: input.role,
      });

      // Recruiter & Company Intelligence
      researchResult = await this.researchAgent.conductResearch({
        company: input.company,
        role: input.role,
        url: input.url,
      });

      // Interview Behavioral Preparation
      interviewResult = await this.interviewCoachAgent.prepareInterview({
        company: input.company,
        role: input.role,
      });
    }

    // Step 3: Application Registration & Tracking
    const trackingResult = await this.trackingAgent.registerApplication({
      reportNum,
      company: input.company,
      role: input.role,
      score,
      url: input.url || '',
      status: 'Evaluated',
      notes: `Evaluated via multi-agent supervisor. Score: ${score}/5.0`,
    });

    console.log(`\n======================================================`);
    console.log(`[${this.name}] Workflow Complete for Report #${reportNum}`);
    console.log(`Score: ${score} / 5.0 | Tracker Row Registered`);
    if (resumeResult?.pdfPath) console.log(`Tailored Resume: ${resumeResult.pdfPath}`);
    if (coverResult?.coverPath) console.log(`Cover Letter: ${coverResult.coverPath}`);
    console.log(`======================================================\n`);

    return {
      reportNum,
      score,
      evaluation: evalResult,
      resume: resumeResult,
      coverLetter: coverResult,
      research: researchResult,
      interview: interviewResult,
      tracking: trackingResult,
    };
  }

  /**
   * Run a discovery sweep.
   */
  async runDiscovery() {
    return this.discoveryAgent.runSweep();
  }

  /**
   * Show recent multi-agent events.
   */
  showStatus() {
    const events = readAgentEvents({ limit: 20 });
    console.log(`\n=== Recent Multi-Agent Blackboard Events (${events.length}) ===`);
    for (const e of events) {
      console.log(`[${e.timestamp}] [${e.agent}] ${e.type} -> ${JSON.stringify(e.payload)}`);
    }
  }
}

// CLI Execution Entrypoint
if (isMainModule(import.meta.url)) {
  const supervisor = new CareerOpsSupervisor();
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  if (command === 'evaluate' || command === 'eval') {
    const company = args[1] || 'Sample Tech';
    const role = args[2] || 'Staff Systems Architect';
    supervisor.processOpportunity({
      company,
      role,
      url: args[3] || 'https://example.com/jobs/sample',
      jdText: 'Looking for a Staff Systems Architect to lead distributed systems design.',
    }).catch(console.error);
  } else if (command === 'sweep') {
    supervisor.runDiscovery().catch(console.error);
  } else if (command === 'status') {
    supervisor.showStatus();
  } else {
    console.log(`career-ops Multi-Agent Supervisor\n`);
    console.log(`Usage:`);
    console.log(`  node agents/supervisor.mjs evaluate <company> [role] [url]`);
    console.log(`  node agents/supervisor.mjs sweep`);
    console.log(`  node agents/supervisor.mjs status`);
  }
}

