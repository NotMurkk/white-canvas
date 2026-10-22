# TD Map Maker

A Mario Maker-style map editor for a 2D top-down tower defense game built with Phaser. Maps are saved as readable, versioned JSON in `maps/`, and the game loads them directly.

The design and the reasons behind it are in [reports/Tower defense map editor design.md](reports/Tower%20defense%20map%20editor%20design.md). The research notes it draws on are in `research_notes/`.

This repo is a [Lovable](https://lovable.dev/projects/eb61fcae-2889-4f68-a07b-b8d401d798df) project (TanStack Start). Pushes to `main` sync into Lovable, and Lovable's edits are committed back here. Don't force-push or rewrite pushed history (see `AGENTS.md`).

## Run it

```sh
npm install          # or: bun install (Lovable uses bun; bun.lock is the lockfile)
npm run dev          # editor at http://localhost:<port>/?map=<id>, reference game at /play?map=/maps/<id>.map.json&theme=winter
npm test             # unit tests + the committed-maps gate
npm run typecheck    # Lovable's tsconfig.json (src/) and tsconfig.tdmm.json (editor, packages, tools)
npm run build        # production build (Cloudflare Workers via nitro), as Lovable publishes it
npm run art          # regenerate placeholder art, rebuild theme atlases, regenerate credits
npm run packs:objects -- <pack> <asset> --out preview.png   # list the objects on a sheet, to name stamp regions
npm run packs:import # turn downloads/ into packs (see asset-catalog/starter-packs.md)
npm run clearcheck   # re-run the clear check on every map (after content/ or sim changes); --check for CI
```

## Using the editor

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click to inspect an object, marker, junction or flight path. Drag objects (they only move where they fit) and flight-path handles. Delete removes. Drag on empty ground, or Shift+drag anywhere, to box-select for copy and paste. |
| Enemy path | R | Drag in the direction enemies walk. Drag from an existing path cell to branch. Right-drag erases. Refuses water and objects. |
| Spawn | S | Click a path cell at the map edge; a click next to the path snaps onto it. Pick Ground or Air in the palette. Right-click removes. |
| Exit | E | Click the last cell of a path; a click next to it snaps onto it. Right-click removes. |
| Flight path | Q | Click an air spawn, click waypoints, click an exit. Drag handles to adjust; right-click a handle to delete it. |
| Terrain | T | Pencil, Rectangle or Fill. Right-click (or Alt+click) picks the terrain under the cursor. |
| Objects | O | Trees, rocks, buildings. The ghost is green where it fits and red with a reason where it doesn't. A drop that doesn't fit snaps to a spot one cell away that does; hold Shift for exact. Right-click removes. |
| Zones | Z | No-build cells, or range zones such as high ground (+25%) and fog (−20%) from `content/zones.json`. |
| Eraser | X | Removes the top-most thing: object, then marker, then path, then zone. |
| Test tower | C | Drops probe towers that show their range and how much path they reach. They're never saved. Click again or right-click to remove. |

Other shortcuts:
- 1–9 picks a palette item, in the order the palette shows (pinned first). `/` jumps to the palette search.
- G toggles the grid, A the path arrows, B the "where towers fit" overlay, H the coverage heatmap, L the last-run trails.
- Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste a box selection; Delete clears it; Ctrl+A selects the whole map.
- F fits the view, the wheel zooms, Space-drag or middle-drag pans.
- Ctrl+Z / Ctrl+Y undo and redo; a whole stroke is one step.
- Ctrl+S saves.
- P playtests the unsaved map (with its waves) in the game's real scene; Esc comes back.
- M mutes the sounds.

The **Inspect** tab edits what you selected:
- **Junctions:** pick how enemies split (alternate, weighted or seeded random), with per-branch weights and the rounds each branch is open (`all`, `odd`, `even`, `3`, `2-5`, `10+`). It also shows how many enemies took each branch in the simulation.
- **Objects:** make one removable in-game for cash, with a cost and other obstacles that must be cleared first.
- **Flight paths:** smooth or straight.

The **Check** tab starts with the **clear check**: every round is simulated with no towers, and every enemy must spawn and reach an exit. Saving stamps a passing result, with a hash of all gameplay data, into the waves file. The top bar shows **✓ Cleared** or **Draft**. Below the clear check, the Check tab lists every problem, such as dead ends, loops, an exit in the middle of the path, objects blocking the path, water under the path, or a wave pointing at a route that no longer exists. Click a problem to jump to it. The **Waves** tab edits rounds and groups (enemy, count, start, interval, spawn, and route or "Alternate").

**Mario Maker feel.**
- **Forgiveness snapping.** If an object, spawn, exit or test tower doesn't fit under the pointer but fits one cell away, the ghost jumps there with a dashed line back to the pointer, and the status bar says why. Shift places exactly. Fast path strokes fill skipped cells with elbows, so a path never has gaps.
- **Test towers and the coverage heatmap.** The heatmap (H) colours every cell a tower can stand on by how much path a tower there would reach. Brighter is more, and the best cells get a white ring. The value is tiles of path in range for one enemy: each route counts by the share of enemies the clear check sends down it, and high ground and fog change the range. Test towers (C) show the same number for chosen spots. Set the range in the palette.
- **Copy and paste.** Drag a box with the Select tool and choose which layers it takes: terrain, path, objects, zones. Objects come along when the cell they stand on is inside the box. Path links that leave the box are dropped. Paste (Ctrl+V) shows a ghost that follows the pointer, green where it fits and red with a reason where it doesn't (path over water, a tree on the path, overlaps). Each click pastes once and is one undo step. Pasting adds on top: terrain is replaced, but existing path cells keep their style. The clipboard is kept in the browser, so it works across maps and tabs.
- **Palette search and pins.** Long lists get a search box (`/`). The star pins an item to the top, and recent picks show as chips. Pins and recents are remembered.
- **Last-run trails.** After a playtest, the map shows how far enemies got down each route (orange for ground, blue for air, thicker for more enemies), where the ones still walking were when you stopped, and a red count at every exit that leaked. They stay until your next edit.

**Seasonal themes.**
- The theme picker in the top bar previews the map in any theme. Only the art changes: the document, the undo history and the gameplay fingerprint stay the same.
- The Themes section of the Check tab picks which themes ship with the map and which is the default. It also lists any art a theme lacks for this map.
- Shipping a theme is a metadata change, so the clear-check stamp stays valid.

A theme (`themes/<id>.theme.json`) can `inherit` another theme and override only what changes; `winter` inherits `summer`. Any asset reference can be a fallback list, tried in order when atlases are built:

```json
"water": { "autotile": ["ee-621-32px/snow_2", "placeholder-winter/water"] }
```

The first entry that's available wins. The themes put the real Pokémon fan tilesets first (Ekat, IgnathiusNZX and CinnaYva packs from Eevee Expo; the full list is in `asset-catalog/starter-packs.md`) and the generated placeholders last. Each theme builds its own atlas (`assets/atlases/<id>.png`), which records the fully resolved theme and a hash of its inputs. A test fails if a committed atlas is stale or a theme lacks art for something a map uses.

**Downloaded packs aren't committed.** They live in the git-ignored `assets/raw/`. The committed atlases and `credits.json` already contain the art, so the editor and game work on any clone. To rebuild atlases, you need the downloads: put the zips in `downloads/` and run `npm run packs:import`. Without them, the atlas freshness and credits checks are skipped with a note rather than failing.

**Saving.**
- Saving writes `maps/<id>.map.json` and `maps/<id>.waves.json` through the editor's dev server.
- The server re-validates the files and refuses one that changed on disk since you opened it (it offers to overwrite).
- It writes atomically and keeps the previous version in `.tdmm-backup/`.
- Unsaved work is autosaved to the browser every couple of seconds and offered back after a crash or reload, including maps that were never saved.
- **The hosted editor saves to GitHub through pull requests** (once set up, below). Each map you save gets a branch, `editor/<map-id>`, and a pull request into `main`; every Save is one commit with the map and waves files together. The **Pull request ↗** button next to Save opens it. CI (`.github/workflows/check.yml`) runs `npm test` on the pull request, which includes the clear check, so a map only reaches `main` (and Lovable) once it passes. The editor lists and opens a map's open-PR version first, so you keep working on your latest save. Someone else's newer save is a conflict, which you can overwrite or reload.
- Without that setup, the published editor opens the maps that were in the repo when it was built, and Save downloads `<id>.map.json` and `<id>.waves.json` for you to commit. On `localhost` it always saves to `maps/` on disk; add `?storage=github` to the URL to try GitHub saving locally.

**Setting up hosted saving (once):**
1. On GitHub, create a fine-grained personal access token (Settings → Developer settings → Personal access tokens → Fine-grained tokens). Under *Repository access*, choose *Only select repositories* → `white-canvas`. Under *Permissions*, set *Contents* and *Pull requests* to *Read and write*.
2. In Lovable, open **More → Settings → Secrets** and add:
   - `GITHUB_TOKEN`: the token.
   - `EDITOR_KEY`: any long passphrase. Editors type it the first time they save, and the browser remembers it.
   - Optional: `GITHUB_REPO` (default `NotMurkk/white-canvas`) and `GITHUB_BASE_BRANCH` (default `main`).
3. Publish (or update) the app in Lovable. The first Save asks for the editor key.
4. Optional: in the repo's branch protection settings, require the **Check / test** status before merging. GitHub only enforces this on private repos with a paid plan. Without it, CI still marks a failing pull request red.

The token lives only on the server (`src/lib/maps.functions.ts`, `src/lib/github-maps.server.ts`); the browser never sees it.

**Errors and failed clear checks** never stop you saving work in progress. But the game refuses a map with errors, and `npm test` fails if any committed map has an error or lacks a clear-check stamp that matches its current gameplay. Renames and art changes don't affect the stamp. So an unplayable or un-checked map can't be merged.

## Layout

```
src/                  the Lovable app (TanStack Start): / mounts the editor, /play the reference game, both browser-only
apps/game             reference Phaser 4 game: GameScene loads a map + waves from a URL or from memory, plays rounds
apps/map-editor       the editor: React shell + the same Phaser runtime; tools run on DOM pointer events
packages/autotile     Essentials' RMXP autotile tables, neighbour resolver, autotile expander (no Phaser)
packages/map-format   Zod schemas (map, waves, themes, packs, atlases, content), grid encodings, migrations, printers
packages/pathing      directed path cells: stroke editing, route compiler, validation, route geometry
packages/rules        map state, stamp placement, buildable cells, range multipliers, whole-map validation
packages/sim          deterministic wave simulation, branch policies, balance stats, gameplay hash, clear check
packages/map-runtime  logical map + theme + atlas -> Tiled-shaped JSON in memory -> Phaser layers, stamps, markers
content/              terrain-types.json, kinds.json (stamps), enemies.json, zones.json: shared gameplay meaning
themes/               *.theme.json: visual mapping only; winter inherits summer
maps/                 *.map.json + *.waves.json: committed maps
assets/packs/         redistributable packs with provenance (the generated placeholder fallbacks)
assets/raw/           git-ignored raw downloads turned into packs by the importer (the real tilesets)
assets/atlases/       generated per-theme atlases (with their resolved theme) + credits.json
asset-catalog/        the 711-link tileset catalog and the starter download checklist
tools/                art generation, atlas build, pack importer, credits, Vite plugins (data files, dev save endpoints)
```

**The one rule:** maps store gameplay meaning, such as the terrain kind per cell, path directions and object kinds. The art is always derived from that through autotiling and the theme. That keeps undo simple, lets neighbours reshape automatically, and means a winter theme can never change gameplay.

## Status

- **Phase 0 (done).**
  - In-memory Tiled pipeline on Phaser 4.2.1.
  - RMXP autotile expansion with animated water.
  - Shared runtime for game and editor.
- **Phase 1 (done).**
  - Directed path painting with live validation.
  - Ground and air spawns, exits, and branches with route ids.
  - Computed buildable overlay.
  - Y-sorted stamps with footprint rules.
  - Waves form.
  - Save/open/new with conflict detection and autosave.
  - Playtest with enemies following the compiled routes.
  - Pack importer and generated credits.
- **Phase 2 (done).**
  - Branch policies: alternate, weighted, seeded random, and per-round branch gating.
  - Drawn flight paths with optional smoothing.
  - Removable obstacles with costs and prerequisites, playable in-game.
  - Range zones and terrain range multipliers.
  - Wave timeline and balance charts.
  - Shared deterministic simulation, used by the game, the editor's clear check and the CI gate.
  - Map schema v2, with a tested v1 migration (`fixtures/maps/v1`).
- **Phase 3 (done).**
  - Winter theme with inheritance and fallback lists.
  - Placeholder winter pack, with stamps winterized from the summer ones so footprints match exactly.
  - One atlas per theme, recording the resolved theme and a hash of its inputs.
  - Theme switcher and per-theme coverage in the editor.
  - The gameplay fingerprint, shown in the editor, never changes with the theme.
- **Phase 4 (done).**
  - Forgiveness snapping for objects, markers, test towers and object drags.
  - Test-tower stamp and a coverage heatmap weighted by route share (`packages/rules/src/coverage.ts`).
  - Box-select copy, cut, paste and delete with a layer filter, a validated paste ghost and a clipboard shared across tabs.
  - Palette search, pins and recents; 1–9 follow the order shown.
  - Last-run trails and leak markers from playtests.
- **Hosting (done).** The editor runs inside the Lovable app: `/` is the editor, `/play` the reference game, and production builds include the data files. The hosted editor saves maps as pull requests that CI checks.
- **Next.**
  - Sign-in with GitHub instead of a shared editor key, so saves are attributed to each editor.
  - Budget meter and micro-animations, the rest of the report's Phase 4 list.
  - A greedy coverage bot for the clear check, so "beatable" means more than "every enemy can walk to an exit".
- **Real art (Batch A done).**
  - Ekat's Gen 3 tilesets, IgnathiusNZX's river water and CinnaYva's snow tileset are imported and used first in both themes.
  - Kinds now match the art: the house is 5×5.
  - Next: the DeviantArt batches (need a logged-in browser), Anon Alpaca's trees (MEGA) and lolalime's water (Eevee Expo login).
