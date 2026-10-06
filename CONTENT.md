## What this is

The **auto-detected** source of truth for the daukle organization. A zero-dependency Node detector
scans every public repo in the org, reads each one's `plugin.lua` on its default branch, and writes
`plugins.json` at the root.

`daukle/guide` reads it to discover what exists. **Nothing is submoduled and
nothing is listed by hand**: a gitlink is a pinned SHA somebody has to maintain, and a hand-written
list is a list that is wrong the day a repository is added.

## What it classifies, and from what

**Every classification comes from the repository's own `plugin.lua`**, never from its name. A name
is a label somebody chose; a declaration is what core enforces.

| kind | how it is decided |
| --- | --- |
| `core` | the `daukle/daukle` repository |
| `toolchain` | declares `daukle.toolchain` **and** uses `exec` or `provision` |
| `resolver` | declares `daukle.toolchain` and uses **neither** |
| `language` | declares `daukle.language` |
| `source` | declares `daukle.source` |
| `library` | declares nothing, and exists to be required by others |
| `guide`, `examples` | the two repositories that aggregate the rest |

**The resolver rule is the one worth reading twice.** `daukle/maven` literally declares a
toolchain, because that is the only declaration that fits, and it compiles nothing and runs
nothing: it turns coordinates into pinned entries other toolchains consume. Listing it beside
`java` and `cmake` would mislead every reader, and "declares a toolchain but may not start a
process" separates it mechanically rather than by a hand-maintained exception.

## What each entry carries

```json
{
  "id": "gradle",
  "repo": "daukle/gradle",
  "kind": "toolchain",
  "defaultBranch": "main",
  "declares": ["toolchain"],
  "uses": ["provision", "artifact", "exec", "write"],
  "exports": ["lib/distributions", "lib/build_file", "lib/junit"],
  "requires": [{ "alias": "java", "repo": "daukle/java", "id": "java" }],
  "wiki": true,
  "examples": ["gradle-hello"],
  "release": { "tag": "1.0.0", "publishedAt": "2026-10-05T12:00:00Z" }
}
```

**`requires` carries the repository and not only the alias, and the difference is real.**
`daukle/cmake` requires `daukle/c` under the alias **`cc`**, because core refuses a one-letter
alias: a letter before a colon is a Windows drive letter, so `daukle.require("c:...")` could never
resolve. The first version of this detector compared aliases to ids and reported a false "requires
something outside this org" on the one entry where they differ. The repository is read from the
pinned url, which is the only place it actually appears.

**`plugins` is topologically sorted**: a plugin always appears after everything it requires, so a
consumer walking the list in order never meets a dependency it has not seen. A cycle still produces
a manifest, because a cycle is a fact about the org worth seeing rather than a reason to publish
nothing.

## What is never classified, and why

| repository | why |
| --- | --- |
| `manifest` | this one |
| `docs` | private: the queue, the rules and the traps |
| `.github` | the org profile, not a project |
| `*-pre20260922` | the predecessors kept from the extraction that turned the built-ins into plugins. They still carry a `plugin.lua`, so only a rule tells them apart |

Any private repository is skipped as well, because a consumer's CI cannot read one.

## It refuses to emit a degraded manifest

A detector that answers with an empty org fails in a way that looks exactly like an org with
nothing in it, and a consumer would then publish a site with no plugins rather than fail. So a run
that finds no core, or no plugin at all, **raises instead of writing**.

## Running it

```sh
npm test                              # pure functions, no network, no token
GITHUB_TOKEN=... npm run generate     # rewrites plugins.json
```

Every module except `src/github.mjs` is a pure function over injected strings, which is why the
suite never needs a token or a fixture server.

## Reading it

```
https://raw.githubusercontent.com/daukle/manifest/main/plugins.json
```

No authentication: it is a public file on the default branch.
