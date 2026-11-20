// Fake provider for end-to-end tests. It misbehaves on purpose (invented
// figures, tools and employers) so tests can prove the fact check catches them.
import { LlmError } from "./errors.mjs";
import { PARSE_MARKER, TAILOR_MARKER } from "./prompts.mjs";

export const MOCK_KEY = "mock-valid-key";

export const MOCK_RESUME = {
  contact: { name: "Asha Rao", email: "asha.rao@example.com", phone: "", location: "Bengaluru", links: [] },
  summary: "Finance analyst with 4 years of experience in reporting and month-end close.",
  experience: [
    {
      company: "Infosys",
      title: "Senior Analyst",
      location: "Bengaluru",
      start: "2019",
      end: "2023",
      bullets: [
        "Reduced month-end close time by 30% using SQL and Power BI",
        "Managed a team of 4 analysts",
        "Handled budgets of ₹2 crore",
      ],
    },
  ],
  education: [{ school: "Christ University", degree: "B.Com", field: "", year: "2019" }],
  skills: ["SQL", "Power BI", "Excel"],
};

export async function mockVerifyKey({ key }) {
  if (key !== MOCK_KEY) throw new LlmError("invalid_key", "The mock provider did not accept this key.");
  return { models: [{ id: "mock-1", label: "Mock model" }], recommended: "mock-1" };
}

const INVENTED = [
  "Cut month-end close time by 30% with SQL and Power BI reporting",
  "Led a team of 12 analysts across reporting",
  "Handled budgets of ₹2 crore using Tableau at Google",
];
const INVENTED_SUMMARY = "Finance analyst with 4 years of experience managing ₹5 crore portfolios.";

export async function mockComplete({ system, user }) {
  if (system.includes(PARSE_MARKER)) return JSON.stringify(MOCK_RESUME);
  if (system.includes(TAILOR_MARKER)) {
    const start = user.indexOf("[");
    const end = user.indexOf("\n", start);
    let lines = [];
    try { lines = JSON.parse(user.slice(start, end === -1 ? undefined : end)); } catch { /* no lines */ }
    const out = [];
    let b = 0;
    for (const l of lines) {
      if (l.ref === "summary") out.push({ ref: l.ref, after: INVENTED_SUMMARY, rationale: "Shows the scale of work." });
      else if (b < INVENTED.length) out.push({ ref: l.ref, after: INVENTED[b++], rationale: "Matches the job's wording." });
    }
    // Bullets first, summary last, as the brief lists them.
    out.sort((x, y) => (x.ref === "summary") - (y.ref === "summary"));
    return JSON.stringify({ suggestions: out });
  }
  throw new LlmError("bad_response", "The mock provider did not recognise this request.");
}
