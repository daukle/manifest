import { test } from "node:test";
import assert from "node:assert/strict";
import { examplesFromTree } from "../src/detect.mjs";

// The site renders every file of an example without listing a directory, so the
// names have to come from here. A tree is one API call per repository where the
// contents API is one per directory.

const PLUGIN_TREE = [
  ".gitattributes",
  "plugin.lua",
  "wiki/index.md",
  "test/cases.sh",
  "test/cases/refuses-a-non-string-tag/daukle.toml",
  "examples/java-hello-jar/ABOUT.md",
  "examples/java-hello-jar/daukle.toml",
  "examples/java-hello-jar/src/main/java/com/example/Main.java",
  "examples/java-pinned-classpath/daukle.toml",
  "examples/java-pinned-classpath/ABOUT.md",
];

test("an example's files are relative to the example, not to the repository", () => {
  assert.deepEqual(examplesFromTree(PLUGIN_TREE), [
    {
      name: "java-hello-jar",
      files: ["ABOUT.md", "daukle.toml", "src/main/java/com/example/Main.java"],
    },
    { name: "java-pinned-classpath", files: ["ABOUT.md", "daukle.toml"] },
  ]);
});

test("nothing outside examples/ becomes an example", () => {
  const found = examplesFromTree(PLUGIN_TREE).map((e) => e.name);
  assert.deepEqual(found, ["java-hello-jar", "java-pinned-classpath"]);
});

test("a directory with no ABOUT.md is not an example, whatever else it holds", () => {
  // The rule the README generator already uses. An exclusion list was tried
  // first in this repository and named `test` just before `wiki/` was added.
  assert.deepEqual(examplesFromTree([
    "examples/undocumented/daukle.toml",
    "examples/undocumented/src/main.c",
  ]), []);
});

test("a dot directory is never an example, even carrying an ABOUT.md", () => {
  assert.deepEqual(examplesFromTree(["examples/.scratch/ABOUT.md"]), []);
});

test("the order is by name, so the manifest does not churn on a re-run", () => {
  const shuffled = [
    "examples/zeta/ABOUT.md",
    "examples/alpha/ABOUT.md",
    "examples/mid/ABOUT.md",
  ];
  assert.deepEqual(examplesFromTree(shuffled).map((e) => e.name),
                   ["alpha", "mid", "zeta"]);
});
