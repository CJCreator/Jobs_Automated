// P1-19c: rupee (and other currency) amounts in the engine fact gate.
//
// Every row of docs/plan/p1-19c-cases.md is a test here. Money is money on
// both sides: a currency-marked amount is compared by value and currency and
// never counts the words after it, and a lakh or crore amount the facts state
// as money backs the same figure only for the money word next to it.
//
// Also here: the C-suite audience rule and the coverage-reason rule, both
// added to P1-19c by the coordinator.
//
// Run:  node --test tests/verify-cv-facts-p1-19c.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyFactsFromText, metricClaims } from '../verify-cv-facts.mjs';
import { SOURCE, HONEST } from '../../../apps/web/tests/fixtures/honest-lines.mjs';

const gate = (text, sourceText) => verifyFactsFromText(text, { sourceText });
const label = (line, source) => `${line} | ${source === SOURCE ? 'SOURCE' : JSON.stringify(source)}`;
const passes = (line, source) => {
  const result = gate(line, source);
  assert.deepEqual(result.invented, [], label(line, source));
  assert.notEqual(result.verdict, 'block', `${label(line, source)} -> ${JSON.stringify(result.unsupportedFacts)}`);
};
const blocks = (line, source) => {
  const result = gate(line, source);
  assert.ok(result.invented.length > 0, `${label(line, source)} should block on a figure`);
  assert.equal(result.verdict, 'block', label(line, source));
};

test('rows 1-7: honest crore rewordings of SOURCE pass', () => {
  for (const line of ['Handled 2 crore budgets', 'Handled ₹ 2 crore budgets', 'Handled 2 Cr budgets', 'Handled 2cr budgets',
    'Handled a 2 crore budget', 'Managed 2 crore worth of budgets', 'Managed budgets totalling 2 crore annually']) {
    passes(line, SOURCE);
  }
});

test('rows 8-9: the money word next to the amount backs it, whatever else the line counts', () => {
  passes('Handled 2 crore budgets', 'Handled ₹2 crore budgets for 300 customers');
  passes('Handled 2 crore budgets', 'Managed a team of 4 analysts, handled budgets of ₹2 crore');
});

test('row 10: a label backs its amount across ":" and "("', () => {
  passes('Handled 2 crore budgets', 'Budget: ₹2 crore');
  passes('Handled 2 crore budgets', 'Budget (₹2 crore)');
});

test('rows 11-12: digits glued to text are not counters', () => {
  passes('Handled 2 crore budgets', 'FY23 budgets of ₹2 crore');
  passes('Handled 2 crore budgets', 'Q3 budgets of ₹2 crore for B2B');
});

test('rows 13-14: a wrapped bullet is one statement', () => {
  passes('Handled 2 crore budgets', '- Handled budgets of\n  ₹2 crore');
  passes('Served 10k customers', '- Served 10,000\n  customers');
});

test('row 15: Indian digit grouping', () => {
  passes('Served 1 lakh users', 'Served 1,00,000 users');
  assert.ok(metricClaims('Served 1,00,000 users').has('100000 users'));
});

test('row 16: ₹2,00,00,000 is ₹2 crore', () => {
  passes('Handled budgets of ₹2,00,00,000', SOURCE);
  assert.deepEqual([...metricClaims('Handled budgets of ₹2,00,00,000')], ['₹2crore']);
});

test('row 17: a ₹-marked amount in the tailored line is money, never a count claim', () => {
  passes('Earned ₹2 crore from customers', 'Earned ₹2 crore in revenue from 300 customers');
  assert.deepEqual([...metricClaims('Earned ₹2 crore from customers')], ['₹2crore']);
});

test('row 18: what works keeps working', () => {
  passes('Handled 2 crore budgets', 'Handled 2 crore budgets');
});

test('row 19: the honest lines and the four extras pass', () => {
  const extra = ['Led a four-person analyst team', 'Directed a team of 4 analysts.', 'Oversaw a team of four analysts',
    'Spearheaded month-end close improvements using Power BI'];
  const lines = [...HONEST, ...extra];
  assert.ok(lines.length >= 120);
  for (const line of lines) {
    const result = gate(line, SOURCE);
    assert.notEqual(result.verdict, 'block', `${line} -> ${JSON.stringify([result.invented, result.unsupportedFacts])}`);
  }
});

test('one rupee value has one key, however it is spelled', () => {
  for (const text of ['₹2 crore', '₹ 2 crore', '₹2Cr', 'Rs 2 crore', 'Rs. 2 Cr', 'INR 2 crore', 'inr 200 lakh',
    '2 crore rupees', '2 crore INR', '₹2,00,00,000', '₹20000000', 'Rs.2 crores']) {
    assert.deepEqual([...metricClaims(`Handled budgets of ${text}`)], ['₹2crore'], text);
  }
  assert.deepEqual([...metricClaims('Handled ₹2.5 crore')], ['₹2.5crore']);
  assert.deepEqual([...metricClaims('Handled ₹250 lakh')], ['₹2.5crore']);
  assert.deepEqual([...metricClaims('Handled ₹20,00,000')], ['₹20lakh']);
  assert.deepEqual([...metricClaims('Handled ₹50,000')], ['₹50000']);
});

test('review 1, edit 3: the rupee parser reads compound magnitudes, decimals and L, and fails closed', () => {
  blocks('Handled ₹2 lakh crore', 'Handled ₹2 lakh');
  blocks('Handled ₹20 thousand crore', 'Handled ₹20,000');
  blocks('Handled ₹2,99,00,000.00', 'Handled ₹2,50,00,000.00');
  blocks('Paid ₹9,99,999.50', 'Paid ₹9 fee');
  blocks('Handled ₹2 trillion', 'Handled ₹2');
  blocks('Handled ₹20L', 'Handled ₹20');
  passes('Handled ₹20L', 'Handled ₹20 lakh');
  passes('Handled ₹2,50,00,000.00', 'Handled ₹2.5 crore');
  passes('Handled ₹2 lakh crore', 'Handled ₹2,00,000 crore');
  assert.deepEqual([...metricClaims('Handled ₹2 lakh crore')], ['₹200000crore']);
  // An amount with digits left over is not read: only the same text backs it.
  for (const [line, source] of [['Handled ₹2,5 crore', 'Handled ₹2 crore'], ['Handled ₹2 crore3', 'Handled ₹2 crore'],
    ['Handled ₹2 zillion', 'Handled ₹2']]) {
    blocks(line, source);
    assert.ok([...metricClaims(line)].every((claim) => claim.startsWith('₹?')), line);
  }
});

test('round 2: a single letter is no second magnitude, and not a magnitude before "&", "/" or a dash', () => {
  passes('Closed ₹200 crore M&A deals', 'Closed M&A deals worth ₹200 crore');
  assert.deepEqual([...metricClaims('Closed ₹200 crore M&A deals')], ['₹200crore']);
  assert.deepEqual([...metricClaims('Approved ₹5 lakh L&D budget')], ['₹5lakh']);
  assert.deepEqual([...metricClaims('Ran ₹5 crore K-12 programme')], ['₹5crore']);
  passes('Approved ₹5 lakh L&D budget', 'Approved budget of ₹5 lakh');
});

test('round 2: a rupee range is read whole and fails closed', () => {
  blocks('Handled budgets of ₹2-30 crore', 'Handled budgets of ₹2-3 crore');
  blocks('Handled budgets of ₹2-3 crore', 'Handled budgets of ₹2-3 lakh');
  blocks('Handled budgets of ₹2 to 3 crore', 'Handled budgets of ₹2 to 30 crore');
  blocks('Handled budgets of ₹2-3 crore', 'Handled budgets of ₹2 crore');
  passes('Handled budgets of ₹2-3 crore', 'Handled budgets of ₹2-3 crore');
});

test('round 2: a magnitude-suffixed number after a letter-hyphen is a count, a plain decimal is not', () => {
  blocks('Grew to sub-2.5k customers', 'Served 300 customers');
  blocks('Grew from 300-to-2.5M customers', 'Served 300 customers');
  assert.deepEqual([...metricClaims('Used GPT-4.5 agents')], []);
  assert.deepEqual([...metricClaims('Sold to B2B customers')], []);
});

test('review 1, edit 4: a grouped number after a letter-hyphen or a glued letter is still a count', () => {
  for (const line of ['Grew from 300-to-2,500 customers', 'Grew to sub-2,500 customers', 'Grew to post-1,500 customers',
    'Served A1,500 customers']) {
    blocks(line, 'Served 300 customers');
  }
  // An identifier stays an identifier.
  assert.deepEqual([...metricClaims('Signed EIP-712 offers')], []);
});

test('review 1, edit 5: "rupee-paying" is no rupee word', () => {
  blocks('Served 2 crore rupee-paying customers', 'Budget of ₹2 crore');
  blocks('Served 2 crore rupee-paying customers', SOURCE);
});

test('review 1, edit 6: lakh and crore amounts in other currencies are money claims', () => {
  blocks('Raised 50 crore dollars', 'Raised ₹50 crore');
  blocks('Raised 5 lakh euros', 'Raised ₹5 lakh');
  blocks('Raised 50 crore USD', 'Raised ₹50 crore');
  blocks('Raised $50 crore', 'Raised ₹50 crore');
  passes('Raised 50 crore dollars', 'Raised $50 crore');
  assert.deepEqual([...metricClaims('Raised 50 crore USD')], ['$50crore']);
});

test('a money word coordinated with a count noun does not hide the count', () => {
  blocks('Managed 2 crore budgets and customers', SOURCE);
});

// Known false blocks, accepted at review 1: a lakh or crore figure followed by
// a word that is neither a money word nor a counted noun is read as a count of
// that word. These honest lines block; a later task may fix them, and then
// "Handled customers of 2 crore this year" and "Handled budgets of 2 crore for
// vendors" must still block.
test('known false blocks: "2 crore towards" and "2 crore this year" block', () => {
  blocks('Handled budgets of 2 crore towards vendor contracts', SOURCE);
  blocks('Handled budgets of 2 crore this year', SOURCE);
  blocks('Handled customers of 2 crore this year', SOURCE);
  blocks('Handled budgets of 2 crore for vendors', SOURCE);
});

test('B1-B3: a different rupee amount blocks', () => {
  blocks('Handled budgets of ₹20 crore', SOURCE);
  blocks('Handled budgets of Rs 20 lakh', SOURCE);
  blocks('Handled budgets of ₹20,00,000', SOURCE);
});

test('B4: rupee money in the facts never backs a count', () => {
  for (const source of ['Earned ₹2 crore from customers', 'Earned Rs 2 crore from customers', 'Earned ₹ 2 crore from customers']) {
    blocks('Served 2 crore customers', source);
  }
});

// B5 reads: the spaced-₹ line in the facts makes no count claim. Its amount
// is money ("₹2crore"), so a count read of the same figure is not backed.
test('B5: a spaced ₹ mark is money, not a count', () => {
  const claims = [...metricClaims('Handled ₹ 2 crore budgets')];
  assert.deepEqual(claims, ['₹2crore']);
  assert.ok(!claims.includes('2crore budgets'));
  blocks('Handled 30M budgets', 'Handled ₹ 2 crore budgets');
  blocks('Served 2 crore customers', 'Handled ₹ 2 crore customers');
});

test('B6-B8: trailing rupees and dollars are money, never a count', () => {
  blocks('Served 2 crore customers', 'Budget of 2 crore rupees for customers');
  blocks('Served 20M customers', 'Budget of 2 crore rupees for customers');
  blocks('Served 20 lakh customers', 'Earned 2 million dollars from customers');
});

test('B9-B10: money in revenue never backs a count of customers, in any currency', () => {
  blocks('Served 2 crore customers', 'Closed ₹2 crore in revenue with enterprise customers');
  blocks('Served 2 million customers', 'Closed $2 million in revenue with enterprise customers');
  blocks('Served 2 million customers', 'Closed USD 2 million in revenue with enterprise customers');
  blocks('Served 2 million customers', 'Closed €2 million in revenue with enterprise customers');
  blocks('Served 2 million customers', 'Closed £2 million in revenue with enterprise customers');
});

test('B11: a line break is a stop', () => {
  blocks('Served 2 crore customers', 'Budget: ₹2 crore\nCustomers served daily');
  blocks('Handled 2 crore budgets', 'Earned ₹2 crore\nBudgets were approved');
});

test('B12-B13: years are told by context', () => {
  blocks('Served 2 crore customers', 'Served 2019 customers, handled budgets of ₹2 crore');
  blocks('Served 2.02k customers', 'Analyst since 2020 customers were served');
  blocks('Served 2.02k customers', 'In 2020 customers were served');
  blocks('Served 2.02k customers', '2019 – 2020 customers served');
  // A year-shaped number with no dating word is still a count.
  passes('Processed 2k invoices', 'Processed 2,000 invoices');
});

test('B14: a comma is a stop', () => {
  blocks('Handled 2 crore customers', 'Handled budgets of ₹2 crore, customers across India');
  blocks('Handled 2 crore budgets', 'Earned ₹2 crore, budgets approved later');
});

test('B15-B17: money never backs a count of analysts, however the analysts are counted', () => {
  blocks('Managed 2 crore analysts', 'Managed a team of 4 senior finance analysts on ₹2 crore');
  blocks('Managed 2 crore analysts', 'Managed four analysts, ₹2 crore');
  blocks('Managed 2 crore analysts', 'Led four analysts handling ₹2 crore');
});

test('B18: crore lines that keep blocking against SOURCE', () => {
  for (const line of ['Managed 2 crore customers', 'Handled 20 crore budgets', 'Handled 2 lakh budgets',
    'Managed 20 crore worth of budgets', 'Sold 2 crore worth of software licences', 'Earned 2 crore annually',
    'Processed 2 crore monthly invoices', 'Raised 2 crore total invoices', 'Processed 2 crore annual invoices',
    'Handled 2 crore overall invoices', 'Managed budgets totalling 20 crore annually', 'Handled budgets of 20 crore',
    'Handled budgets of 2 lakh']) {
    blocks(line, SOURCE);
  }
});

test('B19-B24: money near a counted noun never backs that noun', () => {
  blocks('Managed 2 crore customers', 'Handled ₹2 crore budgets for 300 customers');
  blocks('Managed 2 crore analysts', 'Managed a team of 4 analysts, handled budgets of ₹2 crore');
  blocks('Managed 2 crore analysts', 'Led 4 analysts handling ₹2 crore');
  blocks('Served 2 crore analysts', 'Managed 4 analysts with budgets of ₹2 crore');
  blocks('Managed 2 crore vendors', 'Handled ₹2 crore budgets across the north and south zones with vendors');
  blocks('Served 2 crore customers', 'Served 2,000 customers on ₹2 crore budgets');
});

test('a money word counted by another number is not a label', () => {
  blocks('Handled 2 crore budgets', 'Approved 3 budgets of ₹2 crore');
  blocks('Handled 2 crore budgets', 'Approved three budgets of ₹2 crore');
  // A glued digit counts nothing.
  passes('Handled 2 crore budgets', 'FY23 budgets of ₹2 crore');
});

test('a money word is never a count: countable words need the same count in the facts', () => {
  for (const [line, source] of [
    ['Processed 2 lakh loans', 'Disbursed loans of ₹2 lakh'],
    ['Won 2 crore grants', 'Won grants of ₹2 crore'],
    ['Closed 2 crore sales', 'Closed sales of ₹2 crore'],
    ['Managed 2 crore funds', 'Managed funds of ₹2 crore'],
    ['Made 2 crore investments', 'Made investments of ₹2 crore'],
    ['Collected 2 lakh fees', 'Collected fees of ₹2 lakh'],
    ['Cut 2 crore costs', 'Cut costs of ₹2 crore'],
    ['Managed 2 crore portfolios', 'Managed portfolios of ₹2 crore'],
  ]) {
    blocks(line, source);
  }
  passes('Grew 2 crore revenue', 'Grew revenue of ₹2 crore');
  passes('Ran 2 crore payroll', 'Ran payroll of ₹2 crore');
});

test('a money label backs only the lakh and crore spellings of the amount', () => {
  blocks('Handled 50k budgets', 'Budget: ₹50,000');
  blocks('Handled 20M budgets', 'Handled ₹2 crore budgets');
  passes('Handled 200 lakh budgets', 'Handled ₹2 crore budgets');
});

test('a label is one word next to the amount, through one linker at most', () => {
  blocks('Handled 2 crore budgets', 'Budgets for the region of ₹2 crore');
  blocks('Handled 2 crore budgets', 'Budgets from ₹2 crore');
  passes('Handled 2 crore budgets', 'Budgets worth ₹2 crore');
  passes('Handled 2 crore budget', 'Managed a ₹2 crore budget');
});

// ---------------------------------------------------------------------------
// Cost. Every builder is linear: one-line 30,000-character sources of the
// shapes that made earlier rules quadratic stay well under the bound, cold.
// ---------------------------------------------------------------------------

const N = 30000;
const ADVERSARIAL = {
  'comma run': `1${','.repeat(N - 1)}`,
  'digit-comma run': '1,'.repeat(N / 2),
  'Indian grouping run': `1${',11'.repeat(N / 3 - 1)}`,
  'digit run': '1'.repeat(N),
  '₹ run': '₹'.repeat(N),
  '₹ amount run': '₹1 '.repeat(N / 3),
  'Rs then digits': `${'Rs '.repeat(N / 6)}${'1'.repeat(N / 2)}`,
  '"1." run': '1.'.repeat(N / 2),
  'crore run': '1 crore '.repeat(N / 8),
  'labelled amount run': 'budgets of ₹2 crore '.repeat(N / 20),
  'rupees run': '2 crore rupees '.repeat(N / 15),
  'wrapped bullet run': '- a\n  b\n'.repeat(N / 8),
  'dated year run': 'since 2020 '.repeat(N / 11),
  'C-suite run': 'C-suite '.repeat(N / 8),
  'compound magnitude run': '₹2 lakh crore '.repeat(N / 14),
  'unreadable amount run': '₹2,5'.repeat(N / 4),
  'glued grouped number run': 'A1,500 '.repeat(N / 7),
  'C-suite audience run': 'Presented results to the C-suite '.repeat(N / 33),
  'rupee range run': '₹2-3 crore '.repeat(N / 11),
  'M&A run': '₹2 crore M&A '.repeat(N / 13),
};

for (const [name, body] of Object.entries(ADVERSARIAL)) {
  test(`a one-line 30,000-character ${name} is checked in under 500 ms, as source and as target`, () => {
    const source = `${body.slice(0, N - 20)} ${Date.now()}`;
    let started = performance.now();
    gate('Handled 2 crore budgets worth ₹2 crore', source);
    const asSource = performance.now() - started;
    started = performance.now();
    gate(source, 'Analyst.');
    const asTarget = performance.now() - started;
    assert.ok(asSource < 500, `${name} as source: ${asSource.toFixed(0)} ms`);
    assert.ok(asTarget < 500, `${name} as target: ${asTarget.toFixed(0)} ms`);
  });
}

test('a source of 1,500 labelled rupee amounts on one line is checked in under 500 ms', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const word = (i) => `${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}${letters[Math.floor(i / 676) % 26]}q`;
  let source = '';
  for (let i = 0; i < 1500; i++) source += `budgets of ₹${i + 1} crore ${word(i)} `;
  source = `${source.slice(0, 29980)} ${Date.now()}`;
  const started = performance.now();
  const result = gate('Handled 2 crore budgets', source);
  const ms = performance.now() - started;
  assert.deepEqual(result.invented, []);
  assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
});

// ---------------------------------------------------------------------------
// C-suite (coordinator scope, P1-19 regression). "C-suite" before an audience
// noun, or in "presented ... to the C-suite", names who the candidate worked
// with, not their own seniority.
// ---------------------------------------------------------------------------

// Any kind: "Served as a C-suite leader" is read as a title.
const seniority = (line) => gate(line, 'Analyst. Month-end close reporting.').unsupportedFacts.map((fact) => fact.value);

test('C-suite as an audience is not a seniority claim', () => {
  for (const line of ['Built the deck using a C-suite narrative.', 'Built the platform using a C-suite sponsor.',
    'a C-suite narrative', 'a C-suite sponsor', 'Presented quarterly results to the C-suite',
    'Prepared C-suite reporting packs', 'Briefed C-suite stakeholders monthly', 'Reported risks to the C-suite']) {
    assert.deepEqual(seniority(line), [], line);
  }
});

test('C-suite as the candidate role still blocks', () => {
  for (const line of ['C-suite executive with 10 years in finance', 'Served as a C-suite leader', 'C-suite reporting',
    'Promoted to the C-suite', 'C-suite leader of finance', 'Briefly promoted to the C-suite',
    'Presented results and was promoted to the C-suite', 'Reported results, then rose to the C-suite',
    // Review 1, edit 1: only a closed object list sits between the verb and "to the".
    'Recommended for promotion to the C-suite', 'Proposed for elevation to the C-suite',
    'Reported results then ascended to the C-suite', 'Presented my transition to the C-suite',
    'Briefed on my move to the C-suite', 'pitched himself to the c-suite',
    // Review 1, edit 2: one line, a short audience list, no role noun after it, no role predicate before.
    '- Member of the C-suite\n- Reviews vendor contracts', 'Member of the C-suite\nReports to the finance director',
    'Member of the C-suite — reviews all budgets', 'I am a C-suite audience', 'worked as a c-suite sponsor',
    'C-suite engagement lead', 'served on c-suite review boards', 'Was the C-suite sponsor',
    // Round 2: the shapes never cross a line, and a role verb before is a role.
    'Member of the C-suite\nSponsors the annual offsite', 'Member of the C-suite\nStakeholders included the board',
    'Appointed C-suite sponsor', 'Named C-suite sponsor', 'Acting C-suite sponsor']) {
    assert.ok(seniority(line).includes('c-suite'), line);
  }
});

test('award-winning needs an award in the facts (owner decision)', () => {
  assert.ok(gate('An award-winning analyst', 'Analyst. Month-end close reporting.').unsupportedFacts
    .some((fact) => fact.value === 'award'));
  assert.deepEqual(gate('An award-winning analyst', 'Won the CFO Excellence Award 2022').unsupportedFacts, []);
});

// ---------------------------------------------------------------------------
// Coverage reason (coordinator scope, P1-20 review). A language gap wins the
// reason: scope-not-checked blocks in the app, no-count-claims-recognized does
// not, so a line with both gaps must not come back as the weaker one.
// ---------------------------------------------------------------------------

test('a language gap wins the coverage reason over a count gap', () => {
  const source = `${SOURCE}\n- 4 anni, 3 mesi`;
  const withCounts = gate('lideró toda la función de finanzas en infosys, 4 anni, 3 mesi', source);
  assert.equal(withCounts.coverage?.reason, 'scope-not-checked');
  assert.ok(withCounts.coverage.spans.length > 0, 'the count spans are kept');
  const without = gate('lideró toda la función de finanzas en infosys', source);
  assert.equal(without.coverage?.reason, 'scope-not-checked');
});
