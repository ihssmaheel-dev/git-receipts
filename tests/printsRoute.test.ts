import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { GET, POST } from "../app/api/prints/route";
import { closeDbClient, getDbClient } from "../lib/db/client";

// Never let a developer's Turso configuration send test writes to a real store.
process.env.SQLITE_URL = "file::memory:";
process.env.RATE_LIMIT_PRINTS = "1000";
process.env.RATE_LIMIT_SALT = "print-route-test";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
after(closeDbClient);

const year = new Date().getUTCFullYear();
let address = 1;
function request(body?: BodyInit | null, headers: HeadersInit = {}): Request {
  const merged = new Headers(headers);
  if (!merged.has("x-forwarded-for")) merged.set("x-forwarded-for", `198.51.100.${address++}`);
  return new Request("https://git-receipts.example/api/prints", {
    method: body === undefined ? "GET" : "POST",
    headers: merged,
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}
function receipt(user: unknown = "octocat") {
  return { user, year, runKey: randomUUID() };
}
async function total(): Promise<number> {
  return Number((await getDbClient()!.execute("SELECT value FROM counters WHERE name = 'prints'")).rows[0].value);
}

test("unavailable telemetry returns a null GET total and an accepted uncounted POST", async () => {
  process.env.VERCEL = "1";
  closeDbClient();
  try {
    const read = await GET(request());
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { total: null });
    assert.equal(read.headers.get("cache-control"), "private, no-store");
    const write = await POST(request(JSON.stringify(receipt())));
    assert.equal(write.status, 202);
    assert.deepEqual(await write.json(), { counted: false, total: null });
  } finally {
    delete process.env.VERCEL;
    closeDbClient();
  }
});

test("POST validates the external user field, normalizes profile URLs, and deduplicates", async () => {
  const input = receipt("https://github.com/octocat");
  const first = await POST(request(JSON.stringify(input)));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { counted: true, total: 1 });
  const row = (await getDbClient()!.execute({ sql: "SELECT username FROM print_events WHERE run_key = ?", args: [input.runKey] })).rows[0];
  assert.equal(row.username, "octocat");
  const replay = await POST(request(JSON.stringify(input)));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { counted: false, total: 1 });
});

test("omitted and blank users count legitimate demo prints", async () => {
  const before = await total();
  for (const user of [undefined, "", "  "]) {
    const input = receipt(user);
    if (user === undefined) delete (input as { user?: unknown }).user;
    const response = await POST(request(JSON.stringify(input)));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).counted, true);
    const row = (await getDbClient()!.execute({ sql: "SELECT username FROM print_events WHERE run_key = ?", args: [input.runKey] })).rows[0];
    assert.equal(row.username, "demo");
  }
  assert.equal(await total(), before + 3);
});

test("null, arrays, primitive JSON, and invalid user values return 400 without counting", async () => {
  const before = await total();
  for (const body of [null, [], 0, true, "octocat", {},
    ...[null, false, 0, [], {}, "octocat/repo", "https://example.com/octocat"].map(receipt),
    { ...receipt(), year: "2025" }, { ...receipt(), runKey: "not-a-uuid" }]) {
    const response = await POST(request(JSON.stringify(body)));
    assert.equal(response.status, 400, `Unexpected status for ${JSON.stringify(body)}`);
  }
  assert.equal(await total(), before);
});

test("POST rejects malformed JSON and enforces bytes even without Content-Length", async () => {
  const before = await total();
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request(""))).status, 400);
  assert.equal((await POST(request(new Uint8Array([0xff])))).status, 400);
  assert.equal((await POST(request(JSON.stringify(receipt()), { "content-length": "1025" }))).status, 413);
  const unicodeBody = JSON.stringify({ ...receipt(), note: "é".repeat(500) });
  assert.ok(unicodeBody.length < 1024);
  assert.ok(new TextEncoder().encode(unicodeBody).byteLength > 1024);
  assert.equal((await POST(request(unicodeBody))).status, 413);
  assert.equal((await POST(request(" ".repeat(1025), { "content-length": "0" }))).status, 413);

  let cancelled = false;
  let chunks = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks += 1;
      controller.enqueue(new Uint8Array(512).fill(32));
    },
    cancel() { cancelled = true; },
  });
  assert.equal((await POST(request(stream))).status, 413);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 4, "The oversized stream must stop being consumed promptly.");
  assert.equal(await total(), before);
});

test("a valid JSON body at the 1024-byte boundary is accepted", async () => {
  const input = { ...receipt(), note: "" };
  input.note = "a".repeat(1024 - JSON.stringify(input).length);
  const body = JSON.stringify(input);
  assert.equal(new TextEncoder().encode(body).byteLength, 1024);
  const response = await POST(request(body));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).counted, true);
});

test("GET returns the latest cached total and has a separate limit from POST", async () => {
  process.env.RATE_LIMIT_PRINTS = "1";
  const headers = { "x-forwarded-for": "203.0.113.234" };
  try {
    const read = await GET(request(undefined, headers));
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { total: await total() });
    assert.equal(read.headers.get("cache-control"), "private, no-store");
    assert.equal((await GET(request(undefined, headers))).status, 429);
    const write = await POST(request(JSON.stringify(receipt()), headers));
    assert.equal(write.status, 200, "Reading the count must not consume the print budget.");
    assert.equal((await write.json()).counted, true);
    assert.equal((await POST(request(JSON.stringify(receipt()), headers))).status, 429);
  } finally {
    process.env.RATE_LIMIT_PRINTS = "1000";
  }
});
