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

const structurallyWrong = {
  "a null document": "null",
  "an array document": "[]",
  "a number document": "5",
  "a string document": '"x"',
  "detect that is not an array": '{"detect": {}}',
  "a null rule": '{"detect": [null]}',
  "a numeric rule": '{"detect": [5]}',
  "a non-string file": '{"detect": [{"files": [1]}]}',
  "an empty-string file": '{"detect": [{"files": [""]}]}',
  "contains that is not an array": '{"detect": [{"files": ["a"], "contains": "x"}]}',
  "a non-string pattern": '{"detect": [{"files": ["a"], "contains": [1]}]}',
  "a non-string scope": '{"detect": [{"files": ["a"], "scope": 1}]}',
  "replaces that is not an object": '{"replaces": []}',
  "a tool that is not an object": '{"replaces": {"gradle": "x"}}',
  "a kind that is not an array": '{"replaces": {"gradle": {"plugins": "x"}}}',
  "a kind holding a non-string": '{"replaces": {"gradle": {"plugins": [1]}}}',
};

for (const [name, text] of Object.entries(structurallyWrong)) {
  test(`${name} is refused with a warning, never a throw`, () => {
    const read = readCatalog(text, "daukle/w");
    assert.deepEqual(read.detect, []);
    assert.deepEqual(read.replaces, {});
    assert.match(read.warnings[0], /daukle\/w: catalog\.json/);
  });
}

test("skip is read as a list of directory names, empty when absent", () => {
  assert.deepEqual(readCatalog(JSON.stringify({ skip: ["node_modules"] }), "daukle/k").skip, ["node_modules"]);
  assert.deepEqual(readCatalog(valid, "daukle/x").skip, []);
});

const badSkips = {
  "skip that is not an array": '{"skip": "x"}',
  "an empty skip name": '{"skip": [""]}',
  "a skip name holding a slash": '{"skip": ["a/b"]}',
  "a skip name holding a backslash": '{"skip": ["a\\\\b"]}',
  "a skip name holding a wildcard": '{"skip": ["*"]}',
  "a skip name that is a dot": '{"skip": ["."]}',
  "a skip name that is two dots": '{"skip": [".."]}',
  "a skip name holding a colon": '{"skip": ["c:"]}',
  "a non-string skip name": '{"skip": [1]}',
};

for (const [name, text] of Object.entries(badSkips)) {
  test(`${name} is refused with a warning`, () => {
    const read = readCatalog(text, "daukle/q");
    assert.deepEqual(read.skip, []);
    assert.match(read.warnings[0], /daukle\/q: catalog\.json .*skip/);
  });
}

test("a literal ] right after [ or [^ does not end the set early", () => {
  const text = JSON.stringify({ detect: [{ files: ["a"], contains: ["[^]a-z]", "[]a-z]"] }] });
  assert.deepEqual(readCatalog(text, "daukle/b").warnings, []);
});

test("a leading hyphen is refused, conservatively, rather than guessed at", () => {
  const text = JSON.stringify({ detect: [{ files: ["a"], contains: ["-x"] }] });
  const read = readCatalog(text, "daukle/h");
  assert.deepEqual(read.detect, []);
  assert.match(read.warnings[0], /daukle\/h.*"-x"/);
});
