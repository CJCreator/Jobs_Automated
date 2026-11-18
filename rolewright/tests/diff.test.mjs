import test from "node:test";
import assert from "node:assert/strict";
import { diffWords } from "../src/lib/diff.mjs";

const join = (parts, ...types) => parts.filter((p) => types.includes(p.type)).map((p) => p.text).join("");

function assertRoundTrip(before, after) {
  const parts = diffWords(before, after);
  assert.equal(join(parts, "same", "add"), after);
  assert.equal(join(parts, "same", "remove"), before);
  return parts;
}

test("identical strings are all same", () => {
  const parts = assertRoundTrip("Led a team of five", "Led a team of five");
  assert.deepEqual(parts, [{ type: "same", text: "Led a team of five" }]);
});

test("full replacement has no same words", () => {
  const parts = assertRoundTrip("alpha beta", "gamma delta");
  assert.ok(parts.every((p) => p.type !== "same"));
  assert.equal(join(parts, "remove"), "alpha beta");
  assert.equal(join(parts, "add"), "gamma delta");
});

test("insertion", () => {
  const parts = assertRoundTrip("Built the API", "Built the billing API");
  assert.equal(join(parts, "add").trim(), "billing");
  assert.equal(join(parts, "remove").trim(), "");
});

test("deletion", () => {
  const parts = assertRoundTrip("Built the billing API", "Built the API");
  assert.equal(join(parts, "remove").trim(), "billing");
  assert.equal(join(parts, "add").trim(), "");
});

test("₹ amounts and percentages are single tokens", () => {
  const parts = assertRoundTrip("Saved ₹12 lakh and cut cost 30% overall", "Saved ₹15 lakh and cut cost 40% overall");
  const removed = parts.filter((p) => p.type === "remove").map((p) => p.text.trim());
  const added = parts.filter((p) => p.type === "add").map((p) => p.text.trim());
  assert.deepEqual(removed, ["₹12", "30%"]);
  assert.deepEqual(added, ["₹15", "40%"]);
});

test("trailing punctuation is its own token, so only the change is marked", () => {
  const parts = assertRoundTrip("Shipped it, fast.", "Shipped it fast.");
  const removed = parts.filter((p) => p.type === "remove").map((p) => p.text.trim());
  assert.deepEqual(removed, [","]);
  const end = assertRoundTrip("Handled failed payments.", "Handled failed payments and refunds.");
  assert.ok(!end.some((p) => p.type === "remove" && p.text.includes("payments")), "the unchanged word is not struck through");
});

test("empty inputs", () => {
  assert.deepEqual(diffWords("", ""), []);
  assert.deepEqual(diffWords("", "new text"), [{ type: "add", text: "new text" }]);
  assert.deepEqual(diffWords("old text", ""), [{ type: "remove", text: "old text" }]);
});

test("whitespace differences still round-trip", () => {
  assertRoundTrip("a  b\tc", "a b  c\n");
});
