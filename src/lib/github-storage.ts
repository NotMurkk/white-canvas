// The editor's MapStorage when the server can save to GitHub: maps are listed and loaded from the
// repo (an open pull request's version first) and every Save becomes a commit on a pull request.
// Themes, content and atlases still come from the build: the editor never changes them.
import { SaveConflictError, defaultStorage, type MapStorage } from "@tdmm/map-editor/storage";
import { getMapStorageInfo, listRepoMaps, loadRepoMap, saveRepoMap } from "./maps.functions";

const KEY_STORAGE = "tdmm:editor-key";

function storedKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

function rememberKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // the key just won't be remembered
  }
}

export function githubStorage(repo: string, base: string): MapStorage {
  return {
    label: `pull requests on GitHub (${repo}, into ${base})`,
    listMaps: () => listRepoMaps(),
    listThemes: () => defaultStorage.listThemes(), // themes ship with the build (dev: the dev server)
    loadMapFiles: (id) => loadRepoMap({ data: { id } }),
    async saveMapFiles(req) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const key =
          storedKey() ??
          window
            .prompt(
              attempt
                ? "That key didn't match. Editor key:"
                : "Editor key (the EDITOR_KEY secret set in Lovable):",
            )
            ?.trim();
        if (!key) throw new Error("Saving to GitHub needs the editor key.");
        const res = await saveRepoMap({ data: { ...req, key, summary: req.summary ?? null } });
        if (res.ok) {
          rememberKey(key);
          return { hash: res.hash, message: res.message, url: res.url ?? undefined };
        }
        if (res.reason === "conflict") throw new SaveConflictError(res.error);
        rememberKey(null); // bad key: forget it and ask again
      }
      throw new Error("The editor key didn't match the EDITOR_KEY secret.");
    },
  };
}

/**
 * GitHub saving when the server is set up for it, except on localhost, where the dev server's
 * maps/ is the natural place (add ?storage=github to try GitHub locally). Undefined means the
 * editor's default: local files in dev, read-only maps and downloads in a published build.
 */
export async function pickMapStorage(): Promise<MapStorage | undefined> {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (local && new URLSearchParams(location.search).get("storage") !== "github") return undefined;
  try {
    const info = await getMapStorageInfo();
    return info.github ? githubStorage(info.repo, info.base) : undefined;
  } catch {
    return undefined;
  }
}
