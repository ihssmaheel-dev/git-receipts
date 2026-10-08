"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowRightIcon, CheckIcon, Cross2Icon, DownloadIcon, FileTextIcon, Link2Icon, MoonIcon, ReaderIcon, SpeakerLoudIcon, SpeakerOffIcon, SunIcon, ZoomInIcon } from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { PrinterHousingBack, PrinterHousingFront } from "./PrinterHousing";
import { Receipt } from "@/components/Receipt/Receipt";
import { useReceiptPreferences } from "@/components/Receipt/ReceiptPreferences";
import { usePrinter } from "@/hooks/usePrinter";
import { calculatePaperFeed, resolveLineEnds } from "@/lib/paperFeed";
import { receiptLineText } from "@/lib/receiptLines";
import { createReceiptSeal, isReceiptSealText } from "@/lib/receiptSeal";
import type { ReceiptData } from "@/lib/types";
import styles from "./Printer.module.css";

const statusText = {
  idle: "Receipt loaded", warming: "Warming the print head", handshake: "Sending the print job",
  printing: "Printing your receipt", cutting: "Cutting the paper", done: "Receipt ready",
};
const PAPER_WIDTH = 360;
// The reference SVG is cropped to a 1100 × 775 viewBox and rendered at 440 × 310.
const MACHINE_WIDTH = 440;
const MACHINE_HEIGHT = 310;
const BELOW_SLOT = 214.4;

type PrinterProps = { data: ReceiptData; qrPath: string; qrSize: number; qrLabel: string; qrUrl: string; printCount: number | null };

export function Printer({ data, qrPath, qrSize, qrLabel, qrUrl, printCount }: PrinterProps) {
  const { showStamp, setShowStamp } = useReceiptPreferences();
  const engine = usePrinter(data.lines);
  const uid = useId().replaceAll(":", "");
  const assemblyRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const showFinishedReceipt = useRef(false);
  const receiptReturnFocus = useRef<HTMLButtonElement | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [geometry, setGeometry] = useState({ height: 700, scale: 232 / PAPER_WIDTH, machineScale: 1, ends: [] as number[] });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [exporting, setExporting] = useState<"png" | "pdf" | "svg" | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const [egg, setEgg] = useState(false);
  const serialClicks = useRef(0);
  const runKeyRef = useRef<string | null>(null);
  const postedPrints = useRef<Set<number>>(new Set());
  const available = data.snapshot.available;
  const outOfPaper = !available && data.snapshot.rateLimited;
  const exportDisabled = engine.isBusy || !!exporting || !available;
  const sample = data.snapshot.source === "demo";
  const earnedSeal = createReceiptSeal(data.lines);
  const stampNote = available && data.stats.calendarComplete ? "No achievement earned for this period." : "Achievement data unavailable for this period.";
  const query = new URLSearchParams({ year: String(data.snapshot.year), theme, animate: "0", stamp: String(showStamp) });
  if (!sample) query.set("user", data.snapshot.username);

  useEffect(() => {
    if (engine.state !== "done" || !showFinishedReceipt.current) return;
    const openFinishedReceipt = () => {
      showFinishedReceipt.current = false;
      setReceiptOpen(true);
    };
    if (engine.reducedMotion) {
      openFinishedReceipt();
      return;
    }
    const settleTimer = window.setTimeout(openFinishedReceipt, 240);
    return () => window.clearTimeout(settleTimer);
  }, [engine.state, engine.runId, engine.reducedMotion]);

  // Count one completed FEED run toward the public total. Guarded per run so
  // StrictMode remounts and dialog-driven re-renders never double-count.
  // Interrupted prints (engine.error) are excluded; reduced-motion instant
  // completions count because the full receipt is delivered.
  useEffect(() => {
    if (engine.state !== "done" || engine.error) return;
    if (!available || postedPrints.current.has(engine.runId)) return;
    postedPrints.current.add(engine.runId);
    const runKey = runKeyRef.current;
    if (!runKey) return;
    const body = JSON.stringify({
      ...(sample ? {} : { user: data.snapshot.username }),
      year: data.snapshot.year,
      runKey,
    });
    fetch("/api/prints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      // Telemetry must never interrupt the receipt experience.
    });
  }, [engine.state, engine.runId, available, sample, data.snapshot.username, data.snapshot.year]);

  useEffect(() => {
    let active = true;
    const measure = () => {
      const paper = paperRef.current;
      const window = windowRef.current;
      const assembly = assemblyRef.current;
      if (!active || !paper || !window || !assembly) return;
      const scale = window.clientWidth / PAPER_WIDTH;
      const height = paper.offsetHeight;
      // Rect differences are translation-invariant (identical mid-print and at
      // rest) and ignore offsetParent quirks, unlike an offsetTop chain.
      const paperTop = paper.getBoundingClientRect().top;
      const ends = Array.from(paper.querySelectorAll<HTMLElement>("[data-receipt-line]"))
        .map((line) => line.getBoundingClientRect().bottom - paperTop);
      const machineScale = assembly.clientWidth / MACHINE_WIDTH;
      setGeometry((previous) => {
        if (Math.abs(previous.height - height) < 0.5 && Math.abs(previous.scale - scale) < 0.001 &&
            Math.abs(previous.machineScale - machineScale) < 0.001 &&
            previous.ends.length === ends.length && previous.ends.every((end, i) => Math.abs(end - ends[i]) < 0.5)) return previous;
        return { height, scale, machineScale, ends };
      });
    };
    const observer = new ResizeObserver(measure);
    if (paperRef.current) observer.observe(paperRef.current);
    if (windowRef.current) observer.observe(windowRef.current);
    if (assemblyRef.current) observer.observe(assemblyRef.current);
    measure();
    document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [data.lines]);

  // Measured rows drive the feed; evenly spaced rows stand in when measurement
  // raced layout, so the slip still emerges line by line instead of suddenly.
  const lineEnds = resolveLineEnds(geometry.ends, data.lines.length, geometry.height);
  const fullFeed = calculatePaperFeed({
    state: engine.state, visibleLines: engine.visibleLines,
    lineProgress: engine.lineProgress, tailProgress: engine.tailProgress,
    lineEnds, height: geometry.height,
  });
  // Keep the machine in view. Longer paper travels past the camera's top edge;
  // the complete receipt remains available in the full-size viewer.
  const fed = engine.state === "idle" ? Math.min(lineEnds[3] ?? 190, geometry.height) : fullFeed;
  const detached = engine.state === "cutting" || engine.state === "done";
  const paperY = (geometry.height - fed) * geometry.scale + 8 - (detached ? 2 * geometry.machineScale : 0);
  const physicalHeight = geometry.height * geometry.scale + 8;
  const stageStyle = {
    "--paper-height": physicalHeight + "px",
    "--machine-height": MACHINE_HEIGHT * geometry.machineScale + "px",
    "--below-slot": BELOW_SLOT * geometry.machineScale + "px",
    height: Math.min(physicalHeight + BELOW_SLOT * geometry.machineScale, 420 * geometry.machineScale),
  } as CSSProperties;
  const currentStatus = !available
    ? (outOfPaper ? "Out of paper" : "Profile unavailable")
    : statusText[engine.state];

  function printReceipt(event: MouseEvent<HTMLButtonElement>) {
    if (!available || engine.isBusy || exporting) return;
    receiptReturnFocus.current = event.currentTarget;
    showFinishedReceipt.current = true;
    runKeyRef.current = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
    setMessage("");
    setCopied(null);
    engine.startPrint();
  }

  function saveBlob(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "git-receipt-" + data.snapshot.username + "-" + data.snapshot.year + "." + extension;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function download(format: "png" | "pdf" | "svg") {
    if (exporting || engine.isBusy || !available) return;
    setExporting(format);
    setMessage("Preparing " + format.toUpperCase() + "…");
    let objectUrl: string | undefined;
    try {
      const response = await fetch("/api/receipt." + (format === "pdf" ? "pdf" : "svg") + "?" + query, { cache: "no-store" });
      if (!response.ok) throw new Error("The receipt could not be downloaded. Please try again.");
      if (format !== "png") {
        saveBlob(await response.blob(), format);
      } else {
        objectUrl = URL.createObjectURL(new Blob([await response.text()], { type: "image/svg+xml" }));
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth * 3;
        canvas.height = image.naturalHeight * 3;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PNG export is unavailable. Download the PDF or SVG instead.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG export failed.")), "image/png"));
        saveBlob(blob, "png");
      }
      setMessage(format.toUpperCase() + " downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed. Please try again.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setExporting(null);
    }
  }

  async function copyReceipt(kind: "link" | "text") {
    if (!available) return;
    const url = new URL(window.location.origin);
    url.searchParams.set("year", String(data.snapshot.year));
    url.searchParams.set("stamp", String(showStamp));
    if (!sample) url.searchParams.set("user", data.snapshot.username);
    setCopied(null);
    try {
      const lines = showStamp ? data.lines : data.lines.filter((line) => !(line.type === "text" && isReceiptSealText(line.text)));
      await navigator.clipboard.writeText(kind === "text" ? lines.map(receiptLineText).join("\n") : url.toString());
      setCopied(kind);
      setMessage(kind === "text" ? "Text receipt copied." : "Receipt link copied.");
    } catch {
      setMessage("Share this receipt: " + url.toString());
    }
  }

  const printedReceipt = <Receipt lines={data.lines} qrPath={qrPath} qrSize={qrSize} qrLabel={qrLabel} showStamp={false} compact />;
  const stampToggle = <button className={styles.stampToggle} type="button" role="switch"
    aria-checked={showStamp && !!earnedSeal} disabled={!earnedSeal || !!exporting}
    onClick={() => { setShowStamp(!showStamp); setCopied(null); }}>
    <span>Show GitHub achievement stamp</span><span className={styles.switchTrack} aria-hidden="true"><span /></span>
  </button>;

  return <Dialog.Root open={receiptOpen} onOpenChange={setReceiptOpen}><div className={styles.studio} data-theme={theme}>
    <div className={styles.controlBar}>
      <div className={styles.modelLabel}><span className={styles.statusDot} data-busy={engine.isBusy} /> GR–02 <span>/ DIRECT THERMAL</span></div>
      <div className={styles.topActions}>
        <button className={styles.soundToggle} onClick={engine.toggleMuted} aria-label={engine.muted ? "Enable printer sound" : "Mute printer sound"} aria-pressed={!engine.muted}>{engine.muted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}<span>Sound {engine.muted ? "off" : "on"}</span></button>
        <button className={styles.primaryPrint} onClick={printReceipt} disabled={engine.isBusy || !available || !!exporting}><ReaderIcon />{engine.isBusy ? "Printing…" : engine.state === "done" ? "Print again" : "Print receipt"}<ArrowRightIcon /></button>
      </div>
    </div>
    <div className={styles.bench} data-state={engine.state}>
      <div className={styles.benchHeading}><span>PRINT STATION / 01</span>{printCount !== null && <span className={styles.printCount}>Totally {printCount.toLocaleString("en-US")} {printCount === 1 ? "receipt" : "receipts"} printed</span>}<span>{!available ? "NO DATA" : sample ? "SAMPLE" : "@" + data.snapshot.username} · {data.snapshot.year}</span></div>
      <div className={styles.assembly} ref={assemblyRef} style={stageStyle} data-state={engine.state} data-reduced={engine.reducedMotion}>
        <PrinterHousingBack idPrefix={uid} />
        <div ref={windowRef} className={styles.paperWindow} aria-label="Paper exiting the top slot">
            <div className={styles.paperWeb} style={{ "--paper-feed-y": Math.round(paperY) + "px" } as CSSProperties}>
            <div ref={paperRef} className={styles.paperSurface} style={{ width: PAPER_WIDTH, zoom: geometry.scale }}>{printedReceipt}</div>
          </div>
          <div className={styles.printHeadShadow} aria-hidden="true" />
          <Dialog.Trigger asChild><button className={styles.paperViewerTrigger} disabled={engine.isBusy} aria-label="View full receipt" onClick={(event) => { receiptReturnFocus.current = event.currentTarget; }} /></Dialog.Trigger>
        </div>
        <PrinterHousingFront idPrefix={uid} stage={engine.state} egg={egg} available={available} />
        <button className={styles.physicalPrint} onClick={printReceipt} disabled={engine.isBusy || !available || !!exporting} aria-label={engine.state === "done" ? "Print receipt again on the thermal printer" : "Print receipt on the thermal printer"}><svg className={styles.feedMark} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8V3q0-1.5 1.5-1.5h11Q21 1.5 21 3v5M6 8h16q5 0 5 5v7q0 2-2 2h-4M7 22H3q-2 0-2-2v-7q0-5 5-5" /><rect x="7" y="16" width="14" height="10" rx="1.5" /></svg><span className={styles.feedButtonLabel}>FEED</span></button>
        <button className={styles.serialNumber} onClick={() => { serialClicks.current += 1; if (serialClicks.current % 5 === 0) setEgg(!egg); }} aria-label="Printer serial number">SN. 0008427</button>
      </div>
      <div className={styles.benchFooter}><span><span className={styles.footerDot} /> {currentStatus}</span><Dialog.Trigger asChild><button disabled={engine.isBusy} className={styles.viewReceipt} onClick={(event) => { receiptReturnFocus.current = event.currentTarget; }}><ZoomInIcon />View receipt</button></Dialog.Trigger></div>
    </div>
    <div className={styles.outputBar}>
      <div className={styles.downloadGroup}><span>SAVE AS</span><button onClick={() => download("png")} disabled={exportDisabled}><DownloadIcon />PNG</button><button onClick={() => download("pdf")} disabled={exportDisabled}><FileTextIcon />PDF</button><button onClick={() => download("svg")} disabled={exportDisabled}><FileTextIcon />SVG</button></div>
      <div className={styles.paperThemes} aria-label="Paper color"><button onClick={() => setTheme("light")} aria-label="White paper" aria-pressed={theme === "light"}><SunIcon /></button><button onClick={() => setTheme("dark")} aria-label="Charcoal paper" aria-pressed={theme === "dark"}><MoonIcon /></button></div>
    </div>
    <div className={styles.stampSetting}>{stampToggle}{!earnedSeal && <span>{stampNote}</span>}</div>
    <div className={styles.shareBar}><button onClick={() => copyReceipt("link")} disabled={!available}>{copied === "link" ? <CheckIcon /> : <Link2Icon />}{copied === "link" ? "Link copied" : "Copy receipt link"}</button><button onClick={() => copyReceipt("text")} disabled={!available}>{copied === "text" ? <CheckIcon /> : <FileTextIcon />}{copied === "text" ? "Text copied" : "Copy text receipt"}</button><button onClick={() => window.print()} disabled={!available || engine.isBusy}><ReaderIcon />Print on paper</button></div>
    <p className={styles.message} role="status" aria-live="polite">{engine.isBusy ? currentStatus + "…" : message || engine.error || (outOfPaper ? "Out of paper — quota is empty. Try the sample receipt or come back soon." : !available ? "Load another profile to print a receipt." : engine.state === "done" ? "The receipt is cut and ready to save." : "Press Print receipt to run the printer.")}</p>
    <noscript><p className={styles.message}>Download your full receipt as <a href={"/api/receipt.svg?" + query}>SVG</a> or <a href={"/api/receipt.pdf?" + query}>PDF</a> without JavaScript.</p></noscript>
    <Dialog.Portal><Dialog.Overlay className={styles.dialogOverlay} /><Dialog.Content className={styles.receiptDialog} data-theme={theme} onCloseAutoFocus={(event) => { event.preventDefault(); receiptReturnFocus.current?.focus({ preventScroll: true }); }}>
      <div className={styles.dialogHeading}><div><span>{engine.state === "done" ? "PRINTED RECEIPT" : "RECEIPT"} / {data.snapshot.year}</span><Dialog.Title asChild><strong>{!available ? "Receipt unavailable" : sample ? "Sample receipt" : "@" + data.snapshot.username + " receipt"}</strong></Dialog.Title></div><Dialog.Close asChild><button aria-label="Close receipt"><Cross2Icon /></button></Dialog.Close></div>
      <Dialog.Description className={styles.srOnly}>Your complete GitHub activity receipt. Download a copy or open the QR link below.</Dialog.Description>
      <div className={styles.dialogStampSetting}>{stampToggle}{!earnedSeal && <span>{stampNote}</span>}</div>
      <div className={styles.dialogBody} role="region" tabIndex={0} aria-label="Receipt preview" data-receipt-viewer><div className={styles.dialogPaper}><Receipt lines={data.lines} qrPath={qrPath} qrSize={qrSize} qrLabel={qrLabel} showStamp={showStamp} animateStamp compact /></div></div>
      <div className={styles.dialogFooter}><a href={qrUrl} target="_blank" rel="noreferrer">{qrLabel.toLowerCase()}<ArrowRightIcon /></a><button onClick={() => download("pdf")} disabled={!!exporting || !available}><DownloadIcon />Download PDF</button></div>
      {(message || engine.error) && <p role="status" className={styles.dialogMessage}>{message || engine.error}</p>}
    </Dialog.Content></Dialog.Portal>
    <div className={styles.printDocument}>{printedReceipt}</div>
  </div></Dialog.Root>;
}
