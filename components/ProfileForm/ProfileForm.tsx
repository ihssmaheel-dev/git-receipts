"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, GitHubLogoIcon, ReloadIcon } from "@radix-ui/react-icons";
import { YearPicker } from "@/components/YearPicker/YearPicker";
import { parseGitHubUsername } from "@/lib/githubInput";
import styles from "./ProfileForm.module.css";

type ProfileFormProps = {
  rawUser: string;
  year: number;
  currentYear: number;
  statusMessage: string | null;
  invalidInput: boolean;
};

export function ProfileForm({ rawUser, year, currentYear, statusMessage, invalidInput }: ProfileFormProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(rawUser);
  const [clientError, setClientError] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [pending, startTransition] = useTransition();
  const message = clientError ?? navigationError ?? (pending || (invalidInput && edited) ? null : statusMessage);
  const invalid = Boolean(clientError) || (invalidInput && !edited && !pending);

  useEffect(() => {
    setInputValue(rawUser);
    setClientError(null);
    setNavigationError(null);
    setEdited(false);
  }, [rawUser, year, statusMessage, invalidInput]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const value = input.current?.value.trim() ?? "";
    const username = parseGitHubUsername(value);
    if (!username) {
      setNavigationError(null);
      setClientError(value
        ? "Use a GitHub username or profile link, such as github.com/octocat."
        : "Enter a GitHub username or profile link to load a receipt.");
      input.current?.focus();
      return;
    }
    const formYear = Number(new FormData(event.currentTarget).get("year"));
    const selectedYear = Number.isInteger(formYear) && formYear >= 2008 && formYear <= currentYear ? formYear : year;
    const query = new URLSearchParams({ user: username, year: String(selectedYear) });
    const current = new URL(window.location.href);
    const stamp = current.searchParams.get("stamp");
    if (stamp !== null) query.set("stamp", stamp === "false" || stamp === "0" ? "false" : "true");
    const sameReceipt = current.pathname === "/" && current.searchParams.get("user") === username && Number(current.searchParams.get("year")) === selectedYear;
    setInputValue(username);
    setClientError(null);
    setNavigationError(null);
    startTransition(() => {
      try {
        if (sameReceipt) router.refresh();
        else router.push("/?" + query, { scroll: false });
      } catch {
        setNavigationError("The receipt could not load. Please try again.");
      }
    });
  }

  return (
    <form id="profile" className={styles.form} action="/" method="get" noValidate onSubmit={submit}>
      <label className={styles.label} htmlFor="github-user">GitHub profile</label>
      <div className={styles.inputRow} data-invalid={invalid || undefined} data-pending={pending || undefined}>
        <GitHubLogoIcon width={17} height={17} aria-hidden="true" />
        <input
          ref={input}
          id="github-user"
          type="text"
          name="user"
          placeholder="Username or profile link"
          value={inputValue}
          readOnly={pending}
          maxLength={180}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-required="true"
          aria-invalid={invalid || undefined}
          aria-describedby={message ? "profile-help profile-error" : "profile-help"}
          onChange={(event) => { setInputValue(event.currentTarget.value); setClientError(null); setNavigationError(null); setEdited(true); }}
        />
      </div>
      <p id="profile-help" className={styles.help}>Any public profile. No sign-in required.</p>
      <div className={styles.formRow}>
        <div className={styles.yearField}>
          <label className={styles.label} htmlFor="receipt-year">Year</label>
          <YearPicker key={`${rawUser}:${year}`} year={year} currentYear={currentYear} id="receipt-year" name="year" disabled={pending} />
        </div>
        <button className={styles.loadButton} type="submit" disabled={pending}>
          <span>{pending ? "Loading receipt" : "Load receipt"}</span>
          {pending
            ? <ReloadIcon className={styles.spinner} width={16} height={16} aria-hidden="true" />
            : <ArrowRightIcon width={16} height={16} aria-hidden="true" />}
        </button>
      </div>
      {message && <p id="profile-error" className={styles.error} role="alert">{message}</p>}
      <span className={styles.srOnly} role="status">{pending ? "Loading your GitHub receipt." : ""}</span>
    </form>
  );
}
