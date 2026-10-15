import { test } from "node:test";
import assert from "node:assert/strict";
import { runDetect } from "../src/detect.mjs";

const PLUGIN_LUA = 'daukle.plugin{ api = 1 }\ndaukle.toolchain{ name = "node" }\n';
const CATALOG = JSON.stringify({
  detect: [{ files: ["package.json"], scope: "tree" }],
  replaces: { gradle: { plugins: ["x.release"] } },
});

function fakeClient({ catalogs }) {
  const catalogReads = [];
  const repoRow = (name) => ({ repo: `daukle/${name}`, name, defaultBranch: "main", private: false });
  const client = {
    listOrgRepos: async () => [repoRow("daukle"), ...Object.keys(catalogs).map(repoRow)],
    getFile: async (repo, path) => {
      if (path === "catalog.json") {
        catalogReads.push(repo);
        return catalogs[repo.split("/")[1]] ?? null;
      }
      return path === "plugin.lua" ? (repo === "daukle/daukle" ? "daukle.plugin{ api = 1 }\n" : PLUGIN_LUA) : null;
    },
    listFiles: async () => [],
    treeOf: async (repo) => {
      const text = catalogs[repo.split("/")[1]];
      return { paths: text === undefined ? [] : ["catalog.json"], truncated: false };
    },
    latestRelease: async () => null,
    tipOf: async () => null,
  };
  return { client, catalogReads };
}

const detectFor = async (catalogs) => {
  const { client, catalogReads } = fakeClient({ catalogs });
  const manifest = await runDetect({ client, generatedAt: "now" });
  return { manifest, catalogReads, byId: Object.fromEntries(manifest.plugins.map((p) => [p.id, p])) };
};

test("a repository with a catalog.json publishes its detect and replaces", async () => {
  const { byId, manifest } = await detectFor({ node: CATALOG });
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
