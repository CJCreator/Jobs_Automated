import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NOTICE_VERSION } from "../src/lib/notice.mjs";
import { en } from "../src/i18n/en.ts";

const lock = JSON.parse(readFileSync(new URL("./fixtures/notice-lock.json", import.meta.url), "utf8"));
// Functions (en.consent.lead) are rendered with a placeholder so the sentence the user ticks is locked too.
const render = (_k, v) => (typeof v === "function" ? v("{provider}") : v);
const sha256 = createHash("sha256")
  .update(JSON.stringify([en.app.privacy, en.notice, en.consent, en.consentStorage], render))
  .digest("hex");

test("the notice text matches the lock", () => {
  assert.equal(sha256, lock.sha256, "The notice text changed. Bump NOTICE_VERSION in src/lib/notice.mjs and update notice-lock.json.");
});

test("the lock is for the current notice version", () => {
  assert.equal(
    lock.version,
    NOTICE_VERSION,
    "The notice text changed. Bump NOTICE_VERSION in src/lib/notice.mjs and update notice-lock.json.",
  );
});
