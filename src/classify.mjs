// What a repository IS, read from the one file that cannot lie about it.
//
// Every classification here comes from the repo's own plugin.lua: what it
// declares, what capabilities it asks for, what it exports and what it
// requires. Nothing is inferred from a repository NAME, because a name is a
// label somebody chose and a declaration is what core enforces.

// Repos that are deliberately never classified, each with the reason, because
// an unexplained exclusion list is one nobody dares to change.
export const IGNORED = {
  manifest: "this repository",
  docs: "private: the queue, the rules and the traps, readable by nobody's CI but its own",
  ".github": "org profile, not a project",
};

// The predecessors kept from the 2026-09-22 extraction, when the built-ins
// became plugins. They still carry a plugin.lua, so only a rule can tell them
// apart from the live ones.
export const SUPERSEDED = /-pre\d{8}$/;

const DECLARATIONS = [
  ["toolchain", /daukle\.toolchain\s*\{/],
  ["language", /daukle\.language\s*\{/],
  ["source", /daukle\.source\s*\{/],
  ["publisher", /daukle\.publisher\s*\{/],
];

// The two repositories that are not plugins and never will be.
const FIXED = {
  daukle: "core",
  guide: "guide",
};

function listField(text, field) {
  // Matches `field = { "a", "b" }` inside daukle.plugin{...}. A plugin that
  // spells it any other way reports nothing rather than a wrong answer: this
  // is a reader, not a Lua interpreter, and it says so by failing closed.
  const block = text.match(new RegExp(field + "\\s*=\\s*\\{([^}]*)\\}"));
  if (!block) return [];
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The plugins a plugin requires, as { alias, repo, id }.
 *
 * @implNote the ALIAS is not the repository name and cannot be used as one.
 * `daukle/cmake` requires `daukle/c` under the alias `cc`, because core refuses
 * a one-letter alias: a letter before a colon is a Windows drive letter, so
 * `daukle.require("c:...")` could never resolve. The repository is taken from
 * the pinned url instead, which is the only place it actually appears. The
 * first version of this reader compared aliases to ids and reported a false
 * "requires something outside this org" on the one entry that differs.
 */
function requiresField(text) {
  const block = text.match(/requires\s*=\s*\{([\s\S]*?)\n\s*\},?\s*\n\}/);
  if (!block) return [];
  const out = [];
  const entries = block[1].matchAll(
    /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{([\s\S]*?)\}/gm);
  for (const [, alias, body] of entries) {
    const url = (body.match(/url\s*=\s*"([^"]+)"/) || [])[1] || "";
    const owner = url.match(/github\.com\/([^/]+)\/([^/]+)\//);
    out.push({
      alias,
      repo: owner ? `${owner[1]}/${owner[2]}` : null,
      id: owner ? owner[2].toLowerCase() : null,
    });
  }
  return out;
}

/**
 * The kind of a plugin, from what it declares and what it may do.
 *
 * A toolchain that neither execs nor provisions is a RESOLVER: it starts no
 * process and installs no tool, it turns coordinates into pinned entries other
 * toolchains consume. daukle/maven is the only one today and calling it a
 * toolchain, which is what it literally declares, would put it beside java and
 * cmake and mislead every reader of this file.
 */
export function kindOf({ declares, uses }) {
  if (declares.includes("toolchain")) {
    const runsSomething = uses.includes("exec") || uses.includes("provision");
    return runsSomething ? "toolchain" : "resolver";
  }
  if (declares.includes("language")) return "language";
  if (declares.includes("source")) return "source";
  if (declares.includes("publisher")) return "publisher";
  // Declares nothing and is still a plugin: it exists to be required by
  // others, like daukle/lifecycle's shared task vocabulary.
  return "library";
}

/**
 * Every kind a chunk declares, in kindOf's order, so kinds[0] is always kind.
 * One chunk may hold a source beside a publisher since daukle 0.8.0, which is
 * what daukle/github does.
 */
export function kindsOf({ declares, uses }) {
  const kinds = [];
  if (declares.includes("toolchain")) kinds.push(kindOf({ declares: ["toolchain"], uses }));
  for (const kind of ["language", "source", "publisher"]) {
    if (declares.includes(kind)) kinds.push(kind);
  }
  return kinds.length > 0 ? kinds : ["library"];
}

export function readPlugin(text) {
  const declares = DECLARATIONS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const uses = listField(text, "uses");
  const exports = listField(text, "exports");
  const requires = requiresField(text);
  return {
    declares, uses, exports, requires,
    kind: kindOf({ declares, uses }),
    kinds: kindsOf({ declares, uses }),
  };
}

/**
 * A plugin's modules, each read from its own chunk: a module carries its own
 * grant (daukle 0.9.0, D-134), so its kinds and uses are its own and not the
 * main chunk's.
 */
function modulesOf(moduleSources = {}) {
  return Object.keys(moduleSources).sort().map((name) => {
    const { kind, kinds, uses } = readPlugin(moduleSources[name]);
    return { name, kind, kinds, uses };
  });
}

/**
 * @param repos  [{ repo, name, defaultBranch, archived }]
 * @param files  { [repo]: { pluginLua, hasWiki, hasExamples, release } }
 */
export function classify(repos, files) {
  const out = [];
  for (const repo of repos) {
    const reason = IGNORED[repo.name];
    if (reason) continue;
    if (SUPERSEDED.test(repo.name)) continue;
    // Archived is how a merged repository retires while its releases stay downloadable.
    if (repo.archived) continue;

    const found = files[repo.repo] || {};
    const fixed = FIXED[repo.name];
    const entry = {
      id: repo.name.toLowerCase(),
      repo: repo.repo,
      kind: fixed || null,
      defaultBranch: repo.defaultBranch,
      wikiPages: found.wikiPages || [],
      examples: found.examples || [],
      release: found.release || null,
      tip: found.tip || null,
      detect: found.catalog ? found.catalog.detect : [],
      replaces: found.catalog ? found.catalog.replaces : {},
      asset: found.release && found.assetSha
        ? { url: `https://github.com/${repo.repo}/releases/download/${found.release.tag}/plugin.lua`,
            sha256: found.assetSha }
        : null,
    };

    if (fixed) {
      out.push(entry);
      continue;
    }
    if (!found.pluginLua) continue;
    const plugin = readPlugin(found.pluginLua);
    out.push({ ...entry, ...plugin, modules: modulesOf(found.moduleSources) });
  }
  return out;
}
