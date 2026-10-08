import { parseGitHubUsername } from "./githubInput";

type ReceiptRequestOptions = {
  username?: string;
  year?: number;
  theme: "light" | "dark";
  animated: boolean;
  showStamp: boolean;
};

export function parseReceiptRequest(url: URL): ReceiptRequestOptions | { error: string } {
  const user = url.searchParams.get("user");
  const username = user === null ? undefined : parseGitHubUsername(user);
  if (username === null) return { error: "Enter a valid GitHub username or profile URL." };

  const requestedYear = url.searchParams.get("year");
  let year: number | undefined;
  if (requestedYear !== null) {
    const currentYear = new Date().getUTCFullYear();
    year = Number(requestedYear);
    if (!/^\d{4}$/.test(requestedYear) || year < 2008 || year > currentYear) {
      return { error: `Year must be between 2008 and ${currentYear}.` };
    }
  }

  const theme = url.searchParams.get("theme") || "light";
  if (theme !== "light" && theme !== "dark") return { error: "Theme must be light or dark." };
  const animate = url.searchParams.get("animate");
  if (animate !== null && animate !== "0" && animate !== "1") return { error: "Animate must be 0 or 1." };
  const stamp = url.searchParams.get("stamp");
  if (stamp !== null && !["true", "false", "1", "0"].includes(stamp)) {
    return { error: "Stamp must be true or false (or 1 or 0)." };
  }

  return { username, year, theme, animated: animate !== "0", showStamp: stamp !== "false" && stamp !== "0" };
}
