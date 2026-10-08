import assert from "node:assert/strict";
import test from "node:test";
import { getPrintCount, isValidPrintInput, recordPrint } from "../lib/prints";

// In-memory SQLite: no files, no locks, fresh per test process.
process.env.SQLITE_URL = "file::memory:";

const year = new Date().getUTCFullYear();
const runA = "123e4567-e89b-42d3-a456-426614174000";
const runB = "123e4567-e89b-42d3-a456-426614174001";

test("print input validation rejects malformed receipts before any write", () => {
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "https://github.com/octocat", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "octocat/repo", year, runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year: 1999, runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: "not-a-uuid" }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: "123e4567-e89b-12d3-a456-426614174000" }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year: "2025", runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year }), false);
});

test("invalid prints are never counted and never throw", async () => {
  assert.deepEqual(
    await recordPrint({ username: "octocat/repo", year, runKey: runA, ipHash: "test" }),
    { counted: false, total: null },
  );
  assert.deepEqual(
    await recordPrint({ username: "octocat", year: 1999, runKey: runA, ipHash: "test" }),
    { counted: false, total: null },
  );
});

test("each run key counts exactly once toward the public total", async () => {
  assert.deepEqual(
    await recordPrint({ username: "octocat", year, runKey: runA, ipHash: "hash-a" }),
    { counted: true, total: 1 },
  );
  assert.deepEqual(
    await recordPrint({ username: "octocat", year, runKey: runA, ipHash: "hash-a" }),
    { counted: false, total: 1 },
  );
  assert.deepEqual(
    await recordPrint({ year, runKey: runB, ipHash: "hash-b" }),
    { counted: true, total: 2 },
  );
  assert.equal(await getPrintCount(), 2);
});
