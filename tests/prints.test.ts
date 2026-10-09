import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { closeDbClient, ensureDbSchema, getDbClient } from "../lib/db/client";
import { getPrintCount, isValidPrintInput, recordPrint } from "../lib/prints";

// In-memory SQLite: no files, no locks, fresh per test process.
process.env.SQLITE_URL = "file::memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
after(closeDbClient);

const year = new Date().getUTCFullYear();
const runA = "123e4567-e89b-42d3-a456-426614174000";
const runB = "123e4567-e89b-42d3-a456-426614174001";

test("print input validation rejects malformed receipts before any write", () => {
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "  ", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "https://github.com/octocat", year, runKey: runA }), true);
  assert.equal(isValidPrintInput({ username: "octocat/repo", year, runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year: 1999, runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: "not-a-uuid" }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year, runKey: "123e4567-e89b-12d3-a456-426614174000" }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year: "2025", runKey: runA }), false);
  assert.equal(isValidPrintInput({ username: "octocat", year }), false);
  for (const input of [null, undefined, [], true, 0, "octocat"]) {
    assert.equal(isValidPrintInput(input), false);
  }
  for (const username of [null, false, 0, [], {}]) {
    assert.equal(isValidPrintInput({ username, year, runKey: runA }), false);
  }
});

test("concurrent new and duplicate run keys increment only once per print", async () => {
  await ensureDbSchema();
  const db = getDbClient()!;
  const before = Number((await db.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value);
  const keys = Array.from({ length: 20 }, () => randomUUID());
  const results = await Promise.all(keys.flatMap((runKey) => [
    recordPrint({ username: "parallel", year, runKey, ipHash: "concurrent" }),
    recordPrint({ username: "parallel", year, runKey, ipHash: "concurrent" }),
  ]));
  assert.equal(results.filter((result) => result.counted).length, keys.length);
  assert.ok(results.every((result) => result.total !== null));
  assert.equal(Number((await db.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value), before + keys.length);
  assert.equal(Number((await db.execute("SELECT COUNT(*) AS total FROM print_events WHERE username = 'parallel'")).rows[0].total), keys.length);
  assert.equal(await getPrintCount(Date.now() + 60_001), before + keys.length);
});

test("a failed counter update rolls back the run key and permits a safe retry", async () => {
  await ensureDbSchema();
  const db = getDbClient()!;
  const before = Number((await db.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value);
  const runKey = randomUUID();
  await db.execute(`CREATE TRIGGER fail_print_count BEFORE UPDATE ON counters
    WHEN NEW.name = 'prints' BEGIN SELECT RAISE(ABORT, 'test counter failure'); END`);
  try {
    assert.deepEqual(await recordPrint({ username: "octocat", year, runKey, ipHash: "retry" }), {
      counted: false, total: null,
    });
    assert.equal(Number((await db.execute({ sql: "SELECT COUNT(*) AS total FROM print_events WHERE run_key = ?", args: [runKey] })).rows[0].total), 0);
    assert.equal(Number((await db.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value), before);
  } finally {
    await db.execute("DROP TRIGGER fail_print_count");
  }
  assert.deepEqual(await recordPrint({ username: "octocat", year, runKey, ipHash: "retry" }), {
    counted: true, total: before + 1,
  });
  assert.deepEqual(await recordPrint({ username: "octocat", year, runKey, ipHash: "retry" }), {
    counted: false, total: before + 1,
  });
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
  await ensureDbSchema();
  const before = Number((await getDbClient()!.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value);
  assert.deepEqual(
    await recordPrint({ username: "octocat", year, runKey: runA, ipHash: "hash-a" }),
    { counted: true, total: before + 1 },
  );
  assert.deepEqual(
    await recordPrint({ username: "octocat", year, runKey: runA, ipHash: "hash-a" }),
    { counted: false, total: before + 1 },
  );
  assert.deepEqual(
    await recordPrint({ year, runKey: runB, ipHash: "hash-b" }),
    { counted: true, total: before + 2 },
  );
  assert.equal(await getPrintCount(), before + 2);
});
