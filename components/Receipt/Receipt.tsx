"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatReceiptNumber, receiptLineText } from "@/lib/receiptLines";
import { createReceiptBarcode } from "@/lib/receiptBarcode";
import { createReceiptSeal, getReceiptSealOverlay, isReceiptSealText, renderReceiptSealSvg, type ReceiptSeal } from "@/lib/receiptSeal";
import type { ReceiptLine } from "@/lib/types";
import styles from "./Receipt.module.css";

type ReceiptProps = {
  lines: ReceiptLine[];
  qrPath?: string;
  qrSize?: number;
  qrLabel?: string;
  /** Kept for callers using the old line reveal API; paper now feeds as one sheet. */
  visibleLines?: number;
  compact?: boolean;
  className?: string;
  showStamp?: boolean;
  animateStamp?: boolean;
};

function AchievementStamp({ seal, animate, onPlacementChange }: { seal: ReceiptSeal; animate: boolean; onPlacementChange: (fits: boolean) => void }) {
  const impressionRef = useRef<HTMLSpanElement>(null);
  const [punched, setPunched] = useState(!animate);
  const [placement, setPlacement] = useState<{ x: number; y: number; scale: number } | null>(null);

  useEffect(() => {
    const impression = impressionRef.current;
    const paper = impression?.closest("article");
    if (!paper) return;
    const measure = () => {
      const paperBox = paper.getBoundingClientRect();
      const total = paper.querySelector('[data-receipt-line="total"]');
      if (!total || !paperBox.width) return;
      const totalBox = total.getBoundingClientRect();
      const qr = paper.querySelector("[data-receipt-qr] svg");
      const qrBox = qr?.getBoundingClientRect();
      const qrArea = qrBox ? { x: qrBox.left - paperBox.left, y: qrBox.top - paperBox.top, width: qrBox.width, height: qrBox.height } : undefined;
      const protectedAreas = Array.from(paper.querySelectorAll("[data-receipt-qr] svg, [data-receipt-barcode] svg"))
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.left - paperBox.left, y: box.top - paperBox.top, width: box.width, height: box.height };
        });
      // Printed rows and the QR caption count as ink: the seal favors empty
      // paper (for example beside the QR) over readable text. Each child's own
      // box is used so centered captions don't read as full-width strips.
      const inkAreas = [
        ...Array.from(paper.querySelectorAll("[data-receipt-line]")).flatMap((row) =>
          Array.from(row.children).map((element) => {
            const box = (element as HTMLElement).getBoundingClientRect();
            return { x: box.left - paperBox.left, y: box.top - paperBox.top, width: box.width, height: box.height };
          }).filter((area) => area.width > 0 && area.height > 0)),
        ...Array.from(paper.querySelectorAll("[data-receipt-qr] span")).map((element) => {
          const box = (element as HTMLElement).getBoundingClientRect();
          return { x: box.left - paperBox.left, y: box.top - paperBox.top, width: box.width, height: box.height };
        }).filter((area) => area.width > 0 && area.height > 0),
      ];
      const next = getReceiptSealOverlay(seal, { width: paperBox.width, top: totalBox.bottom - paperBox.top, bottom: paperBox.height - 20, qrArea, protectedAreas, inkAreas });
      onPlacementChange(!!next);
      setPlacement((previous) => previous && next && Math.abs(previous.x - next.x) < .5 && Math.abs(previous.y - next.y) < .5 && Math.abs(previous.scale - next.scale) < .001 ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    measure();
    return () => observer.disconnect();
  }, [seal.text, seal.centerX, seal.rotation, seal.diameter, seal.placement, onPlacementChange]);

  useEffect(() => {
    const impression = impressionRef.current;
    if (!placement) return;
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !impression || !window.IntersectionObserver) {
      setPunched(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setPunched(true);
        observer.disconnect();
      }
    }, { root: impression.closest("[data-receipt-viewer]"), threshold: 0.4 });
    observer.observe(impression);
    return () => observer.disconnect();
  }, [animate, !!placement]);

  return <span ref={impressionRef} aria-hidden="true" className={styles.sealImpression} data-receipt-stamp
      data-animate={animate} data-punched={punched}
      style={{ top: placement?.y ?? 0, left: placement?.x ?? 0, visibility: placement ? "visible" : "hidden", "--seal-diameter": `${seal.diameter * (placement?.scale ?? 1)}px` } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: renderReceiptSealSvg({ ...seal, ink: "var(--receipt-seal-ink, #9b5148)" }) }} />;
}

function Line({ line }: { line: ReceiptLine }): ReactNode {
  switch (line.type) {
    case "heading":
      return (
        <div className={styles.heading}>
          <strong>{line.text}</strong>
          {line.detail && <span>{line.detail}</span>}
        </div>
      );
    case "text":
      return <p className={`${line.align === "center" ? styles.center : styles.text} ${line.text.startsWith("@") ? styles.handle : ""}`}>{line.text}</p>;
    case "divider":
      return <div className={styles.divider} />;
    case "item":
      return (
        <div className={styles.item}>
          <span className={styles.itemName}>{line.name}</span>
          <span className={styles.value}>{formatReceiptNumber(line.total)}</span>
        </div>
      );
    case "total":
      return (
        <div className={styles.total} style={{ "--total-size": `${Math.min(22, Math.max(12, (312 - line.label.length * 7.2 - 14) / (formatReceiptNumber(line.value).length * 0.6)))}px` } as CSSProperties}>
          <strong>{line.label}</strong>
          <strong>{formatReceiptNumber(line.value)}</strong>
        </div>
      );
    case "pair":
      return (
        <div className={`${styles.pair} ${312 - line.value.length * 7.2 - 14 < 72 ? styles.stackedPair : ""}`}>
          <span>{line.label}</span>
          <span className={styles.value}>{line.value}</span>
        </div>
      );
    case "spacer":
      return <div className={styles.spacer} />;
    case "footer":
      return <p className={styles.footer}>{line.text}</p>;
  }
}

/** The printer moves the complete sheet; its readable copy stays available throughout. */
export function Receipt({
  lines,
  qrPath,
  qrSize = 33,
  qrLabel = "OPEN THIS RECEIPT",
  compact = false,
  className = "",
  showStamp = true,
  animateStamp = false,
}: ReceiptProps) {
  const [stampFits, setStampFits] = useState(true);
  const numberLine = lines.find((line) => line.type === "footer" && /^No\. [0-9]+-[0-9]+-[0-9]+$/.test(line.text));
  const number = numberLine?.type === "footer" ? numberLine.text.slice(4) : null;
  const barcode = number ? createReceiptBarcode(number) : null;
  const seal = showStamp ? createReceiptSeal(lines) : null;
  const sealLine = seal ? lines.find((line) => line.type === "text" && line.text === seal.text) : null;
  return (
    <article
      className={`${styles.receipt} ${compact ? styles.compact : ""} ${className}`}
      aria-label="GitHub contribution receipt"
    >
      {seal && <AchievementStamp seal={seal} animate={animateStamp} onPlacementChange={setStampFits} />}
      <div aria-hidden="true" className={styles.visual} data-receipt-content>
        {lines.map((line, index) => (
          <div
            key={index}
            data-receipt-line={line.type}
            className={styles.line}
          >
            {line.type === "item" && lines[index - 1]?.type !== "item" && (
              <div className={styles.tableHeading}><span>ACTIVITY</span><span>COUNT</span></div>
            )}
            {line !== numberLine && !(line.type === "text" && isReceiptSealText(line.text)) && <Line line={line} />}
          </div>
        ))}
        {qrPath && (
          <div className={styles.qr} data-receipt-qr>
            <svg
              width="104"
              height="104"
              viewBox={`-4 -4 ${qrSize + 8} ${qrSize + 8}`}
              shapeRendering="crispEdges"
              focusable="false"
            >
              <rect x="-4" y="-4" width={qrSize + 8} height={qrSize + 8} fill="var(--receipt-paper, #f9f8f3)" />
              <path d={qrPath} fill="var(--receipt-ink, #232321)" />
            </svg>
            <span>{qrLabel}</span>
          </div>
        )}
        {barcode && (
          <div className={styles.barcode} data-receipt-barcode>
            <svg width="280" height="32" viewBox={`0 0 ${barcode.width} 32`} preserveAspectRatio="none" shapeRendering="crispEdges" focusable="false">
              {barcode.bars.map((bar) => <rect key={bar.x} x={bar.x} y="0" width={bar.width} height="32" fill="currentColor" />)}
            </svg>
            <span>No. {barcode.value}</span>
          </div>
        )}
      </div>
      <div className={styles.srOnly}>
        {lines.map((line, index) => {
          if (line.type === "divider" || line.type === "spacer") return null;
          if (line.type === "text" && isReceiptSealText(line.text) && (line !== sealLine || !stampFits)) return null;
          const text = receiptLineText(line);
          return text ? <p key={index}>{text}</p> : null;
        })}
        {qrPath && <p>QR code: {qrLabel.toLowerCase()}.</p>}
        {barcode && <p>Code 128 barcode encodes receipt number {barcode.value}.</p>}
      </div>
    </article>
  );
}

export default Receipt;
