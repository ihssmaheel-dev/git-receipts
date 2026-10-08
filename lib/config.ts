function cleanOptional(value: string | undefined): string | null {
  return value?.trim() || null;
}

function safeSiteUrl(value: string | undefined): string {
  try {
    const url = new URL(value || "http://localhost:3000");
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.origin;
    }
  } catch {
    // An incomplete deployment URL should not prevent the app from starting.
  }
  return "http://localhost:3000";
}

export const siteConfig = {
  appName: "Commit Printer",
  name: cleanOptional(process.env.PORTFOLIO_NAME) || "Commit Printer",
  role: "Your GitHub year, on paper.",
  pitch: "Turn a year of building into a receipt worth keeping.",
  email: cleanOptional(process.env.PORTFOLIO_EMAIL),
  linkedin: cleanOptional(process.env.PORTFOLIO_LINKEDIN),
  githubUsername: cleanOptional(process.env.GITHUB_USERNAME),
  siteUrl: safeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  githubUrl: process.env.GITHUB_USERNAME?.trim()
    ? `https://github.com/${encodeURIComponent(process.env.GITHUB_USERNAME.trim())}`
    : null,
};
