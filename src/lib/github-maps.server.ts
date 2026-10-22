// GitHub-backed map storage for the hosted editor. Server only: it holds the GitHub token.
//
// The repo stays the source of truth. Each map being edited gets a branch, editor/<map-id>, and a
// pull request into the base branch; every Save is one commit (map + waves together) on that
// branch. CI runs `npm test` on the pull request (schemas, validation and the clear check), so a
// map only reaches main, and Lovable, once it passes. Reads prefer the open pull request's version,
// so the editor always shows the latest saved work.
import { parseMap, parseWaves, printMap, printWaves } from "@tdmm/map-format";
import { hashOf, type LoadedFiles, type MapListEntry } from "@tdmm/map-editor/storage";

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  /** Branch pull requests target (and maps are read from when there's no open PR). */
  base: string;
  /** Shared key the editor must send to save; saving is refused while it's unset. */
  editorKey: string | undefined;
}

/** Reads GITHUB_TOKEN, GITHUB_REPO, GITHUB_BASE_BRANCH and EDITOR_KEY; null without a token. */
export function configFromEnv(env: Record<string, string | undefined>): GitHubConfig | null {
  const token = env["GITHUB_TOKEN"]?.trim();
  if (!token) return null;
  const [owner, repo] = (env["GITHUB_REPO"]?.trim() || "NotMurkk/white-canvas").split("/");
  if (!owner || !repo) throw new Error('GITHUB_REPO must look like "owner/repo"');
  return {
    token,
    owner,
    repo,
    base: env["GITHUB_BASE_BRANCH"]?.trim() || "main",
    editorKey: env["EDITOR_KEY"]?.trim() || undefined,
  };
}

export interface Ctx {
  cfg: GitHubConfig;
  fetch: typeof fetch;
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BRANCH_PREFIX = "editor/";
const mapPath = (id: string) => `maps/${id}.map.json`;
const wavesPath = (id: string) => `maps/${id}.waves.json`;

/** One GitHub REST call. Returns null for 404 (and 422 when `allow422`); throws GitHubError otherwise. */
async function api<T>(
  ctx: Ctx,
  method: string,
  path: string,
  opts: { body?: unknown; raw?: boolean; allow422?: boolean } = {},
): Promise<T | null> {
  const { owner, repo, token } = ctx.cfg;
  const res = await ctx.fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "td-map-maker",
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  if (res.status === 404 || (opts.allow422 && res.status === 422)) return null;
  if (!res.ok) {
    const detail =
      ((await res.json().catch(() => ({}))) as { message?: string }).message ?? res.statusText;
    const hint =
      res.status === 401
        ? " (check GITHUB_TOKEN)"
        : res.status === 403
          ? " (the token needs Contents and Pull requests write access to this repo)"
          : "";
    throw new GitHubError(res.status, `GitHub ${method} ${path}: ${res.status} ${detail}${hint}`);
  }
  return (opts.raw ? await res.text() : await res.json()) as T;
}

const readFile = (ctx: Ctx, path: string, ref: string) =>
  api<string>(ctx, "GET", `/contents/${path}?ref=${encodeURIComponent(ref)}`, { raw: true });

async function refSha(ctx: Ctx, branch: string): Promise<string | null> {
  return (
    (await api<{ object: { sha: string } }>(ctx, "GET", `/git/ref/heads/${branch}`))?.object.sha ??
    null
  );
}

interface PullRequest {
  number: number;
  html_url: string;
  head: { ref: string };
}

/** Open editor pull requests into the base branch, by map id. */
async function openPulls(ctx: Ctx): Promise<Map<string, PullRequest>> {
  const pulls =
    (await api<PullRequest[]>(
      ctx,
      "GET",
      `/pulls?state=open&base=${encodeURIComponent(ctx.cfg.base)}&per_page=100`,
    )) ?? [];
  return new Map(
    pulls
      .filter((p) => p.head.ref.startsWith(BRANCH_PREFIX))
      .map((p) => [p.head.ref.slice(BRANCH_PREFIX.length), p]),
  );
}

async function openPullFor(ctx: Ctx, id: string): Promise<PullRequest | null> {
  const head = `${ctx.cfg.owner}:${BRANCH_PREFIX}${id}`;
  const pulls =
    (await api<PullRequest[]>(
      ctx,
      "GET",
      `/pulls?state=open&head=${encodeURIComponent(head)}&base=${encodeURIComponent(ctx.cfg.base)}`,
    )) ?? [];
  return pulls[0] ?? null;
}

/** Maps on the base branch, plus new ones that only exist in an open pull request. */
export async function listMaps(ctx: Ctx): Promise<MapListEntry[]> {
  const [pulls, dir] = await Promise.all([
    openPulls(ctx),
    api<{ name: string; type: string }[]>(
      ctx,
      "GET",
      `/contents/maps?ref=${encodeURIComponent(ctx.cfg.base)}`,
    ),
  ]);
  const ids = new Set(
    (dir ?? [])
      .filter((f) => f.type === "file" && f.name.endsWith(".map.json"))
      .map((f) => f.name.slice(0, -".map.json".length)),
  );
  for (const id of pulls.keys()) if (ID.test(id)) ids.add(id);
  const entries = await Promise.all(
    [...ids].sort().map(async (id): Promise<MapListEntry | null> => {
      const pr = pulls.get(id);
      const text = await readFile(ctx, mapPath(id), pr ? pr.head.ref : ctx.cfg.base);
      if (text === null) return null;
      const note = pr ? `unmerged changes (PR #${pr.number})` : undefined;
      try {
        const doc = JSON.parse(text) as { name: string; grid: { width: number; height: number } };
        return {
          id,
          name: doc.name,
          width: doc.grid.width,
          height: doc.grid.height,
          hash: null,
          mtimeMs: 0,
          note,
        };
      } catch {
        return {
          id,
          name: `${id} (unreadable)`,
          width: 0,
          height: 0,
          hash: null,
          mtimeMs: 0,
          note,
        };
      }
    }),
  );
  return entries.filter((e): e is MapListEntry => e !== null);
}

/** A map and its waves file: from its open pull request if there is one, else the base branch. */
export async function loadMap(ctx: Ctx, id: string): Promise<LoadedFiles> {
  if (!ID.test(id)) throw new Error(`"${id}" isn't a map id`);
  const pr = await openPullFor(ctx, id);
  const ref = pr ? pr.head.ref : ctx.cfg.base;
  const [map, waves] = await Promise.all([
    readFile(ctx, mapPath(id), ref),
    readFile(ctx, wavesPath(id), ref),
  ]);
  if (map === null) throw new Error(`no map "${id}" in maps/ on GitHub`);
  return { map, waves, hash: await hashOf(map, waves), mtimeMs: 0 };
}

export interface SaveInput {
  key: string;
  id: string;
  map: string;
  waves: string;
  expectedHash: string | null;
  force: boolean;
  name: string;
  cleared: boolean;
  summary: string | null;
}

/** Checks what arrived over the network before it's trusted. */
export function parseSaveInput(d: unknown): SaveInput {
  const o = (d ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => {
    const v = o[k];
    if (typeof v !== "string" || v.length > max) throw new Error(`bad save request: ${k}`);
    return v;
  };
  const MB = 4 * 1024 * 1024;
  const expected = o["expectedHash"];
  if (expected !== null && typeof expected !== "string")
    throw new Error("bad save request: expectedHash");
  const summary = o["summary"];
  return {
    key: str("key", 500),
    id: str("id", 64),
    map: str("map", MB),
    waves: str("waves", MB),
    expectedHash: expected,
    force: o["force"] === true,
    name: str("name", 200),
    cleared: o["cleared"] === true,
    summary: typeof summary === "string" ? summary.slice(0, 500) : null,
  };
}

export type SaveOutcome =
  | { ok: true; hash: string; url: string | null; number: number | null; message: string }
  | { ok: false; reason: "bad-key" }
  | { ok: false; reason: "conflict"; error: string };

export async function saveMap(ctx: Ctx, input: SaveInput): Promise<SaveOutcome> {
  const { cfg } = ctx;
  if (!cfg.editorKey)
    throw new Error(
      "Hosted saving needs an EDITOR_KEY secret (Lovable: More → Settings → Secrets).",
    );
  if (input.key !== cfg.editorKey) return { ok: false, reason: "bad-key" };
  const { id } = input;
  if (!ID.test(id)) throw new Error('map ids are lowercase letters, digits, "_" and "-"');
  // Same checks as the local dev server: valid, matching ids, canonically printed.
  const doc = parseMap(input.map);
  const waves = parseWaves(input.waves);
  if (doc.id !== id || waves.mapId !== id)
    throw new Error("map/waves id does not match the file name");
  if (printMap(doc) !== input.map || printWaves(waves) !== input.waves)
    throw new Error("files must be canonically printed (printMap/printWaves)");

  const branch = `${BRANCH_PREFIX}${id}`;
  const [pr, baseSha] = await Promise.all([openPullFor(ctx, id), refSha(ctx, cfg.base)]);
  if (!baseSha) throw new Error(`no branch "${cfg.base}" on GitHub`);
  // An editor branch without an open pull request is left over from a merged or closed one: start fresh.
  const branchSha = pr ? await refSha(ctx, branch) : null;
  const ref = branchSha ? branch : cfg.base;
  const [curMap, curWaves] = await Promise.all([
    readFile(ctx, mapPath(id), ref),
    readFile(ctx, wavesPath(id), ref),
  ]);
  const currentHash = curMap === null ? null : await hashOf(curMap, curWaves);
  const hash = await hashOf(input.map, input.waves);
  if (currentHash !== input.expectedHash && !input.force) {
    return {
      ok: false,
      reason: "conflict",
      error:
        currentHash === null
          ? "the map was deleted on GitHub"
          : "the map changed on GitHub since you opened it",
    };
  }
  if (currentHash === hash) {
    return pr
      ? {
          ok: true,
          hash,
          url: pr.html_url,
          number: pr.number,
          message: `No changes since the last save (PR #${pr.number})`,
        }
      : { ok: true, hash, url: null, number: null, message: `No changes from ${cfg.base}` };
  }

  // One commit with both files.
  const parent = branchSha ?? baseSha;
  const parentCommit = await api<{ tree: { sha: string } }>(ctx, "GET", `/git/commits/${parent}`);
  if (!parentCommit) throw new Error(`commit ${parent} not found`);
  const tree = await api<{ sha: string }>(ctx, "POST", "/git/trees", {
    body: {
      base_tree: parentCommit.tree.sha,
      tree: [
        { path: mapPath(id), mode: "100644", type: "blob", content: input.map },
        { path: wavesPath(id), mode: "100644", type: "blob", content: input.waves },
      ],
    },
  });
  const title = `${input.cleared ? "Map" : "Draft map"}: ${input.name} (${id})`;
  const commit = await api<{ sha: string }>(ctx, "POST", "/git/commits", {
    body: {
      message: `${title}\n\n${input.summary ?? ""}\n\nSaved from the hosted map editor.`.trim(),
      tree: tree!.sha,
      parents: [parent],
    },
  });
  const sha = commit!.sha;
  if (branchSha)
    await api(ctx, "PATCH", `/git/refs/heads/${branch}`, { body: { sha, force: false } });
  else {
    const created = await api(ctx, "POST", "/git/refs", {
      body: { ref: `refs/heads/${branch}`, sha },
      allow422: true,
    });
    if (created === null)
      await api(ctx, "PATCH", `/git/refs/heads/${branch}`, { body: { sha, force: true } }); // stale branch
  }

  const pull =
    pr ??
    (await api<PullRequest>(ctx, "POST", "/pulls", {
      body: {
        title,
        head: branch,
        base: cfg.base,
        body: [
          "Saved from the hosted map editor.",
          "",
          `- Files: \`${mapPath(id)}\`, \`${wavesPath(id)}\``,
          `- Clear check: ${input.cleared ? "✓ passed" : "✗ fails (draft)"}${input.summary ? `: ${input.summary}` : ""}`,
          "",
          "CI runs `npm test` (schemas, validation and the clear check) on this pull request. Merge it to publish the map; Lovable syncs the base branch.",
        ].join("\n"),
      },
    }))!;
  return {
    ok: true,
    hash,
    url: pull.html_url,
    number: pull.number,
    message: `Saved to GitHub: pull request #${pull.number}`,
  };
}
