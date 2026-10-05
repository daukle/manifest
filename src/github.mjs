// The one module that touches the network, kept separate so every other module
// is a pure function and the test suite never needs a token or a fixture server.

const API = "https://api.github.com";

export function makeClient({ token, fetchImpl = fetch } = {}) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "daukle-manifest",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  async function json(path) {
    const response = await fetchImpl(API + path, { headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`${path} answered ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  return {
    async listOrgRepos(org) {
      const out = [];
      for (let page = 1; ; page += 1) {
        const batch = await json(`/orgs/${org}/repos?per_page=100&page=${page}`);
        if (!batch || batch.length === 0) break;
        for (const repo of batch) {
          out.push({
            repo: repo.full_name,
            name: repo.name,
            defaultBranch: repo.default_branch,
            archived: repo.archived,
            private: repo.private,
          });
        }
        if (batch.length < 100) break;
      }
      return out;
    },

    // Raw rather than the contents API: the contents API base64-encodes and
    // caps at 1 MB, and every file this reads is a small text file on a public
    // repo. A 404 is an answer, not a failure.
    async getFile(repo, path, ref) {
      const response = await fetchImpl(
        `https://raw.githubusercontent.com/${repo}/${ref}/${path}`, { headers });
      if (!response.ok) return null;
      return response.text();
    },

    async listDirectory(repo, path, ref) {
      const entries = await json(`/repos/${repo}/contents/${path}?ref=${ref}`);
      if (!Array.isArray(entries)) return [];
      return entries.filter((entry) => entry.type === "dir").map((entry) => entry.name);
    },

    async latestRelease(repo) {
      const release = await json(`/repos/${repo}/releases/latest`);
      return release ? { tag: release.tag_name, publishedAt: release.published_at } : null;
    },
  };
}
