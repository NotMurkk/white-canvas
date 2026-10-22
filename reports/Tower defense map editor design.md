# Paint gameplay, derive art, prove every map

Build the map maker as a TypeScript browser app. Its viewport is the game's own Phaser 4 renderer, and it imports one shared, Phaser-free package that holds the map format, the path compiler, validation and the simulation. The authoritative data in a map are semantic grids: terrain kind per cell, directed path cells, zones, and the footprints of obstacles and objects. Every visible tile is derived from those grids through RPG Maker XP-style 47-pattern autotiling and swappable theme packs. That one decision covers most of the requirements. Undo becomes a sparse diff of what was painted. Neighbouring tiles re-shape automatically. A winter update is a new theme file whose gameplay hash matches summer's by construction. One-click playtest runs the real game scene on the in-memory map. Super Mario Maker's quality comes less from its palette than from its edit-play loop: dying in test-play drops you straight back into the editor, and a course cannot be uploaded until its creator clears it ([Super Mario Wiki](https://www.mariowiki.com/Course_Maker); [Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Maker)). The TD equivalent is instant playtest, ghost placement that is validated before it commits, and an export gate. For the gameplay layer, Arknights' public level files, which keep tiles, routes and waves separate, and Bloons TD 6's rules for alternating junctions and priced removable obstacles are the best sourced precedents. The binding constraint is the art, not the code. 613 of the 711 catalog links point to DeviantArt, which since March 2026 limits free accounts to 10 downloads a week, and its public previews are often resized or JPEG-compressed. Assets therefore have to be acquired on demand, starting with artist bundles, with credits recorded per pack and raw sheets kept out of any public repo. The minimal first version is one playable map built from roughly 25–40 tilesets. It has terrain and path painting with live autotiles, start and end markers, a computed buildable overlay, validation that blocks export, deterministic JSON saved into the repo, and playtest in the real game.

## Mario Maker's polish lives in the edit-play loop, not the palette

### What Nintendo actually built

Super Mario Maker's editor is a handful of always-visible, single-purpose tools sitting on a rich part system. **The clapperboard switches between editing and test-play. Losing a life in test-play returns you straight to the Course Maker, and a held button replays the course from the start rather than from Mario's current position** ([Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)). An outline mode shows Mario's movement paths so creators can position parts against the run they just played ([Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)). **A course must be played to completion before it can be published** ([Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Maker)), and Nintendo still deletes uploads containing bugs the creator did not intend ([Nintendo UK support](https://nintendo.co.uk/en-gb/Support/Nintendo-Switch/A-Course-I-Uploaded-Seems-to-Have-Disappeared-Where-Did-it-Go-Super-Mario-Maker-2--1588842.html)). Clearing is a quality floor, not a guarantee of quality.

The history matters for this project. SMM began as an internal Nintendo course-editing tool that was then pitched to Takashi Tezuka ([Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Maker)). Tezuka described Nintendo's internal level tools as far more complicated and keyboard-and-mouse driven ([Gaming Trend](https://gamingtrend.com/news/super-mario-maker-was-originally-a-mario-paint-game-according-to-creator)). At E3 he said players should enjoy SMM rather than think of it as an editor tool ([DualShockers](https://www.dualshockers.com/takashi-tezuka-details-mario-maker-this-isnt-your-typical-course-editor/)). This project runs that story backwards: an internal tool that wants consumer-grade feel. The lesson is to keep the internal tool's depth (keyboard and mouse, precise data, validation), borrow the consumer layer's immediacy (direct manipulation, instant feedback, one-click play), and skip whimsy that costs build time, such as mascots and hand cursors.

The part system reaches its breadth by composition rather than palette size. **SMM2 groups parts into four categories, shows recently used parts first, and lets a held part be pinned to the row** ([Super Mario Wiki](https://www.mariowiki.com/Course_Maker); [Tom's Guide](https://tomsguide.com/how-to/super-mario-maker-2-tips-how-to-build-levels-like-a-pro)). Shaking a part, or using SMM2's context menu, cycles its variants. Items drop into blocks and pipes. Semisolids and Bill Blasters have drag handles ([Super Mario Wiki](https://www.mariowiki.com/Course_Maker)). Ground "connects with other Ground blocks", which is SMM's version of autotiling, and a theme change swaps the editor's assets, objects and music together ([Super Mario Wiki: Ground](https://www.mariowiki.com/Ground_(block)); [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)). The supporting tools are Mr. Eraser, Undodog (one tap or a held button undoes the last action), Reset Rocket, and Multigrab with copy ([Super Mario Wiki: Undodog](https://www.mariowiki.com/Undodog)). **Placement sounds are vocal calls whose pitch and length follow the background melody**, and **SMM2 caps Ground at 4,000 blocks** ([Super Mario Wiki](https://www.mariowiki.com/Course_Maker); [Super Mario Wiki: Ground](https://www.mariowiki.com/Ground_(block))). This research could not confirm SMM's exact feedback for invalid drops, its undo depth, or whether Reset Rocket asks for confirmation. Those details should come from the design below, not from imitation.

### How each SMM idea translates to a TD map maker

Other editors fill in what SMM lacks for a grid TD. LDtk derives visual auto-layers from a semantic IntGrid layer, toggles back to the raw IntGrid with one key, caps entity counts (adding a second singleton moves the first), and draws numeric fields such as a radius as circles on the map ([LDtk auto-layers](https://ldtk.io/docs/general/auto-layers/); [LDtk entities](https://ldtk.io/docs/general/editor-components/entities/)). Tiled's terrain brush updates neighbouring tiles, routes through an intermediate terrain when two terrains lack a direct transition, and weights random variants by probability ([Tiled manual: Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)). Porymap, the Pokémon decomp map editor, paints collision as its own overlay using the same tools as the art, with an opacity slider, right-click pickup and collision edits in undo ([Porymap manual](https://huderlem.github.io/porymap/manual/editing-map-collisions.html)). LittleBigPlanet keeps a complexity thermometer visible at all times that blocks additions when full ([LBPUnion](https://www.lbpunion.com/?p=3391)). Seth Coster's GDC talk on Levelhead argues for "forgiveness": deliver the outcome the player meant from imprecise input ([GDC Vault](https://www.gdcvault.com/play/1026606/Forgiveness-Mechanics-Reading-Minds-for)).

| SMM behaviour (sourced) | TD map-maker equivalent (recommended) |
|---|---|
| Clapperboard toggle; dying returns you to the editor | "Play from wave N" runs the real game scene on the in-memory map. Esc returns with camera, selection and undo history intact |
| Outline mode shows Mario's last path | Last-run enemy trails and leak markers stay until the next edit. Animated chevrons always show the flow direction of the path |
| Must clear before upload | Hard gate: static validation blocks export. Soft gate: a stored simulation record tied to the gameplay hash |
| Ground auto-connects | Painting or erasing re-shapes the cell and its 8 neighbours |
| Shake or context menu for variants | Cycle-variant hotkey (wheel while hovering), right-click property menu |
| Items dropped into blocks | Drop a reward onto an obstacle, a branch policy onto a junction, or a spawn group onto a start marker |
| Recent parts and pinning | Category palette (Terrain, Path, Markers, Obstacles, Decor) with a recent strip, pin-to-strip, search and number-key shortcuts |
| Mr. Eraser, Undodog, Reset Rocket | Explicit eraser (E, or a held modifier), unlimited transaction undo, and a reset that asks for confirmation and can itself be undone |
| Multigrab and copy | Marquee selection with a layer filter. Pasting shows a floating ghost validated like a single placement |
| Ground cap; LBP thermometer | Always-visible budget meter for decor sprites, animated tiles, routes and waves, with soft and hard caps measured in the real Phaser build |
| Music-synced placement voices | A short, distinct sound per action class, pitch-varied within a stroke, with an 80 ms scale-in "pop" on place |

### Placement rules: buildability is computed, never painted

The placement logic separates SMM-grade from merely functional. **Every placement is previewed before it commits.** The ghost sprite sits under the cursor at about 60% opacity, each footprint cell is tinted green or red, and a refused drop shows a one-line reason next to the cursor ("Blocked: overlaps path at (12,7)", "Needs water", "No-build zone"). SMM conveys refusal with feel alone; an internal tool owes its designer the reason. Forgiveness snapping applies Coster's principle. If the drop is illegal but a legal anchor exists within one cell, the ghost snaps there with a dashed connector. If the pointer skips cells mid-stroke, the editor rasterises the gap and inserts elbow cells so a path stays 4-connected.

Buildability follows a single rule. A cell is buildable when it is in bounds, is not path, is not under a blocking footprint, has a terrain class that allows the tower, and is not inside a no-build zone. Water-only cells admit only water-class towers. **No one paints "buildable" directly**, so it can never drift out of sync with the terrain. The "show buildable" overlay colours cells green for any tower, blue for water-only, red-hatched for no-build and grey where a removable obstacle blocks building. It uses Porymap's opacity slider and LDtk's gameplay-only render toggle.

Every multi-tile object carries two masks. A footprint mask holds the cells that block building and pathing. A visual mask holds the cells its sprite covers, such as a canopy two rows above the trunk. The anchor sits at the bottom centre of the base, so tall three-quarter-view objects line up by their feet. A test-tower stamp, an editor-only ghost that shows a range ring and counts the path cells it covers, is the most valuable TD-specific aid in the list. It shows real coverage before any playtest.

SMM features that don't translate should be dropped. Daily unlocks were resented enough that a day-one patch changed them ([Super Mario Wiki](https://www.mariowiki.com/Super_Mario_Maker)). Upload quotas, Course World and wings-on-enemies composition don't fit an internal tool either. Enemy attributes belong in wave and unit data, not on the map.

## Directed path cells and flag-bundle terrain keep multi-route maps unambiguous

### What shipped tower defense games store

The most complete public TD level format is Arknights'. **A level file separates `mapData` (a 2D grid of indices into tile definitions carrying `heightType`, `buildableType` of MELEE/RANGED/NONE, and `passableMask` of ALL/FLY_ONLY), `routes` (start, end, checkpoints, motion mode, spawn offsets), and `waves` (fragments of actions with `count`, `interval`, `preDelay` and a `routeIndex`), plus a `randomSeed`** ([ArknightsGameData level 0-1](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)). That three-way separation of gameplay tiles, routes and waves, cross-referenced, is the template here. One flaw should be fixed: references by array index break silently in a long-lived, git-committed format, so use stable string IDs.

Bloons TD 6 supplies the branching rules. Bloons enter from each active entrance in turn and typically alternate at splitting junctions ([Bloonswiki: Track](https://bloonswiki.com/Track)). Bazaar switches entrances on even and odd rounds, and Bloonarius Prime opens a shorter path on prime-numbered rounds ([Bloonswiki: Bazaar](https://www.bloonswiki.com/Bazaar)). **Removables cost cash, the price does not vary with difficulty, and some maps chain them in tiers. Dark Path's run $250, $500, $1,000 and $1,000** ([Bloonswiki: Removable](https://www.bloonswiki.com/Removable); [Dark Path mirror](https://breezewiki.discard.no/bloons/wiki/Dark_Path)). Kingdom Rush's fliers ignore ground blockers and the ground path ([KR Wiki: Perython](https://kingdomrushtd.fandom.com/wiki/Perython)), which argues for authoring air routes as separate objects. Pokémon Tower Defense's own map internals are not documented anywhere this research could reach. Only its Focus/Ignore Candy targeting, map zoom and fast-forward could be confirmed ([PTD Wiki](https://pokemontowerdefense.fandom.com/wiki/File:Wave.png)). Its placement and flying rules shouldn't be copied from memory.

### Path cells store their own direction

The user chose tile-by-tile path painting, and that choice brings one trap: **inferring connectivity from adjacency.** Two touching lanes would merge into an accidental junction. A two-wide road becomes a 2×2 blob with no defined direction. Deriving direction from distance to the exit also fails: a branch that turns back near its split can sit closer, by graph distance, to the exit through the split, so the inferred arrows point backwards. The fix is to store a 4-bit out-mask per path cell (N=1, E=2, S=4, W=8), written as the stroke moves from cell A to cell B. Wide roads then become a visual concern only, and parallel lanes stay unconnected by construction. A "flip segment" tool reverses a chain, and a "connect" tool toggles single edges.

The compiler, which lives in the shared package, turns these masks into a directed acyclic graph. Cells with in-degree 0 must be spawns, cells with out-degree 0 must be exits, out-degree ≥2 marks a split that needs a branch policy, and in-degree ≥2 marks a merge. A cell with both in ≥2 and out ≥2 is ambiguous and must declare `junction` or `crossing`. Kahn's topological sort rejects cycles. Routes are then enumerated as spawn-to-exit edge sequences with IDs derived from their choices (`spawn_west>N>E`), and the editor warns above about 64 routes because the count grows exponentially with stacked splits.

Branch policies follow the BTD6 menu: `alternate` (the default, with a counter that resets each round so results reproduce), seeded `weighted` or `random`, `shortest`, `fixed`, and `byRound` (parity, prime or an explicit list). A wave group may pin a full route, and a pinned route beats junction policies. Movement follows tile centres, and each turn is replaced by a quarter-circle arc of radius 0.5 tile, which is π/4 ≈ 0.785 tiles long instead of 1.0. Each route gets a precomputed arc-length table. Because routes differ in length, **"first" targeting should rank enemies by remaining distance, not distance travelled**, or an enemy about to leak on a short branch gets mis-ranked. Bridges and tunnels can come later as extra path layers joined by explicit ramp cells. Version one only needs the flat `crossing` junction kind.

Flying routes are any-angle polylines in tile coordinates, and their endpoints may sit off-grid so units fly in from outside the map. They ignore terrain and the ground path. The enemy definition, not its Pokémon type, decides whether a unit moves as ground or air. A Flying-type need not be an air unit.

### Terrain types are flag bundles, and obstacles are instances

Terrain rules belong in a terrain-type registry kept in the game repo, so "water" means the same thing on every map. Each type bundles placement tags (`land`, `water`, `high`, `path`), `walkable`, `flyable`, `losBlock`, `height`, `rangeMult` and `speedMult`, mirroring Arknights' per-tile `buildableType`/`passableMask`/`heightType` ([ArknightsGameData](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)). Each tower declares an any-of `canPlaceOn` list. A Water-type gets `["water", "land"]`, a Magikarp-like unit `["water"]` only, so a later "lava, Fire-types only" rule is a registry entry, not code. No-build and no-fly are sparse zone overlays drawn above the terrain, so a bridge deck over water can be no-build without inventing a fake terrain type.

Removable obstacles are instances, not terrain. Each has a footprint, a removal cost, an optional `requires` chain (for Dark Path-style tiers) and a `becomes` terrain for its cells once cleared. A Pokémon-flavoured option is to require Cut or Rock Smash instead of cash. Range modifiers multiply: effective range = base range × the cell's `rangeMult` × a single global height-bonus table, so every map behaves the same. The +15% per height level in the research is a placeholder until playtests set it. Line of sight via grid ray traversal is a later feature, not version one.

### Waves are their own file, authored next to the map

Every sourced system converges on rounds made of groups: an enemy type with modifiers, a count, a start offset, and either an interval or a first-to-last duration ([Arknights](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json); [Bloonswiki: Apopalypse](https://www.bloonswiki.com/Apopalypse_(BTD6))). Store one canonical timing (start, count, interval) and show the BTD6-style duration as derived. Dragging a group's end handle on the timeline edits its interval. Keep waves in a separate `*.waves.json` that references the map's spawn and route IDs. A seasonal or challenge wave set can then change without touching the layout, and one map can carry several wave sets. Difficulty works best as overlays: multipliers plus per-group difficulty masks, Arknights' `difficultyMask` approach, rather than three copied files that drift apart. Per-kill bounty belongs in the enemy registry. The wave file holds round bonus cash, early-send rules (Kingdom Rush lets players call a wave early ([TrueAchievements](https://www.trueachievements.com/a382017/daring-achievement))), telegraph text, and Pokémon fields such as `level`, `catchable` and `holdsItem`.

The balancing panel should plot total HP per round against the user's own TD guideline of roughly **1.1–1.2× geometric HP growth against a roughly linear income** ([local balancing.md](file:///C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/references/balancing.md)). Alongside it go HP arriving per second at each exit, a cumulative cash curve, and a swimlane timeline with one lane per spawn.

### Validation is a compiler problem list; the clear check is a simulation record

Validation should work like a compiler's problem list: every issue carries a cell or ID, and clicking it focuses the camera there. Errors block export and warnings do not.

| Tier | Representative checks | Severity |
|---|---|---|
| Schema and integrity | `schemaVersion` supported, IDs unique, every reference resolves against the pinned enemy, tower and terrain registries, everything inside bounds | Error |
| Path graph | Every ground spawn reaches an exit. The set of path cells equals forward-reachable from spawns ∩ backward-reachable to exits. Out-degree 0 only at exits. No cycles. Ambiguous cells declare junction or crossing. Path sits on walkable terrain with no obstacle on it | Error |
| Path quality | Adjacent but unconnected lanes, path hugging the map edge, route shorter than a minimum, more than ~64 routes | Warning |
| Air routes | Starts at an air-capable spawn, at least 2 points. Warn if it never passes within reference range of any buildable cell | Error / Warning |
| Terrain and obstacles | Footprints overlap neither each other nor the path. Removal chains are acyclic. Warn on buildable cells too far from every route ("dead real estate") | Error / Warning |
| Waves | Spawn and route exist and belong together. Movement type matches the route. Count ≥ 1. Warn if a group spawns while its entrance is inactive | Error / Warning |
| Themes | Theme files contain no gameplay keys. Every logical kind has art or a declared fallback. Gameplay hash is identical across themes | Error / Warning |

The SMM clear check maps onto a cheap simulation because the game logic is shared. Use a deterministic, fixed-timestep, Phaser-free simulation with a seeded PRNG, run in a Web Worker. For version one the gate is modest: with no towers placed, every group of every wave reaches an exit, which proves every spawn can route. Later, bots supply real beatability evidence. A greedy coverage bot buys the best affordable tower at the highest-coverage cell, a stored human replay acts as a regression test, and per-route stress tests force every group down each branch. Results are stored with the gameplay hash and sim version. Editing gameplay invalidates them, and changing a theme never does. A bot clear proves solvability, not fun. Red Blob Games shows that one BFS from the goals gives distances and reachability for every cell at once ([Red Blob Games](https://www.redblobgames.com/pathfinding/tower-defense/)), so the coverage heatmap is cheap enough to update live while painting. It plots, per buildable cell, the length of path within range, weighted by route share. The research estimates about 1.2M distance checks, well under 50 ms, on a 30×20 grid; that is an estimate, not a benchmark. No published thresholds exist for "good" path length, buildable percentage or coverage concentration, so the dashboard should show numbers and calibrate them against playtests.

## Only about half the catalog snaps to the RPG Maker XP grid

### The Essentials format, and what the catalog lacks

Pokémon Essentials, the engine most catalog art targets, uses **32×32 tiles, three layers per cell, and an ID space in which IDs 48–383 cover seven 48-pattern autotiles (0–47 belong to the blank slot), IDs ≥384 index an 8-column, 256 px-wide tileset, and ID 0 is empty** ([Essentials TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb); [Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb)). Per-tile metadata covers passage bits (four direction blocks, bush 0x40, counter 0x80), priority 0–5 and terrain tags 0–17. Priority-N tiles get z = y·32 + N·32 + 33, so they sort as if they sat N rows lower and cover characters standing up to N rows below ([TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)). **All of that metadata lives in `Data/Tilesets.rxdata`, a Ruby Marshal file** ([Essentials terrain-tag editor](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/020_Debug/001_Editor%20screens/002_EditorScreens_TerrainTags.rb)). The catalog's assets are bare PNGs, so the editor must author blocking, overhang and terrain meaning itself. Importing `.rxdata` is optional at most.

### One 256-entry lookup table converts every RMXP autotile

The autotile format is fully specified in source. **An RMXP autotile frame is 96×128 px: a 6×8 grid of 16×16 mini-tiles. Each of its 48 patterns is assembled from four minis placed top-left, top-right, bottom-left and bottom-right.** An 8-bit neighbour mask (N, NE, E, SE, S, SW, W, NW) indexes a 256-entry table that selects the pattern. Neighbours count as "same" only when they hold the identical autotile ID, and off-map cells clamp to the edge, so the map border counts as "same" ([TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)). A check run during this research confirmed the table is exactly a quarter-tile rule. Each quarter looks at its two adjacent cardinals and the diagonal between them and takes one of five states: outer corner, vertical edge, horizontal edge, inner corner or fill. The 47 distinct state combinations map one-to-one onto patterns 0–46, and pattern 47, the palette icon, is never selected. Converting an RMXP autotile to a 47-tile blob set is therefore deterministic and lossless, and Essentials' own `AutotileExpander` does exactly that at load time ([AutotileExpander.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/003_AutotileExpander.rb)). The editor can copy both tables verbatim.

Animation is just as simple. Frames repeat horizontally (frame count = width/96), a 32 px-tall "autotile" is a non-autotiling animated strip (frame count = width/32), and **Essentials defaults to 0.25 s per frame, with a `[x]` filename suffix overriding it to x/20 s** ([TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)). Don't copy mkxp-z's 8-frame cap ([mkxp-z tilemap.cpp](https://github.com/mkxp-z/mkxp-z/blob/dev/src/display/tilemap.cpp)): the catalog contains an 11-frame BW water autotile ([Rayquaza-dot](https://www.deviantart.com/rayquaza-dot/art/BW-Water-Autotile-293271655)).

### The catalog is two-thirds importable and one-third hand-sliced

The catalog is less uniform than "RMXP format" suggests. This research swept DeviantArt's public oEmbed metadata ([example endpoint](https://backend.deviantart.com/oembed?url=https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004)) without downloading any images, and it returned exact original dimensions for 538 entries:

- **179 (33%)** are 256 px RMXP sheets.
- **77 (14%)** are 128 px-wide sheets of 16 px-native art in RMXP layout that need exact 2× scaling.
- 17 are canonical 96×128 autotiles, with 1 to 11 frames.
- 18 are 32 px animated strips.
- 17 are RPG Maker MV 48 px sheets.
- About **190 (35%)** are loose or unaligned sheets.

The other 73 entries returned only resized previews, so their true size is unknown. Samples show the variety. PeekyChew's beach sheet is RGB with no alpha and a baked checkerboard background ([PeekyChew](https://www.deviantart.com/peekychew/art/Public-Tileset-Dump-3-4-Beach-and-Sea-828233122)). J-Treecko252's path sheets are hand-made 3×3-plus-inner-corner blocks rather than autotiles ([Path Tiles EX – Dirt](https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469)). One GitHub entry is a pokeemerald decomp tileset of 4bpp tiles and metatile binaries, not RMXP at all ([Team Aqua's Asset Repo](https://github.com/TeamAquasHideout/Team-Aquas-Asset-Repo/tree/main/Tilesets/The%20Great%20Tileset%20Exchange/Full%20Tilesets/Volcano%20Secondary)).

The importer needs modes for each of these:

- 32 px grid slicing.
- 2× nearest-neighbour upscaling of 16 px art.
- RMXP autotile expansion.
- Animated strips.
- A loose-sheet stamp cutter with colour-key removal.
- MV sheets, accepted only when the art is an exact 3× multiple (scale down ÷3, then up ×2).
- Decomp tilesets, which get a separate importer or are skipped.

A pixel-doubling test, which checks whether every 2×2 block is uniform, detects 16 px-native art. **The stamp cutter matters as much as the autotile importer**, because a third of the catalog has no grid to slice by. A wizard can turn J-Treecko-style path sheets into synthetic autotiles: the user clicks the 3×3 block and the inner-corner tile, and those 13 tiles supply every mini the pattern table needs.

### Multi-terrain maps use priority-ordered overlays

Quarter-tile autotiling has no native multi-terrain extension. Boris the Brave's survey lists two workarounds: overlay one transparent autotiling per terrain, or draw tiles for each terrain pair ([Boris the Brave](https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/)). The first is how Essentials maps already look, so use it. Each theme defines a base fill (summer grass, winter snow) drawn everywhere. Each other terrain draws its blob-47 autotile on its own render layer in rank order, for example water, then sand, then tall grass, then path, and transparent autotile edges let the base show through. Where a theme lacks a direct path-to-water edge, prefer a validation warning over Tiled-style automatic intermediate rings. Dual-grid autotiling needs only 16 or even 6 tiles and avoids ambiguous tiles ([Excalibur.js](https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique)), but it needs corner-based art the catalog lacks, and its half-tile offset complicates picking and gameplay overlays. Treat it as an option only for newly drawn art. The path's visual mask should take its cardinal bits from the path connections rather than raw adjacency, so two touching but unconnected lanes render as two roads. Cliffs in Gen 3 art are hand-placed three-quarter-view pieces, so they should be multi-tile objects in version one rather than an auto-terrain. Grass variants come from a deterministic hash of (x, y, map seed), which keeps diffs and themes stable.

### Stamps separate a tree's footprint from its canopy

Define each multi-tile object as a stamp: a sheet region in tile units plus a per-cell role mask. The roles are blocking base, non-blocking base, blocking overhang, non-blocking overhang and empty. Each stamp also has an anchor row and optional animation. Overhang parts render as one pre-composited image whose depth is the anchor row's world y plus one tile. Units use their foot y and towers their base y. The result reproduces RMXP priority 1: a unit north of a tree walks under the canopy, and a unit south of it walks in front of the trunk. Godot hits the same problem and fixes it the same way, setting the Y-sort origin at the visual base ([Godot forum](https://forum.godotengine.org/t/how-to-use-ysort-with-tilemaps-in-godot-4/4776)). An MZ plugin shows that a single "draw above" flag breaks for tall sprites ([Cyclone Tile Priority](https://hudell.itch.io/cyclone-tile-priority)), which is why the role mask works per cell. Baked shadows that spill outside the stamp rectangle should be split into a ground-decal part so they never draw over units. Fences use a 16-tile edge set painted like terrain. A tall-grass `hidesLowerBody` flag stands in for RMXP's bush bit.

### Themes map logical kinds, so winter cannot change gameplay

Keep gameplay data theme-free and make a theme pack a mapping from logical terrain kinds to autotile sets and from object kinds to stamps. Tiled has no first-class theme system. Its workaround of swapping the tileset image only works when "the replacement tileset will still need to have the exact same layout" ([Tiled forum](https://discourse.mapeditor.org/t/a-way-to-swap-between-tilesets/2709)). Stardew Valley's same-layout seasonal sheets are the commercial version of that trick ([Stardew forums](https://forums.stardewvalley.net/threads/content-patcher-custom-tilesheet-problem.29470/latest)). The catalog supports both levels of swap. **J-Treecko252's tree sheet repeats one tree layout in green, snow, autumn and pink bands; UltimoSpriter's sheet has labelled summer/autumn/winter/spring bands; and J-Treecko's path series has snow versions of the same road types** ([Tree Tiles Ver 01](https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004); [Seasons Edit](https://www.deviantart.com/ultimospriter/art/Misc-B-W-Tiles-Seasons-Edit-724089908)). Register such sheets once with per-theme offsets as a fast path, and fall back to explicit kind-to-stamp mappings everywhere else.

Validation enforces interchangeability. Every kind any map uses must have art in every supported theme, directly or through `inherits`. Every theme's stamp for a kind must have an identical footprint and anchor. Animation may differ between themes (frozen water), but gameplay flags may not. Missing art falls back through the inherit chain with a visible warning badge, and a fallback never changes a footprint.

Pokémon Black and White show the anti-pattern. **Winter snow there opens areas that are otherwise inaccessible** ([PokémonDB](https://www.pokemondb.net/black-white/seasons)), which is exactly what the user's "identical gameplay" rule forbids. A lint rule should reject any theme field touching blocking, buildability, path or speed. A night theme is cheapest as a camera tint plus a few lit-object overrides.

### Phaser 4 animates the tiles Phaser 3 could not

The renderer choice is clear-cut. **Phaser 4 (v4.0.0 April 2026; v4.2.1 on 9 July 2026) parses Tiled tile animations and plays them in both `TilemapLayer` and `TilemapGPULayer`. Phaser 3.90.0, the last 3.x release, has no tile animation code in its layer renderer** ([Phaser releases](https://github.com/phaserjs/phaser/releases); [phaser@4.2.1 Tileset.js](https://unpkg.com/phaser@4.2.1/src/tilemaps/Tileset.js); [phaser@3.90.0 renderer](https://unpkg.com/phaser@3.90.0/src/tilemaps/TilemapLayerWebGLRenderer.js)). Phaser's own forum told Phaser 3 users to swap tile IDs on a timer ([Phaser discourse](https://phaser.discourse.group/t/animated-tilemap/1285)).

The GPU layer draws a whole layer as one quad but carries constraints: one tileset image per layer, WebGL only, orthographic only, and **no automatic refresh after edits until `generateLayerDataTexture()` is called** ([phaser@4.2.1 TilemapGPULayer.js](https://unpkg.com/phaser@4.2.1/src/tilemaps/TilemapGPULayer.js)). The editor should therefore use CPU layers, and the game can use GPU layers for static ground if measurements justify it. At TD map sizes of about 30×20 to 60×40 cells, even 5–8 CPU layers amount to a few thousand tiles, so performance is not the concern.

Use `pixelArt: true` with integer zoom only ([Phaser 4 Pixel Art Guide](https://cdn.jsdelivr.net/npm/phaser@4.2.0/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md)). Extrude tiles by 1 px (margin 1, spacing 2) to stop bleeding ([tile-extruder](https://github.com/sporadic-labs/tile-extruder)). Pack only the tiles a theme actually uses into atlases of at most 4096×4096. **4096 px textures reach 100% of WebGL2 devices, while 8192 px reaches about 75% of Android devices** ([Web3D Survey](https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE)). One 4096² page holds about 12,700 extruded 32 px tiles, and an 11-frame autotile expands to 517 of them, so a whole theme fits in one page and stays eligible for GPU layers. Each expanded autotile frame is exported as a Tiled `animation` array: 250 ms per frame by default, or the duration from the `[x]` suffix.

## Run the game's own Phaser inside the editor, over one shared rules package

### Stack: parity beats renderer preference

Use **Phaser 4.2.x, pinned to the exact version the game uses, as the editor viewport, inside a React (or Svelte) DOM shell with TypeScript, Vite and a small external store**. React never renders tiles. The deciding requirement is parity. With Phaser in the editor, the same runtime code builds tilemaps, animated tiles, theme swaps and y-sorted objects in both apps, and playtest simply starts the game's real scene. Phaser Editor v4 reached the same conclusion: it dropped its custom renderer and now runs Phaser in the browser so the editor view matches game output ([Phaser Editor v4](https://phaser.io/news/2025/10/phaser-editor-v4)). PixiJS v8 is a capable renderer, but tile animation, autotile drawing and depth logic would then exist twice and drift apart. The Phaser game object should be created once, outside React's render cycle, with the document store wired to it by subscription rather than per-frame props. tldraw's architecture is the model: a signals-based store of normalized, JSON-serializable records with snapshots and migrations, wrapped by an `Editor` API ([tldraw](https://tldraw.dev/sdk-features/editor); [tldraw data](https://tldraw.dev/features/composable-primitives/data-management)).

### Undo is a transaction of sparse cell diffs

Store each grid layer as a typed array indexed `y*w+x`. A 60×40 map is 2,400 cells, so chunking is pointless. Objects and waves are records keyed by stable IDs. Every gesture opens a transaction on pointer-down, applies changes immediately, records a cell's "before" value only on first touch, and commits a single history entry on pointer-up. A whole brush stroke is one undo step by construction. Off-the-shelf options fit poorly. **zundo has no transaction API beyond throttling setters, and Immer "does not guarantee the generated set of patches will be optimal"** ([zundo](https://github.com/charkour/zundo); [Immer patches](https://immerjs.github.io/immer/patches)). A hand-written history module of about 150 lines is simpler. Undo stays correct because the document stores autotile intent (the terrain kind painted), and the resolver recomputes dirty cells plus their neighbours as a pure function. Neighbour side effects never enter history, which follows the user's own save-systems rule to store authoritative state and recompute derived state ([local save-systems skill](file:///C:/Users/Micha/Desktop/newbloons/.claude/skills/save-systems/references/versioning-and-migration.md)).

Selection, tool and camera live in a separate UI store (Zustand is fine) outside the undoable document. Figma's principle applies: undoing a lot, copying, then redoing back should leave the document unchanged ([Figma](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)). Target under 4 ms per pointer-move for apply, resolve and render on a 60×40×5 map. Run heavier validation debounced or in a worker.

### The repo file is a custom schema, not Tiled JSON

Make a custom, versioned, typed schema the committed file, and convert it to Tiled's shape in memory at load time. Using Tiled's TMJ as the source of truth has real costs. **Phaser's Tiled parser requires embedded tilesets and rejects "collection of images" tilesets** ([Phaser tilemaps skill doc](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md)), so every map would duplicate tileset definitions and every tileset tweak would rewrite every map. Global `firstgid` arithmetic makes theme swaps noisy. Path graphs, waves and terrain rules would become stringly-typed property arrays ([Tiled JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)). Sprite Fusion shows the TMJ route works for plain tilemaps ([Phaser News](https://phaser.io/news/2026/08/sprite-fusion-tilemap-editor-phaser)), but plain tilemaps are not this project's problem. A shared `map-runtime` adapter builds the Tiled-shaped object from the logical map, the theme and the tileset files, then feeds Phaser's parser, so native animation still works. One step is unverified: the exact Phaser 4.2 API for injecting an in-memory Tiled object, likely `cache.tilemap.add` followed by `make.tilemap`, and whether animations survive that path. It is the first spike to run.

This report prefers building at load over the alternative of pre-baking a Tiled JSON per theme and committing it. Committed baked files triple every diff and can desync from the logical map. If load time ever matters, pre-bake as an uncommitted build artifact. One deliberate exception to "never store derived data" is worth adopting as a test rather than a file: a CI golden snapshot of each map's compiled routes. A compiler change that alters what an existing map means then shows up in review.

Make serialization git-friendly. Each grid row is a string on its own line with a legend (`"rows": ["..~~==..", ...]`). Key order is fixed. Record arrays are sorted by stable key, except where order carries meaning, as with waves. Use LF endings (enforced in `.gitattributes`), and no base64 or compression. A round-trip test asserts `print(parse(file)) === file` byte for byte. IDs are a short prefix plus 6–8 random characters, generated once. Tiled-style `nextobjectid` counters would collide when two branches add objects in parallel. Versioning follows the save-systems skill. Every file carries an integer `schemaVersion`. Pure vN→vN+1 migrations are kept forever. Files newer than the code are refused. A corpus of real old files acts as a regression net. Zod schemas give runtime validation plus inferred types shared by the editor and the game. Optionally publish a JSON Schema, as LDtk does ([LDtk JSON](https://ldtk.io/json/)).

### Saving goes through a dev-server plugin, not the browser's file API

**The File System Access API is still Chromium-desktop-only in October 2026: Firefox (Mozilla calls it "harmful"), Safari, iOS and Chrome for Android don't support it, which covers about 30% global usage** ([caniuse](https://caniuse.com/native-filesystem-api)). The primary save path should therefore be a Vite dev-server plugin (`configureServer`, `apply: 'serve'`) ([Vite plugin API](https://vite.dev/guide/api-plugin)). It binds to localhost, accepts writes only under `maps/`, re-validates with the same Zod schema, prints deterministically and writes atomically (temp file, then `.bak`, then rename, since a rename that replaces a file isn't guaranteed atomic on Windows). It works in every browser because collaborators run it inside their own clone, then commit with normal git. The dev server may show `git status` but never commits. All storage sits behind a `MapStorage` interface (`list`, `load`, `save(id, doc, {expectedHash})`). File System Access becomes an optional Chromium backend, download and upload a universal fallback, and a hosted API a possible later backend that needs no UI changes.

Autosave writes to IndexedDB about 1–2 s after each committed transaction, in a three-slot ring per map stamped with the hash of the on-disk file it was based on. If that file has since changed through `git pull`, recovery offers "restore as copy" instead of clobbering a teammate's work. Before export, validation blocks on errors and shows a summary of what changed.

### Input and testing

Editor tools should run on DOM pointer events through a tool controller that converts screen coordinates to world coordinates. That keeps tools testable and decoupled from Phaser scenes, leaving Phaser input to the game during playtest. The controller handles several browser details:

- `touch-action: none` on the canvas.
- A non-passive wheel listener that blocks Ctrl+wheel page zoom.
- A suppressed context menu, so right-click can act as eyedropper or eraser.
- Pointer capture, so strokes continue outside the canvas.
- Coalesced pointer events plus Bresenham interpolation, so fast strokes leave no gaps.

Zoom moves in integer steps around the cursor. Shortcuts go through a named-action binding table with rebinding and conflict detection, following the user's input-systems skill, and are skipped while focus is in a text field.

Testing concentrates on pure logic in the shared packages, using Vitest:

- The autotile resolver, table-tested over all 256 masks.
- Path-compiler fixtures for splits, merges, crossings, dead ends and cycles.
- A property test that N random strokes followed by N undos restore the document byte for byte.
- The migration corpus.
- Serializer golden files.

Playwright screenshot tests should be few. **Playwright warns that rendering varies with host OS, hardware and headless mode, so baselines must be generated where the tests run** ([Playwright](https://playwright.dev/docs/test-snapshots)). Run them in one pinned Linux Chromium container with a frozen animation clock, and assert on exposed game state rather than pixels wherever possible.

### Repo layout: a separate app in the same repo

The user describes a standalone editor feeding a separate game repo. The strongest form of that is a **separate app inside the game's repo**, not a separate repo. Maps, tilesets, the enemy and terrain registries and the pinned Phaser version all live in the game repo. One pull request can then change the schema, add a migration, re-save maps and update the loader atomically, and the dev-server save path writes straight into `maps/`. A separate editor repo is workable but costs more. The shared packages must be versioned and published or pulled in as submodules. The save path must point at a configured sibling clone. Schema changes span two pull requests.

```
/apps/game              Phaser 4 game: imports map-format, map-runtime, sim, content
/apps/map-editor        Vite + React + Phaser viewport; dev-server save plugin; imports the game scene for playtest
/packages/map-format    Zod schema, types, migrations, deterministic printer, validators, CLI (no Phaser)
/packages/pathing       path compiler, route enumeration, arc-length tables (no Phaser)
/packages/sim           deterministic fixed-step simulation shared by game, editor and CI (no Phaser)
/packages/autotile      RMXP pattern tables and resolver (no Phaser)
/packages/map-runtime   logical map + theme -> Tiled-shaped object -> Phaser layers and sprites (Phaser peer dependency, exact pin)
/content                terrain-types, stamp kinds, enemies, towers (IDs that validation resolves)
/themes                 *.theme.json
/maps                   *.map.json, *.waves.json
/assets/atlases         generated per-theme atlases + tileset JSON + credits.json (built from the private asset repo)
/fixtures/maps/vN       migration corpus, never deleted
```

## Ten downloads a week makes art the critical path

### Who the catalog depends on and what they allow

The catalog is concentrated and mostly credit-required. **It has 131 distinct artists, the top ten account for 419 of 711 rows (59%), and 578 rows (81%) carry the ☆ "credit required" mark** ([tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)). Terms on sampled pages fall into four buckets:

- **Explicit licences.** ditto209's Winter Tileset is CC BY 3.0, and Magiscarf's mastersheet is CC BY-NC-SA 3.0, which means derivatives must carry the same licence ([ditto209](https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260); [Magiscarf](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390)).
- **Non-commercial with credit, in prose.** Ekat99 and TheDeadHeroAlistair use this form, and KingTapir uses a "Personal Use License" ([Ekat99](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036); [KingTapir](https://www.deviantart.com/kingtapir/art/Alola-Tile-Dump-7-873115278)).
- **Credit only.** J-Treecko252 says "Free to Edit/Use, just give credit" ([J-Treecko252](https://www.deviantart.com/j-treecko252/art/Apartment-Building-Tiles-01-903544904)).
- **No terms at all.** Aveontrainer's PokeCenter is an example ([Aveontrainer](https://www.deviantart.com/aveontrainer/art/PokeCenter-966014361)).

**No sampled artist addressed redistributing the raw sheet.** DeviantArt's ToS says others' content should not be copied without the owner's consent ([DeviantArt ToS](https://www.deviantart.com/about/policy/service/)). The safe reading is that use in a game with credit is granted, while re-hosting whole raw sheets, which a public git repo amounts to, is not. Only about 12 of 131 artists' pages were sampled, and terms vary per deviation, so the catalog's ☆/❉ flag is a prior, not a licence. Credit every artist regardless of the flag. It costs nothing and matches community norms.

### Acquisition must be on demand, bundle-first and quota-respecting

**DeviantArt's March 9, 2026 update caps free downloads at 10 a week for free and Core Basic accounts, 150 for Core+/Pro/Pro+, and 300 for Core Max (doubled on June 28, 2026). The cap is enforced on the API as well as the website** ([DeviantArt team update](https://www.deviantart.com/team/journal/An-adjustments-being-made-to-1307747979); [gallery-dl #9217](https://github.com/mikf/gallery-dl/issues/9217); [Archive Team](https://wiki.archiveteam.org/index.php/DeviantArt)). The same announcement also mentions a "monthly limit of 40", which contradicts the weekly figures, and that contradiction is unresolved.

Previews are no substitute. Ekat99's 128×3600 sheet is served as a 126×3577 preview, a non-integer downscale that breaks the 16 px grid. Magiscarf's 1728×1776 sheet is served as an 882×906 JPEG at quality 70 with no alpha ([Ekat99](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036); [Magiscarf](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390)). At 10 a week, all 613 DeviantArt items would take roughly 61 weeks, and the human time for the full catalog is an estimated 25–45 hours. Ingesting everything is the wrong goal.

Start from artist bundles instead. **Ekat's Public Gen 3 Tilesets bundle on Eevee Expo holds 81 sets plus a per-set credits file, and it redirects to MediaFire without a login** ([Eevee Expo 621](https://eeveeexpo.com/resources/621/)). It notes that the tiles are native 16 px and must be doubled for Essentials. After the bundles, download manually while logged in, within the quota. Optionally buy one month of Core+ to speed this up. Using gallery-dl, the API or the tokenised CDN URLs in the page HTML to get around the quota would breach the ToS and the API licence ([DeviantArt API terms](https://www.deviantart.com/about/policy/api/)). A local helper script should watch a `downloads/` inbox and do the bookkeeping without fetching anything itself:

- Match each file to its catalog row; DeviantArt filenames embed the title slug, the artist and the deviation code.
- Record the sha256, the dimensions and a dated snapshot of the terms text.
- Reject JPEG previews.
- Detect the native tile size.

Skip ad-shortener download links such as skatefilter5's ([skatefilter5](https://www.deviantart.com/skatefilter5/art/Main-Trees-891202430)).

The starter set for one summer map plus its winter variant needs about 25–40 items, of which about 15–25 are DeviantArt downloads, roughly two to three weeks on a free account:

- **Outdoor base.** Ekat's bundle, or TheDeadHeroAlistair's Project Heliodor megasets for a lower share of rips.
- **Water.** Autotiles from Eevee Expo, such as IgnathiusNZX's river and lake set ([Eevee Expo 1604](https://eeveeexpo.com/resources/1604/)).
- **Trees and paths.** J-Treecko252's sheets.
- **Winter.** ditto209's CC BY winter set and CinnaYva's Gen 3 Snow Tileset ([Eevee Expo 1631](https://eeveeexpo.com/resources/1631/)).

Choosing the starter set from the grid-aligned half of the catalog has a second payoff. Version one needs only grid slicing and autotile expansion, and the loose-sheet cutter can wait.

### Credits are transitive and should be generated

The community norm is to credit every resource you didn't make, as "Resource – Creator" lines under a Credits heading ([PokéCommunity summary](https://www.mintlify.com/espparki1/PokemonValhalla/resources/credits)). Credits are also transitive. Ekat99's sheet credits Vurtax, Heartlessdragoon, Heroalistar and Zein, and TheDeadHeroAlistair asks users to credit the tree artists he edited ([TheDeadHeroAlistair](https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Trees-Megaset-895896602)). Each pack should therefore carry a provenance manifest: source URL and ID, retrieval date, file hash and dimensions, a dated terms snapshot (descriptions change), licence, an exact credit line, upstream credits, commercial, edit and raw-redistribution status, `ripped_from_official` and visibility. The build walks every shipped map, resolves the tiles used to their packs, and emits a `credits.json` that the game's credits scene renders. An unused pack never appears and a used pack can never be missing. CI fails if a used pack lacks a credit line or has licence status `unknown`.

### Branding drives takedown risk more than tiles do

Enforcement against free Pokémon fan games is selective but continuing:

| Year | Action | Source |
|---|---|---|
| 2011 | Pokémon Tower Defense pulled from the Android Market after 120,000+ downloads | [DroidGamers](https://www.droidgamers.com/2011/03/31/pokemon-tower-defense-pulled-off-the-android-market-faster-then-we-thought-it-would-but-has-a-new-home/) |
| 2016 | Pokémon Uranium hit with DMCA notices weeks after 1.5M+ downloads | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| 2016 | Nintendo notice covering 562 Game Jolt games, citing the host's ads | [Engadget](https://www.engadget.com/2016-09-05-nintendo-issues-dmca-takedown-for-hundreds-of-fan-games.html) |
| 2018 | Takedown of Pokémon Essentials itself, attributed to its reuse of official assets | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| 2021 | 379 more Game Jolt fan games removed | [Nintendo Life](https://www.nintendolife.com/news/2021/01/nintendo_issues_mass_dmca_takedown_379_fan-made_games_forcibly_removed) |
| 2024 | Relic Castle forum shut down after a DMCA notice | [Kotaku](https://kotaku.com/pokemon-fan-games-relic-castle-shutdown-dmca-reason-1851359618) |
| 2025 | Copyright claims against "Pokémon FPS" footage within a week | [GamesHub](https://www.gameshub.com/news/news/pokemon-fps-fan-game-11618/) |

Former TPC chief legal officer Don McGowan says press coverage is the worst thing for a fan project, and that TPC engages with crowdfunding once it succeeds ([Aftermath](https://aftermath.site/pokemon-lawyer-cease-desist-fan-project-pikachu-movie)). Nintendo told shareholders in 2024 that its IP policy will not change ([Nintendo Life](https://nintendolife.com/news/2024/07/nintendo-on-inappropriate-use-of-its-ip-and-games-action-must-be-taken)).

The risk ranking follows from those triggers. From highest to lowest: monetization of any kind (donations included), the Pokémon name or logo in the title or domain, official sprites, cries or music, press and streamer attention, hosting on ad-funded portals, shipping ripped official tiles, and original Gen 3-style fan tiles. **Within the tileset layer, rips are the material risk.** The Spriters Resource disclaims any rights over its rips ([TSR FAQ](https://spriters-resource.com/page/faq)). The catalog has 17 "Ripped" rows, and several "fan" sheets openly contain FRLG and RSE rips, including Ekat99's credited rippers and Phyromatical's "Pokemon League ripped". Rip packs should be flagged `private-only` by default, and ROM-patch resources treated as official derivatives. Original fan tiles also survive a forced rebrand to a non-Pokémon "monster TD"; rips do not. A free Phaser game with Pokémon creatures still infringes in a strict sense. The realistic aim is to lower both the probability and the impact of a takedown. This is not legal advice.

## Recommended design: one logical map, many derived views

### Data model sketch

The committed files are logical. Visuals, routes, atlases and credits are all derived.

```jsonc
// maps/viridian-forest.map.json: authoritative, theme-free, committed
{
  "format": "ptd-map", "schemaVersion": 1,
  "id": "viridian-forest", "name": "Viridian Forest", "seed": 48213,
  "grid": { "width": 40, "height": 24, "tileSize": 32 },
  "themes": { "default": "summer", "supported": ["summer", "winter"] },
  "registries": { "terrain": "terrain@3", "kinds": "kinds@7", "enemies": "enemies@2026.10" },
  "terrain": {                                   // one logical kind per cell
    "legend": { ".": "grass", "~": "water", "^": "cliff", "=": "path_dirt", "m": "path_mud" },
    "rows": ["........~~~~..........==..............", "..."]
  },
  "path": {                                      // directed out-mask per cell, written by strokes
    "encoding": "outmask-hex:N=1,E=2,S=4,W=8;.=none",
    "layers": [{ "id": "ground", "z": 0, "targetable": true, "out": ["......2222224.........", "..."] }],
    "junctions": [{ "cell": [6, 3], "kind": "junction", "policy": { "type": "alternate", "resetEachRound": true } }]
  },
  "spawns": [
    { "id": "spawn_west", "cell": [0, 3], "kind": "ground", "edge": "W", "active": { "type": "always" } },
    { "id": "sky_north", "pos": [10.5, -0.5], "kind": "air" }
  ],
  "exits":     [{ "id": "exit_east", "cell": [39, 5], "edge": "E", "livesMultiplier": 1 }],
  "airRoutes": [{ "id": "air_main", "from": "sky_north", "to": "exit_east", "mode": "polyline",
                  "points": [[10.5, -0.5], [16.5, 2.5], [40.5, 5.5]] }],
  "zones":     [{ "id": "z_bridge", "rule": "noBuild", "cells": [[12, 3], [12, 4]] }],
  "modifiers": [{ "id": "m_focus", "kind": "rangeMult", "value": 1.2, "cells": [[9, 7]] }],
  "obstacles": [{ "id": "ob_k3f9a2", "kind": "boulder_2x2", "x": 4, "y": 2, "becomes": "grass",
                  "removal": { "cost": 450, "requires": [], "removable": true } }],
  "objects":   [{ "id": "o_7qd1zz", "kind": "tree_large", "x": 6, "y": 4, "variantSeed": 3 }],
  "decor":     [{ "id": "d_p0c2m1", "kind": "flower_patch", "x": 14, "y": 9 }],    // never blocks
  "autotileOverrides": []                        // rare hand-forced patterns: { cell, terrain, pattern }
}

// maps/viridian-forest.waves.json: references spawn/route IDs; one map may have several wave sets
{
  "format": "ptd-waves", "schemaVersion": 1, "mapId": "viridian-forest", "mapGameplayHash": "sha256:…",
  "difficulties": { "normal": { "hpMult": 1.0, "cashMult": 1.0, "startCash": 650, "lives": 100 } },
  "rounds": [{ "n": 1, "intent": "teach", "bonusCash": 100, "earlySend": { "allowed": true },
    "groups": [
      { "id": "r1_rattata", "enemy": "rattata", "level": 3, "count": 8, "startSec": 0, "intervalSec": 1.0,
        "spawn": "spawn_west", "route": null },
      { "id": "r1_pidgey", "enemy": "pidgey", "level": 3, "count": 4, "startSec": 6, "intervalSec": 1.5,
        "spawn": "sky_north", "route": "air_main", "difficulty": ["normal", "hard"] } ] }],
  "clearCheck": { "simVersion": "sim@1.0.0", "gameplayHash": "sha256:…",
    "results": [{ "difficulty": "normal", "strategy": "noTowers:allRoute", "seed": 1, "passed": true }] }
}

// content/terrain-types.json and content/kinds/*.json: shared gameplay meaning (game repo)
{ "grass":    { "placement": ["land"], "walkable": false, "height": 0 },
  "water":    { "placement": ["water"], "walkable": false },
  "cliff":    { "placement": ["land", "high"], "height": 1, "rangeMult": 1.15 },
  "path_mud": { "placement": ["path"], "walkable": true, "speedMult": 0.7 } }
{ "kind": "tree_large", "footprint": ["...", ".B."], "anchor": { "row": 1, "col": 1 } }

// themes/winter.theme.json: visual only; validator rejects any gameplay key
{ "id": "winter", "inherits": "summer", "baseFill": "snow_fill",
  "terrain": { "path_dirt": { "autotile": "jt_cobble_snow" }, "water": { "autotile": "ice_water" } },
  "objects": { "tree_large": ["tree.round.large.snow"] },          // footprint and anchor must match the kind
  "decor":   { "flower_patch": ["snow_tuft"] }, "postFx": null }

// asset-packs-raw/<pack_id>/pack.json: private repo; feeds the atlas build and credits.json
{ "pack_id": "da-ditto209-winter-tileset-419617260",
  "source": { "site": "deviantart", "url": "…", "retrieved_at": "2026-10-21", "files": [{ "sha256": "…", "w": 256, "h": 672 }] },
  "artist": { "name": "ditto209" }, "upstream_credits": [],
  "license": { "spdx": "CC-BY-3.0", "credit_line": "Winter Tileset by ditto209 (CC BY 3.0)", "status": "ok",
               "terms_snapshot": "raw/terms_2026-10-21.txt", "raw_redistribution": "unspecified" },
  "ripped_from_official": "none", "format": { "kind": "tileset", "native_tile_px": 16, "scale": 2 },
  "visibility": "public-ok" }
```

The gameplay hash is computed over canonicalised terrain, path, markers, zones, modifiers, obstacles, object footprints and the wave file. Decor and themes are excluded, so a seasonal skin never needs re-verification.

### Feature list

| Area | First version (MVP) | Later |
|---|---|---|
| Canvas and tools | 32 px grid, integer zoom, pan; pencil, line, rectangle and flood fill; explicit eraser; eyedropper; transaction undo and redo; hover tooltip with cell, terrain and buildable reason | Marquee selection with layer filter, copy and paste across tabs, flip; scatter brush; half-cell decor snapping |
| Terrain and autotile | Logical terrain grid; RMXP blob-47 resolver with live 3×3 re-shaping; priority-ordered overlays on a base fill; deterministic grass variants | Missing-transition warnings; forced-pattern overrides; edge-set fences |
| Enemy paths | Stroke-recorded out-masks with elbow insertion; chevrons; one or more spawns and exits; splits and merges with `alternate` default; live path errors | Policy editor (weighted, byRound, pinned routes); crossings; bridge and tunnel layers; flip and connect tools |
| Flying routes | Straight spawn-to-exit air routes | Polyline editing, smoothing, no-fly zones |
| Terrain rules | Registry-driven placement tags; water-only; no-build zones; computed buildable overlay with opacity slider | Removable obstacles with tiers and ability gates; range-modifier tiles; height bonus; line of sight |
| Objects | Stamp kinds with footprint and role masks; ghost preview green/red with reason; y-sorted overhangs | Cycle-variant, context menu, forgiveness snapping, canopy-over-path warnings |
| Waves | Form editor: rounds → groups (enemy, level, count, start, interval, spawn, route) | Swimlane timeline, difficulty overlays, HP, cash and arrival-rate charts, telegraphs, freeplay |
| Validation and clear check | Schema, integrity and path-graph errors block export; problem list with click-to-focus; no-tower "all groups route" simulation | Coverage heatmap, test-tower stamp, metrics dashboard, greedy bot, replays, per-route stress |
| Playtest | "Play from wave N" in the real game scene with the in-memory map; Esc returns with state intact | Speed controls, spawn injection, god mode, last-run trails and leak markers |
| Themes | One theme (summer) through the theme-pack indirection | Winter theme, inherit and fallback chain, image-offset fast path, gameplay-hash display, night tint |
| Assets | Node importer: 32 px slicing, ×2 upscale, RMXP autotile expansion, strips; pack.json manifests; per-theme atlas build; credits.json | Loose-sheet stamp cutter with colour-key, MV ÷3×2 conversion, inbox matcher, pack-swap remapping |
| Storage | Dev-server plugin save and load into `maps/`; deterministic printer; IndexedDB autosave ring | File System Access backend, hosted backend, persisted undo history |
| Feel | Place, erase and refuse sounds; pop and wobble animations | Pitch-varied stroke sounds, optional editor music, budget meter |

## Build plan: ship one playable map before any polish

The order follows two facts. Acquiring assets at 10 downloads a week runs on the calendar, not on engineering effort, so it starts on day one in parallel with code. The riskiest technical unknown is whether Phaser 4.2 accepts an in-memory Tiled object with working tile animations, so that gets settled before anything is built on it.

| Phase | Goal | Contents | Exit criterion |
|---|---|---|---|
| 0. Spikes and setup | Remove the unknowns | Confirm the game's Phaser version and bundler; set up workspace packages; spike the in-memory Tiled injection with an expanded Essentials water autotile and check frame timing; make the game scene accept a map object as well as a URL; start downloading the starter packs (bundles first) | A hard-coded logical map renders with animated water in the game and the editor viewport through `map-runtime` |
| 1. MVP: first playable map | End-to-end loop on one map | Everything in the MVP column: terrain and path painting with live autotiles, spawns and exits, buildable overlay, stamp placement, wave form, blocking validation, dev-server save, autosave, playtest round-trip, Node importer and atlas build for about 25–40 grid-aligned packs, credits.json | A designer builds a 40×24 map from scratch, it passes validation, saves into `maps/`, playtests in the real scene, and the committed file loads in the shipped game identically |
| 2. Full gameplay authoring | Every confirmed scope item | Multiple splits and merges with all policies and pinned routes; flying polylines; removable obstacles; range modifiers; swimlane wave timeline and balance charts; the no-tower clear check as an export gate; CI validation of all maps plus route golden snapshots | A BTD6-style multi-entrance map with a flier wave and tiered removables validates, simulates and plays |
| 3. Seasonal themes | Winter without touching gameplay | Theme packs with inherits and fallbacks; winter art via kind mappings and image-offset sheets; theme switcher in the editor; gameplay-hash display; per-theme atlases | Switching summer to winter changes every visual and leaves the gameplay hash and clear-check record valid |
| 4. Mario Maker feel | Speed and delight | Ghost reasons and forgiveness snapping; test-tower stamp and coverage heatmap; marquee copy and paste; palette pin, recent and search; sounds and micro-animations; last-run trails; budget meter | Designers prefer the editor over hand-editing JSON for every change |
| 5. Depth | Long-term content updates | Greedy bot and replay clear checks; bridges and tunnels; line of sight; loose-sheet cutter; pack-swap tool for removing rips; optional File System Access or hosted backend | A rip-free rebuild of every shipped map is one remapping pass |

## Decisions only the project owner can make

| Decision | Options | Default this report would pick | What it blocks |
|---|---|---|---|
| Game's Phaser version | Migrate the game to Phaser 4.2.x / pin the editor to 3.90 with a hand-written tile-animation shim | Migrate to 4.2.x; parity matters more than the version | Phase 0, all rendering work |
| Editor location | Separate app in the game repo / separate repo consuming published packages | Same repo, separate app | Repo layout, save path, CI |
| Public or private game repo; raw sheet storage | Public game repo + private asset repo / everything private | Private raw-pack repo; public repo gets only atlases and credits.json | Asset pipeline, licensing exposure |
| Map size and camera | Fixed single-screen maps (PTD-like) / scrolling larger maps | Fixed size per map, 32 px tiles, integer zoom 1–2 | Grid limits, UI layout, atlas budgets |
| Tower footprint and placement classes | All towers 1×1 / some 2×2; which classes (land, water, high, path) exist | 1×1 towers; land, water and high classes | Buildable rule, overlay colours, validation |
| Branch default and counter reset | Alternate per junction (BTD6) / weighted / pinned routes only; reset each round or not | Alternate, reset each round | Path compiler, reproducible balancing |
| Crossings, bridges and tunnels in scope | Flat crossings only / layered paths | Flat crossings in phase 2; layers later | Path data model |
| Removal currency | Cash with tiers / Pokémon ability (Cut, Rock Smash) / both | Cash first, ability gate as an option | Obstacle schema, game economy |
| Range and height numbers | Multiplicative per-terrain `rangeMult` plus a global height table / additive tiles | Multiplicative, with values from playtests | Terrain registry, previews |
| Candy-stealing or return-trip enemies (PTD-like; mechanic unverified) | None / enemies walk back along their route carrying items | Decide before phase 2; reverse traversal fits the arc-length model | Route semantics, targeting |
| Clear-check strictness | Static validation only / plus no-tower simulation / plus bot pass per difficulty | Static plus no-tower simulation blocks export; bot pass as a badge | Export flow, CI |
| Rip policy | Exclude ripped packs from public builds / allow with flags | Exclude by default | Starter-pack choice, Ekat bundle usage |
| Branding and hosting | Pokémon name in title or domain / neutral working title; own static host / portal | Neutral title, own ad-free static host, no donations, clear non-affiliation disclaimer | IP risk profile |
| Acquisition budget | Free account (10 a week) / one month of Core+ (150 a week) | Free account plus bundles; Core+ only if the schedule demands it | Phase 1 timing |
| Collaborators | Solo / several editors on branches | Design for several (random IDs, autosave hash checks) | Storage and merge behaviour |
| Launch themes | Summer only / summer + winter / plus night tint | Summer at launch, winter as the first seasonal update | Phase 3 scope |

## Conclusion

The research reframes the request. A Super Mario Maker-quality map maker for this game is mostly a data-modelling problem. Once gameplay lives in semantic grids with directed path cells and theme-free kinds, the features that look hard fall out as consequences: neighbour-aware autotiling, trivially correct undo, seasonal updates that provably change nothing about play, a gameplay hash that keeps clear checks valid across reskins, and a clear check that is cheap because the editor and game run one shared, Phaser-free simulation. The most important line in the codebase is therefore the package boundary between the logical map plus its rules and anything that touches Phaser. Every time the game and editor disagree about what a map means, that boundary has leaked.

The schedule risk is not where engineers usually look. DeviantArt's quota, its unusable previews and the third of the catalog with no tile grid make art throughput and provenance the critical path. The cheapest mitigation is a planning choice, not code: start downloads on day one, take bundles first, and pick the first map's art from the grid-aligned half of the catalog so the first version needs no hand-slicing. The tileset choices matter less for legal exposure than branding does. Keeping rips out of public builds is still worth the discipline, because it is what lets the project survive a forced rebrand with its maps intact.
