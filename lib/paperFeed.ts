import type { PrinterStage } from "./printMachine";

interface PaperFeedInput {
  state: PrinterStage;
  visibleLines: number;
  lineProgress: number;
  tailProgress: number;
  /** Measured bottom edge of each text row, relative to the top of the paper. */
  lineEnds: readonly number[];
  height: number;
}

function fraction(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Distance fed through the slot: the paper's leading edge leaves first. */
export function calculatePaperFeed({
  state, visibleLines, lineProgress, tailProgress, lineEnds, height,
}: PaperFeedInput): number {
  const paperHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  if (state === "idle" || state === "done" || state === "cutting") return paperHeight;
  if (state === "warming" || state === "handshake") return 0;

  // Preserve row indexes when measurements are missing, and prevent backwards feed.
  let previousEnd = 0;
  const ends = lineEnds.map((end) => {
    const measured = Number.isFinite(end) ? end : previousEnd;
    previousEnd = Math.max(previousEnd, Math.min(paperHeight, measured));
    return previousEnd;
  });
  const completed = Number.isFinite(visibleLines)
    ? Math.max(0, Math.min(ends.length, Math.floor(visibleLines)))
    : 0;
  const start = completed > 0 ? ends[completed - 1] : 0;
  if (completed < ends.length) {
    return start + (ends[completed] - start) * fraction(lineProgress);
  }
  return start + (paperHeight - start) * fraction(tailProgress);
}

/**
 * Measured row bottoms drive the feed; when measurement raced layout (or the
 * row count drifted from the printed lines), fall back to evenly spaced rows
 * so every line still moves paper instead of sitting retracted until the tail.
 */
export function resolveLineEnds(
  lineEnds: readonly number[],
  lineCount: number,
  height: number,
): number[] {
  const count = Number.isFinite(lineCount) ? Math.floor(lineCount) : 0;
  if (count > 0 && lineEnds.length === count) return [...lineEnds];
  if (count <= 0 || !Number.isFinite(height) || height <= 0) return [...lineEnds];
  return Array.from({ length: count }, (_, index) => height * (index + 1) / count);
}
