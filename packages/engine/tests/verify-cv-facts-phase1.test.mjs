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

test('plural Indian magnitudes are magnitudes, not modifiers', () => {
  const blocks = (line, source) => gate(line, source).invented.length > 0;
  assert.ok(blocks('Served 5 lakhs customers', 'Served 5 customers'));
  assert.ok(blocks('Served 5 lacs customers', 'Served 5 customers'));
  assert.ok(blocks('Handled 3 crores transactions', 'Handled 3 transactions'));
  assert.equal(blocks('Served 5 lakhs customers', 'Served 5 lakh customers'), false);
  assert.equal(blocks('Handled 3 crores transactions', 'Handled 3 crore transactions'), false);
  // Glued to the number.
  assert.ok(blocks('Served 5lakh customers', 'Served 5 customers'));
  assert.ok(blocks('Served 3crores customers', 'Served 3 customers'));
  assert.equal(blocks('Served 5lakh customers', 'Served 5 lakh customers'), false);
});

// Known false blocks, pending P1-19c. The engine no longer backs a bare
// `<n> crore|lakh <word>` claim from the same figure stated as money ("Handled
// budgets of ₹2 crore"): the rule that did (P1-19, currencyAmountClaims) was
// removed by owner decision (P1-19d), so the gate errs toward blocking. Each
// of these honest lines blocks today. P1-19c rebuilds the rule and must flip
// every entry to pass, then delete this list.
const KNOWN_FALSE_BLOCKS_PENDING_P1_19C = [
  ['Handled 2 crore budgets', SOURCE],
  ['Handled ₹ 2 crore budgets', SOURCE],
  ['Handled 2 Cr budgets', SOURCE],
  ['Handled 2cr budgets', SOURCE],
  ['Handled a 2 crore budget', SOURCE],
  ['Managed 2 crore worth of budgets', SOURCE],
  ['Managed budgets totalling 2 crore annually', SOURCE],
  ['Handled 2 crore budgets', 'Handled ₹2 crore budgets for 300 customers'],
  ['Handled 2 crore budgets', 'Managed a team of 4 analysts, handled budgets of ₹2 crore'],
];

test('known false blocks pending P1-19c: these honest crore lines block today', () => {
  for (const [line, source] of KNOWN_FALSE_BLOCKS_PENDING_P1_19C) {
    assert.ok(gate(line, source).invented.length > 0, `${line} | ${source === SOURCE ? 'SOURCE' : source}`);
  }
});

test('a crore amount without a currency mark needs the same count in the facts', () => {
  const blocks = (line, source = SOURCE) => gate(line, source).invented.length > 0;
  for (const line of ['Managed 2 crore customers', 'Handled 20 crore budgets', 'Managed 20 crore worth of budgets',
    'Managed budgets totalling 20 crore annually', 'Handled 2 lakh budgets',
    'Processed 2 crore monthly invoices', 'Raised 2 crore total invoices', 'Processed 2 crore annual invoices',
    'Handled 2 crore overall invoices', 'Sold 2 crore worth of software licences', 'Earned 2 crore annually']) {
    assert.ok(blocks(line), line);
  }
  assert.ok(blocks('Managed 2 crore customers', 'Handled ₹2 crore budgets for 300 customers'));
  assert.ok(blocks('Managed 2 crore analysts', 'Managed a team of 4 analysts, handled budgets of ₹2 crore'));
  assert.ok(blocks('Managed 2 crore analysts', 'Led 4 analysts handling ₹2 crore'));
  assert.ok(blocks('Managed 2 crore vendors', 'Handled ₹2 crore budgets across the north and south zones with vendors'));
  assert.ok(blocks('Served 2 crore customers', 'Served 2,000 customers on ₹2 crore budgets'));
  assert.ok(blocks('Served 2 crore analysts', 'Managed 4 analysts with budgets of ₹2 crore'));
  // The same count in the facts still backs it.
  assert.equal(blocks('Handled 2 crore budgets', 'Handled 2 crore budgets'), false);
});

// A source of many crore amounts on one unpunctuated line must stay cheap:
// an earlier rule that backed counts from money took 8 s and 1.3 GB on it.
test('a source of 1,500 crore amounts on one line is checked in under 500 ms', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const word = (i) => `${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}${letters[Math.floor(i / 676) % 26]}q`;
  let source = '';
  for (let i = 0; i < 1500; i++) source += `₹${i + 1} crore ${word(i)} `;
  source += `${Date.now()}`;
  assert.ok(source.length < 30000);
  const started = performance.now();
  gate('Handled 2 crore budgets', source);
  const ms = performance.now() - started;
  assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
});

test('a plain source number backs a rewritten count only on its own line and never as money', () => {
  const blocks = (line, source) => gate(line, source).invented.length > 0;
  for (const source of ['Budget Rs 50000 invoices were processed', 'Budget Rs. 50000 invoices were processed',
    'INR 50000 invoices were processed', '₹ 50000 invoices were processed', '₹50000 invoices were processed',
    '$ 50000 invoices were processed', 'USD 50000 invoices were processed']) {
    assert.ok(blocks('Processed 50k invoices', source), source);
  }
  assert.ok(blocks('Served 2.02k customers', 'Joined in 2020\nCustomers were served daily'));
  assert.ok(blocks('Processed 9.9b invoices', 'Phone 9900000000 invoices'));
  assert.ok(blocks('Onboarded 5k vendors', 'PIN 5000 vendors onboarded'));
  assert.equal(blocks('Processed 10k invoices', 'Processed 10,000 invoices'), false);
  assert.equal(blocks('Processed 10k invoices', 'Processed 10000 invoices'), false);
  // Years are not excluded by value: 2,000 invoices is a count.
  assert.equal(blocks('Processed 2k invoices', 'Processed 2,000 invoices'), false);
});

test('cxos is in the cxo family', () => {
  const words = (line, source) => gate(line, source).unsupportedFacts.map((fact) => fact.value);
  assert.ok(words('Presented to CXOs monthly', 'Analyst.').includes('cxos'));
  assert.deepEqual(words('Presented to CXOs monthly', 'Presented to the CXO monthly'), []);
});

// The gate re-derives nothing from a source it has already read: a call on
// the same source is several times faster than the first call on a new one.
// Without the per-source memo, warm and cold cost the same.
test('a warm call on a 30,000-character source reuses the source work', (t) => {
  const big = SOURCE.repeat(Math.ceil(30000 / SOURCE.length)).slice(0, 29990);
  const target = 'Reduced month-end close time by 30% using SQL and Power BI, budgets of ₹2 crore';
  const fresh = (tag) => `${big}\n${tag}`;
  // JIT warm-up on other sources, so the cold figure is source work, not compile time.
  for (let i = 0; i < 5; i++) gate(target, fresh(`warm-up ${i}`));
  let cold = Infinity;
  let warm = Infinity;
  for (let i = 0; i < 5; i++) {
    const source = fresh(`cold ${i}`);
    let started = performance.now();
    gate(target, source);
    cold = Math.min(cold, performance.now() - started);
    for (let j = 0; j < 5; j++) {
      // A new string with the same content, the way the app rebuilds the fact base per call.
      const same = `${source} `.slice(0, -1);
      started = performance.now();
      gate(target, same);
      warm = Math.min(warm, performance.now() - started);
    }
  }
  t.diagnostic(`cold ${cold.toFixed(2)} ms, warm ${warm.toFixed(2)} ms`);
  assert.ok(warm * 3 <= cold, `cold ${cold.toFixed(2)} ms, warm ${warm.toFixed(2)} ms`);
});
