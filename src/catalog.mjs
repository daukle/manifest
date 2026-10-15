// A plugin's catalog.json: how to detect the projects it serves, and which
// other tools' plugins it replaces. Read as data, never run.

const SCOPES = ["root", "tree"];

/**
 * True when a Lua pattern holds a "-" that Lua reads as the lazy quantifier.
 *
 * @implNote inside a set, "-" is a range and is fine; escaped as "%-" it is a
 * literal. Anywhere else it quantifies the character before it, which is the
 * bug this org shipped twice in daukle/gradle.
 */
export function hasBareHyphen(pattern) {
  let inSet = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "%") { index += 1; continue; }
    if (inSet) { if (char === "]") inSet = false; continue; }
    if (char === "[") { inSet = true; if (pattern[index + 1] === "]") index += 1; continue; }
    if (char === "-") return true;
  }
  return false;
}

function refuse(repo, reason) {
  return { detect: [], replaces: {}, warnings: [`${repo}: catalog.json ${reason}`] };
}

function readRule(rule) {
  if (!Array.isArray(rule.files) || rule.files.length === 0) return { reason: "has a rule with no files" };
  const scope = rule.scope ?? "root";
  if (!SCOPES.includes(scope)) return { reason: `has a rule whose scope "${scope}" is not root or tree` };
  const contains = rule.contains ?? [];
  const bare = contains.find(hasBareHyphen);
  if (bare !== undefined) {
    return { reason: `has the pattern "${bare}", whose bare - is a lazy quantifier; write %-` };
  }
  return { rule: { files: rule.files, contains, scope } };
}

export function readCatalog(text, repo) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return refuse(repo, `is not valid JSON (${error.message})`);
  }
  const detect = [];
  for (const rule of parsed.detect ?? []) {
    const read = readRule(rule);
    if (read.reason) return refuse(repo, read.reason);
    detect.push(read.rule);
  }
  return { detect, replaces: parsed.replaces ?? {}, warnings: [] };
}
