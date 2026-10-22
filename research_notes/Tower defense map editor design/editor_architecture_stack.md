# Editor Architecture and Web Tech Stack for a Phaser-Consumed 2D Tile Map Editor (as of Oct 2026)

Scope: an internal, browser-based map maker for a Pokémon-Tower-Defense-style Phaser game. Output is versioned JSON committed to the game's git repo. Target UX is Super Mario Maker level: instant feedback, undo, instant playtest. Content includes RPG Maker XP / Essentials 32px tilesets with autotiles and animated tiles, multi-tile objects, a painted multi-route path with flying routes, per-cell terrain rules, waves, and seasonal themes.

Convention: "Cited Findings" are sourced facts. "Inferences" are my recommendations and reasoning built on them. Local skill files the user provided are cited by path.

---

## 1. Rendering/UI stack: Phaser vs PixiJS vs plain Canvas, WYSIWYG parity, in-editor playtest, and how real editors are built

### Takeaway
Use Phaser 4.2.x (pinned to the exact version the game uses) as the editor viewport, inside a React (or Svelte) DOM shell. It is the only option that gives true WYSIWYG parity: the same tilemap renderer and the same Tiled-style tile animation code. It also makes instant playtest a matter of starting the game's real scene with the in-memory map. Phaser 4 now animates Tiled tile animations natively, which Phaser 3 never did. That is a strong reason to have both the game and the editor on v4.

### Cited Findings
**Phaser versions and status**
- Phaser releases on GitHub, newest first: v4.2.1 (9 Jul 2026), v4.2.0 (19 Jun 2026), v4.1.0 (30 Apr 2026), v4.0.0 (10 Apr). The last 3.x release is v3.90.0 (23 May 2025). Several v4 RCs came out between 2024 and Mar 2026 (RC7 on 25 Mar). — [Phaser GitHub releases](https://github.com/phaserjs/phaser/releases)
- v4.0.0 is codenamed "Caladan" and v4.2.1 "Giedi". GameDev.net describes v4.2.1 as a bug-fix patch covering stencil rendering and ESM build problems. — [phaser.io stable download](https://phaser.io/download/stable); [GameDev.net: Phaser v4.2.1 released](https://gamedev.net/news/4825-phaser-v421-released/)
- v4.0.0 points to a v3→v4 migration guide. One breaking change: the Tint system was overhauled, so `tintFill`/`setTintFill()` were removed and replaced by `setTint(color).setTintMode(Phaser.TintModes.FILL)`. — [Phaser GitHub releases](https://github.com/phaserjs/phaser/releases)
- The Phaser npm package ships agent "skill" docs, e.g. `phaser@4.2.1/skills/tilemaps/SKILL.md`. — [unpkg phaser@4.2.1 tilemaps SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md)

**Phaser 4 tilemap rendering facts relevant to an editor**
- Tile animations defined in Tiled's tileset editor are parsed automatically. Both `TilemapLayer` and `TilemapGPULayer` play them. `TilemapLayerBase` tracks time with an `ElapseTimer` in `preUpdate`. — [Phaser 4.2.1 tilemaps SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md); [Phaser Beam Technical Preview 4](https://phaser.io/news/2024/09/phaser-beam-technical-preview-4)
- Phaser 3: I found only community plugins for Tiled animated tiles, such as `phaser-animated-tiles` (2018) and `phaser-tilemap-plus`, and no evidence of native support. One older hand-rolled approach used a fixed interval for all frames and ignored Tiled's per-frame durations. — [Phaser 3 animated tiles plugin (2018)](https://phaser.io/news/2018/03/phaser-3-animated-tiles-plugin); [phaser-tilemap-plus (npm)](https://npmjs.com/package/phaser-tilemap-plus)
- `TilemapGPULayer` (created via `createLayer(id, tileset, x, y, gpu=true)`) renders a whole layer as one quad.
  - Limits: WebGL only, orthographic only, one tileset with one image per layer, at most 4096×4096 tiles, and 2^23 unique tile/animation entries.
  - It does not refresh when tile data changes. You must call `layer.generateLayerDataTexture()`.
  - It has no per-tile tint (v4.2.0).
  - — [Phaser 4.2.1 tilemaps SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md); [TilemapGPULayer API (4.0.0-rc.6)](https://docs.phaser.io/api-documentation/4.0.0-rc.6/class/tilemaps-tilemapgpulayer); [Phaser GitHub releases](https://github.com/phaserjs/phaser/releases)
- The GPU layer is described as "5 or 50 times faster" than the CPU layer on desktop, but some mobile devices may be slower than the non-GPU version. — [Phaser Beam TP4](https://phaser.io/news/2024/09/phaser-beam-technical-preview-4)
- CPU layers support multiple tilesets per layer (`map.createLayer('Ground', [tiles1, tiles2])`). Dynamic editing APIs exist: `createBlankLayer`, `putTileAt`, `putTilesAt(2D array)`, `fill`, `removeTileAt`, `replaceByIndex`, and others. — [Phaser 4.2.1 tilemaps SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md)

**PixiJS**
- PixiJS v8.x pairs with `@pixi/tilemap` ("Tilemap Kit") v5.x. — [pixi-tilemap GitHub](https://github.com/pixijs/pixi-tilemap)
- A third-party aggregator lists the tilemap repo's last push as 2025-07-14. This is unverified on GitHub. — [ecosyste.ms OpenCollective listing](https://opencollective.ecosyste.ms/projects/17875)
- `pixi-tiledmap` v2 is a separate Tiled loader rewritten for PixiJS v8. — [pixi-tiledmap README](https://cdn.jsdelivr.net/npm/pixi-tiledmap@2.4.0/README.md)
- PixiJS v8.16.0 added an experimental Canvas renderer. — [PixiJS blog v8.16.0](https://pixijs.com/blog/tags/tagged-text)

**How real web editors are built**
- Phaser Editor v4 dropped the custom renderer of earlier desktop versions. It now runs Phaser in the browser to draw the scene, so the editor view matches game output.
  - Scenes are stored in a `.scene` data file that a compiler turns into readable Phaser code (chosen over a runtime loader for vanilla-Phaser compatibility).
  - The desktop app uses Go, Electron and Node (v4.2 notes).
  - "Preview Scene" opens the game in a browser with a URL start parameter naming the scene.
  - v4 docs are now marked unmaintained in favor of Phaser Editor v5.
  - — [Phaser Editor v4 news](https://phaser.io/news/2025/10/phaser-editor-v4); [Phaser Editor v4 docs (scene editor misc)](https://docs.phaser.io/phaser-editor/v4/scene-editor/misc); [Phaser Editor v4.2.0 release](https://phaser.io/news/2024/08/phaser-editor-v420-released) (all via search summary; I did not read full pages)
- Sprite Fusion, a free web tilemap editor, exports to Phaser as a Tiled-compatible `map.json` plus a packed `spritesheet.png`, loaded with Phaser's native `tilemapTiledJSON()`. — [Phaser News, Aug 2026](https://phaser.io/news/2026/08/sprite-fusion-tilemap-editor-phaser); [Phaser forum post by the author](https://phaser.discourse.group/t/sprite-fusion-map-editor-can-now-export-to-phaser/15555)
- tldraw is layered:
  - `@tldraw/state` is a signals-based reactive core.
  - `@tldraw/store` is a normalized reactive record store on top of it, with JSON-serializable records, snapshots and schema migrations.
  - An `Editor` class wraps the store and exposes methods like `createShapes()`.
  - React components wrapped in `track()` re-render only when the signals they read change. A single shape's prop change re-renders only that shape.
  - A spatial index culls off-screen shapes.
  - — [tldraw Editor docs](https://tldraw.dev/sdk-features/editor); [tldraw data management](https://tldraw.dev/features/composable-primitives/data-management); [tldraw performance](https://tldraw.dev/sdk-features/performance); [@tldraw/state README](https://cdn.jsdelivr.net/npm/@tldraw/state@4.5.9/README.md)
- Figma models a document as "a tree of objects, similar to the HTML DOM". Each object has an ID and a property map (ObjectID → property → value). Sibling order uses fractional indexing. — [Figma: How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- From the user's game-ui-ux skill: drive UI from events, not per-frame polling; model screens as a push/pop stack; mouse and keyboard focus must coexist. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/game-ui-ux/SKILL.md`

### Inferences
**Recommended stack:** Phaser 4.2.x viewport, React UI shell, a small external store (Zustand or a hand-rolled store with subscriptions), Vite build, TypeScript throughout. Svelte is an equally valid shell. The decisive part is that React/Svelte never renders tiles.

**Why Phaser over Pixi or Canvas2D**
- Parity is the decisive requirement. With Phaser in the editor, the same `map-runtime` code that builds a `Tilemap` from a map document runs in both apps, including animated tiles, theme texture swaps, depth sorting of multi-tile objects and Y-sorting (`createFromObjects` gained `sortByY` in RC6).
- Pixi v8 is a fine renderer, but you would write tile animation, autotile drawing and object depth logic twice and keep them in sync. Playtest would still need Phaser.
- Plain Canvas2D/WebGL maximizes control and minimizes parity. It is not worth it for a small team.

**Architecture pattern (tldraw-like)**
- Keep the document in a framework-agnostic store.
- The Phaser "EditorScene" subscribes imperatively and applies minimal diffs with `putTileAt` and object add/remove.
- React panels subscribe to coarse selectors.
- Create the `Phaser.Game` once, outside the React render cycle, in an effect with cleanup. Communicate via store subscriptions or an event bus, never props per frame (event-driven per the game-ui-ux skill).

**Editor rendering choices**
- Use CPU `TilemapLayer`s in the editor, because GPU layers need `generateLayerDataTexture()` after every edit.
- GPU layers are an optional optimization in the game, only for large static single-tileset layers.
- At typical TD map sizes (about 30×20 to 60×40 tiles × 3–5 layers), CPU layers are almost certainly sufficient. Measure before adopting the GPU layer, per the performance skill.
- Draw editor-only overlays (grid, terrain-rule tint, path arrows, spawn/exit markers, validation error badges, brush ghost) as separate Phaser Graphics or overlay layers above the map. That keeps them pixel-aligned with the camera. Never write them into document layers.

**Instant playtest (the Mario Maker "play" toggle)**
1. Serialize the current doc in memory.
2. Validate it with the shared schema.
3. Hand the object to the game's real `GameScene` via `scene.start('Game', { mapDoc, themeId, startWave })`.
4. Stop the editor scene, or run the game in a second canvas/iframe.

Notes on the variants:
- Same-instance switching is fastest. An iframe running the game build gives isolation from editor globals: pass the doc via `postMessage`, at some extra boot cost.
- Phaser Editor's approach (open a browser tab with a start parameter) is simpler but not "instant". Use it only as a fallback.
- Playtest must never mutate the document. Returning to edit restores camera and selection.
- This requires the game to accept a map object, not only a URL key. Build that seam early.

**Version alignment**
- If the game is still on Phaser 3.90, either migrate it to v4 (native Tiled animations, GPU layer) or pin the editor to 3.90 and use a community or hand-written animated-tiles shim.
- Parity matters more than having the newest version.

### Gaps
- I did not find what Sprite Fusion's editor UI or canvas is built with; its "Built with" listing was empty in the captured text.
- I did not research Excalidraw's internal architecture in this pass (no source fetched).
- I did not verify per-frame-duration fidelity of Phaser 4's Tiled animation playback, or whether `ElapseTimer` respects `timeScale`. Test it with an Essentials water autotile.
- I did not verify whether Phaser Editor v5 (current) changed the browser-rendering model described for v4.
- The tldraw version is uncertain: a third-party listing says 5.4.0 ([openapps.pro](https://openapps.pro/packages/tldraw)) while the fetched `@tldraw/state` README is 4.5.9. This is only relevant as an architecture reference.

---

## 2. State management, undo/redo, selection/copy-paste, and data structures for big grids (incl. performance)

### Takeaway
Use a normalized document with one typed array per grid layer. Represent every user gesture as a transaction that records sparse cell diffs (and object property diffs), committed as one history entry on pointer-up. Store autotile terrain "intent", not resolved autotile shapes. Neighbor reshaping is then derived, and undo is automatically correct. Use Zustand for UI state. zundo and Immer patches are reasonable references but are a poor fit for 4,800-cell typed-array layers.

### Cited Findings
**Libraries**
- zundo v2 is a Zustand undo middleware under 700 bytes. It requires zustand ≥4.2.0 or v5. Options:
  - `partialize` (choose tracked fields), `limit` (cap past/future).
  - `equality` (skip no-op sets; otherwise every setter call is recorded).
  - `handleSet` (wrap the setter, e.g. throttle or debounce, to coalesce calls).
  - `diff` (store deltas instead of full snapshots; return `null` to skip).
  - `pause()`/`resume()`, `onSave`, `wrapTemporal`.
  - There is no dedicated batching/transaction API beyond throttling via `handleSet`.
  - — [zundo GitHub](https://github.com/charkour/zundo)
- Immer patches:
  - Since v6 they must be turned on with `enablePatches()`.
  - `produceWithPatches` returns `[nextState, patches, inversePatches]`. Patches are `{op, path: (string|number)[], value}`, RFC 6902-like. `applyPatches` replays them, and inverse patches implement undo.
  - Immer "does not guarantee the generated set of patches will be optimal."
  - — [Immer patches docs](https://immerjs.github.io/immer/patches)
- tldraw's store batches multiple changes into one notification. Changes can be wrapped in `editor.run(fn, { history: 'ignore' })` to keep them off the undo stack. History length is configurable. — [tldraw state management](https://tldraw.dev/features/programmatic-control/state-management-and-control); [tldraw data management](https://tldraw.dev/features/composable-primitives/data-management)
- Figma's undo principle: undoing a lot, copying something, and redoing back to the present should leave the document unchanged. An undo writes the redo history at the time of the undo, and vice versa. Deleted objects' properties live in the deleting client's undo buffer. Property-level changes are last-writer-wins on a server-authoritative model, which they found simpler than OT. — [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

**Local skill guidance**
- save-systems: store authoritative, non-derivable state and recompute derived data on load. Saving derived data invites desync when the formula changes. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/references/versioning-and-migration.md`
- performance-optimization:
  - Measure first.
  - 60 FPS = 16.67 ms frame budget.
  - Prefer algorithmic wins.
  - Avoid per-frame allocations, which cause GC stutter.
  - Set budgets and enforce them in CI.
  - — `C:/Users/Micha/Desktop/newbloons/.claude/skills/performance-optimization/SKILL.md`

### Inferences
**Document model**

```ts
MapDoc {
  meta,
  grid: { w, h, tile },
  visualLayers: Layer[],
  terrain: Uint8Array,
  autotileIntent: Uint8Array per autotile layer,
  objects: Record<id, Obj>,
  path: PathGraph,
  waves: Wave[],
  themes,
}
```

- Use `Uint16Array`/`Uint32Array` per tile layer, indexed `y*w+x`.
- At these map sizes, chunking is unnecessary: 60×40 = 2,400 cells, so a full-layer copy is microseconds. Add 32×32 chunking only if maps become huge or infinite.
- Keep objects and waves as plain JSON records keyed by stable ID (Figma/tldraw-style normalized records).

**Undo model: a command/transaction log with sparse diffs, not full snapshots**
- On pointerdown, start `tx = { label: 'Paint grass', cells: Map<layer, Map<idx, [before, after]>>, objects: [...] }`.
- Each pointermove applies changes immediately (instant feedback) and records `before` only on first touch of a cell.
- On pointerup, commit one entry. A whole brush stroke is one undo step by construction, with no throttling heuristics as in zundo `handleSet`.
- Undo applies `before` values; redo applies `after`.
- Memory cost is a few bytes per changed cell. A `limit` of 200–500 entries plus a byte cap is plenty.

**Autotiles**
- Store the terrain id the user painted (e.g. "water", "tall-grass") in an intent layer. Resolve shapes (47-blob or RPG Maker XP 48-config) as a pure function of the 8 neighbors at render/export time.
- Undoing a stroke then restores intent, and the resolver recomputes the dirty cells plus their neighbors. Neighbor side effects never need to be in history.
- This follows the save-systems "recompute derived" rule.
- If a hand-placed override is needed ("force this corner tile"), store it as an explicit override cell, which is authoritative and undoable.

**Dirty-region rendering**
- The resolver returns the set of changed resolved tiles.
- The Phaser adapter calls `putTileAt` only for those cells, coalesced per animation frame via `requestAnimationFrame`.
- Do not allocate per pointermove: reuse scratch arrays (performance skill).

**Selection model**
- `selection = { kind: 'cells', rect | mask } | { kind: 'objects', ids: Set }`.
- Keep selection, tool and camera in a separate UI store, not in the undoable document. Optionally record the selection with each history entry so undo restores context.

**Copy/paste**
- Clipboard payload is `{ w, h, layers: {layerId: number[]}, terrain?, objects? }` with relative coordinates.
- Write it to the system clipboard as a JSON string with a MIME-like tag so pasting between editor tabs works.
- Paste creates a "floating selection" previewed as a ghost and committed as one transaction.
- New object IDs are generated on paste.

**Library roles**
- Zustand for UI state and panel subscriptions.
- A hand-written ~150-line history module for the document. It's simpler and faster than Immer patches over typed arrays; Immer drafts plain objects and arrays, and patch output on large arrays is not guaranteed minimal.
- zundo is fine for small non-grid stores (e.g. wave editor form) if wanted.
- The same transaction diffs are also the natural "ops" format for any future hosted, collaborative backend: Figma-style property-level last-writer-wins.

**Performance budget**
- Target under 4 ms per pointermove for apply + resolve + render on a 60×40×5 map.
- Profile with Chrome DevTools before optimizing (performance skill).
- Run heavy validation (path reachability, wave sanity) debounced, or in a Web Worker if it grows, and surface it as live diagnostics.

### Gaps
- I did not verify how Immer handles typed arrays (draftable or not) on the patches page. Treat Immer-over-typed-arrays as unverified.
- I found no published benchmarks of Phaser 4 `putTileAt` throughput or of zundo `diff` overhead for grid editors. This needs measuring.
- I did not source the RPG Maker XP autotile sheet layout and its 48-configuration composition from 16px quarter-tiles. Verify against Essentials source or docs before implementing the resolver.

---

## 3. Map file format: Tiled-compatible TMJ vs custom schema; how Phaser parses Tiled; schema separation, versioning, git-friendliness, and a shared typed loader

### Takeaway
Make a custom, versioned, typed canonical schema the file in the repo. It keeps gameplay layers, the path graph, waves and themes separate from visuals, and it diffs cleanly. A shared `map-runtime` adapter converts it at load time into a Tiled-shaped in-memory object, so Phaser's native Tiled parser (including tile animations) still does the rendering. Optionally emit a `.tmj` for opening in Tiled. Exporting TMJ as the source of truth works (Sprite Fusion does it), but it forces gameplay data into stringly-typed object-layer properties and per-map embedded tilesets.

### Cited Findings
**Tiled JSON (TMJ) format**
- Top-level `version` (a string since 1.6), `tiledversion`, `orientation`, `infinite`, `width`/`height` (tiles), `tilewidth`/`tileheight`, `nextlayerid`/`nextobjectid` counters, `properties`, `layers`, `tilesets`. The changelog runs through Tiled 1.12.
- Layer types: `tilelayer`, `objectgroup`, `imagelayer`, `group`.
- Tile `data` encoding is `csv` (default, plain GID array) or `base64`, with optional `zlib`/`gzip`/`zstd` compression. Infinite maps use `chunks`.
- Objects carry `id`, `name`, `type`, `x`, `y`, `width`, `height`, `properties`, `gid`, and `point`/`ellipse`/`polygon`/`polyline`.
- Property types: `string`, `int`, `float`, `bool`, `color`, `file`, `object`, `class` (custom `propertytype` since 1.8).
- Tilesets: `firstgid` (first starts at 1; local id = GID − firstgid), `image`, `columns`, `tilecount`, `margin`, `spacing`, external `source`.
- Per-tile `animation` is a list of `{tileid, duration(ms)}`. `wangsets` are typed `corner`/`edge`/`mixed` with an 8-element `wangid`.
- `type`↔`class` renames happened in 1.9/1.10.
- — [Tiled JSON map format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)

**How Phaser consumes Tiled JSON**
- `this.load.tilemapTiledJSON(key, url)` plus `this.load.image(...)`, then `this.add.tilemap(key)`. `make.tilemap` is the config-object equivalent, though it's not covered in the skill file.
- `map.addTilesetImage(tilesetName, key, tileWidth, tileHeight, tileMargin, tileSpacing, gid, tileOffset)`, where the name must match Tiled.
- `map.createLayer(layerID, tileset(s), x, y, gpu)`, where the ID must match the Tiled layer name (`'Group/Layer'` for groups). Each layer can be created once.
- The Phaser Tiled parser requires embedded tilesets in the exported JSON. "Collection of Images" tilesets are not supported (all tiles must come from one image).
- Tile custom properties appear as `tile.properties`. Object-layer entries via `map.getObjectLayer(name).objects` expose `name`, `x`, `y`, `properties`.
- `createFromObjects(layerName, config)` matches by `id`/`gid`/`name`/`type` and instantiates `classType` (default Sprite).
- Tiled tile animations are parsed and played automatically in Phaser 4 (see Q1).
- — [Phaser 4.2.1 tilemaps SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md)

**Other formats**
- Sprite Fusion takes the TMJ-export route for Phaser. — [Phaser News](https://phaser.io/news/2026/08/sprite-fusion-tilemap-editor-phaser)
- LDtk (JSON format 1.5.3) separates `defs` (layers, entities and their fields, tilesets, enums) from `levels` (instances with `identifier`, `iid`, `layerInstances`).
  - A "Separate level files" option moves layer content out of the project file.
  - Root-level info is "only used by the editor itself".
  - It publishes a JSON Schema and QuickType-generated types for importers.
  - — [LDtk JSON overview](https://ldtk.io/docs/game-dev/json-overview/); [LDtk JSON docs](https://ldtk.io/json/)

**Versioning rules from the save-systems skill**
- Stamp an integer `version` from v1. Refuse newer files.
- Migrate older files through pure `vN→vN+1` functions, kept forever.
- Validate required keys, ranges and resolvable references (an enemy id removed in a patch must be handled).
- Keep a corpus of real files from each version as a regression net.
- Keep an in-memory canonical shape and (de)serialize at the boundary.
- — `C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/SKILL.md`; `.../save-systems/references/versioning-and-migration.md`

### Inferences
**Recommendation: custom canonical schema plus a runtime Tiled adapter**

Reasons against TMJ as the repo format:
- Phaser requires embedded tilesets, so every map would duplicate tileset definitions and animation tables. Every tileset tweak would then rewrite every map file.
- Global `firstgid` arithmetic makes theme swaps and adding tilesets noisy.
- Path graphs, waves and terrain rules become untyped `{name,type,value}` property arrays or pixel-coordinate polylines.
- Autotile intent has no place Phaser reads; Phaser ignores wangsets.

With a custom schema, the shared `map-runtime` package builds the Tiled-shaped object in memory (embedding tilesets from separate tileset files and the chosen theme) and feeds it to Phaser's Tiled parser. You get native animations and `createLayer` with clean repo files. The adapter can also write a real `.tmj` for debugging in Tiled.

**Schema sketch (`*.map.json`)**

```jsonc
{
  "format": "ptd-map",
  "schemaVersion": 1,
  "id": "route-01",
  "name": "Viridian Forest",
  "grid": { "width": 40, "height": 24, "tileSize": 32 },
  "tilesets": ["outdoor", "forest-objects"],        // refs to /tilesets/<id>.tileset.json (image, columns, animations, autotile defs)
  "themes": { "default": "summer", "supported": ["summer", "winter"] },
  "visual": {
    "layers": [
      { "id": "ground",  "kind": "autotile", "tileset": "outdoor",
        "legend": { ".": null, "g": "grass", "w": "water" },
        "rows": ["gggggwww....", "..."] },           // one row per line
      { "id": "detail",  "kind": "tiles", "tileset": "outdoor",
        "rows": [[0,0,12,13,0], [0,0,20,21,0]] },    // local tile ids, one row per line
      { "id": "objects", "kind": "stamps",
        "items": [{ "id": "o_k3f9a2", "stamp": "tree_large", "x": 6, "y": 4 }] }
    ]
  },
  "gameplay": {
    "terrain": { "legend": { ".": "buildable", "~": "water_only", "#": "no_build", "o": "obstacle", "p": "path" },
                 "rows": ["....~~##", "..."] },
    "obstacles": [{ "id": "ob_1c2d", "x": 10, "y": 3, "w": 2, "h": 2, "removeCost": 150, "stamp": "boulder" }],
    "path": {
      "nodes": [{ "id": "n_spawnA", "x": 0, "y": 5, "kind": "spawn" }, { "id": "n_exit1", "x": 39, "y": 12, "kind": "exit" }],
      "edges": [{ "id": "e_01", "from": "n_spawnA", "to": "n_j1", "mode": "ground", "cells": [[0,5],[1,5],[2,5]] },
                { "id": "e_air", "from": "n_spawnB", "to": "n_exit1", "mode": "air", "waypoints": [[0,20],[39,12]] }]
    }
  },
  "waves": [{ "id": "w01", "groups": [{ "enemy": "rattata", "count": 10, "interval": 0.8, "delay": 0, "spawn": "n_spawnA" }] }]
}
```

**Separation principles**
- `gameplay` never references visual tile ids.
- `visual` never affects rules.
- Themes live in separate theme files that map each tileset id to a theme image (same layout, e.g. a winter sheet as a drop-in texture swap), plus an optional tile-remap table and optional theme-only decoration layers.
- A winter reskin is therefore a new theme file plus optional overlay, with zero changes to gameplay data.

**Path representation**
- The painted path cells (terrain `p`) are the authoring input.
- The editor derives a directed graph. The designer resolves ambiguous junctions with direction arrows.
- The validated graph is stored explicitly, so the game never has to guess routes.
- This is a deliberate exception to "don't store derived data". A CI test asserts that graph edges lie on `p` cells.
- Flying routes are `mode: "air"` edges with waypoints that ignore terrain.

**Git-friendly serialization (write a custom deterministic printer)**
- Fixed key order defined by the schema, not insertion order.
- Two-space indent.
- Each grid row on its own line (as a string or a compact number array).
- Arrays of records sorted by a stable key, or kept in user order where order is meaningful (waves).
- No base64/zlib, a trailing newline, and LF line endings (enforce via `.gitattributes`).
- Round-trip test: `print(parse(file)) === file` byte-for-byte.

**IDs**
- Use short random IDs (prefix + 6–8 chars) generated once at creation and never regenerated.
- Prefer these over Tiled-style `nextobjectid` counters, which collide when two collaborators add objects on parallel branches.

**Versioning**
- `schemaVersion` integer plus a migration chain in `map-format`.
- Zod schemas give runtime validation and inferred TS types for both editor and game.
- Optionally publish a generated JSON Schema for editor-agnostic checks, as LDtk does.
- Validation layers:
  1. Structure (Zod).
  2. Semantics: path connectivity, every spawn reaches an exit, cells in bounds, stamps don't overlap no-build, wave enemies exist in the game's content registry.
  3. Warnings vs errors.
- Refuse newer versions. The editor auto-migrates on open and writes the current version on save.

**Game consumption**

```ts
import { parseMap, migrate } from '@ptd/map-format'
import { buildPhaserTilemap } from '@ptd/map-runtime'
```

- `migrate`/`parseMap` return a typed `MapDoc`. Throw on invalid input in development, and show an error in production.
- The game scene calls `buildPhaserTilemap(scene, doc, theme)` and reads gameplay data directly from the typed doc, never from Tiled properties.

### Gaps
- I did not verify the exact API for injecting an in-memory Tiled object into Phaser. The likely options are `this.cache.tilemap.add(key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data })` followed by `this.make.tilemap({ key })`, or calling `Phaser.Tilemaps.Parsers.Tiled.ParseJSONTiled` directly. Confirm in Phaser 4.2 source.
- I did not confirm whether Phaser 4 supports CSV/base64/compressed TMJ data and infinite chunks; the skill file is silent. It's irrelevant if the adapter always emits a plain CSV array.
- The fetched sources did not cover Phaser's exposure of map-level and layer-level Tiled custom properties, or the GID flip-flag bits.
- I did not verify that Phaser's Tiled animation path works for tiles in a tileset built purely in memory, though it should if the object mirrors TMJ. Test early.
- I did not check Zod's current major version or its JSON Schema export API.

---

## 4. Saving into a git repo from the browser; autosave and crash recovery

### Takeaway
The File System Access API pickers are still Chromium-desktop-only in Oct 2026. Firefox, Safari, iOS and Chrome Android do not support them. Make a local Vite dev-server plugin that writes validated files straight into the repo's `maps/` folder the primary save path; it works in every browser. Add File System Access as an optional Chromium path and download/upload as the universal fallback, all behind one `MapStorage` interface that a hosted backend can implement later. Autosave continuously to IndexedDB/OPFS for crash recovery.

### Cited Findings
**Browser support**
- File System Access: Chrome and Edge support it from 105 (86–104 partial). Firefox has no support in any version, and Mozilla's position is labeled "harmful". Safari (through 27.1 and TP) and Safari iOS (through 27.2) have no support. Chrome for Android has no support. Global usage is about 30% (StatCounter data, Sep 2026). — [caniuse: File System Access API](https://caniuse.com/native-filesystem-api)
- web.dev recommends feature-detecting `showDirectoryPicker` and falling back to `<input type="file" webkitdirectory>` (Firefox 50+, Safari 11.1+), which is read-only and upload-style. — [web.dev: How to open a directory](https://web.dev/articles/files/open-a-directory)

**File System API details**
- Handles (`FileSystemFileHandle`/`FileSystemDirectoryHandle`) come from `showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker` or drag-and-drop, and can be serialized into IndexedDB.
- `createWritable()` returns a stream whose `close()` commits data to disk.
- The Origin Private File System (`navigator.storage.getDirectory()`) is not user-visible, so it needs no permission prompt. `createSyncAccessHandle()` is available only in dedicated Web Workers.
- The API requires a secure context.
- — [MDN: File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)

**Vite dev-server plugin**
- Vite (docs at v8.3.4) `configureServer(server)` adds middleware via `server.middlewares.use(...)`. `apply: 'serve'` restricts a plugin to dev.
- Client-to-server custom events go via `import.meta.hot.send(event, data)` and `server.ws.on(event, (data, client) => …)`. Reply with `client.send`, and prefix event names.
- — [Vite Plugin API](https://vite.dev/guide/api-plugin)

**Save-systems skill**
- Write to temp, flush, then rename. On Windows, rename-replace isn't guaranteed atomic, so keep a `.bak`.
- Autosave to a separate slot, rotate a small ring (autosave_0..2), and throttle.
- Consider a checksum to detect truncation.
- — `C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/SKILL.md`; `.../references/versioning-and-migration.md`

### Inferences
**`MapStorage` interface:** `list()`, `load(id)`, `save(id, doc, {expectedHash})`, `listAssets()`. Implementations:
1. **`DevServerStorage` (default).**
   - A Vite plugin with `apply: 'serve'` exposes `GET /__maps`, `GET /__maps/:id` and `POST /__maps/:id`, or uses HMR custom events.
   - The server re-validates with the same `map-format` Zod schema, serializes deterministically, and writes atomically: temp, then `.bak`, then rename.
   - It whitelists the `maps/` directory (rejects `..` and absolute paths), binds to localhost only, and rejects newer `schemaVersion`.
   - Collaborators run `pnpm dev:editor` inside their clone, then commit and push with normal git.
   - Pros: all browsers, no permission prompts, server-side validation, can list tilesets and enemy registry from the repo.
   - Cons: requires Node and a cloned repo, which every collaborator committing to git already has.
2. **`FsAccessStorage` (Chromium only).** The user picks the repo's `maps/` folder once. Store the directory handle in IndexedDB. On reload, call `queryPermission` and then `requestPermission`; a user gesture is likely needed (see Gaps). Useful if the editor is ever deployed as a static site.
3. **`DownloadStorage`.** Download a `.map.json` via Blob or anchor, and open via `<input type=file>` or drag-drop. Universal last resort.
4. **Future `HttpApiStorage`.** The same interface against a hosted backend. Designing `save` with `expectedHash` (optimistic concurrency) now means the backend later slots in without UI changes.

**Validation before save:** block on errors and allow saving with warnings. Show a diff summary (cells changed, objects added) and the computed hash.

**Autosave and recovery**
- Debounce about 1–2 s after each committed transaction. Write `{doc, baseFileHash, savedAt}` to IndexedDB (or OPFS from a worker) in a 3-slot ring per map.
- On open, if an autosave exists whose `baseFileHash` matches the on-disk file but whose content differs, offer "Recover unsaved changes".
- If `baseFileHash` doesn't match (the file changed via git pull), offer recover-as-copy to avoid clobbering teammates.
- Also persist the history stack optionally, so undo survives reloads.

**Git hygiene**
- Add `.gitattributes` with `*.map.json text eol=lf`.
- Add a pre-commit/CI step running `map-format validate maps/**/*.map.json` and the round-trip printer check.
- Commits stay in the user's git client. The dev server can show `git status` for maps but should not commit automatically.

### Gaps
- MDN's page did not document `queryPermission`/`requestPermission` behavior, persistence of permissions across sessions (Chrome's "persistent permissions" UX), or the user-activation requirements for pickers. Check the `FileSystemHandle` MDN pages and Chrome's developer blog.
- I did not confirm whether `createWritable()` writes atomically (e.g. via a swap file). Do not assume it; keep `.bak` semantics.
- I did not research in-browser git (e.g. isomorphic-git) as an alternative. It's probably unnecessary given the dev-server approach.

---

## 5. Camera and input: pan/zoom, pointer/pen/touch, shortcuts, preventing browser zoom/context menu, Phaser vs DOM input

### Takeaway
Handle editor tools with DOM Pointer Events on the canvas through a tool controller that converts screen to world coordinates. Use the Phaser camera for view transforms, use integer zoom steps for pixel art, and keep Phaser's own input system for playtest only. Route all shortcuts through a named-action map with rebinding and conflict detection, per the input-systems skill.

### Cited Findings
- input-systems skill rules:
  - Map physical inputs to named actions and never wire behavior to raw keys.
  - Use edge (pressed-this-frame) for discrete actions and held (level) for continuous ones.
  - Provide rebinding with conflict detection, persistence and reset-to-defaults.
  - Swap prompts or glyphs by the last-used device.
  - Avoid required simultaneous presses (accessibility).
  - — `C:/Users/Micha/Desktop/newbloons/.claude/skills/input-systems/SKILL.md`
- game-ui-ux skill: mouse and focus navigation must coexist. Layout should use anchors and containers rather than absolute pixels, so editor panels survive window resizes. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/game-ui-ux/SKILL.md`
- Phaser layers render with the camera transform. `TilemapGPULayer` respects camera translation (fixed in RC6). — [Phaser GitHub releases](https://github.com/phaserjs/phaser/releases)

### Inferences
**Zoom**
- Allowed steps: 0.25×, 0.5×, 1×, 2×, 3×, 4×, (6×, 8×). Zoom about the cursor position.
- Snap camera scroll to whole device pixels at integer zooms to avoid shimmering seams.
- Set the Phaser game config to pixel-art mode (nearest filtering) and enable rounding of pixel positions.
- Handle `devicePixelRatio`: size the canvas backing store to CSS size × DPR, or accept browser scaling. Test at 125% and 150% Windows scaling, which is common on the team's machines.

**Pan**
- Middle-mouse drag, Space+left-drag, two-finger trackpad scroll (wheel without ctrl), or the arrow keys/WASD action.
- Zoom with Ctrl/Cmd+wheel and pinch.

**Preventing browser behavior on the canvas element**
- `touch-action: none` (CSS).
- A `wheel` listener with `{ passive: false }` that calls `preventDefault()` when `ctrlKey` (stops page zoom).
- `contextmenu` → `preventDefault()` (right-click = eyedropper or erase, Mario Maker-like).
- `setPointerCapture` on pointerdown so strokes continue outside the canvas.
- Ignore events whose `pointerType`/`isPrimary` indicate a second touch while painting.

**Pointer events**
- One code path for mouse, pen and touch.
- Coalesced pointer events (`getCoalescedEvents()`) prevent gaps in fast brush strokes. Also interpolate cells with Bresenham between successive samples regardless.

**Shortcut layer**
- A single keydown handler on `window`.
- Skip when `event.target` is an input, textarea or contenteditable.
- Resolve the action via a binding table, e.g. `{ 'tool.brush': ['KeyB'], 'tool.fill': ['KeyG'], 'edit.undo': ['Ctrl+KeyZ'], 'edit.redo': ['Ctrl+Shift+KeyZ','Ctrl+KeyY'], 'playtest.toggle': ['Enter'] }`.
- Match on `event.code` for positional tools and `event.key` for mnemonic ones (decide consistently).
- Call `preventDefault()` for bound browser-conflicting combos (Ctrl+S, Ctrl+Z inside the canvas).
- Store bindings in localStorage. Hold-to-temporarily-switch tools (e.g. Alt = eyedropper) uses held semantics.

**DOM vs Phaser input with UI overlays**
- Panels are DOM siblings positioned over or around the canvas.
- Overlay wrappers use `pointer-events: none` with `pointer-events: auto` on actual panels, so the canvas still gets events in the gaps.
- Feeding Phaser's input plugin from editor tools couples tools to Phaser scenes. A DOM tool controller keeps tools testable and framework-agnostic.
- During playtest, disable the editor controller and let the game's own Phaser input run unchanged (parity).

### Gaps
- I did not fetch sources for browser behaviors: trackpad pinch delivering `wheel` with `ctrlKey` in Chromium/Firefox/Safari, `getCoalescedEvents` support, and the exact Phaser 4 config names for pixel-art and `roundPixels`. These are standard but should be verified against MDN and the Phaser 4 docs.
- I found no source on Phaser 4 DPR/resolution handling changes vs Phaser 3.

---

## 6. Testing and quality

### Takeaway
Put most tests on pure logic in the shared packages with Vitest:
- autotile resolver tables
- path-graph derivation and validation
- terrain rules
- migrations over a corpus of old files
- byte-exact serializer golden files

Add a thin Playwright layer for end-to-end flows and canvas screenshot regression, run in one pinned environment because canvas rendering varies by OS and GPU.

### Cited Findings
**Playwright visual comparisons**
- `await expect(page).toHaveScreenshot()` creates the baseline on first run, retaking until two consecutive screenshots match.
- Baselines are stored in `<test-file>-snapshots/` and should be committed and reviewed. Names include browser and platform (e.g. `-chromium-darwin.png`).
- `npx playwright test --update-snapshots` regenerates baselines.
- Tuning options: `threshold` (default 0.2, per-pixel color tolerance) and `maxDiffPixels`. `stylePath` hides volatile elements.
- Rendering varies with host OS, version, settings, hardware, power source and headless mode, so run tests where the baselines were generated.
- `expect(value).toMatchSnapshot(name)` compares text or binary data.
- — [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)

**Skill guidance**
- save-systems: keep a corpus of real files from each shipped version and assert they still load after every change. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/references/versioning-and-migration.md`
- performance-optimization: add a perf check to verification and enforce budgets in CI. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/performance-optimization/SKILL.md`

### Inferences
**Vitest unit tests (packages, no DOM)**
- **Autotile resolver:** table-driven over all 256 neighbor masks, checking the resolved configuration, plus fixture maps whose resolved layer is compared to golden output.
- **Path derivation:** fixtures for splits, merges, multiple spawns/exits and dead ends.
  - Every spawn must reach ≥1 exit.
  - No unreachable edges.
  - Air edges are exempt from terrain.
- **Terrain validation:** stamps on no-build cells, obstacles overlapping the path.
- **Wave validation:** enemy ids exist in the game's content registry, and spawn ids exist.
- **History:** applying N transactions and then undoing N restores the byte-identical document. Redo restores the post-state. Run it as a property test over random strokes.

**Golden files**
- `fixtures/maps/v1/*.map.json`, `v2/...` are a migration corpus, never deleted.
- Tests: `migrate(load(old))` validates, and `print(parse(current)) === current` byte-for-byte.
- `map-runtime` adapter output (the Tiled-shaped object) is snapshot-tested as text.

**Playwright**
- Run in the CI Linux container, Chromium only, fixed viewport and DPR 1.
- Freeze animation time via a test hook (e.g. `window.__editor.setAnimationClock(0)`), and park the mouse.
- Flows: open map → paint stroke → screenshot → undo → screenshot equals the original → playtest toggle starts the game scene (assert via an exposed game state, not pixels) → return to edit.
- Keep screenshot tests few, and assert on exposed state where possible.

**Type sharing:** the game imports `MapDoc` types and the loader from `map-format`. `tsc --noEmit` across the workspace in CI catches schema/game drift. A CI job also validates every committed map.

### Gaps
- I did not verify Vitest-specific features (e.g. file snapshot matchers or the current major version) in this pass. Playwright's `toMatchSnapshot` is a sourced alternative for text goldens.
- Playwright's page here did not document the `mask`/`animations` screenshot options. Check the API reference.

---

## 7. Monorepo layout; editor in the game repo vs its own repo

### Takeaway
Put the editor in the game's repo as a workspace app. Maps, tilesets, the enemy registry and the pinned Phaser version all live there. One PR can then change the schema, add a migration, re-save maps and update the game loader atomically, and the dev-server save path writes directly into `maps/`. Split it out only if the editor becomes a hosted multi-project product.

### Cited Findings
- Phaser Editor keeps scene data files in the game project and compiles them to plain Phaser code. Its preview runs the project's own game. — [Phaser Editor v4 news](https://phaser.io/news/2025/10/phaser-editor-v4); [Phaser Editor v4 docs](https://docs.phaser.io/phaser-editor/v4/scene-editor/misc) (via search summary)
- LDtk publishes a JSON Schema and generated types so game-side importers stay in sync with the editor format. — [LDtk JSON docs](https://ldtk.io/json/)
- save-systems: migrations must live forever alongside the loader, and validation must check references against current content. This requires access to the game's content registry. — `C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/references/versioning-and-migration.md`

### Inferences
**Layout (pnpm or npm workspaces)**

```
/apps/game                  Phaser 4 game (imports @ptd/map-format, @ptd/map-runtime)
/apps/map-editor            Vite + React + Phaser; dev plugin for save/load; imports the same packages + the game's GameScene for playtest
/packages/map-format        Zod schema, TS types, migrations, deterministic printer, validators, CLI (validate/migrate) — no Phaser dependency
/packages/map-runtime       Phaser adapter: MapDoc + theme -> Tiled-shaped object -> Tilemap/layers/objects; peerDependency phaser (exact pin)
/packages/autotile          pure resolver(s) for RMXP/Essentials autotiles (used by editor live and by map-runtime at load)
/packages/content           enemy/tower/stamp registries (ids used by validation)
/maps/*.map.json            committed maps
/assets/tilesets/*.png + *.tileset.json, /assets/themes/*.theme.json
/fixtures/maps/vN/          migration corpus
```

**Playtest import:** the editor imports `GameScene` from `apps/game` (or a `packages/game-core` if cleaner). It runs the same code with an injected `MapDoc`.

**Leaving room for a hosted backend**
- Maps are self-contained documents with logical asset keys (no filesystem paths).
- Storage sits behind `MapStorage`.
- Saves carry `expectedHash`, and transactions are already diff ops.
- A server can reuse `map-format` for validation unchanged.

**Version pinning:** pin `phaser` to the exact same version in game and editor (a single root dependency or a pnpm catalog), so parity cannot drift.

### Gaps
- I did not research workspace tooling choices (pnpm vs npm vs Turborepo/Nx) or current versions. Any modern workspace manager works for a repo this size.
- I don't know the game repo's current Phaser version, bundler or language. These choices assume TypeScript + Vite. Confirm with the user.
