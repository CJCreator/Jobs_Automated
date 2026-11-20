// P1-19: the engine alone blocks participation-to-ownership inflation and
// Indian-format figures, honest rewordings still pass, and the exported lists
// the app's sync test reads exist.
//
// Run:  node --test tests/verify-cv-facts-phase1.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  verifyFactsFromText,
  metricClaims,
  CLAIM_FAMILIES,
  COVERAGE_REASONS,
} from '../verify-cv-facts.mjs';
import { SOURCE, HONEST } from '../../../apps/web/tests/fixtures/honest-lines.mjs';

const gate = (text, sourceText) => verifyFactsFromText(text, { sourceText });
const S2 = `${SOURCE}\n- Assisted with vendor contracts\n- Supported the audit of 12 branches`;
const scopeBlocked = (line, source = S2) =>
  gate(line, source).unsupportedFacts.some((fact) => fact.kind === 'scope');

test('stronger ownership verbs block against a participation source', () => {
  for (const verb of ['Led', 'Drove', 'Headed', 'Spearheaded']) {
    assert.ok(scopeBlocked(`${verb} vendor contracts`), verb);
  }
  assert.ok(scopeBlocked('Was in charge of vendor contracts'), 'in charge of');
  assert.ok(scopeBlocked('Leader of vendor contracts'), 'leader of');
  assert.ok(scopeBlocked('Championed vendor contracts'), 'championed');
});

test('participation sources of every spelling are weaker than ownership', () => {
  for (const source of ['Aided vendor contracts', 'Participated in vendor contracts', 'Involved in vendor contracts',
    'Part of vendor contracts', 'Member of vendor contracts', 'Shadowed vendor contracts', 'Observed vendor contracts']) {
    assert.ok(scopeBlocked('Led vendor contracts', source), source);
  }
});

test('an equal or stronger source keeps the verb honest', () => {
  assert.equal(scopeBlocked('Managed vendor contracts'), false);
  assert.equal(scopeBlocked('Led vendor contracts', 'Managed vendor contracts'), false);
  assert.equal(scopeBlocked('Spearheaded vendor contracts', 'Led vendor contracts'), false);
});

test('Indian-format and abbreviated figures need the same figure in the facts', () => {
  const blocks = (line, source) => gate(line, source).invented.length > 0;
  assert.ok(blocks('Served 5 lakh customers', 'Served 5 customers'));
  assert.ok(blocks('Handled 3 crore transactions', 'Handled 3 transactions'));
  assert.ok(blocks('Processed 10k invoices', 'Processed 1,000 invoices'));
  assert.equal(blocks('Processed 10k invoices', 'Processed 10,000 invoices'), false);
  assert.equal(blocks('Processed 10,000 invoices', 'Processed 10k invoices'), false);
  assert.equal(blocks('Served 5 lakh customers', 'Served 5 lakh customers'), false);
  assert.equal(blocks('Served 500,000 customers', 'Served 5 lakh customers'), false);
});

test('a magnitude count names the thing counted, not the word after it', () => {
  const claims = [...metricClaims('Processed 14M evaluations for users')];
  assert.ok(claims.includes('14m evaluations'), claims.join('|'));
  assert.ok(!claims.includes('14m users'));
});

test('every honest rewording passes against the source', () => {
  const extra = ['Led a four-person analyst team', 'Directed a team of 4 analysts.', 'Oversaw a team of four analysts',
    'Spearheaded month-end close improvements using Power BI'];
  for (const line of [...HONEST, ...extra]) {
    const result = gate(line, SOURCE);
    assert.notEqual(result.verdict, 'block', `${line} -> ${JSON.stringify([result.invented, result.unsupportedFacts])}`);
  }
});

test('new claim words block when the source lacks them', () => {
  const blocked = (line) => {
    const result = gate(line, 'Analyst. Month-end close reporting.');
    return result.unsupportedFacts.length > 0 || result.invented.length > 0;
  };
  for (const line of ['Principals meeting lead', 'Industry gurus', 'Veterans outreach', 'Earned diplomas', 'Class toppers mentor',
    'Seniors team', 'Heads of finance', 'Seniormost analyst', 'Senior-most analyst', 'Expertly handled close',
    'Ph D in finance', 'Post graduate in finance', 'Post-graduate in finance', 'Mgr, reporting', 'GM, reporting',
    'General Manager, reporting', 'AVP, reporting', 'SVP, reporting', 'EVP, reporting', 'C-suite reporting', 'CXO reporting',
    'Pan-India reporting', 'Pan India reporting']) {
    assert.ok(blocked(line), line);
  }
});

test('plain business phrases that contain a claim word are not blocked', () => {
  for (const line of ['Wrote the executive summary for close', 'Enterprise reporting for month-end close', 'Award-winning close team']) {
    const result = gate(line, 'Analyst. Month-end close reporting.');
    assert.equal(result.unsupportedFacts.length, 0, line);
  }
  // The exemption is for the exact phrase only.
  assert.ok(gate('Executive reporting for close', 'Analyst.').unsupportedFacts.length > 0);
  assert.ok(gate('Award for close', 'Analyst.').unsupportedFacts.length > 0);
});

test('the lists are exported for the sync test', () => {
  assert.ok(Object.isFrozen(CLAIM_FAMILIES));
  assert.deepEqual(Object.keys(CLAIM_FAMILIES), ['credential', 'seniority', 'scope', 'expertise']);
  assert.ok(CLAIM_FAMILIES.scope.some((family) => family.includes('pan-india')));
  assert.ok(Array.isArray(COVERAGE_REASONS));
  assert.ok(COVERAGE_REASONS.includes('no-count-claims-recognized'));
  assert.ok(COVERAGE_REASONS.includes('scope-not-checked'));
});

test('the claim-word check stays fast on a 30,000-character source', () => {
  const big = SOURCE.repeat(Math.ceil(30000 / SOURCE.length)).slice(0, 30000);
  const started = performance.now();
  for (let i = 0; i < 20; i++) gate('Led month-end close reporting', big);
  assert.ok((performance.now() - started) / 20 < 500);
});
