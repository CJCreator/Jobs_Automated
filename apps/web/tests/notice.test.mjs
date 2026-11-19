import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTICE_VERSION, grievanceContact } from "../src/lib/notice.mjs";
import { en } from "../src/i18n/en.ts";

test("notice version is set", () => {
  assert.match(NOTICE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test("grievance contact: unset", () => {
  assert.deepEqual(grievanceContact({}), { name: "", email: "", set: false });
});

test("grievance contact: blank values", () => {
  const c = grievanceContact({ ROLEWRIGHT_GRIEVANCE_NAME: "   ", ROLEWRIGHT_GRIEVANCE_EMAIL: " " });
  assert.equal(c.set, false);
});

test("grievance contact: name only", () => {
  const c = grievanceContact({ ROLEWRIGHT_GRIEVANCE_NAME: "Asha Rao" });
  assert.equal(c.set, false);
  assert.equal(c.name, "Asha Rao");
});

test("grievance contact: bad email", () => {
  for (const email of ["nope", "a@b", "a b@c.com", "@c.com", "a@", "a@b.c?subject=x", "a@b.c&body=hi", "a@b.c%0d%0aSubject:x", "\"><script>@x.y"]) {
    const c = grievanceContact({ ROLEWRIGHT_GRIEVANCE_NAME: "Asha", ROLEWRIGHT_GRIEVANCE_EMAIL: email });
    assert.equal(c.set, false, email);
  }
});

test("grievance contact: both set, trimmed", () => {
  const c = grievanceContact({ ROLEWRIGHT_GRIEVANCE_NAME: " Asha Rao ", ROLEWRIGHT_GRIEVANCE_EMAIL: " grievance@example.com " });
  assert.deepEqual(c, { name: "Asha Rao", email: "grievance@example.com", set: true });
});

// P0-12: the notice names every recipient, in plain words, and says only what the code does.
const p = en.app.privacy;

test("notice: 'Who else handles your data' names each recipient and what it gets", () => {
  assert.equal(p.recipientsTitle, "Who else handles your data");
  assert.equal(p.recipients.length, 4);
  const text = p.recipients.join("\n");
  for (const [name, what] of [
    ["Resend", /email address/],
    ["Google", /name, email and picture/],
    ["Google Cloud", /Mumbai/],
    ["AI provider", /What goes to your AI provider/],
  ]) {
    assert.match(text, new RegExp(name), name);
    assert.match(text, what, name);
  }
  assert.match(p.recipients[0], /only if you sign in by email/);
  assert.match(p.recipients[1], /if you sign in with Google/);
});

test("notice: the page renders the recipients item", () => {
  const tsx = readFileSync(new URL("../src/components/privacy-notice.tsx", import.meta.url), "utf8");
  assert.match(tsx, /t\.recipientsTitle/);
  assert.match(tsx, /t\.recipients\.map/);
});

test("notice: account deletion says the consent record goes too", () => {
  assert.match(p.deleteBody, /consent record/);
});

test("notice: the privacy page's browser title matches the notice", () => {
  const page = readFileSync(new URL("../src/app/app/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(page, /title: "Privacy notice"/);
});

test("the old resume-upload consent strings are gone", () => {
  assert.equal("consent" in en.app.resume, false);
  assert.equal("consentError" in en.app.resume, false);
});
