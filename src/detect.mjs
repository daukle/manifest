import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { makeClient } from "./github.mjs";
import { classify, IGNORED, SUPERSEDED } from "./classify.mjs";
import { buildManifest } from "./manifest.mjs";

const ORG = "daukle";

export async function runDetect({ org = ORG, client, generatedAt }) {
  const repos = (await client.listOrgRepos(org)).filter(
    (repo) => !IGNORED[repo.name] && !SUPERSEDED.test(repo.name) && !repo.private);

  const files = {};
  for (const { repo, defaultBranch } of repos) {
    // The default branch and not development: what a consumer resolves is what
    // is released, and the generated README already only exists there.
    const pluginLua = await client.getFile(repo, "plugin.lua", defaultBranch);
    const wikiIndex = await client.getFile(repo, "wiki/index.md", defaultBranch);
    files[repo] = {
      pluginLua,
      hasWiki: wikiIndex !== null,
      examples: await client.listDirectory(repo, "examples", defaultBranch),
      release: await client.latestRelease(repo),
    };
  }

  const manifest = buildManifest(classify(repos, files), { generatedAt });

  // A detector that answers with an empty org has failed in a way that looks
  // exactly like an org with nothing in it, and the consumers would publish a
  // site with no plugins rather than fail. Refuse instead.
  if (!manifest.core) throw new Error("no core repository was found; refusing to emit a manifest");
  if (manifest.plugins.length === 0) {
    throw new Error("no plugin was found; refusing to emit a manifest");
  }
  return manifest;
}

async function main() {
  const client = makeClient({ token: process.env.GITHUB_TOKEN });
  const manifest = await runDetect({ client, generatedAt: new Date().toISOString() });
  writeFileSync(new URL("../plugins.json", import.meta.url),
                JSON.stringify(manifest, null, 2) + "\n");
  const counts = {};
  for (const plugin of manifest.plugins) counts[plugin.kind] = (counts[plugin.kind] || 0) + 1;
  const summary = Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(", ");
  console.log(`wrote ${manifest.plugins.length} plugins (${summary})`);
  for (const warning of manifest.warnings) console.warn(`warning: ${warning}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
