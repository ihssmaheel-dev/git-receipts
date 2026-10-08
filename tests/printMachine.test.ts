import assert from "node:assert/strict";
import test from "node:test";
import { createPrintState, printReducer, type PrintState } from "../lib/printMachine";

function begin(lineCount: number, runId = 1): PrintState {
  let state = printReducer(createPrintState(lineCount), { type: "start", runId, lineCount });
  state = printReducer(state, { type: "handshake", runId });
  return printReducer(state, { type: "print", runId });
}

test("the cutter waits for both the text and the entire QR/footer section", () => {
  let state = begin(2);
  state = printReducer(state, { type: "line", runId: 1 });
  assert.equal(state.visibleLines, 1);
  assert.equal(printReducer(state, { type: "cut", runId: 1 }).stage, "printing");
  state = printReducer(state, { type: "line", runId: 1 });
  assert.equal(printReducer(state, { type: "cut", runId: 1 }).stage, "printing");
  state = printReducer(state, { type: "tail", runId: 1, progress: 0.75 });
  assert.equal(printReducer(state, { type: "cut", runId: 1 }).stage, "printing");
  state = printReducer(state, { type: "tail", runId: 1, progress: 1 });
  state = printReducer(state, { type: "cut", runId: 1 });
  assert.equal(state.stage, "cutting");
  state = printReducer(state, { type: "done", runId: 1 });
  assert.equal(state.stage, "done");
  assert.equal(state.visibleLines, 2);
});

test("reset and a new account reject late events from the old print job", () => {
  let state = begin(4, 10);
  state = printReducer(state, { type: "line", runId: 10 });
  state = printReducer(state, { type: "reset", runId: 11, lineCount: 2 });
  state = printReducer(state, { type: "start", runId: 12, lineCount: 2 });
  const before = state;
  for (const type of ["handshake", "print", "line", "cut", "done"] as const) {
    state = printReducer(state, { type, runId: 10 });
  }
  state = printReducer(state, { type: "feed", runId: 10, progress: 1 });
  state = printReducer(state, { type: "tail", runId: 10, progress: 1 });
  state = printReducer(state, { type: "finish", runId: 10 });
  assert.deepEqual(state, before);
});

test("reprinting begins with blank paper and a double click cannot replace an active job", () => {
  let state = begin(1);
  state = printReducer(state, { type: "line", runId: 1 });
  const active = state;
  assert.equal(printReducer(state, { type: "start", runId: 2, lineCount: 5 }), active);
  state = printReducer(state, { type: "tail", runId: 1, progress: 1 });
  state = printReducer(state, { type: "cut", runId: 1 });
  state = printReducer(state, { type: "done", runId: 1 });
  state = printReducer(state, { type: "start", runId: 3, lineCount: 1 });
  assert.equal(state.stage, "warming");
  assert.equal(state.visibleLines, 0);
  assert.equal(state.lineProgress, 0);
  assert.equal(state.tailProgress, 0);
  assert.equal(state.runId, 3);
});

test("reduced motion returns the complete receipt immediately", () => {
  const state = printReducer(createPrintState(20), {
    type: "start", runId: 1, lineCount: 20, reducedMotion: true,
  });
  assert.equal(state.stage, "done");
  assert.equal(state.visibleLines, 20);
  assert.equal(state.tailProgress, 1);
});

test("unexpected transitions and extra ticks never skip a phase or reveal extra lines", () => {
  let state = createPrintState(1);
  assert.equal(printReducer(state, { type: "line", runId: 0 }), state);
  state = printReducer(state, { type: "start", runId: 1, lineCount: 1 });
  assert.equal(printReducer(state, { type: "done", runId: 1 }), state);
  state = printReducer(state, { type: "handshake", runId: 1 });
  state = printReducer(state, { type: "print", runId: 1 });
  state = printReducer(state, { type: "line", runId: 1 });
  assert.equal(printReducer(state, { type: "line", runId: 1 }), state);
});

test("an interrupted job leaves a complete receipt and can be printed again", () => {
  let state = begin(7);
  state = printReducer(state, { type: "error", runId: 1, message: "Interrupted" });
  assert.equal(state.stage, "done");
  assert.equal(state.visibleLines, 7);
  assert.equal(state.tailProgress, 1);
  assert.equal(state.error, "Interrupted");
  state = printReducer(state, { type: "start", runId: 2, lineCount: 7 });
  assert.equal(state.error, null);
  assert.equal(state.stage, "warming");
});

test("paper feed cannot run backwards or bring the QR section through early", () => {
  let state = begin(2);
  state = printReducer(state, { type: "feed", runId: 1, progress: 0.75 });
  assert.equal(state.visibleLines, 0);
  assert.equal(state.lineProgress, 0.75);
  state = printReducer(state, { type: "feed", runId: 1, progress: 0.25 });
  assert.equal(state.lineProgress, 0.75);
  assert.equal(printReducer(state, { type: "tail", runId: 1, progress: 1 }).tailProgress, 0);
  state = printReducer(state, { type: "line", runId: 1 });
  assert.equal(state.visibleLines, 1);
  assert.equal(state.lineProgress, 0);
  state = printReducer(state, { type: "line", runId: 1 });
  state = printReducer(state, { type: "tail", runId: 1, progress: 0.5 });
  state = printReducer(state, { type: "tail", runId: 1, progress: Number.NaN });
  assert.equal(state.tailProgress, 0.5);
  state = printReducer(state, { type: "tail", runId: 1, progress: 10 });
  assert.equal(state.tailProgress, 1);
});

test("enabling reduced motion during feed produces a usable receipt immediately", () => {
  let state = begin(12);
  state = printReducer(state, { type: "line", runId: 1 });
  state = printReducer(state, { type: "feed", runId: 1, progress: 0.5 });
  state = printReducer(state, { type: "finish", runId: 1 });
  assert.equal(state.stage, "done");
  assert.equal(state.visibleLines, 12);
  assert.equal(state.lineProgress, 0);
  assert.equal(state.tailProgress, 1);
  assert.equal(printReducer(state, { type: "feed", runId: 1, progress: 0.75 }), state);
});
