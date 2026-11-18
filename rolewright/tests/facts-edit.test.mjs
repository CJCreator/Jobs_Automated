import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFacts } from "../src/lib/facts.mjs";
import { MAX_REMOVALS, applyFactsEdit, parseRemovals } from "../src/lib/server/facts-edit.mjs";

const stored = normalizeFacts({
  summary: { text: "Finance analyst.", confirmed: true },
  cannotConfirm: ["12", "Tableau", "₹5 crore"],
}, { trustConfirmed: true });

test("a page that sends an empty can't-confirm list does not clear the stored one", () => {
  const edited = { ...stored, summary: { text: "Finance analyst in Bengaluru.", confirmed: true }, cannotConfirm: [] };
  const out = applyFactsEdit(stored, edited, []);
  assert.deepEqual(out.cannotConfirm, ["12", "Tableau", "₹5 crore"]);
  assert.equal(out.summary.text, "Finance analyst in Bengaluru.", "the rest of the edit is saved");
});

test("a page cannot add to the list either: it only grows through review actions", () => {
  const out = applyFactsEdit(stored, { ...stored, cannotConfirm: ["12", "Power BI"] }, []);
  assert.deepEqual(out.cannotConfirm, ["12", "Tableau", "₹5 crore"]);
});

test("a page that omits the list keeps it too", () => {
  const { cannotConfirm, ...rest } = stored;
  void cannotConfirm;
  assert.deepEqual(applyFactsEdit(stored, rest, []).cannotConfirm, ["12", "Tableau", "₹5 crore"]);
});

test("an explicit removal takes the entry off, matching without regard to case or spaces", () => {
  const out = applyFactsEdit(stored, stored, ["  tableau ", "₹5 CRORE"]);
  assert.deepEqual(out.cannotConfirm, ["12"]);
});

test("a removal that matches nothing is ignored", () => {
  assert.deepEqual(applyFactsEdit(stored, stored, ["Snowflake", ""]).cannotConfirm, ["12", "Tableau", "₹5 crore"]);
});

test("confirmations in the edit are trusted, unknown keys are dropped", () => {
  const out = applyFactsEdit(stored, { skills: [{ name: "SQL", confirmed: true }], suggestions: [{ decision: "accepted" }] }, []);
  assert.equal(out.skills[0].confirmed, true);
  assert.equal("suggestions" in out, false);
});

test("a stored list that is missing or malformed is treated as empty", () => {
  assert.deepEqual(applyFactsEdit({}, stored, []).cannotConfirm, []);
  assert.deepEqual(applyFactsEdit({ cannotConfirm: "12" }, stored, []).cannotConfirm, []);
  assert.deepEqual(applyFactsEdit({ cannotConfirm: [12, "Tableau"] }, stored, []).cannotConfirm, ["Tableau"]);
});

test("parseRemovals: absent means none; only a list of short strings is accepted", () => {
  assert.deepEqual(parseRemovals(undefined), []);
  assert.deepEqual(parseRemovals(["12", "Tableau"]), ["12", "Tableau"]);
  assert.deepEqual(parseRemovals([]), []);
  for (const bad of [null, "12", 12, { 0: "12" }, [12], ["ok", null], ["x".repeat(201)], Array(MAX_REMOVALS + 1).fill("a")]) {
    assert.equal(parseRemovals(bad), null, `refused: ${JSON.stringify(bad)?.slice(0, 40)}`);
  }
});
