import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { makeClient } from "./github.mjs";
import { classify, IGNORED, SUPERSEDED } from "./classify.mjs";
import { buildManifest } from "./manifest.mjs";

const ORG = "daukle";

/**
 * Every example of one repository, with the files beneath it.
 *
 * @implNote an example is a directory under `examples/` carrying an ABOUT.md,
 * which is the definition the README generator already uses. An exclusion list
 * was tried first and was wrong within the hour: it named `test` and then
 * `wiki/` was added and appeared as an example.
 */
export function examplesFromTree(paths) {
  const byExample = new Map();
  for (const path of paths) {
    if (!path.startsWith("examples/")) continue;
    const rest = path.slice("examples/".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) continue;
    const example = rest.slice(0, slash);
    if (example.startsWith(".")) continue;
    if (!byExample.has(example)) byExample.set(example, []);
    byExample.get(example).push(rest.slice(slash + 1));
  }
  return [...byExample.entries()]
    .filter(([, files]) => files.includes("ABOUT.md"))
    .map(([example, files]) => ({ name: example, files: files.sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function examplesOf(client, repo, ref, tree) {
  if (!tree.truncated) return examplesFromTree(tree.paths);

  // A truncated tree has lost paths without saying which, so fall back to the
  // per-directory listing rather than publish an example missing files.
  const found = [];
  for (const entry of await client.listDirectory(repo, "examples", ref)) {
    if (entry.startsWith(".")) continue;
    if (await client.getFile(repo, `examples/${entry}/ABOUT.md`, ref)) {
      found.push({ name: entry, files: [] });
    }
  }
  return found;
}

export async function runDetect({ org = ORG, client, generatedAt }) {
  const repos = (await client.listOrgRepos(org)).filter(
    (repo) => !IGNORED[repo.name] && !SUPERSEDED.test(repo.name) && !repo.private);

  const files = {};
  for (const { repo, name, defaultBranch } of repos) {
    // The default branch and not development: what a consumer resolves is what
    // is released, and the generated README already only exists there.
    const pluginLua = await client.getFile(repo, "plugin.lua", defaultBranch);
    // The page NAMES and not merely whether a wiki exists. This runs with a
    // token; the site that consumes it does not, and listing a directory costs
    // a rate-limited contents call while fetching a known path over raw costs
    // none. Recording the names here is what keeps the site's build off the
    // API entirely.
    const wikiPages = await client.listFiles(repo, "wiki", defaultBranch, ".md");
    const tree = await client.treeOf(repo, defaultBranch);
    files[repo] = {
      pluginLua,
      wikiPages,
      examples: await examplesOf(client, repo, defaultBranch, tree),
      release: await client.latestRelease(repo),
      tip: await client.tipOf(repo, defaultBranch),
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
