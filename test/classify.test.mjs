import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlugin, kindOf, classify, SUPERSEDED } from "../src/classify.mjs";

const MAVEN = `
daukle.plugin{ api = 1, uses = { "fetch", "cache", "pin", "write" },
               exports = { "lib/xml", "lib/pom", "lib/graph" } }
daukle.toolchain{ name = "maven", generate = function() return {} end }
`;

const GRADLE = `
daukle.plugin{
  api = 1,
  uses = { "provision", "artifact", "exec", "write" },
  exports = { "lib/distributions", "lib/build_file", "lib/junit" },
  requires = {
    java = {
      url = "https://github.com/daukle/java/releases/download/1.2.0/plugin.lua",
      sha256 = "deadbeef",
    },
  },
}
daukle.toolchain{ name = "gradle" }
`;

const NPM = `
daukle.plugin{ api = 1, uses = { "region", "json_set" } }
daukle.language{ name = "npm" }
`;

const LIFECYCLE = `
daukle.plugin{ api = 1, uses = {}, exports = { "lib/names" } }
`;

test("a toolchain that neither execs nor provisions is a resolver", () => {
  assert.equal(readPlugin(MAVEN).kind, "resolver");
  assert.equal(readPlugin(GRADLE).kind, "toolchain");
});

test("the resolver rule is about capabilities, not about the declaration", () => {
  assert.equal(kindOf({ declares: ["toolchain"], uses: ["exec"] }), "toolchain");
  assert.equal(kindOf({ declares: ["toolchain"], uses: ["provision"] }), "toolchain");
  assert.equal(kindOf({ declares: ["toolchain"], uses: ["fetch"] }), "resolver");
});

test("a plugin that declares nothing is a library, not a mistake", () => {
  const read = readPlugin(LIFECYCLE);
  assert.equal(read.kind, "library");
  assert.deepEqual(read.exports, ["lib/names"]);
});

test("a language and a source are read from what they declare", () => {
  assert.equal(readPlugin(NPM).kind, "language");
  assert.equal(readPlugin(`daukle.source{ name = "github" }`).kind, "source");
});

test("requires resolves the repository from the url, because the alias differs", () => {
  assert.deepEqual(readPlugin(GRADLE).requires,
                   [{ alias: "java", repo: "daukle/java", id: "java" }]);
  assert.deepEqual(readPlugin(MAVEN).requires, []);
});

test("uses and exports are read as lists", () => {
  assert.deepEqual(readPlugin(MAVEN).uses, ["fetch", "cache", "pin", "write"]);
  assert.deepEqual(readPlugin(MAVEN).exports, ["lib/xml", "lib/pom", "lib/graph"]);
});

test("a plugin.lua this reader cannot parse reports nothing rather than something wrong", () => {
  // Fails closed: a uses list written some other way yields [], which makes the
  // kind "resolver" for a toolchain rather than inventing a capability.
  const odd = `daukle.plugin{ api = 1, uses = USES } daukle.toolchain{ name = "x" }`;
  assert.deepEqual(readPlugin(odd).uses, []);
});

test("the superseded pattern catches the 2026-09-22 predecessors and nothing else", () => {
  assert.ok(SUPERSEDED.test("npm-pre20260922"));
  assert.ok(SUPERSEDED.test("gradle-pre20260922"));
  assert.ok(!SUPERSEDED.test("npm"));
  assert.ok(!SUPERSEDED.test("pre-release"));
});

test("classify skips ignored, superseded and plugin-less repos", () => {
  const repos = [
    { repo: "daukle/daukle", name: "daukle", defaultBranch: "main" },
    { repo: "daukle/maven", name: "maven", defaultBranch: "main" },
    { repo: "daukle/npm-pre20260922", name: "npm-pre20260922", defaultBranch: "main" },
    { repo: "daukle/manifest", name: "manifest", defaultBranch: "main" },
    { repo: "daukle/guide", name: "guide", defaultBranch: "main" },
    { repo: "daukle/nothing", name: "nothing", defaultBranch: "main" },
  ];
  const files = {
    "daukle/maven": { pluginLua: MAVEN, hasWiki: true, examples: ["a"] },
    "daukle/npm-pre20260922": { pluginLua: NPM },
    "daukle/nothing": {},
  };
  const out = classify(repos, files);
  assert.deepEqual(out.map((entry) => entry.id), ["daukle", "maven", "guide"]);
  assert.equal(out.find((entry) => entry.id === "daukle").kind, "core");
  assert.equal(out.find((entry) => entry.id === "guide").kind, "guide");
  assert.equal(out.find((entry) => entry.id === "maven").wiki, true);
  assert.deepEqual(out.find((entry) => entry.id === "maven").examples, ["a"]);
});
