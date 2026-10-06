// Turning the classified rows into the document consumers read.

const ORDER = ["core", "toolchain", "resolver", "language", "source", "library", "guide"];

function byKindThenId(left, right) {
  const difference = ORDER.indexOf(left.kind) - ORDER.indexOf(right.kind);
  return difference !== 0 ? difference : left.id.localeCompare(right.id);
}

/**
 * A plugin that requires another must appear after it, so a consumer walking
 * the list in order never meets a dependency it has not seen. Kahn's algorithm
 * over the `requires` edges, with the kind order as the tiebreaker so the
 * output is stable rather than merely correct.
 */
export function topological(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pending = new Map();
  for (const entry of entries) {
    pending.set(entry.id,
                (entry.requires || []).map((r) => r.id).filter((id) => byId.has(id)));
  }

  const out = [];
  const taken = new Set();
  while (out.length < entries.length) {
    const ready = entries
      .filter((entry) => !taken.has(entry.id) && pending.get(entry.id).every((id) => taken.has(id)))
      .sort(byKindThenId);
    if (ready.length === 0) {
      // A cycle. Emitting the rest in a stable order is better than throwing,
      // because the manifest's job is to describe the org and a cycle is a
      // thing about the org worth seeing rather than a reason to publish
      // nothing. The cycle is reported in `warnings`.
      const rest = entries.filter((entry) => !taken.has(entry.id)).sort(byKindThenId);
      out.push(...rest);
      break;
    }
    for (const entry of ready) {
      out.push(entry);
      taken.add(entry.id);
    }
  }
  return out;
}

export function buildManifest(entries, { generatedAt } = {}) {
  const ordered = topological(entries);
  const byId = new Map(ordered.map((entry) => [entry.id, entry]));

  const warnings = [];
  for (const entry of ordered) {
    for (const required of entry.requires || []) {
      // A require naming something the org does not hold is either a typo or a
      // plugin from elsewhere. Either way a consumer should see it. The alias is
      // reported beside the repository because they differ, which is the whole
      // reason this reads the url.
      if (!required.id || !byId.has(required.id)) {
        warnings.push(`${entry.id} requires "${required.alias}" (${required.repo || "no url"}),`
                      + ` which is not in this org`);
      }
    }
  }

  const core = ordered.find((entry) => entry.kind === "core") || null;
  const plugins = ordered.filter(
    (entry) => !["core", "guide"].includes(entry.kind));

  return {
    generatedAt: generatedAt || null,
    core,
    plugins,
    guide: ordered.find((entry) => entry.kind === "guide") || null,
    warnings,
  };
}
