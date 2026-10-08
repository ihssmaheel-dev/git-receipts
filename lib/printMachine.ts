export type PrinterStage =
  | "idle"
  | "warming"
  | "handshake"
  | "printing"
  | "cutting"
  | "done";

export interface PrintState {
  stage: PrinterStage;
  visibleLines: number;
  /** Feed through the next line, before that line has left the print head. */
  lineProgress: number;
  /** QR, signature, and trailing paper feed after the final text line. */
  tailProgress: number;
  lineCount: number;
  /** Identifies a print job so callbacks from a cancelled job are ignored. */
  runId: number;
  error: string | null;
}

export type PrintAction =
  | { type: "start"; runId: number; lineCount: number; reducedMotion?: boolean }
  | { type: "handshake" | "print" | "line" | "cut" | "done"; runId: number }
  | { type: "feed" | "tail"; runId: number; progress: number }
  | { type: "finish"; runId: number }
  | { type: "error"; runId: number; message: string }
  | { type: "reset"; runId: number; lineCount: number };

function normalizeCount(lineCount: number): number {
  return Number.isFinite(lineCount) ? Math.max(0, Math.floor(lineCount)) : 0;
}

function normalizeProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

export function createPrintState(lineCount: number): PrintState {
  return {
    stage: "idle",
    visibleLines: 0,
    lineProgress: 0,
    tailProgress: 0,
    lineCount: normalizeCount(lineCount),
    runId: 0,
    error: null,
  };
}

export function isPrinting(stage: PrinterStage): boolean {
  return stage !== "idle" && stage !== "done";
}

/** Pure transitions; the client hook owns timing and optional audio. */
export function printReducer(state: PrintState, action: PrintAction): PrintState {
  if (action.type === "reset") {
    return { ...createPrintState(action.lineCount), runId: action.runId };
  }

  if (action.type === "start") {
    if (isPrinting(state.stage)) return state;
    const lineCount = normalizeCount(action.lineCount);
    return {
      stage: action.reducedMotion ? "done" : "warming",
      visibleLines: action.reducedMotion ? lineCount : 0,
      lineProgress: 0,
      tailProgress: action.reducedMotion ? 1 : 0,
      lineCount,
      runId: action.runId,
      error: null,
    };
  }

  if (action.runId !== state.runId) return state;

  switch (action.type) {
    case "handshake":
      return state.stage === "warming" ? { ...state, stage: "handshake" } : state;
    case "print":
      return state.stage === "handshake" ? { ...state, stage: "printing" } : state;
    case "feed":
      return state.stage === "printing" && state.visibleLines < state.lineCount
        ? { ...state, lineProgress: Math.max(state.lineProgress, normalizeProgress(action.progress)) }
        : state;
    case "line":
      return state.stage === "printing" && state.visibleLines < state.lineCount
        ? { ...state, visibleLines: state.visibleLines + 1, lineProgress: 0 }
        : state;
    case "tail":
      return state.stage === "printing" && state.visibleLines === state.lineCount
        ? { ...state, tailProgress: Math.max(state.tailProgress, normalizeProgress(action.progress)) }
        : state;
    case "cut":
      return state.stage === "printing" && state.visibleLines === state.lineCount && state.tailProgress === 1
        ? { ...state, stage: "cutting" }
        : state;
    case "done":
      return state.stage === "cutting" ? { ...state, stage: "done" } : state;
    case "finish":
      // Switching reduced motion on completes the current receipt in place.
      return isPrinting(state.stage)
        ? { ...state, stage: "done", visibleLines: state.lineCount, lineProgress: 0, tailProgress: 1 }
        : state;
    case "error":
      // Retain a usable receipt even if the animation cannot continue.
      return isPrinting(state.stage)
        ? { ...state, stage: "done", visibleLines: state.lineCount, lineProgress: 0, tailProgress: 1, error: action.message }
        : state;
  }
}
