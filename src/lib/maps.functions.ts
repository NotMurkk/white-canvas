// Server functions behind the hosted editor's GitHub saving (see github-maps.server.ts). The
// browser calls these; the token and editor key never leave the server.
//
// Secrets (Lovable: More → Settings → Secrets):
//   GITHUB_TOKEN        fine-grained token for this repo: Contents + Pull requests read & write
//   EDITOR_KEY          shared key editors type once to be allowed to save
//   GITHUB_REPO         optional, "owner/repo" (default NotMurkk/white-canvas)
//   GITHUB_BASE_BRANCH  optional, default "main"
import { createServerFn } from "@tanstack/react-start";
import {
  configFromEnv,
  listMaps,
  loadMap,
  parseSaveInput,
  saveMap,
  type Ctx,
} from "./github-maps.server";

// Read per request: on Cloudflare Workers the environment only exists while a request runs.
function env(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  );
}

function ctx(): Ctx {
  const cfg = configFromEnv(env());
  if (!cfg)
    throw new Error(
      "GitHub saving isn't set up: add a GITHUB_TOKEN secret (Lovable: More → Settings → Secrets).",
    );
  return { cfg, fetch: (input, init) => fetch(input, init) };
}

/** Whether this server can save to GitHub, and where. */
export const getMapStorageInfo = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = configFromEnv(env());
  return cfg
    ? {
        github: true as const,
        repo: `${cfg.owner}/${cfg.repo}`,
        base: cfg.base,
        keySet: !!cfg.editorKey,
      }
    : { github: false as const };
});

export const listRepoMaps = createServerFn({ method: "GET" }).handler(async () => listMaps(ctx()));

export const loadRepoMap = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (typeof d?.id !== "string") throw new Error("bad request: id");
    return { id: d.id };
  })
  .handler(async ({ data }) => loadMap(ctx(), data.id));

export const saveRepoMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => parseSaveInput(d))
  .handler(async ({ data }) => saveMap(ctx(), data));
