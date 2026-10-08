"use client";

import { ArrowIcon } from "@/components/Icons";
import { useReceiptPreferences } from "./ReceiptPreferences";

type ReceiptShareProps = {
  available: boolean;
  demo: boolean;
  username: string;
  year: number;
  siteUrl: string;
  permalink: string;
};

const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

/** README images and native sharing follow the viewer's chosen achievement-stamp setting. */
export function ReceiptShare({ available, demo, username, year, siteUrl, permalink }: ReceiptShareProps) {
  const { showStamp } = useReceiptPreferences();
  const sharePermalink = new URL(permalink);
  sharePermalink.searchParams.set("stamp", String(showStamp));
  const imageUrl = new URL("/api/receipt.svg", siteUrl);
  imageUrl.searchParams.set("year", String(year));
  imageUrl.searchParams.set("stamp", String(showStamp));
  if (!demo && username) imageUrl.searchParams.set("user", username);
  const lightImageUrl = new URL(imageUrl);
  lightImageUrl.searchParams.set("theme", "light");
  const darkImageUrl = new URL(imageUrl);
  darkImageUrl.searchParams.set("theme", "dark");
  const receiptAlt = demo ? `${year} sample GitHub contribution receipt` : `@${username}'s ${year} GitHub contribution receipt`;
  const readmeSnippet = `<a href="${escapeAttribute(sharePermalink.toString())}">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${escapeAttribute(darkImageUrl.toString())}">
    <img src="${escapeAttribute(lightImageUrl.toString())}" alt="${escapeAttribute(receiptAlt)}">
  </picture>
</a>`;
  const shareText = demo ? "A sample GitHub year, on one receipt." : `@${username}'s ${year} GitHub activity, on one receipt.`;
  const xShareUrl = new URL("https://x.com/intent/post");
  xShareUrl.searchParams.set("text", shareText);
  xShareUrl.searchParams.set("url", sharePermalink.toString());
  const blueskyShareUrl = new URL("https://bsky.app/intent/compose");
  blueskyShareUrl.searchParams.set("text", `${shareText}\n${sharePermalink}`);

  return (
    <section className="readme-section" aria-labelledby="readme-title">
      <div><p className="section-label">ADD TO YOUR PROFILE</p><h2 id="readme-title">Your README, with a receipt.</h2><p>Copy this HTML into your README. The image follows the reader&apos;s theme and links to your receipt.</p>{available && <nav className="receipt-share-links" aria-label="Share your receipt"><a href={xShareUrl.toString()} target="_blank" rel="noreferrer">Share on X <ArrowIcon diagonal size={12} /></a><a href={blueskyShareUrl.toString()} target="_blank" rel="noreferrer">Share on Bluesky <ArrowIcon diagonal size={12} /></a></nav>}</div>
      <div className="embed-code"><span className="section-label">HTML / LIGHT + DARK</span>{available ? <><pre><code>{readmeSnippet}</code></pre><p>GitHub caches images, so new activity can take time to appear.</p></> : <p>Load a profile to generate your README image.</p>}</div>
    </section>
  );
}
