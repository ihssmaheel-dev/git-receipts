import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, GithubIcon, PrinterIcon } from "@/components/Icons";
import { Printer } from "@/components/Printer/Printer";
import { getReceiptData, normalizeYear, parseGitHubUsername } from "@/lib/github";
import { siteConfig } from "@/lib/config";
import { createQrPath, receiptPermalink, receiptQrTarget } from "@/lib/qr";
import { ProfileForm } from "@/components/ProfileForm/ProfileForm";
import { ActivityCalendar } from "@/components/ActivityCalendar/ActivityCalendar";
import { ReceiptPreferencesProvider } from "@/components/Receipt/ReceiptPreferences";
import { ReceiptShare } from "@/components/Receipt/ReceiptShare";

type SearchParams = Promise<{ user?: string | string[]; year?: string | string[]; stamp?: string | string[] }>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const stampEnabled = (value: string | string[] | undefined) => !["false", "0"].includes(first(value) || "true");

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const user = parseGitHubUsername(first(params.user) || "");
  const year = normalizeYear(Number(first(params.year)) || undefined);
  if (!user) return {};
  const title = `@${user}'s ${year} receipt — Commit Printer`;
  const image = `/api/og?${new URLSearchParams({ user, year: String(year), stamp: String(stampEnabled(params.stamp)) })}`;
  return {
    title,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawUser = first(params.user)?.trim() || "";
  const user = parseGitHubUsername(rawUser);
  const year = normalizeYear(Number(first(params.year)) || undefined);
  const data = await getReceiptData(year, rawUser || undefined);
  const initialShowStamp = stampEnabled(params.stamp);
  const demo = data.snapshot.source === "demo";
  const selectedUser = user ? data.snapshot.username : "";
  const permalink = receiptPermalink(siteConfig.siteUrl, selectedUser, data.snapshot.year);
  const qrTarget = receiptQrTarget(siteConfig.siteUrl, selectedUser, data.snapshot.year);
  const qr = createQrPath(qrTarget.url);
  const currentYear = new Date().getUTCFullYear();
  const invalidInput = !!rawUser && !user;
  const statusMessage = invalidInput
    ? "Enter a GitHub username or a profile link, such as github.com/octocat."
    : !data.snapshot.available ? data.snapshot.sourceMessage : null;
  const githubUrl = user ? `https://github.com/${user}` : "https://github.com";
  const number = (value: number) => value.toLocaleString("en-US");
  const sourceLabel = !data.snapshot.available ? "DATA UNAVAILABLE" : demo ? "ILLUSTRATIVE DATA" : data.snapshot.source === "fallback" ? "SAVED SNAPSHOT" : data.snapshot.source === "public" ? "PUBLIC CALENDAR" : "GITHUB DATA";

  return (
    <>
      <a className="skip-link" href="#profile">Skip to profile input</a>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Commit Printer home"><span className="logo-icon"><PrinterIcon size={21} /></span>Commit Printer<span className="version-tag">CP–02</span></Link>
        <nav aria-label="Main navigation"><a href="#about">About the data <ArrowIcon size={13} /></a><a className="github-nav" href="https://github.com" target="_blank" rel="noreferrer"><GithubIcon size={17} />GitHub<ArrowIcon diagonal size={12} /></a></nav>
      </header>
      <ReceiptPreferencesProvider key={`${data.snapshot.username}-${data.snapshot.year}`} initialShowStamp={initialShowStamp}>
      <main>
        <section className="workspace" aria-labelledby="hero-title">
          <aside className="configuration">
            <p className="overline">GITHUB / THERMAL RECEIPTS</p>
            <h1 id="hero-title">A year of work.<br /><span>One small receipt.</span></h1>
            <p className="hero-description">Turn your GitHub contributions into a receipt you can print, download, or share.</p>
            <ProfileForm rawUser={rawUser} year={year} currentYear={currentYear} statusMessage={statusMessage} invalidInput={invalidInput} />
            <p className="try-link"><Link href="/" scroll={false}>Try the sample receipt <ArrowIcon size={13} /></Link></p>
            <div className="selected-profile">
              <p className="section-label">ON THE PAPER</p>
              <div className="profile-badge"><span className="profile-mark"><GithubIcon size={19} /></span><div><strong>{!data.snapshot.available && !user ? "No profile loaded" : demo ? "Sample receipt" : `@${data.snapshot.username}`}</strong><span>{year} <span className="profile-separator">/</span> {!data.snapshot.available ? "Unavailable" : demo ? "Preview" : data.snapshot.displayName || "GitHub profile"}</span></div></div>
              <dl className="summary-list">
                <div><dt>Contributions</dt><dd>{data.snapshot.available ? number(data.stats.totalContributions) : "—"}</dd></div>
                <div><dt>Active days</dt><dd>{data.snapshot.available ? number(data.stats.activeDays) : "—"}<span>days</span></dd></div>
                <div><dt>Longest streak</dt><dd>{data.snapshot.available ? number(data.stats.longestStreak) : "—"}<span>days</span></dd></div>
              </dl>
              <p className="source-label">{sourceLabel}</p>
              {demo && data.snapshot.available && <p className="sample-note">This receipt uses sample activity. Load a profile to print your own.</p>}
            </div>
          </aside>
          <div className="printer-column">
            <Printer key={`${data.snapshot.username}-${data.snapshot.year}`} data={data} qrPath={qr.path} qrSize={qr.size} qrLabel={qrTarget.label} qrUrl={qrTarget.url} />
          </div>
        </section>
        <section className="activity-section" aria-labelledby="activity-title">
          <div className="activity-intro"><p className="section-label">{year} / CONTRIBUTION CALENDAR</p><h2 id="activity-title">Every day, on record.</h2><p>{!data.snapshot.available ? "The calendar appears after loading an available profile." : demo ? "The sample year, day by day. Your own calendar appears when you load a profile." : `A daily view of @${data.snapshot.username}'s GitHub activity.`}</p><a className="text-link" href={githubUrl} target="_blank" rel="noreferrer">{user ? "View GitHub profile" : "Explore GitHub"} <ArrowIcon diagonal size={13} /></a></div>
          <div className="activity-content"><ActivityCalendar key={`${data.snapshot.username}-${year}`} days={data.snapshot.days} year={year} /><p className="data-note">{data.snapshot.sourceMessage}</p></div>
        </section>
        <section id="about" className="details-section" aria-label="Saving your receipt and data information">
          <article><p className="section-label">KEEP A COPY</p><h2>A receipt you can take with you.</h2><p>Save a PNG for your profile, a PDF for paper, or an SVG for your README. Use the print dialog to send the receipt to a connected printer.</p></article>
          <article><p className="section-label">ABOUT THE DATA</p><h2>Numbers, as returned.</h2><p>Totals come from GitHub. Public calendars may include activity without a commit breakdown; unavailable categories stay off the receipt.</p></article>
        </section>
        <ReceiptShare available={data.snapshot.available} demo={demo} username={data.snapshot.username} year={data.snapshot.year} siteUrl={siteConfig.siteUrl} permalink={permalink} />
      </main>
      </ReceiptPreferencesProvider>
      <footer className="site-footer"><Link className="footer-brand" href="/"><PrinterIcon size={15} />Commit Printer</Link><p>Made for your GitHub history.</p><a href="#profile">Load another profile <ArrowIcon size={13} /></a></footer>
    </>
  );
}
