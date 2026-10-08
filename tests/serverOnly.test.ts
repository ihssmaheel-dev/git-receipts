import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

/**
 * These modules pull Node-only dependencies (@libsql/client, crypto, server
 * environment) into whichever bundle imports them. The fetcher keeps its
 * `server-only` tripwire; everything else is guarded here so unit tests can
 * import the modules directly.
 */
const GUARDED = ["lib/db", "lib/prints", "lib/rateLimit", "lib/github.ts"];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...sourceFiles(absolute));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(absolute);
    }
  }
  return found;
}

function guardedImport(file: string, specifier: string): string | null {
  let normalized: string;
  if (specifier.startsWith("@/")) {
    normalized = specifier.slice(2).split("/").join(sep);
  } else if (specifier.startsWith(".")) {
    const root = resolve(import.meta.dirname, "..");
    normalized = relative(root, resolve(join(file, ".."), specifier)).split(sep).join("/");
    if (normalized.startsWith("..")) return null;
    normalized = normalized.split("/").join(sep);
  } else {
    return null;
  }
  const withExtension = normalized.endsWith(".ts") || normalized.endsWith(".tsx")
    ? normalized.slice(0, -4)
    : normalized;
  return GUARDED.find((guarded) => withExtension === guarded || withExtension.startsWith(`${guarded}${sep}`)) ?? null;
}

test("client components never import server-only data modules", () => {
  const root = resolve(import.meta.dirname, "..");
  const files = [
    ...sourceFiles(join(root, "components")),
    ...sourceFiles(join(root, "hooks")),
    ...sourceFiles(join(root, "app")),
  ];
  assert.ok(files.length > 10, "Guard scanned a meaningful file set");
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (!/["']use client["']/.test(content)) continue;
    for (const match of content.matchAll(/from\s+["']([^"']+)["']/g)) {
      const guarded = guardedImport(file, match[1]);
      if (guarded) violations.push(`${relative(root, file)} imports ${guarded}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("the GitHub fetcher keeps its server-only tripwire", () => {
  const content = readFileSync(resolve(import.meta.dirname, "..", "lib", "github.ts"), "utf8");
  assert.ok(content.startsWith('import "server-only";'));
});
