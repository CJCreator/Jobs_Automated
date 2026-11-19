import { pass, fail } from './helpers.mjs';
import { verifyFactsFromText } from '../verify-cv-facts.mjs';
import { SOURCE, SOURCE_V, HONEST } from '../../../apps/web/tests/fixtures/honest-lines.mjs';

console.log('\nLaunch bypasses: trailing employer, magnitude counts, sourced claim words');

// No config is passed anywhere in this file: the engine alone has to block these.
const run = (text, sourceText) => verifyFactsFromText(text, { sourceText });
const facts = (r) => r.unsupportedFacts.map(({ kind, value }) => `${kind}:${value}`);

const blocks = (label, text, { source = SOURCE_V, facts: wantFacts = [], invented = [] } = {}) => {
  const r = run(text, source);
  const got = facts(r);
  const problems = [];
  if (r.verdict !== 'block') problems.push(`verdict ${r.verdict}`);
  for (const f of wantFacts) if (!got.includes(f)) problems.push(`missing fact ${f} in ${JSON.stringify(got)}`);
  for (const i of invented) if (!r.invented.includes(i)) problems.push(`missing invented ${i} in ${JSON.stringify(r.invented)}`);
  if (problems.length) fail(`${label}: ${problems.join('; ')}`);
  else pass(label);
};
const passes = (label, text, source = SOURCE_V) => {
  const r = run(text, source);
  if (r.verdict === 'block') fail(`${label}: blocked ${JSON.stringify({ invented: r.invented, unsupportedFacts: r.unsupportedFacts })}`);
  else pass(label);
};

blocks('trailing employer is read', 'Managed vendor contracts at Acme Corp', { facts: ['employer:acme corp'] });
blocks('magnitude count with a noun outside the metric list', 'Managed vendor contracts for 14M evaluations per month', { invented: ['14m evaluations'] });
blocks('magnitude count opening the bullet', 'Processed 14M evaluations per month', { invented: ['14m evaluations'] });
blocks('spelled magnitude count', 'Processed 14 million evaluations per month', { invented: ['14m evaluations'] });
blocks('credential-family word absent from the source', 'Managed Global vendor contracts', { facts: ['scope:global'] });
blocks('two claim words in one line', 'Led a Certified Expert vendor programme', { facts: ['credential:certified', 'expertise:expert'] });
blocks('claim word in lower case', 'Managed global vendor contracts', { facts: ['scope:global'] });
blocks('claim word in upper case', 'MANAGED GLOBAL VENDOR CONTRACTS', { facts: ['scope:global'] });
blocks('seniority word absent from the source', 'Promoted to finance manager at Infosys', { facts: ['seniority:manager'] });

// The app rewrites "A/B/C" to "A, B, C" before calling the engine, which reads a
// slash list as one tool; this test makes the same rewrite so it checks the new
// rules and not that old behaviour.
const asTheAppSendsIt = (text) => text.replace(/([\p{L}\p{N}+#])\s?\/\s?(?=[\p{L}\p{N}])/gu, '$1, ');
for (const line of HONEST) passes(`honest line passes: ${line}`, asTheAppSendsIt(line), SOURCE);
passes('seniority from the source is supported', 'Senior Analyst at Infosys who reduced month-end close time by 30%');
passes('the same magnitude count in the source', 'Processed 14M evaluations per month', `${SOURCE_V}\n- Processed 14M evaluations per month`);
passes('the trailing employer is in the source', 'Managed vendor contracts at Acme Corp', `${SOURCE_V}\n\n### Acme Corp\n- Closed the books`);
passes('a currency amount is not a magnitude count', 'Handled budgets of $2M and managed vendor contracts', `${SOURCE_V}\n- Budget of $2M`);
passes('a cover letter about the target company', 'I admired the work done at Stripe, and managed vendor contracts at Infosys.');
passes('a lower-case place after "at"', 'Managed vendor contracts at the office');
