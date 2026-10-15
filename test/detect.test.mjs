import { test } from "node:test";
import assert from "node:assert/strict";
import { runDetect } from "../src/detect.mjs";

const PLUGIN_LUA = 'daukle.plugin{ api = 1 }\ndaukle.toolchain{ name = "node" }\n';
const CATALOG = JSON.stringify({
  detect: [{ files: ["package.json"], scope: "tree" }],
  replaces: { gradle: { plugins: ["x.release"] } },
});

function fakeClient({ catalogs, digests = {} }) {
  const catalogReads = [];
  const digestReads = [];
  const repoRow = (name) => ({ repo: `daukle/${name}`, name, defaultBranch: "main", private: false });
  const client = {
    listOrgRepos: async () => [repoRow("daukle"), ...Object.keys(catalogs).map(repoRow)],
    getFile: async (repo, path) => {
      if (path === "catalog.json") {
        catalogReads.push(repo);
        return catalogs[repo.split("/")[1]] ?? null;
      }
      return path === "plugin.lua" && repo !== "daukle/daukle" ? PLUGIN_LUA : null;
    },
    listFiles: async () => [],
    treeOf: async (repo) => {
      const text = catalogs[repo.split("/")[1]];
      return { paths: text === undefined ? [] : ["catalog.json"], truncated: false };
    },
    latestRelease: async () => ({ tag: "1.0.0", publishedAt: "then" }),
    assetDigest: async (repo, tag, name) => {
      digestReads.push([repo, tag, name]);
      return digests[repo.split("/")[1]] ?? null;
    },
    tipOf: async () => null,
  };
  return { client, catalogReads, digestReads };
}

const detectFor = async (catalogs, digests) => {
  const { client, catalogReads, digestReads } = fakeClient({ catalogs, digests });
  const manifest = await runDetect({ client, generatedAt: "now" });
  return { manifest, catalogReads, digestReads, byId: Object.fromEntries(manifest.plugins.map((p) => [p.id, p])) };
};

test("a repository with a catalog.json publishes its detect and replaces", async () => {
  const { byId, manifest } = await detectFor({ node: CATALOG }, { node: "abc123" });
  assert.deepEqual(byId.node.detect, [{ files: ["package.json"], contains: [], scope: "tree" }]);
  assert.deepEqual(byId.node.replaces, { gradle: { plugins: ["x.release"] } });
  assert.deepEqual(manifest.warnings, []);
});

test("a repository without one is never asked for it and carries empty fields", async () => {
  const { byId, catalogReads } = await detectFor({ path: undefined });
  assert.deepEqual(catalogReads, []);
  assert.deepEqual(byId.path.detect, []);
  assert.deepEqual(byId.path.replaces, {});
});

test("a malformed catalog.json leaves empty fields and a warning naming the repository", async () => {
  const { byId, manifest } = await detectFor({ node: "{ not json" });
  assert.deepEqual(byId.node.detect, []);
  assert.deepEqual(byId.node.replaces, {});
  assert.ok(manifest.warnings.some((warning) => /daukle\/node.*catalog\.json/.test(warning)));
});

test("a released plugin pins its plugin.lua asset by url and sha256", async () => {
  const { byId, manifest } = await detectFor({ node: undefined }, { node: "abc123" });
  assert.deepEqual(byId.node.asset, {
    url: "https://github.com/daukle/node/releases/download/1.0.0/plugin.lua",
    sha256: "abc123",
  });
  assert.deepEqual(manifest.warnings, []);
});

test("a release without a plugin.lua asset pins nothing and warns", async () => {
  const { byId, manifest } = await detectFor({ node: undefined }, {});
  assert.equal(byId.node.asset, null);
  assert.deepEqual(manifest.warnings, ["daukle/node: release 1.0.0 has no plugin.lua asset to pin"]);
});

test("a repository without plugin.lua is never asked for a digest", async () => {
  const { digestReads } = await detectFor({ node: undefined }, { node: "abc123" });
  assert.deepEqual(digestReads.map(([repo]) => repo), ["daukle/node"]);
});
