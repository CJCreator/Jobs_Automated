// Response shapes of the server routes (see the shared spec).

// Which providers exist is decided by the server (GET /api/providers).
export type ProviderId = string;

export interface ProviderOption {
  id: ProviderId;
  label: string;
  keyUrl: string;
  keyHint: string;
}

export interface StoredLlmKey {
  provider: ProviderId;
  key: string;
  model: string;
  verifiedAt: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export type VerifyResponse =
  | { ok: true; models: ModelOption[]; recommended: string | null }
  | { ok: false; code: string; message: string };

export type Source = "upload" | "user" | "model";

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  confirmed: boolean;
}

export interface Bullet {
  id: string;
  text: string;
  confirmed: boolean;
  source: Source;
}

export interface Job {
  id: string;
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  confirmed: boolean;
  source: Source;
  bullets: Bullet[];
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  year: string;
  confirmed: boolean;
  source: Source;
}

export interface Skill {
  id: string;
  name: string;
  confirmed: boolean;
  source: Source;
}

export interface Extra {
  id: string;
  text: string;
  confirmed: boolean;
  source: "user";
  statedAt: string;
}

export interface Facts {
  contact: Contact;
  summary: { text: string; confirmed: boolean; source: Source };
  experience: Job[];
  education: Education[];
  skills: Skill[];
  extras: Extra[];
  cannotConfirm: string[];
}

export interface Counts {
  confirmed: number;
  total: number;
}

/** Body of PUT /api/facts. The server keeps its own cannotConfirm list; removals are sent separately. */
export interface FactsSave {
  facts: Facts;
  removeCannotConfirm: string[];
}

export interface FactsResponse {
  facts: Facts;
  counts: Counts;
}

export interface TailoringListItem {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  pending: number;
  accepted: number;
}

export type Verdict = "pass" | "warn" | "block";

export interface CheckIssue {
  kind: string;
  value: string;
  message: string;
  /** Set on export-blocked issues: the suggestion, the resume line, and the exact exported text. */
  sid?: string | null;
  ref?: string | null;
  line?: string;
}

export interface Check {
  verdict: Verdict;
  issues: CheckIssue[];
  advisory: string[];
  engineRan: boolean;
}

export type Decision = "pending" | "accepted" | "rejected";

export interface Suggestion {
  id: string;
  ref: string;
  kind: "bullet" | "summary";
  context: string;
  before: string;
  after: string;
  rationale: string;
  check: Check;
  decision: Decision;
  finalText: string;
}

export interface Tailoring {
  id: string;
  title: string;
  company: string;
  jdText: string;
  suggestions: Suggestion[];
  createdAt: string;
}

export type SuggestionAction =
  | { action: "accept" }
  | { action: "reject" }
  | { action: "edit"; text: string }
  | { action: "attest"; value: string }
  | { action: "cannot_confirm"; value: string };
