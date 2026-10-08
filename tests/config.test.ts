import assert from "node:assert/strict";
import test from "node:test";
import { findLeakedSecrets } from "../lib/config";

test("public-prefixed secrets are flagged before they can ship to browsers", () => {
  assert.deepEqual(findLeakedSecrets({}), []);
  assert.deepEqual(findLeakedSecrets({ NEXT_PUBLIC_SITE_URL: "https://example.dev" }), []);
  assert.deepEqual(findLeakedSecrets({ GH_PAT: "ghp_example", TURSO_AUTH_TOKEN: "example" }), []);
  assert.deepEqual(findLeakedSecrets({ NEXT_PUBLIC_GH_PAT: "ghp_example" }), ["NEXT_PUBLIC_GH_PAT"]);
  assert.deepEqual(
    findLeakedSecrets({ NEXT_PUBLIC_TURSO_AUTH_TOKEN: "example", NEXT_PUBLIC_SITE_URL: "https://example.dev" }),
    ["NEXT_PUBLIC_TURSO_AUTH_TOKEN"],
  );
});
