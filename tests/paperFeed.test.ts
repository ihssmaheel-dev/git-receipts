import assert from "node:assert/strict";
import test from "node:test";
import { calculatePaperFeed, resolveLineEnds, unscaleLineEnds } from "../lib/paperFeed";

const paper = {
  visibleLines: 0,
  lineProgress: 0,
  tailProgress: 0,
  lineEnds: [90, 125, 170],
  height: 300,
} as const;

test("zoomed DOM rows feed to their actual paper positions without scaling twice", () => {
  for (const scale of [0.5, 232 / 360, 1, 1.25]) {
    const ends = unscaleLineEnds(paper.lineEnds.map((end) => end * scale), paper.height * scale, paper.height);
    for (let index = 0; index < ends.length; index += 1) {
      assert.ok(Math.abs(ends[index] - paper.lineEnds[index]) < 1e-8);
      const fed = calculatePaperFeed({ ...paper, state: "printing", lineEnds: ends, visibleLines: index + 1 });
      assert.ok(Math.abs(fed * scale - paper.lineEnds[index] * scale) < 1e-8, "Each printed row reaches the slot at its displayed position");
    }
    const tail = calculatePaperFeed({ ...paper, state: "printing", lineEnds: ends, visibleLines: 3, tailProgress: 1 });
    assert.equal(tail, paper.height);
  }
  assert.deepEqual(unscaleLineEnds([90], 0, 300), []);
  assert.deepEqual(unscaleLineEnds([90], 150, Number.NaN), []);
});

test("a new print keeps the header inside the slot until paper begins feeding", () => {
  assert.equal(calculatePaperFeed({ ...paper, state: "idle" }), 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "warming" }), 0);
  assert.equal(calculatePaperFeed({ ...paper, state: "handshake" }), 0);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing" }), 0);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", lineProgress: 0.5 }), 45);
});

test("text rows move continuously through boundaries and the QR section feeds before cutting", () => {
  const distances: number[] = [];
  for (let row = 0; row < paper.lineEnds.length; row += 1) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      distances.push(calculatePaperFeed({ ...paper, state: "printing", visibleLines: row, lineProgress: progress }));
    }
    assert.equal(
      calculatePaperFeed({ ...paper, state: "printing", visibleLines: row, lineProgress: 1 }),
      calculatePaperFeed({ ...paper, state: "printing", visibleLines: row + 1 }),
    );
  }
  for (const tailProgress of [0, 0.25, 0.5, 0.75, 1]) {
    distances.push(calculatePaperFeed({ ...paper, state: "printing", visibleLines: 3, tailProgress }));
  }
  assert.ok(distances.every((distance, index) => index === 0 || distance >= distances[index - 1]));
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", visibleLines: 3, tailProgress: 0.5 }), 235);
  assert.equal(distances.at(-1), 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "cutting", visibleLines: 3, tailProgress: 1 }), 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "done" }), 300);
});

test("invalid measurements and progress keep paper inside its physical bounds", () => {
  const invalid = { ...paper, state: "printing" as const, lineEnds: [-5, 100, Number.NaN, 80, 500] };
  assert.equal(calculatePaperFeed({ ...invalid, visibleLines: 2, lineProgress: 1 }), 100);
  assert.equal(calculatePaperFeed({ ...invalid, visibleLines: 3, lineProgress: 1 }), 100);
  assert.equal(calculatePaperFeed({ ...invalid, visibleLines: 4, lineProgress: 2 }), 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", visibleLines: -1, lineProgress: -1 }), 0);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", lineProgress: Number.NaN }), 0);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", visibleLines: 100, tailProgress: 2 }), 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", height: Number.NaN, lineProgress: 1 }), 0);
});

test("missing or mismatched measurements fall back to evenly spaced rows", () => {
  assert.deepEqual(resolveLineEnds([], 3, 300), [100, 200, 300]);
  assert.deepEqual(resolveLineEnds([90], 3, 300), [100, 200, 300]);
  assert.deepEqual(resolveLineEnds([90, 125, 170, 200], 3, 300), [100, 200, 300]);
  assert.deepEqual(resolveLineEnds([90, 125, 170], 3, 300), [90, 125, 170]);
  assert.deepEqual(resolveLineEnds([], 0, 300), []);
  assert.deepEqual(resolveLineEnds([], 3, Number.NaN), []);
  // Fallback rows move during the line phase instead of jumping at the tail.
  const fallback = resolveLineEnds([], 3, 300);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", lineEnds: fallback, lineProgress: 0.5 }), 50);
  assert.equal(calculatePaperFeed({ ...paper, state: "printing", lineEnds: fallback, visibleLines: 1 }), 100);
  assert.equal(
    calculatePaperFeed({ ...paper, state: "printing", lineEnds: fallback, visibleLines: 0, lineProgress: 1 }),
    calculatePaperFeed({ ...paper, state: "printing", lineEnds: fallback, visibleLines: 1 }),
  );
});
