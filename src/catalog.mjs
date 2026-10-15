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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function refuse(repo, reason) {
  return { detect: [], replaces: {}, warnings: [`${repo}: catalog.json ${reason}`] };
}

function readRule(rule) {
  if (!isPlainObject(rule)) return { reason: "has a rule that is not an object" };
  if (!isStringArray(rule.files) || rule.files.length === 0 || rule.files.includes("")) {
    return { reason: "has a rule whose files are missing or not non-empty strings" };
  }
  const scope = rule.scope ?? "root";
  if (!SCOPES.includes(scope)) return { reason: `has a rule whose scope "${scope}" is not root or tree` };
  const contains = rule.contains ?? [];
  if (!isStringArray(contains)) return { reason: "has a rule whose contains is not an array of strings" };
  const bare = contains.find(hasBareHyphen);
  if (bare !== undefined) {
    return { reason: `has the pattern "${bare}", whose bare - is a lazy quantifier; write %-` };
  }
  return { rule: { files: rule.files, contains, scope } };
}

function readReplaces(replaces) {
  const wellFormed = isPlainObject(replaces) && Object.values(replaces).every(
    (tool) => isPlainObject(tool) && Object.values(tool).every(isStringArray),
  );
  return wellFormed ? {} : { reason: "has replaces that is not tool -> kind -> array of strings" };
}

export function readCatalog(text, repo) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return refuse(repo, `is not valid JSON (${error.message})`);
  }
  if (!isPlainObject(parsed)) return refuse(repo, "is not a JSON object");
  if (parsed.detect !== undefined && !Array.isArray(parsed.detect)) {
    return refuse(repo, "has a detect that is not an array");
  }
  const replaces = parsed.replaces ?? {};
  const replacesProblem = readReplaces(replaces);
  if (replacesProblem.reason) return refuse(repo, replacesProblem.reason);
  const detect = [];
  for (const rule of parsed.detect ?? []) {
    const read = readRule(rule);
    if (read.reason) return refuse(repo, read.reason);
    detect.push(read.rule);
  }
  return { detect, replaces, warnings: [] };
}
