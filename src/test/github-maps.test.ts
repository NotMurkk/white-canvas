import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMap, parseWaves, printMap, printWaves } from "@tdmm/map-format";
import { hashOf } from "@tdmm/map-editor/storage";
import {
  configFromEnv,
  listMaps,
  loadMap,
  saveMap,
  type Ctx,
  type SaveInput,
} from "@/lib/github-maps.server";

type Files = Record<string, string>;
interface Pull {
  number: number;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  title: string;
  state: "open" | "closed";
}

/** Just enough of GitHub's REST API (git data, contents, pulls) for the map storage, in memory. */
class FakeGitHub {
  readonly trees = new Map<string, Files>();
  readonly commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  readonly refs = new Map<string, string>();
  readonly pulls: Pull[] = [];
  private n = 0;

  constructor(files: Files) {
    this.refs.set("main", this.commit(this.tree(files), [], "init"));
  }

  tree(files: Files) {
    const sha = `t${++this.n}`;
    this.trees.set(sha, files);
    return sha;
  }

  commit(tree: string, parents: string[], message: string) {
    const sha = `c${++this.n}`;
    this.commits.set(sha, { tree, parents, message });
    return sha;
  }

  files(ref: string): Files {
    return this.trees.get(this.commits.get(this.refs.get(ref) ?? ref)!.tree)!;
  }

  private descends(sha: string, from: string): boolean {
    if (sha === from) return true;
    return (this.commits.get(sha)?.parents ?? []).some((p) => this.descends(p, from));
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/repos/me/maps", "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const s = (k: string) => body[k] as string;
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    const notFound = json(404, { message: "Not Found" });
    let m: RegExpExecArray | null;
    if (method === "GET" && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      const sha = this.refs.get(m[1]!);
      return sha ? json(200, { object: { sha } }) : notFound;
    }
    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(path))) {
      const ref = url.searchParams.get("ref")!;
      if (!this.refs.has(ref)) return notFound;
      const files = this.files(ref);
      const p = decodeURIComponent(m[1]!);
      if (p in files) return new Response(files[p], { status: 200 });
      const dir = Object.keys(files)
        .filter((f) => f.startsWith(`${p}/`))
        .map((f) => ({ name: f.slice(p.length + 1), type: "file" }));
      return dir.length ? json(200, dir) : notFound;
    }
    if (method === "GET" && (m = /^\/git\/commits\/(.+)$/.exec(path))) {
      const c = this.commits.get(m[1]!);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree } }) : notFound;
    }
    if (method === "POST" && path === "/git/trees") {
      const files = { ...this.trees.get(s("base_tree"))! };
      for (const t of body["tree"] as { path: string; content: string }[])
        files[t.path] = t.content;
      return json(201, { sha: this.tree(files) });
    }
    if (method === "POST" && path === "/git/commits") {
      return json(201, { sha: this.commit(s("tree"), body["parents"] as string[], s("message")) });
    }
    if (method === "POST" && path === "/git/refs") {
      const branch = s("ref").replace("refs/heads/", "");
      if (this.refs.has(branch)) return json(422, { message: "Reference already exists" });
      this.refs.set(branch, s("sha"));
      return json(201, {});
    }
    if (method === "PATCH" && (m = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
      if (!body["force"] && !this.descends(s("sha"), this.refs.get(m[1]!)!)) {
        return json(422, { message: "Update is not a fast forward" });
      }
      this.refs.set(m[1]!, s("sha"));
      return json(200, {});
    }
    if (method === "GET" && path === "/pulls") {
      const head = url.searchParams.get("head");
      const base = url.searchParams.get("base");
      return json(
        200,
        this.pulls.filter(
          (p) =>
            p.state === "open" &&
            (!base || p.base.ref === base) &&
            (!head || `me:${p.head.ref}` === head),
        ),
      );
    }
    if (method === "POST" && path === "/pulls") {
      const number = this.pulls.length + 1;
      const pull: Pull = {
        number,
        html_url: `https://github.com/me/maps/pull/${number}`,
        head: { ref: s("head") },
        base: { ref: s("base") },
        title: s("title"),
        state: "open",
      };
      this.pulls.push(pull);
      return json(201, pull);
    }
    return json(500, { message: `fake GitHub: unhandled ${method} ${path}` });
  };
}

// tests run from the repo root
const repoFile = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MEADOW_MAP = repoFile("maps/phase0-meadow.map.json");
const MEADOW_WAVES = repoFile("maps/phase0-meadow.waves.json");

/** The meadow map re-saved under another id and name, canonically printed. */
function variant(id: string, name: string) {
  const map = parseMap(MEADOW_MAP);
  const waves = parseWaves(MEADOW_WAVES);
  return { map: printMap({ ...map, id, name }), waves: printWaves({ ...waves, mapId: id }) };
}

function setup(editorKey: string | null = "sesame") {
  const gh = new FakeGitHub({
    "maps/phase0-meadow.map.json": MEADOW_MAP,
    "maps/phase0-meadow.waves.json": MEADOW_WAVES,
    "README.md": "# repo",
  });
  const ctx: Ctx = {
    cfg: { token: "t", owner: "me", repo: "maps", base: "main", editorKey: editorKey ?? undefined },
    fetch: gh.fetch,
  };
  return { gh, ctx };
}

const save = (over: Partial<SaveInput> & Pick<SaveInput, "id" | "map" | "waves">): SaveInput => ({
  key: "sesame",
  expectedHash: null,
  force: false,
  name: "New map",
  cleared: true,
  summary: "2 rounds",
  ...over,
});

describe("GitHub map storage", () => {
  it("reads its settings from the environment", () => {
    expect(configFromEnv({})).toBeNull();
    expect(configFromEnv({ GITHUB_TOKEN: " x " })).toEqual({
      token: "x",
      owner: "NotMurkk",
      repo: "white-canvas",
      base: "main",
      editorKey: undefined,
    });
    expect(configFromEnv({ GITHUB_TOKEN: "x", GITHUB_REPO: "a/b", EDITOR_KEY: "k" })).toMatchObject(
      {
        owner: "a",
        repo: "b",
        editorKey: "k",
      },
    );
  });

  it("saves a new map as one commit on its own branch and opens a pull request", async () => {
    const { gh, ctx } = setup();
    const v = variant("new-map", "New map");
    const res = await saveMap(ctx, save({ id: "new-map", ...v }));
    expect(res).toMatchObject({ ok: true, number: 1, url: "https://github.com/me/maps/pull/1" });
    const head = gh.refs.get("editor/new-map")!;
    expect(gh.commits.get(head)!.parents).toEqual([gh.refs.get("main")]);
    expect(gh.commits.get(head)!.message).toMatch(/^Map: New map \(new-map\)/);
    expect(gh.files("editor/new-map")["maps/new-map.map.json"]).toBe(v.map);
    expect(gh.files("editor/new-map")["maps/new-map.waves.json"]).toBe(v.waves);
    expect(gh.files("main")["maps/new-map.map.json"]).toBeUndefined(); // main only changes on merge
    expect(gh.pulls[0]).toMatchObject({ title: "Map: New map (new-map)", base: { ref: "main" } });

    // The next save adds a commit to the same pull request.
    const again = variant("new-map", "New map 2");
    const res2 = await saveMap(
      ctx,
      save({ id: "new-map", ...again, expectedHash: res.ok ? res.hash : null }),
    );
    expect(res2).toMatchObject({ ok: true, number: 1 });
    expect(gh.pulls).toHaveLength(1);
    expect(gh.commits.get(gh.refs.get("editor/new-map")!)!.parents).toEqual([head]);
  });

  it("lists and loads a map's open pull request version first", async () => {
    const { ctx } = setup();
    const v = variant("new-map", "New map");
    await saveMap(ctx, save({ id: "new-map", ...v }));
    expect((await listMaps(ctx)).map((m) => [m.id, m.name, m.note])).toEqual([
      ["new-map", "New map", "unmerged changes (PR #1)"],
      ["phase0-meadow", "Phase 0 Meadow", undefined],
    ]);
    const loaded = await loadMap(ctx, "new-map");
    expect(loaded.map).toBe(v.map);
    expect(loaded.hash).toBe(await hashOf(v.map, v.waves));
    await expect(loadMap(ctx, "missing")).rejects.toThrow(/no map "missing"/);
  });

  it("refuses to overwrite a version it didn't start from, unless forced", async () => {
    const { ctx } = setup();
    const edited = variant("phase0-meadow", "Meadow edited");
    const stale = await saveMap(
      ctx,
      save({ id: "phase0-meadow", ...edited, expectedHash: "0000000000000000" }),
    );
    expect(stale).toEqual({
      ok: false,
      reason: "conflict",
      error: "the map changed on GitHub since you opened it",
    });
    const fresh = await saveMap(
      ctx,
      save({
        id: "phase0-meadow",
        ...edited,
        expectedHash: await hashOf(MEADOW_MAP, MEADOW_WAVES),
      }),
    );
    expect(fresh.ok).toBe(true);
    const forced = await saveMap(
      ctx,
      save({
        id: "phase0-meadow",
        ...variant("phase0-meadow", "Forced"),
        expectedHash: "0000000000000000",
        force: true,
      }),
    );
    expect(forced).toMatchObject({ ok: true, number: 1 });
  });

  it("checks the editor key and the files before touching GitHub", async () => {
    const v = variant("new-map", "New map");
    const { gh, ctx } = setup();
    expect(await saveMap(ctx, save({ id: "new-map", ...v, key: "wrong" }))).toEqual({
      ok: false,
      reason: "bad-key",
    });
    await expect(saveMap(setup(null).ctx, save({ id: "new-map", ...v }))).rejects.toThrow(
      /EDITOR_KEY/,
    );
    await expect(saveMap(ctx, save({ id: "new-map", ...v, map: `${v.map} ` }))).rejects.toThrow(
      /canonically printed/,
    );
    await expect(saveMap(ctx, save({ id: "other", ...v }))).rejects.toThrow(/does not match/);
    expect(gh.refs.size).toBe(1);
  });

  it("starts fresh from main when the map's last pull request was closed", async () => {
    const { gh, ctx } = setup();
    const first = await saveMap(ctx, save({ id: "new-map", ...variant("new-map", "First") }));
    gh.pulls[0]!.state = "closed"; // merged or abandoned; the branch is left behind
    const second = await saveMap(ctx, save({ id: "new-map", ...variant("new-map", "Second") }));
    expect(first.ok && second.ok).toBe(true);
    expect(second).toMatchObject({ number: 2 });
    expect(gh.commits.get(gh.refs.get("editor/new-map")!)!.parents).toEqual([gh.refs.get("main")]);
  });

  it("doesn't commit when nothing changed", async () => {
    const { gh, ctx } = setup();
    const res = await saveMap(
      ctx,
      save({
        id: "phase0-meadow",
        map: MEADOW_MAP,
        waves: MEADOW_WAVES,
        expectedHash: await hashOf(MEADOW_MAP, MEADOW_WAVES),
      }),
    );
    expect(res).toMatchObject({ ok: true, url: null, message: "No changes from main" });
    expect(gh.pulls).toHaveLength(0);
  });
});
