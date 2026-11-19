import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTICE_VERSION, grievanceContact } from "../src/lib/notice.mjs";

test("notice version is set", () => {
  assert.equal(NOTICE_VERSION, "2026-11-19.1");
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
