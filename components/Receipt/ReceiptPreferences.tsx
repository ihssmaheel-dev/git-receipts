"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

const ReceiptPreferences = createContext<{ showStamp: boolean; setShowStamp: (value: boolean) => void } | null>(null);

export function ReceiptPreferencesProvider({ initialShowStamp, children }: { initialShowStamp: boolean; children: ReactNode }) {
  const searchParams = useSearchParams();
  const stamp = searchParams.get("stamp");
  const showStamp = stamp === null ? initialShowStamp : stamp !== "false" && stamp !== "0";

  function setShowStamp(value: boolean) {
    const url = new URL(window.location.href);
    url.searchParams.set("stamp", String(value));
    // This is a presentation choice: keep refresh/share URLs in sync without fetching data again.
    window.history.replaceState(null, "", url.toString());
  }

  return <ReceiptPreferences.Provider value={{ showStamp, setShowStamp }}>{children}</ReceiptPreferences.Provider>;
}

export function useReceiptPreferences() {
  const preferences = useContext(ReceiptPreferences);
  if (!preferences) throw new Error("Receipt preferences must be used inside their provider.");
  return preferences;
}
