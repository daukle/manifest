import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { makeClient } from "./github.mjs";
import { classify, IGNORED, SUPERSEDED } from "./classify.mjs";
import { buildManifest } from "./manifest.mjs";
import { readCatalog } from "./catalog.mjs";

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

// Each modules/<name>.lua beside plugin.lua, by name. The tree is already in
// hand; only a truncated one costs a contents call.
async function moduleSourcesOf(client, repo, ref, tree) {
  const names = tree.truncated
    ? (await client.listFiles(repo, "modules", ref, ".lua")).map((file) => file.slice(0, -4))
    : tree.paths.filter((path) => /^modules\/[^/]+\.lua$/.test(path))
      .map((path) => path.slice("modules/".length, -4));
  const sources = {};
  for (const name of names) {
    const text = await client.getFile(repo, `modules/${name}.lua`, ref);
    if (text !== null) sources[name] = text;
  }
  return sources;
}

// A truncated or unreadable tree cannot say a file is absent, and getFile
// answers null for a missing one.
async function catalogTextOf(client, repo, ref, tree) {
  if (!tree.truncated && !tree.paths.includes("catalog.json")) return null;
  return client.getFile(repo, "catalog.json", ref);
}

export async function runDetect({ org = ORG, client, generatedAt }) {
  const repos = (await client.listOrgRepos(org)).filter(
    (repo) => !IGNORED[repo.name] && !SUPERSEDED.test(repo.name) && !repo.private);

  const files = {};
  const catalogWarnings = [];
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
    const catalogText = await catalogTextOf(client, repo, defaultBranch, tree);
    const catalog = catalogText === null ? null : readCatalog(catalogText, repo);
    if (catalog) catalogWarnings.push(...catalog.warnings);
    const release = await client.latestRelease(repo);
    // Only a repository carrying plugin.lua publishes one; core and the guide
    // release other assets and would otherwise each raise a false warning.
    const assetSha = release && pluginLua
      ? await client.assetDigest(repo, release.tag, "plugin.lua") : null;
    if (release && pluginLua && assetSha === null) {
      catalogWarnings.push(`${repo}: release ${release.tag} has no plugin.lua asset to pin`);
    }
    files[repo] = {
      pluginLua,
      catalog,
      moduleSources: await moduleSourcesOf(client, repo, defaultBranch, tree),
      wikiPages,
      examples: await examplesOf(client, repo, defaultBranch, tree),
      release,
      assetSha,
      tip: await client.tipOf(repo, defaultBranch),
    };
  }

  const manifest = buildManifest(classify(repos, files), { generatedAt });
  manifest.warnings.push(...catalogWarnings);

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
