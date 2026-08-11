import assert from "node:assert/strict";
import test from "node:test";
import { accessCodesMatch, createAccessCookie, verifyAccessCookie } from "../app/access-session.ts";

test("access code comparison normalizes formatting and rejects other values", async () => {
  assert.equal(await accessCodesMatch("rose-man 24", "ROSEMAN24"), true);
  assert.equal(await accessCodesMatch("rose-man 25", "ROSEMAN24"), false);
});

test("signed access cookie lasts twelve hours and rejects tampering", async () => {
  const now = Date.UTC(2026, 7, 11, 12);
  const value = await createAccessCookie("test-session-secret-with-sufficient-length", now);
  assert.equal(await verifyAccessCookie(value, "test-session-secret-with-sufficient-length", now + 11 * 60 * 60 * 1000), true);
  assert.equal(await verifyAccessCookie(value, "test-session-secret-with-sufficient-length", now + 13 * 60 * 60 * 1000), false);
  assert.equal(await verifyAccessCookie(`${value}x`, "test-session-secret-with-sufficient-length", now), false);
  assert.equal(await verifyAccessCookie(value, "different-secret", now), false);
});
