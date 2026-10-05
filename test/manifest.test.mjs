import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest, topological } from "../src/manifest.mjs";

const needs = (...ids) => ids.map((id) => ({ alias: id, repo: `daukle/${id}`, id }));
const entry = (id, kind, requires = []) =>
  ({ id, kind, requires: needs(...requires), repo: `daukle/${id}` });

test("a plugin appears after everything it requires", () => {
  const out = topological([
    entry("gradle", "toolchain", ["java"]),
    entry("java", "toolchain"),
    entry("cmake", "toolchain", ["lifecycle", "c"]),
    entry("lifecycle", "library"),
    entry("c", "toolchain"),
  ]).map((e) => e.id);

  assert.ok(out.indexOf("java") < out.indexOf("gradle"));
  assert.ok(out.indexOf("lifecycle") < out.indexOf("cmake"));
  assert.ok(out.indexOf("c") < out.indexOf("cmake"));
});

test("the order is stable, not merely correct", () => {
  const rows = [entry("node", "toolchain"), entry("cmake", "toolchain"), entry("npm", "language")];
  assert.deepEqual(topological(rows).map((e) => e.id), topological([...rows].reverse()).map((e) => e.id));
});

test("a require on something outside the org is a warning, not a crash", () => {
  const built = buildManifest([
    entry("daukle", "core"),
    entry("java", "toolchain", ["elsewhere"]),
  ]);
  assert.deepEqual(built.warnings,
    ['java requires "elsewhere" (daukle/elsewhere), which is not in this org']);
  assert.equal(built.plugins.length, 1);
});

test("a cycle still produces a manifest, because a cycle is a fact about the org", () => {
  const out = topological([
    entry("a", "toolchain", ["b"]),
    entry("b", "toolchain", ["a"]),
  ]);
  assert.deepEqual(out.map((e) => e.id).sort(), ["a", "b"]);
});

test("core, guide and examples are lifted out of the plugin list", () => {
  const built = buildManifest([
    entry("daukle", "core"),
    entry("guide", "guide"),
    entry("examples", "examples"),
    entry("java", "toolchain"),
  ]);
  assert.equal(built.core.id, "daukle");
  assert.equal(built.guide.id, "guide");
  assert.equal(built.examples.id, "examples");
  assert.deepEqual(built.plugins.map((e) => e.id), ["java"]);
});
