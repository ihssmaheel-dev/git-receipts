"use client";

import { useEffect, useId, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";
import styles from "./YearPicker.module.css";

type YearPickerProps = {
  year: number;
  currentYear: number;
  id?: string;
  name?: string;
  disabled?: boolean;
};

export function YearPicker({
  year,
  currentYear,
  id = "receipt-year",
  name = "year",
  disabled = false,
}: YearPickerProps) {
  const descriptionId = useId();
  const [value, setValue] = useState(String(year));

  useEffect(() => {
    setValue(String(year));
  }, [year]);

  const years = Array.from({ length: currentYear - 2007 }, (_, index) => currentYear - index);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <span id={descriptionId} className={styles.srOnly}>Choose the year for your receipt.</span>
      <Select.Root value={value} onValueChange={setValue} disabled={disabled}>
        <Select.Trigger id={id} className={styles.trigger} aria-label="Year" aria-describedby={descriptionId}>
          <Select.Value>{value}</Select.Value>
          <Select.Icon className={styles.chevron}><ChevronDownIcon aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={styles.content} position="popper" sideOffset={6} collisionPadding={12}>
            <Select.ScrollUpButton className={styles.scrollButton}><ChevronUpIcon aria-hidden="true" /></Select.ScrollUpButton>
            <Select.Viewport className={styles.viewport}>
              {years.map((option) => (
                <Select.Item key={option} value={String(option)} className={styles.item}>
                  <Select.ItemText>{option}</Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}><CheckIcon aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className={styles.scrollButton}><ChevronDownIcon aria-hidden="true" /></Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </>
  );
}
