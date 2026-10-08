"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ReceiptLine } from "@/lib/types";
import { createPrintState, isPrinting, printReducer } from "@/lib/printMachine";
import { createPrinterSound, type PrinterSound } from "@/lib/sound";

const WARMUP_MS = 650;
const HANDSHAKE_MS = 450;
const FEED_STEPS = 4;
const TAIL_STEPS = 12;
const TAIL_FEED_MS = 1_200;
const CUT_DELAY_MS = 180;
const CUT_DURATION_MS = 440;

function lineDelay(line: ReceiptLine): number {
  switch (line.type) {
    case "heading":
      return 540;
    case "divider":
      return 290;
    case "spacer":
      return 135;
    case "total":
      return 340;
    case "footer":
      return 240;
    default:
      return 140;
  }
}

/**
 * Start this hook from a click/keyboard handler to unlock optional browser audio.
 * Idle exposes zero lines; the view can render its complete server-side preview.
 * Only one timer drives line visibility and sound, and reset invalidates its job.
 */
export function usePrinter(lines: readonly ReceiptLine[]) {
  const [machine, dispatch] = useReducer(printReducer, lines.length, createPrintState);
  const [muted, setMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mutedRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<PrinterSound | null>(null);
  const runRef = useRef(0);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const cancelJob = useCallback(() => {
    runRef.current += 1;
    busyRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    soundRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    cancelJob();
    dispatch({ type: "reset", runId: runRef.current, lineCount: linesRef.current.length });
  }, [cancelJob]);

  useEffect(() => {
    mountedRef.current = true;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reducedMotionRef.current = media.matches;
      setReducedMotion(media.matches);
      if (media.matches && busyRef.current) {
        const runId = runRef.current;
        cancelJob();
        dispatch({ type: "finish", runId });
      }
    };
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => {
      mountedRef.current = false;
      media.removeEventListener("change", updatePreference);
      cancelJob();
      soundRef.current?.close();
      soundRef.current = null;
    };
  }, [cancelJob]);

  // A different receipt invalidates any pending work from the previous account.
  useEffect(() => {
    reset();
  }, [lines, reset]);

  const toggleMuted = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    // This callback is also a user gesture, so enabling sound can unlock audio.
    if (!nextMuted && !soundRef.current) soundRef.current = createPrinterSound(false);
    soundRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  }, []);

  const startPrint = useCallback(() => {
    if (busyRef.current || !mountedRef.current) return;
    cancelJob();
    const runId = runRef.current;
    const jobLines = [...linesRef.current];

    // Allocate and resume synchronously inside a gesture, only after sound is enabled.
    if (!mutedRef.current && !soundRef.current) soundRef.current = createPrinterSound(false);
    soundRef.current?.setMuted(mutedRef.current);
    soundRef.current?.resume();

    const skipAnimation = reducedMotionRef.current;
    dispatch({ type: "start", runId, lineCount: jobLines.length, reducedMotion: skipAnimation });
    if (skipAnimation) return;
    busyRef.current = true;
    soundRef.current?.play("warm");

    const schedule = (delay: number, callback: () => void) => {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!mountedRef.current || runId !== runRef.current) return;
        try {
          callback();
        } catch {
          busyRef.current = false;
          soundRef.current?.stop();
          dispatch({ type: "error", runId, message: "Print interrupted. Open View receipt to see the complete receipt." });
        }
      }, delay);
    };

    const cut = () => {
      dispatch({ type: "cut", runId });
      soundRef.current?.play("cut");
      schedule(CUT_DURATION_MS, () => {
        busyRef.current = false;
        dispatch({ type: "done", runId });
        soundRef.current?.play("done");
      });
    };

    const feedTail = (step = 1) => {
      schedule(TAIL_FEED_MS / TAIL_STEPS, () => {
        dispatch({ type: "tail", runId, progress: step / TAIL_STEPS });
        soundRef.current?.play("feed");
        if (step < TAIL_STEPS) feedTail(step + 1);
        else schedule(CUT_DELAY_MS, cut);
      });
    };

    const revealLine = (index: number, step = 1) => {
      if (index >= jobLines.length) {
        feedTail();
        return;
      }
      schedule(lineDelay(jobLines[index]) / FEED_STEPS, () => {
        soundRef.current?.play("feed");
        if (step < FEED_STEPS) {
          dispatch({ type: "feed", runId, progress: step / FEED_STEPS });
          revealLine(index, step + 1);
        } else {
          dispatch({ type: "line", runId });
          revealLine(index + 1);
        }
      });
    };

    schedule(WARMUP_MS, () => {
      dispatch({ type: "handshake", runId });
      soundRef.current?.play("handshake");
      schedule(HANDSHAKE_MS, () => {
        dispatch({ type: "print", runId });
        revealLine(0);
      });
    });
  }, [cancelJob]);

  return {
    state: machine.stage,
    runId: machine.runId,
    visibleLines: machine.visibleLines,
    lineProgress: machine.lineProgress,
    tailProgress: machine.tailProgress,
    lineCount: machine.lineCount,
    muted,
    toggleMuted,
    startPrint,
    reset,
    isBusy: isPrinting(machine.stage),
    reducedMotion,
    error: machine.error,
  };
}
