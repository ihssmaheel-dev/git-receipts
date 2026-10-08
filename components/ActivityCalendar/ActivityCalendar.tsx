"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ContributionDay } from "@/lib/types";
import styles from "./ActivityCalendar.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function activityDescription(day: ContributionDay) {
  const count = day.count.toLocaleString("en-US");
  return `${count} ${day.count === 1 ? "contribution" : "contributions"}`;
}

function displayDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

export function ActivityCalendar({ days, year }: { days: ContributionDay[]; year: number }) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeDays = days.filter((day) => day.count > 0).length;
  const startOffset = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const maximum = Math.max(...days.map((day) => day.count), 1);
  const weekCount = Math.ceil((days.length + startOffset) / 7);
  const selected = selectedIndex === null ? null : days[selectedIndex];
  const months: Array<{ key: string; label: string; column: number }> = [];
  for (let index = 0; index < days.length; index += 1) {
    const key = days[index].date.slice(0, 7);
    if (months[months.length - 1]?.key === key) continue;
    months.push({
      key,
      label: monthFormatter.format(new Date(`${days[index].date}T00:00:00Z`)).toUpperCase(),
      column: Math.floor((index + startOffset) / 7) + 1,
    });
  }
  const gridStyle = { gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` };

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowUp": next = index - 1; break;
      case "ArrowDown": next = index + 1; break;
      case "ArrowLeft": next = index - 7; break;
      case "ArrowRight": next = index + 7; break;
      case "Home": next = 0; break;
      case "End": next = days.length - 1; break;
      default: return;
    }
    event.preventDefault();
    next = Math.max(0, Math.min(days.length - 1, next));
    setFocusIndex(next);
    buttons.current[next]?.focus();
  }

  if (days.length === 0) {
    return <div className={styles.empty}>GitHub activity will appear here when the calendar is available.</div>;
  }

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={100}>
      <div className={styles.calendar} role="group" aria-label={`${year} GitHub contribution calendar, ${activeDays} active days. Use arrow keys to move between days.`}>
        <div className={styles.months} style={gridStyle} aria-hidden="true">
          {months.map((month, index) => <span key={month.key} className={styles.month} style={{ gridColumn: `${month.column} / ${Math.max(month.column + 1, months[index + 1]?.column ?? weekCount + 1)}` }}>{month.label}</span>)}
        </div>
        <div className={styles.grid} style={gridStyle}>
          {Array.from({ length: startOffset }, (_, index) => <span key={`empty-${index}`} className={styles.blank} aria-hidden="true" />)}
          {days.map((day, index) => (
            <Tooltip.Root key={day.date}>
              <Tooltip.Trigger asChild>
                <button
                  ref={(button) => { buttons.current[index] = button; }}
                  className={styles.day}
                  type="button"
                  tabIndex={index === Math.min(focusIndex, days.length - 1) ? 0 : -1}
                  data-level={day.count === 0 ? 0 : Math.min(4, Math.ceil(day.count / maximum * 4))}
                  data-selected={selectedIndex === index || undefined}
                  aria-label={`${displayDate(day.date)}: ${activityDescription(day)}`}
                  onFocus={() => setFocusIndex(index)}
                  onKeyDown={(event) => navigate(event, index)}
                  onClick={() => { setFocusIndex(index); setSelectedIndex(index); }}
                />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className={styles.tooltip} side="top" sideOffset={8} collisionPadding={12}>
                  <span className={styles.tooltipDate}>{displayDate(day.date)}</span>
                  <strong>{activityDescription(day)}</strong>
                  <Tooltip.Arrow className={styles.tooltipArrow} width={8} height={4} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </div>
        <div className={styles.caption}>
          <p className={styles.detail} role="status" aria-live="polite">
            {selected ? <><span>{displayDate(selected.date)}</span><span className={styles.detailSeparator}>/</span><strong>{activityDescription(selected)}</strong></> : "Select a day to see its activity."}
          </p>
          <span className={styles.legend} aria-hidden="true">Less <i data-level="0" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /> More</span>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
