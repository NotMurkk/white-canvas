# TD Map Maker

A Mario Maker-style map editor for a 2D top-down tower defense game built with Phaser. Maps are saved as readable, versioned JSON in `maps/`, and the game loads them directly.

The design and the reasons behind it are in [reports/Tower defense map editor design.md](reports/Tower%20defense%20map%20editor%20design.md). The research notes it draws on are in `research_notes/`.

## Run it

```sh
npm install
npm run dev:editor   # editor at http://localhost:5173/?map=<id>
npm run dev:game     # reference game at http://localhost:5174/?map=/maps/<id>.map.json&theme=winter
npm test             # unit tests + the committed-maps gate
npm run typecheck
npm run art          # regenerate placeholder art, rebuild theme atlases, regenerate credits
npm run packs:objects -- <pack> <asset> --out preview.png   # list the objects on a sheet, to name stamp regions
npm run packs:import # turn downloads/ into packs (see asset-catalog/starter-packs.md)
npm run clearcheck   # re-run the clear check on every map (after content/ or sim changes); --check for CI
```

## Using the editor

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click to inspect an object, marker, junction or flight path. Drag objects (they only move where they fit) and flight-path handles. Delete removes. |
| Enemy path | R | Drag in the direction enemies walk. Drag from an existing path cell to branch. Right-drag erases. Refuses water and objects. |
| Spawn | S | Click a path cell at the map edge. Pick Ground or Air in the palette. Right-click removes. |
| Exit | E | Click the last cell of a path. Right-click removes. |
| Flight path | Q | Click an air spawn, click waypoints, click an exit. Drag handles to adjust; right-click a handle to delete it. |
| Terrain | T | Pencil, Rectangle or Fill. Right-click (or Alt+click) picks the terrain under the cursor. |
| Objects | O | Trees, rocks, buildings. The ghost is green where it fits and red with a reason where it doesn't. Right-click removes. |
| Zones | Z | No-build cells, or range zones such as high ground (+25%) and fog (−20%) from `content/zones.json`. |
| Eraser | X | Removes the top-most thing: object, then marker, then path, then zone. |

Other shortcuts:
- 1–9 picks a palette item.
- G toggles the grid, A the path arrows, B the "where towers fit" overlay.
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

**Errors and failed clear checks** never stop you saving work in progress. But the game refuses a map with errors, and `npm test` fails if any committed map has an error or lacks a clear-check stamp that matches its current gameplay. Renames and art changes don't affect the stamp. So an unplayable or un-checked map can't be merged.

## Layout

```
apps/game             reference Phaser 4 game: GameScene loads a map + waves from a URL or from memory, plays rounds
apps/map-editor       React shell + the same Phaser runtime; tools run on DOM pointer events
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
tools/                art generation, atlas build, pack importer, credits, dev-server plugins
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
- **Next, Phase 4 (Mario Maker feel).**
  - Forgiveness snapping, a test-tower stamp with a coverage heatmap.
  - Marquee copy and paste, palette search and pinning.
  - Last-run enemy trails in playtest.
- **Real art (Batch A done).**
  - Ekat's Gen 3 tilesets, IgnathiusNZX's river water and CinnaYva's snow tileset are imported and used first in both themes.
  - Kinds now match the art: the house is 5×5.
  - Next: the DeviantArt batches (need a logged-in browser), Anon Alpaca's trees (MEGA) and lolalime's water (Eevee Expo login).
