import { test } from "node:test";
import assert from "node:assert/strict";
import { errorLabel } from "../src/lib/server/log-label.mjs";

test("names the error class and keeps a system-style code", () => {
  assert.equal(errorLabel(Object.assign(new TypeError("boom"), { code: "ECONNREFUSED" })), " cause=TypeError/ECONNREFUSED");
  assert.equal(errorLabel(Object.assign(new Error("relation missing"), { code: "42P01" })), " cause=Error/42P01");
  assert.equal(errorLabel(new RangeError("x")), " cause=RangeError");
});

test("never includes the message", () => {
  const secret = "sk-live-KEY-should-never-be-logged-123";
  assert.ok(!errorLabel(new Error(`request failed for ${secret}`)).includes(secret));
});

test("drops a code that could be part of a key or of the request", () => {
  for (const code of ["mock-valid-key", "sk-ant-api03-abc", "AIzaSyD-shortish_key", "a b", "x".repeat(33), "ABC-123", 42]) {
    assert.equal(errorLabel(Object.assign(new Error("e"), { code })), " cause=Error", String(code));
  }
});

test("a hostile error name is reduced to word characters", () => {
  const err = new Error("e");
  err.name = "Bad name: sk-123 <script>";
  assert.equal(errorLabel(err), " cause=Badnamesk123script");
});

test("non-errors get no label", () => {
  assert.equal(errorLabel("a string"), "");
  assert.equal(errorLabel({ name: "Error", code: "E1" }), "");
  assert.equal(errorLabel(null), "");
});
