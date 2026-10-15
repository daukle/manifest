import { test } from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../src/catalog.mjs";

const valid = JSON.stringify({
  detect: [
    { files: ["package.json"], contains: ['"scripts"%s*:'], scope: "tree" },
    { files: ["CMakeLists.txt"] },
  ],
  replaces: { gradle: { plugins: ["com.github.breadmoirai.github-release"] } },
});

test("a valid catalog is read with defaults filled in", () => {
  const read = readCatalog(valid, "daukle/x");
  assert.deepEqual(read.warnings, []);
  assert.deepEqual(read.detect[1], { files: ["CMakeLists.txt"], contains: [], scope: "root" });
  assert.deepEqual(read.replaces.gradle.plugins, ["com.github.breadmoirai.github-release"]);
});

test("malformed JSON is a warning naming the repository, never a throw", () => {
  const read = readCatalog("{ not json", "daukle/broken");
  assert.deepEqual(read.detect, []);
  assert.deepEqual(read.replaces, {});
  assert.match(read.warnings[0], /daukle\/broken.*catalog\.json/);
});

// A bare "-" in a Lua pattern is a lazy quantifier, not a literal, and this org
// has shipped that bug twice.
test("an unescaped hyphen in a pattern refuses the catalog", () => {
  const text = JSON.stringify({ detect: [{ files: ["a"], contains: ["daukle-task (.+)"] }] });
  const read = readCatalog(text, "daukle/y");
  assert.deepEqual(read.detect, []);
  assert.match(read.warnings[0], /daukle\/y.*"daukle-task \(\.\+\)".*-/);
});

test("an escaped hyphen and a hyphen inside a set are accepted", () => {
  const text = JSON.stringify({ detect: [{ files: ["a"], contains: ["a%-b", "[%w%-]+", "[a-z]"] }] });
  assert.deepEqual(readCatalog(text, "daukle/z").warnings, []);
});

test("a scope other than root or tree is refused", () => {
  const text = JSON.stringify({ detect: [{ files: ["a"], scope: "everywhere" }] });
  assert.match(readCatalog(text, "daukle/s").warnings[0], /scope/);
});

test("a rule with no files is refused", () => {
  const text = JSON.stringify({ detect: [{ contains: ["x"] }] });
  assert.match(readCatalog(text, "daukle/f").warnings[0], /files/);
});
