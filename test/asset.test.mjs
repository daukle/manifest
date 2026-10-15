import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeClient } from "../src/github.mjs";

const body = "return 1\n";
const sha = createHash("sha256").update(body).digest("hex");

function fakeFetch(url) {
  if (url === "https://github.com/daukle/node/releases/download/1.1.0/plugin.lua") {
    return Promise.resolve(new Response(body, { status: 200 }));
  }
  return Promise.resolve(new Response("", { status: 404 }));
}

test("an asset is hashed from the release's own bytes", async () => {
  const client = makeClient({ fetchImpl: fakeFetch });
  assert.equal(await client.assetDigest("daukle/node", "1.1.0", "plugin.lua"), sha);
});

test("a release with no such asset answers null, never a digest of something else", async () => {
  const client = makeClient({ fetchImpl: fakeFetch });
  assert.equal(await client.assetDigest("daukle/github", "greeter-2.0.0", "plugin.lua"), null);
});
