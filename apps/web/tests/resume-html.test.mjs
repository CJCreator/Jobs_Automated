import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, resumeFilename, resumeHtml } from "../src/lib/resume-html.mjs";
import { buildResume, normalizeFacts } from "../src/lib/facts.mjs";

const RESUME = {
  contact: { name: "Asha Rao", email: "asha.rao@example.com", phone: "+91 98450 00000", location: "Bengaluru", links: ["linkedin.com/in/asharao"], confirmed: true },
  summary: "Finance analyst with 4 years of experience in reporting and month-end close.",
  experience: [{
    company: "Infosys", title: "Senior Analyst", location: "Bengaluru", dates: "2019 – 2023",
    bullets: ["Reduced month-end close time by 30% using SQL and Power BI", "Managed a team of 4 analysts", "Handled budgets of ₹2 crore"],
  }],
  education: ["B.Com, Christ University, 2019"],
  skills: ["SQL", "Power BI", "Excel"],
};

/** Everything that could run code or fetch something. */
function assertInert(html) {
  assert.doesNotMatch(html, /<script/i, "no script element");
  assert.doesNotMatch(html, /<link/i, "no link element");
  assert.doesNotMatch(html, /<img/i, "no image");
  assert.doesNotMatch(html, /<(?:iframe|object|embed|svg|base|form|a)\b/i, "no embedding or link elements");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no event handler attribute");
  assert.doesNotMatch(html, /\s(?:href|src|srcset|action|formaction|xlink:href)\s*=/i, "no attribute that loads or links a URL");
  assert.doesNotMatch(html, /url\(|@import/i, "no CSS that loads a URL");
  assert.doesNotMatch(html, /(?:https?:|javascript:|file:|data:)\/?\/?/i, "no URL scheme anywhere");
}

test("a complete, single-column document with the expected structure", () => {
  const html = resumeHtml(RESUME);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /@page \{ size: A4; margin: [^}]+\}/);
  assert.match(html, /<h1>Asha Rao<\/h1>/);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.deepEqual([...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]), ["Summary", "Experience", "Education", "Skills"]);
  assert.match(html, /<h3>Senior Analyst, Infosys<\/h3>\n<p class="when">2019 – 2023 \| Bengaluru<\/p>/);
  assert.match(html, /<ul><li>Reduced month-end close time by 30% using SQL and Power BI<\/li><li>Managed a team of 4 analysts<\/li><li>Handled budgets of ₹2 crore<\/li><\/ul>/);
  assert.match(html, /<p>SQL, Power BI, Excel<\/p>/);
  assert.match(html, /font-family: system-ui/);
  assert.doesNotMatch(html, /<table|display:\s*(?:grid|flex)|columns?:|float:/i, "no layout tables, grids, columns or floats");
  assertInert(html);
});

test("contact links are printed as plain text, never as links", () => {
  const html = resumeHtml(RESUME);
  assert.match(html, /<p class="contact">asha\.rao@example\.com \| \+91 98450 00000 \| Bengaluru \| linkedin\.com\/in\/asharao<\/p>/);
  assert.doesNotMatch(html, /<a\b|mailto:|tel:/i);
});

test("every value is escaped: an injected script, quotes and handlers come out as text", () => {
  const hostile = {
    contact: { name: 'Asha "<b>" Rao', email: "x@example.com\" onmouseover=\"alert(1)", links: ["<img src=x onerror=alert(1)>"] },
    summary: "Summary with <style>body{display:none}</style> & an ampersand",
    experience: [{
      company: "Infosys</h3><script>alert(1)</script>",
      title: "Analyst' onload='alert(1)",
      dates: "2019",
      bullets: ['<script>alert(1)</script> and "quoted" text', "<a href=\"https://evil.example/x\">click</a>", "url(https://evil.example/x.png)"],
    }],
    education: ["<link rel=stylesheet href=https://evil.example/x.css>"],
    skills: ["<iframe src=javascript:alert(1)>", "C++ & C#"],
  };
  const html = resumeHtml(hostile);
  assert.match(html, /<li>&lt;script&gt;alert\(1\)&lt;\/script&gt; and &quot;quoted&quot; text<\/li>/);
  assert.match(html, /<h1>Asha &quot;&lt;b&gt;&quot; Rao<\/h1>/);
  assert.match(html, /Analyst&#39; onload=&#39;alert\(1\), Infosys&lt;\/h3&gt;&lt;script&gt;/);
  assert.match(html, /C\+\+ &amp; C#/);
  assert.match(html, /&lt;style&gt;body\{display:none\}&lt;\/style&gt; &amp; an ampersand/);

  // Only the template's own tags exist, with only the template's own attributes.
  // Every "<" from the data is escaped, so each real tag below is the template's.
  const allowedTags = new Set(["html", "head", "meta", "title", "style", "body", "h1", "h2", "h3", "p", "ul", "li"]);
  const allowedAttrs = new Set([
    "",
    'lang="en"',
    'charset="utf-8"',
    `http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"`,
    'class="contact"',
    'class="when"',
  ]);
  for (const m of html.matchAll(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    assert.ok(allowedTags.has(m[1].toLowerCase()), `unexpected tag <${m[1]}>`);
    assert.ok(allowedAttrs.has(m[2].trim()), `unexpected attributes on <${m[1]}>: ${m[2]}`);
  }
  assert.equal((html.match(/<style>/g) ?? []).length, 1, "only the template's own style element");
  assert.equal((html.match(/<\/h3>/g) ?? []).length, 1);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotMatch(css, /evil|url\(|@import|display:\s*none/i, "data never reaches the style sheet");
  // The hostile URL is body text, not something the renderer would fetch.
  assert.match(html, /<li>url\(https:\/\/evil\.example\/x\.png\)<\/li>/);
  assert.doesNotMatch(html, /<script|<img|<link|<iframe|<a\b/i);
});

test("the CSP meta tag forbids loading anything but the inline style", () => {
  const html = resumeHtml(RESUME);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">/);
});

test("empty sections are left out, and a missing contact still gives a title", () => {
  const html = resumeHtml({ contact: null, summary: "", experience: [], education: [], skills: [] });
  assert.match(html, /<h1>Resume<\/h1>/);
  assert.doesNotMatch(html, /<h2>/);
  assert.doesNotMatch(html, /class="contact"/);
  assert.doesNotMatch(resumeHtml(null), /<h2>/);
});

test("works on the output of buildResume, with an accepted change in place", () => {
  const facts = normalizeFacts({
    contact: { name: "Asha Rao", email: "asha.rao@example.com", confirmed: true },
    experience: [{ id: "exp-infosys", company: "Infosys", title: "Senior Analyst", start: "2019", end: "2023", confirmed: true,
      bullets: [{ id: "b-team-size", text: "Managed a team of 4 analysts", confirmed: true }, { id: "b-hidden", text: "Not confirmed", confirmed: false }] }],
  }, { trustConfirmed: true });
  const { resume } = buildResume(facts, [{ ref: "bullet:exp-infosys:b-team-size", decision: "accepted", finalText: "Managed and mentored a team of 4 analysts" }]);
  const html = resumeHtml(resume);
  assert.match(html, /<li>Managed and mentored a team of 4 analysts<\/li>/);
  assert.doesNotMatch(html, /Not confirmed/);
  assertInert(html);
});

test("the download filename is ASCII letters, digits and dashes only", () => {
  assert.equal(resumeFilename("Asha Rao", "Zeta Fintech"), "Asha-Rao-Zeta-Fintech.pdf");
  assert.equal(resumeFilename("Aśhā  Rāo", "Café & Co."), "Asha-Rao-Cafe-Co.pdf");
  assert.equal(resumeFilename('Asha"; filename="evil.exe', "Zeta\r\nSet-Cookie: x=1"), "Asha-filename-evil-exe-Zeta-Set-Cookie-x-1.pdf");
  assert.equal(resumeFilename("", ""), "resume.pdf");
  assert.equal(resumeFilename(null, undefined), "resume.pdf");
  assert.equal(resumeFilename("राहुल", "इन्फोसिस"), "resume.pdf");
  assert.equal(resumeFilename("../../etc/passwd", "x"), "etc-passwd-x.pdf");
  const long = resumeFilename("A".repeat(200), "B".repeat(200));
  assert.ok(long.length <= 84);
  for (const name of [resumeFilename('a"b', "c\\d"), long]) assert.match(name, /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.pdf$/);
});

test("escapeHtml covers the five significant characters", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
});
