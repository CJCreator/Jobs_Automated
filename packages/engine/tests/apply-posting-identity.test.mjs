// tests/apply-posting-identity.test.mjs — the apply modes save answers only to
// the report of the posting on screen (#5854).
//
// `modes/apply.md` compared the form's company and role with the matched report
// before drafting, then wrote `## Application Answers` and set Applied on
// whichever report Step 2 had found by company name. Nothing told a retitled
// posting (same application, its answers belong in its report) from a different
// posting at the same employer (another application, whose answers would
// overwrite this report's record). The Dutch mode guarded the write with an
// exact company-and-role match, which got the second case right and the first
// one wrong, and still set Applied on the row whose answers it refused to save.
//
// The rule now lives once, in English: "Posting identity" (Step 5) and "Write
// only to the report of this posting" (Step 8). Every translation points at
// those two names, which no translation changes, so that is how these checks
// find the rule in every language. A rename in apply.md breaks them here rather
// than leaving nineteen pointers at a heading that no longer exists.
import { pass, fail, ROOT } from './helpers.mjs';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ok = (name, fn) => { try { fn(); pass(name); } catch (e) { fail(`${name} — ${e.message}`); } };
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

const IDENTITY = 'Posting identity';
const WRITE_RULE = 'Write only to the report of this posting';

/** The `## ` section containing line `index`, heading included. */
function sectionAt(lines, index) {
  let start = index;
  while (start > 0 && !/^## /.test(lines[start])) start--;
  let end = index + 1;
  while (end < lines.length && !/^## /.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

/** The `## Step N` section of apply.md whose heading starts with `prefix`. */
function step(text, prefix) {
  const lines = text.split('\n');
  const at = lines.findIndex(l => l.startsWith(prefix));
  assert.ok(at !== -1, `no "${prefix}" heading`);
  return sectionAt(lines, at);
}

// ── The canonical rule ──────────────────────────────────────────────────────
const apply = read('modes/apply.md');

ok('apply.md defines the posting identity without the title', () => {
  const preflight = step(apply, '## Step 5 — Preflight gate');
  assert.ok(preflight.includes(`**${IDENTITY}`), 'Step 5 does not define the posting identity');
  assert.match(preflight, /\*\*Same employer\*\*/);
  assert.match(preflight, /\*\*Same posting\*\*/);
  assert.match(preflight, /title is not part of the identity/, 'does not say a retitled posting is still the same application');
});


ok('apply.md drafts an unsaved answer set without the other posting\'s report', () => {
  // The matched report, its Section H and its tailored CV were written for a
  // different posting, so a draft for the visible one must not lean on them.
  const draft = step(apply, '## Step 5 — Preflight gate').split('\n').find(l => l.includes('**Draft without saving**'));
  assert.match(draft, /matched report and its tailored CV aside/);
});

ok('apply.md Step 2 picks among a company\'s reports by posting before role', () => {
  // A retitled posting's report carries the old role. Narrowing by role first
  // dropped the one report whose URL matched, and Step 3 never saw it.
  const search = step(apply, '## Step 2 — Identify and search for context');
  assert.match(search, /first compare the posting URL or req ID/);
  assert.match(search, /even if its stored role differs/);
  assert.match(search, /Use the role only to narrow/);
});

ok('apply.md Step 3 leaves a different employer or posting to Step 5', () => {
  const roleChange = step(apply, '## Step 3 — Detect changes in the role');
  assert.ok(roleChange.includes(IDENTITY), 'Step 3 does not point at the posting identity');
  assert.match(roleChange, /is not a role change/);
});

ok('apply.md Step 8 says where the answers go in each case', () => {
  const persist = step(apply, '## Step 8 — Persist application snapshot');
  assert.ok(persist.includes(WRITE_RULE), `Step 8 has no "${WRITE_RULE}" rule`);
  const rows = persist.split('\n').filter(l => l.startsWith('| ') && !/^\|\s*-/.test(l)).slice(1);
  const row = (re) => rows.find(r => re.test(r)) ?? assert.fail(`no row for ${re}`);
  assert.match(row(/same title/), /The matched report/);
  assert.match(row(/\*\*adapt\*\*/), /The matched report/);
  assert.match(row(/\*\*re-evaluated\*\*/), /The matched report/);
  assert.match(row(/Different employer/), /Never the matched report/);
});

ok('apply.md Step 9 sets no status on a row that is another application', () => {
  const postApply = step(apply, '## Step 9 — Post-apply');
  assert.match(postApply, /set no status on the matched report's row/);
});

// ── The choices for a different posting, in every language ─────────────────
// The two choices carry their English labels in every mode, the way the rule
// names do, so the offer itself can be read without knowing the language: every
// block that offers a choice for a different posting may name only these two.
// A third bold option (an "adapt anyway", in any wording) fails here, which a
// check for one English phrase could not see in a translation.
const CHOICES = ['Draft without saving', 'Evaluate as new'];
const RULE_NAMES = new Set([IDENTITY, WRITE_RULE]);

/** Each block naming a choice: the sibling sub-bullets of one prompt, or one paragraph. */
function choiceBlocks(lines) {
  const blocks = new Map();
  lines.forEach((line, i) => {
    if (!CHOICES.some(c => line.includes(`**${c}**`))) return;
    const bullet = line.match(/^(\s+)- /);
    if (!bullet) {
      // A code span holds a field name such as `**URL:**`, never a choice.
      const prose = line.replace(/`[^`]*`/g, '');
      blocks.set(i, [...prose.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1]).filter(l => !RULE_NAMES.has(l)));
      return;
    }
    const sibling = (l) => l.startsWith(`${bullet[1]}- `);
    let start = i;
    while (start > 0 && sibling(lines[start - 1])) start--;
    let end = i;
    while (end + 1 < lines.length && sibling(lines[end + 1])) end++;
    blocks.set(start, lines.slice(start, end + 1).map(l => l.match(/^\s+- \*\*([^*]+)\*\*/)?.[1]).filter(Boolean));
  });
  return [...blocks.values()];
}

function assertChoices(text) {
  const blocks = choiceBlocks(text.split('\n'));
  assert.ok(blocks.some(b => CHOICES.every(c => b.includes(c))), 'no block offers both "Evaluate as new" and "Draft without saving"');
  for (const labels of blocks) {
    const extra = labels.filter(l => !CHOICES.includes(l));
    assert.deepStrictEqual(extra, [], `a different posting is offered more than the two choices: ${extra.join(', ')}`);
  }
}

ok('apply.md offers a different posting only the two choices', () => assertChoices(apply));

// Step 2 loaded the matched report's answers before anything checked that it
// was this posting's report, so a sibling posting's answers reached the context
// first. In every mode the list item that confirms the posting identity, and
// names the choices for a different posting, now comes before the item that
// loads `## Application Answers`.
function assertIdentityBeforeLoad(text) {
  // The workflow overview sits in a code fence and names the load step too.
  let fenced = false;
  const lines = text.split('\n').map(l => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return ''; }
    return fenced ? '' : l;
  });
  const item = (pred) => lines.findIndex(l => /^\d+\.\s/.test(l) && pred(l));
  const gate = item(l => l.includes(`**${IDENTITY}**`));
  const load = item(l => l.includes('## Application Answers'));
  assert.ok(gate !== -1, 'no list item confirms the posting identity');
  assert.ok(load !== -1, 'no list item loads ## Application Answers');
  assert.ok(gate < load, `answers are loaded (line ${load + 1}) before the posting identity is confirmed (line ${gate + 1})`);
}

// apply.md prints Step 5 above Step 2, so a file-wide order would pass on the
// preflight alone: it is read inside Step 2. (modes/ja and modes/vi had the same
// layout; non-India market sets were removed, ADR 0013.)
const searchStep = {
  'modes/apply.md': '## Step 2 — ',
};
const searchText = (file, text) => (searchStep[file] ? step(text, searchStep[file]) : text);

ok('apply.md confirms the posting before loading the report\'s answers', () => assertIdentityBeforeLoad(searchText('modes/apply.md', apply)));

// The workflow overview at the top of each mode is the first thing read; its
// LOAD line said "read the full report" with no condition at all.
function assertWorkflowLoadGated(text) {
  const lines = text.split('\n');
  const open = lines.findIndex(l => /^\s*```/.test(l));
  const close = lines.findIndex((l, i) => i > open && /^\s*```/.test(l));
  const load = lines.slice(open + 1, close).find(l => /^4\.\s/.test(l));
  assert.ok(load, 'no LOAD line in the workflow overview');
  assert.ok(load.includes(`**${IDENTITY}**`), `the workflow LOAD line loads the report unconditionally: ${load}`);
}

ok('apply.md: the workflow LOAD line waits for the posting identity', () => assertWorkflowLoadGated(apply));

// apply.md, modes/ja and modes/vi have a PREFLIGHT line in the overview. In vi
// it still asked for "company/role match", which stops a retitled posting that
// Step 3 would adapt; the line names the posting identity instead.
// (modes/ja and modes/vi were also checked here; non-India market sets were removed, ADR 0013.)
for (const file of ['modes/apply.md']) {
  ok(`${file}: the workflow PREFLIGHT line checks the posting identity, not the role`, () => {
    const line = read(file).split('\n').find(l => /^5\.\s+PREFLIGHT/.test(l));
    assert.ok(line, 'no PREFLIGHT line in the workflow overview');
    assert.ok(line.includes(`**${IDENTITY}**`), `the PREFLIGHT line does not check the posting identity: ${line}`);
  });
}

// apply.md, modes/ja and modes/vi compare the report in Step 5, after Step 2
// has picked it. "Load the full report, but read it only to compare" still put
// the other posting's answers in context, so Step 2 reads the header alone.
const headerFirst = {
  'modes/apply.md': { item: /^3\. If there is a match/, reads: 'read only the header of each matching report', loads: /→ load the full report/ },
};
for (const [file, expect] of Object.entries(headerFirst)) {
  ok(`${file}: Step 2 reads only report headers until the posting is confirmed`, () => {
    const item = step(read(file), searchStep[file]).split('\n').find(l => expect.item.test(l));
    assert.ok(item, 'no Step 2 match item');
    assert.ok(item.includes(expect.reads), 'Step 2 does not limit itself to the report header');
    assert.ok(!expect.loads.test(item), 'Step 2 still loads the full report before the posting is confirmed');
  });
}

// The modes that carry the canonical Steps 6 and 7 read the report there, far
// below the preflight, so the unsaved path has to be restated where it is read.
const generationSteps = {
  'modes/apply.md': ['## Step 6 — ', '## Step 7 — '],
};
for (const [file, headings] of Object.entries(generationSteps)) {
  ok(`${file}: the question and generation steps skip the report on an unsaved draft`, () => {
    const text = read(file);
    for (const heading of headings) assert.ok(step(text, heading).includes('**Draft without saving**'), `"${heading.trim()}" does not handle the unsaved path`);
  });
}

// ── Every translation points at it ──────────────────────────────────────────
const modeFiles = readdirSync(join(ROOT, 'modes'), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .flatMap(e => readdirSync(join(ROOT, 'modes', e.name)).filter(f => f.endsWith('.md')).map(f => `modes/${e.name}/${f}`))
  .sort();
// The "[X] → [Y]" role prompt is the part of the apply mode no translation
// changes (the order of the two varies), the same marker
// tests/modes-tracker-write-paths.test.mjs uses.
const isRolePrompt = (l) => l.includes('[X]') && l.includes('[Y]') && /^\s*-\s/.test(l);
const localized = modeFiles.filter(f => read(f).split('\n').some(isRolePrompt));

ok('the localized apply modes are found', () => {
  // Only modes/hi remains: non-India market sets were removed (ADR 0013). A
  // recognizer that silently stops matching would pass everything below.
  assert.ok(localized.includes('modes/hi/aavedan.md'), `modes/hi/aavedan.md not recognized: ${localized.join(', ')}`);
  assert.ok(localized.length >= 1, `only ${localized.length} localized apply modes recognized: ${localized.join(', ')}`);
});

/** The `## ` steps between the role change and post-apply whose lists read `## Application Answers`. */
function answerReadingSections(lines) {
  const role = lines.findIndex(isRolePrompt);
  const applied = lines.findIndex(l => l.includes('set-status.mjs') && l.includes('Applied'));
  const heads = lines.map((l, i) => (/^## /.test(l) ? i : -1)).filter(i => i !== -1);
  const found = [];
  heads.forEach((start, k) => {
    const end = heads[k + 1] ?? lines.length;
    if (start <= role || start > applied || (start < applied && applied < end)) return;
    const body = lines.slice(start, end);
    if (body.some(l => /^\s*(\d+\.|-)\s/.test(l) && l.includes('Application Answers'))) found.push({ heading: lines[start], body: body.join('\n') });
  });
  return found;
}

for (const file of localized) {
  const lines = read(file).split('\n');

  ok(`${file}: a different posting is offered only the two choices`, () => assertChoices(lines.join('\n')));

  ok(`${file}: the posting is confirmed before the report's answers are loaded`, () => assertIdentityBeforeLoad(searchText(file, lines.join('\n'))));

  ok(`${file}: the workflow LOAD line waits for the posting identity`, () => assertWorkflowLoadGated(lines.join('\n')));

  ok(`${file}: every step that reads the report's answers skips them on an unsaved draft`, () => {
    // The role-change step set the report aside on Draft without saving, but
    // the question and generation steps below it still said to reuse its
    // answers. Any step between the role change and post-apply whose list reads
    // `## Application Answers` must restate the exclusion itself.
    const sections = answerReadingSections(lines);
    assert.ok(sections.length > 0, 'no step reads the report\'s answers: the recognizer found nothing to check');
    for (const { heading, body } of sections) {
      assert.ok(body.includes('**Draft without saving**'), `"${heading}" reuses the report's answers with no unsaved-draft exclusion`);
    }
  });

  ok(`${file}: the role-change step points at the posting identity`, () => {
    const roleChange = sectionAt(lines, lines.findIndex(isRolePrompt));
    assert.ok(roleChange.includes(IDENTITY), `the role-change step does not mention "${IDENTITY}"`);
  });

  ok(`${file}: the post-apply step writes only to the report of this posting`, () => {
    const at = lines.findIndex(l => l.includes('set-status.mjs') && l.includes('Applied'));
    assert.ok(at !== -1, 'no line sets Applied with set-status.mjs');
    const postApply = sectionAt(lines, at);
    assert.ok(postApply.includes(WRITE_RULE), `the post-apply step does not mention "${WRITE_RULE}"`);
    // Submitted answers go to their own section; Block H stays the evaluation's
    // draft. modes/ar, modes/zh and modes/zh-TW wrote them into Block H.
    assert.ok(postApply.includes('## Application Answers'), 'the post-apply step does not save to ## Application Answers');
  });
}

// modes/sg, modes/nl, modes/zh and modes/zh-TW had their own checks here; non-India
// market sets were removed (ADR 0013).

// The output template opens with "Based on: Report #NNN | Score | Archetype".
// An unsaved draft has no report, so each template says what replaces it. The
// report-number placeholder is the part no translation changes.
for (const file of ['modes/apply.md', ...localized]) {
  ok(`${file}: the output header drops the report on an unsaved draft`, () => {
    const lines = read(file).split('\n');
    const at = lines.findIndex(l => /#(NNN|\{###\})/.test(l));
    assert.ok(at !== -1, 'no report-number line in the output template');
    assert.ok(lines[at + 1]?.includes('**Draft without saving**'), `the line after "${lines[at].trim()}" does not cover the unsaved draft`);
    // The replacement itself carries no report metadata. The placeholders are
    // read from this mode's own header line (#6030): a fixed list of archetype
    // words missed the Arabic one, and would miss any new locale's.
    const replacement = lines[at + 1];
    const placeholders = lines[at].match(/#NNN|\{[^}]+\}|\[[^\]]+\]|X[.,]X\/5/g) ?? [];
    assert.ok(placeholders.length >= 2, `could not read the header's placeholders: ${lines[at].trim()}`);
    const leaked = placeholders.filter(ph => replacement.includes(ph));
    assert.deepStrictEqual(leaked, [], `the unsaved-draft line still carries report metadata: ${leaked.join(', ')}`);
    assert.match(replacement, /["“「][^"”」]+["”」]/, 'the unsaved-draft line does not give the text that replaces the header');
  });
}
