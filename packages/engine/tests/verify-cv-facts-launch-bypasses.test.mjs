import { pass, fail } from './helpers.mjs';
import { verifyFactsFromText } from '../verify-cv-facts.mjs';
import { buildHtml } from '../generate-cover-letter.mjs';
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

// Review round 1.
// 1. The verb deny-list is case-insensitive: a capitalised verb opens a bullet.
for (const text of ['Looked at Kafka for the pipeline', '- Arrived at Consensus across teams', 'Attended a workshop at Google', 'Visited the team at Stripe']) {
  passes(`a capitalised non-work verb names no employer: ${text}`, text);
}

// 2. Truthful sentences about the company a letter is addressed to, with a source that has no Stripe.
for (const text of [
  'I applied for the Analyst role at Stripe because of its mission.',
  'Interested in the Senior Analyst position at Stripe.',
  'Excited by the Analyst opening at Stripe.',
  'I discovered the role at Stripe through LinkedIn.',
  'I learned of the opening at Stripe and applied.',
  'Experienced analyst interested in the Analyst role at Stripe.',
  'Motivated by what I read about engineering at Stripe.',
  'Inspired by the mission at Stripe, I managed vendor contracts.',
  'I managed vendor contracts, and loved what was built at Stripe.',
  'I managed vendor contracts and I would love to do the same at Stripe.',
]) {
  passes(`a sentence about the target company: ${text}`, text);
}
blocks('a bullet with a second job clause still blocks', 'Managed vendor contracts and budgets at Acme Corp', { facts: ['employer:acme corp'] });
blocks('a team count before the employer', 'Led a team of 4 at Acme Corp', { facts: ['employer:acme corp'] });

// 3. An adjective between the magnitude and the noun is not a second claim.
const SERVED = `${SOURCE_V}\n- Served 2 million users`;
passes('an adjective after a sourced magnitude (2M active users)', 'Served 2M active users', SERVED);
passes('a plus and an adjective (2M+ monthly users)', 'Served 2M+ monthly users', SERVED);
passes('a spelled magnitude with an adjective', 'Served 2 million happy users', SERVED);
blocks('an unsourced magnitude count still blocks', 'Processed 14M evaluations', { invented: ['14m evaluations'] });

// 4. The structured-title exemption is scoped to the title slot's own words.
const docWith = (role, bullet) => `<div class="job-company">Infosys</div><div class="job-role">${role}</div><ul><li>${bullet}</li></ul>`;
const wordsOf = (text, source = SOURCE_V) => run(text, source).unsupportedFacts.map(f => f.value);
{
  const r = wordsOf(docWith('Director', 'Managed vendor contracts as director of the unit'));
  if (r.includes('director')) pass('a title slot does not excuse the same word in a bullet'); else fail(`director in a bullet was swallowed by the title slot: ${JSON.stringify(r)}`);
  const g = wordsOf(docWith('Global Head of Finance', 'Managed global vendor contracts'));
  if (g.includes('global')) pass('global in a bullet is reported beside a Global title'); else fail(`global swallowed: ${JSON.stringify(g)}`);
  const t = run(docWith('Senior Director', 'Managed vendor contracts'), SOURCE_V);
  if (t.verdict === 'warn' && !wordsOf(docWith('Senior Director', 'Managed vendor contracts')).includes('director')) pass('a title slot alone still only warns');
  else fail(`a title slot alone: ${JSON.stringify(t)}`);
}
for (const text of ['Rolled the linter out across the entire organization', 'Rolled the linter out across the global org']) {
  const r = run(text, SOURCE_V);
  if (r.verdict === 'block') pass(`an adoption advisory does not swallow the word: ${text}`); else fail(`${text}: ${r.verdict}`);
}

// 5. Blank lines before the verb are read in linear time.
{
  const timed = (n) => { const t = performance.now(); verifyFactsFromText(`Managed${'\n '.repeat(n)}at Acme`, { sourceText: SOURCE_V }); return performance.now() - t; };
  timed(5000);
  const small = Math.max(timed(20000), 1);
  const large = timed(200000);
  if (large < 1000 || large / small < 40) pass('blank lines before "at" are read in linear time');
  else fail(`blank-line run scaled superlinearly: ${Math.round(small)} ms for 20,000, ${Math.round(large)} ms for 200,000`);
}

// 6. The target role's title is not a claim about the candidate.
for (const role of ['Senior Finance Manager', 'Finance Manager', 'Senior Analyst']) {
  const html = buildHtml({
    candidate: { name: 'Jane Doe' },
    letter: { role_title: role, company: 'Stripe', city: 'Dublin', opening: 'I managed vendor contracts.', profile_intro: 'Profile.' },
  });
  const r = verifyFactsFromText(html, { sourceText: SOURCE_V.replace('Senior Analyst', 'Analyst') });
  if (r.verdict !== 'block') pass(`a cover letter for the role "${role}" is not blocked by its title`);
  else fail(`role title ${role} blocked: ${JSON.stringify(r.unsupportedFacts)}`);
}
