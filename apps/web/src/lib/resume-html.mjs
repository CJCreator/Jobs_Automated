// The exported resume as one plain HTML document.
//
// Applicant-tracking software reads the PDF's text layer in order, so the
// layout is deliberately boring: one column, real text, headings in reading
// order, bullets as a list. No tables, columns, images or icons.
//
// Every value is user data (and an AI wrote some of it), so everything is
// escaped, and nothing here ever emits a script, an event handler, a link, an
// image or any URL the renderer could fetch. The CSP meta tag is a second
// lock in case a future edit forgets that.
//
// Pure, no I/O, so `node --test` can import it directly.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for an HTML text node or a quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** ASCII letters, digits and single dashes only: safe in a header and on any file system. */
const filenamePart = (v) =>
  String(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The download name for an exported resume, e.g. "Asha-Rao-Zeta-Fintech.pdf".
 * @param {string | null | undefined} name
 * @param {string | null | undefined} company
 */
export function resumeFilename(name, company) {
  const base = [filenamePart(name) || "resume", filenamePart(company)].filter(Boolean).join("-").slice(0, 80).replace(/-+$/, "");
  return `${base || "resume"}.pdf`;
}

const STYLE = `
@page { size: A4; margin: 16mm 18mm; }
* { box-sizing: border-box; }
html { color: #1C1B22; background: #FFFFFF; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.4;
}
h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 2pt; }
h2 {
  font-size: 12pt;
  margin: 14pt 0 5pt;
  padding-bottom: 2pt;
  border-bottom: 0.75pt solid #5B5866;
}
h3 { font-size: 11pt; margin: 9pt 0 1pt; }
p { margin: 0 0 4pt; }
.contact { color: #3A3842; margin-bottom: 6pt; }
.when { color: #3A3842; margin-bottom: 3pt; }
ul { margin: 0 0 4pt; padding-inline-start: 14pt; }
li { margin: 0 0 2pt; }
h2, h3 { break-after: avoid; page-break-after: avoid; }
li { break-inside: avoid; page-break-inside: avoid; }
`;

/**
 * Render a built resume as a complete HTML document.
 *
 * @param {{
 *   contact: { name?: string, email?: string, phone?: string, location?: string, links?: string[] } | null,
 *   summary?: string,
 *   experience?: { company?: string, title?: string, location?: string, dates?: string, bullets?: string[] }[],
 *   education?: string[],
 *   skills?: string[],
 * }} resume the `resume` from facts.mjs buildResume()
 * @returns {string}
 */
export function resumeHtml(resume) {
  const r = resume && typeof resume === "object" ? resume : {};
  const contact = r.contact && typeof r.contact === "object" ? r.contact : null;
  const name = text(contact?.name);
  const out = [];

  out.push(`<h1>${escapeHtml(name || "Resume")}</h1>`);
  if (contact) {
    const links = Array.isArray(contact.links) ? contact.links : [];
    const line = [contact.email, contact.phone, contact.location, ...links].map(text).filter(Boolean);
    if (line.length) out.push(`<p class="contact">${line.map(escapeHtml).join(" | ")}</p>`);
  }

  const summary = text(r.summary);
  if (summary) out.push("<h2>Summary</h2>", `<p>${escapeHtml(summary)}</p>`);

  const jobs = (Array.isArray(r.experience) ? r.experience : []).filter((e) => e && (text(e.title) || text(e.company)));
  if (jobs.length) {
    out.push("<h2>Experience</h2>");
    for (const job of jobs) {
      const heading = [text(job.title), text(job.company)].filter(Boolean).join(", ");
      out.push(`<h3>${escapeHtml(heading)}</h3>`);
      const when = [text(job.dates), text(job.location)].filter(Boolean).join(" | ");
      if (when) out.push(`<p class="when">${escapeHtml(when)}</p>`);
      const bullets = (Array.isArray(job.bullets) ? job.bullets : []).map(text).filter(Boolean);
      if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
    }
  }

  const education = (Array.isArray(r.education) ? r.education : []).map(text).filter(Boolean);
  if (education.length) out.push("<h2>Education</h2>", `<ul>${education.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`);

  const skills = (Array.isArray(r.skills) ? r.skills : []).map(text).filter(Boolean);
  if (skills.length) out.push("<h2>Skills</h2>", `<p>${skills.map(escapeHtml).join(", ")}</p>`);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    `<title>${escapeHtml(name ? `${name} resume` : "Resume")}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    ...out,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
