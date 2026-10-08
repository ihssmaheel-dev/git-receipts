function cleanOptional(value: string | undefined): string | null {
  return value?.trim() || null;
}

/**
 * Tokens must never use the NEXT_PUBLIC_ prefix: anything so prefixed ships
 * to browsers. Returns the offending variable names for boot warnings.
 */
export function findLeakedSecrets(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter((name) =>
    name.startsWith("NEXT_PUBLIC_") && /(GH_PAT|AUTH_TOKEN|SECRET|PRIVATE_KEY)/.test(name));
}

const leaked = findLeakedSecrets(process.env);
if (leaked.length > 0) {
  console.warn(`[security] These secrets use the NEXT_PUBLIC_ prefix and ship to browsers: ${leaked.join(", ")}. Rename them without the prefix.`);
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
  appName: "Git Receipts",
  name: cleanOptional(process.env.PORTFOLIO_NAME) || "Git Receipts",
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
