# Tilesets, Autotiling, Multi-tile Objects, Seasonal Themes and Phaser Rendering for the TD Map Editor

Scope: what the catalog's art actually is (RPG Maker XP / Pokémon Essentials tilesets, autotiles, animated tiles), the exact RMXP autotile composition algorithm, which autotiling model the editor should use, how to define multi-tile objects and swappable themes, and the Phaser-side rendering constraints. Research date: 21 Oct 2026. Sourced facts are in "Cited Findings"; my own reasoning and recommendations are in "Inferences".

---

## 1. RPG Maker XP tileset format as used by Pokémon Essentials

### Takeaway
An Essentials map cell holds 3 tile IDs, one per layer. IDs 1–383 point into 7 autotiles (48 IDs each, with 0–47 left empty) and IDs ≥384 index a 32px-tile, 8-column (256px-wide) tileset image. Per-tile metadata is three tables stored in `Data/Tilesets.rxdata`, not in PBS: `passages` (4 direction-block bits plus bush 0x40 and counter 0x80), `priorities` (0 = under characters, 1–5 = drawn above by row), and `terrain_tags` (Essentials defines IDs 0–17).

### Cited Findings
- **Tile size.** Essentials sets `TILE_WIDTH = 32` and `TILE_HEIGHT = 32` on `Game_Map`. The renderer has `SOURCE_TILE_WIDTH = 32`, plus `DISPLAY_TILE_WIDTH` and `ZOOM_X = DISPLAY_TILE_WIDTH / SOURCE_TILE_WIDTH` for display scaling — [Essentials Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb); [Essentials TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)
- **ID space.** `AUTOTILES_COUNT = 8   # Counting the blank tile as an autotile`, `TILES_PER_AUTOTILE = 48`, and `TILESET_START_ID = AUTOTILES_COUNT * TILES_PER_AUTOTILE` (= 384). Regular tiles are cut from the tileset at `x = ((id-384) % 8) * 32`, `y = ((id-384) / 8) * 32`, so the sheet is 8 tiles (256px) wide. The autotile index is `(id / 48) - 1` and the pattern is `id % 48`. Id 0 is empty — [Essentials TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb); [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)
- **7 autotile slots per tileset.** `TileDrawingHelper.fromTileset` loads `7.times { pbGetAutotile(tileset.autotile_names[i]) }` — [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **Three map layers.** Each cell gets `Array.new(3) { TileSprite.new(@viewport) }` and reads `map.data[tile_x, tile_y, layer]`. The minimap code loops `3.times do |z|` over `map.data[x, y, z]` — [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb); [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **Priority and draw order.** `priority = map.priorities[tile_id] || 0`, then `tile.z = (priority == 0) ? 0 : (y * SOURCE_TILE_HEIGHT) + (priority * SOURCE_TILE_HEIGHT) + SOURCE_TILE_HEIGHT + 1`. Priority 0 tiles sit at z=0, under characters. Priority N tiles are y-sorted as though they were N rows lower, so a character standing up to N rows below the tile is drawn behind it. Reflection tiles get z=-100, and bridges get z=0 while the player is on a bridge. The layer index does not enter the z calculation — [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)
- **Passage bits.** The direction bit is `(1 << ((d / 2) - 1)) & 0x0f` with d = 2/4/6/8 (down/left/right/up), giving 0x01 = down, 0x02 = left, 0x04 = right, 0x08 = up. A set bit blocks that direction, and `passage & 0x0f == 0x0f` means fully impassable. Layers are checked from the top (2, 1, 0), and a layer whose tile has priority 0 and no blocking bits returns passable — [Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb)
- **Bush and counter flags.** `bush?` returns true if `@passages[tile_id] & 0x40 == 0x40`, which hides the lower part of characters in tall grass. `counter?` tests `passage & 0x80 == 0x80`. `deepBush?` needs both the 0x40 bit and a terrain tag with `deep_bush` — [Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb)
- **Terrain tags in current Essentials (`GameData::TerrainTag`).**

  | ID | Tag | Flags |
  |---|---|---|
  | 0 | None | |
  | 1 | Ledge | |
  | 2 | Grass | shows grass rustle, land encounters |
  | 3 | Sand | |
  | 4 | Rock | |
  | 5 | DeepWater | surf, fish, dive |
  | 6 | StillWater | surf, fish, reflections |
  | 7 | Water | surf, fish |
  | 8 | Waterfall | |
  | 9 | WaterfallCrest | |
  | 10 | TallGrass | deep_bush, double encounters, must_walk |
  | 11 | UnderwaterGrass | |
  | 12 | Ice | ice, must_walk_or_run |
  | 13 | Neutral | ignore_passability |
  | 14 | SootGrass | |
  | 15 | Bridge | |
  | 16 | Puddle | reflections |
  | 17 | NoEffect | |

  — [Essentials 011_TerrainTag.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/010_Data/001_Hardcoded%20data/011_TerrainTag.rb)
- **Storage.** The tileset database (graphic name, autotile names, `passages`, `priorities`, `terrain_tags` tables) lives in RMXP's `Data/Tilesets.rxdata`, a Ruby Marshal file. Essentials' in-game Terrain Tag editor calls `load_data("Data/Tilesets.rxdata")` and on confirmation `save_data(@tilesets_data, "Data/Tilesets.rxdata")`. `Game_Map` reads `tileset.passages`, `tileset.priorities` and `tileset.terrain_tags` from it — [Essentials EditorScreens_TerrainTags.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/020_Debug/001_Editor%20screens/002_EditorScreens_TerrainTags.rb); [Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb)
- **Large tilesets.** Essentials wraps tall 256px-wide tilesets into several columns when the height exceeds the GPU max texture size (`MAX_TEX_SIZE = (Bitmap.max_size / 1024) * 1024`). It raises `"Tileset is too long!"` if even the wrapped version will not fit — [Essentials TilesetWrapper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/002_TilesetWrapper.rb)
- **Versions.** The latest GitHub release of Essentials is `v21.1`, published 2023-07-31 — [GitHub releases API / Essentials releases](https://github.com/Maruno17/pokemon-essentials/releases)

### Inferences
- The `.rxdata` files are Ruby Marshal. Nearly every catalog asset is a bare PNG with no `Tilesets.rxdata`, so passage, priority and terrain data must be authored in our editor. Do not plan around importing `.rxdata`; at most it is an optional "import Essentials project" feature.
- Map RMXP concepts onto TD gameplay like this:
  - passage → `buildable` / `walkable` flags. A TD has no 4-direction passage, so collapse the bits into a single `blocked` flag.
  - priority → the "overhang above units" flag.
  - terrain tag → logical terrain kind.
  - bush flag → "unit lower body hidden", useful for tall grass.
- Essentials' z formula (z = y·32 + priority·32 + 33) is a concrete y-sort rule we can copy: a priority-N tile is sorted as if it sat N rows lower.

### Gaps
- I could not reach the Essentials wiki (essentialsdocs.fandom.com returned HTTP 402) to confirm it matches the source code. The facts above come from the current GitHub `master` source, not the docs.
- I did not verify whether an Essentials release newer than v21.1 exists outside GitHub (for example on Eevee Expo) as of Oct 2026.
- The RMXP tileset database also has panorama, fog and battleback fields, and RMXP's built-in terrain tags only go 0–7. Neither was verified from a primary source this session.

---

## 2. The RMXP autotile format, its 48-pattern composition table, animation, and VX/Ace/MV/MZ formats

### Takeaway
An RMXP autotile frame is 96×128px: a 6×8 grid of 16×16 quarter mini-tiles, numbered 1–48 row by row. Each of 48 patterns (47 real neighbor configurations plus one palette icon) is drawn from 4 mini-tiles placed TL, TR, BL, BR. The editor can copy Essentials' `AUTOTILE_PATTERNS` and `NEIGHBORS_TO_AUTOTILE_INDEX` tables (reproduced below), which I checked are exactly equivalent to a quarter-tile rule. Animated autotiles repeat the 96px frame horizontally (frames = width/96). A 32px-tall autotile is a non-autotiling animated single tile (frames = width/32). Essentials defaults to 0.25 s per frame, and a `[x]` filename suffix overrides it.

### Cited Findings
- **Mini-tile addressing.** `tile_position = tiles[i] - 1; src = ((tile_position % 6) * 16 + anim, (tile_position / 6) * 16, 16, 16)` with `anim = frame * 96`. The destination for quarter i is `(i % 2, i / 2)`, so the order is TL, TR, BL, BR. When `autotile.height == 32` the autotile is a single 32×32 tile and `anim = frame * 32` — [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **`AUTOTILE_PATTERNS`, verbatim from Essentials.** Indexed `[id >> 3][id & 7]`, i.e. pattern 0–47 in row-major order of the 8×6 layout:
  ```
  p0-7:   [27,28,33,34] [5,28,33,34] [27,6,33,34] [5,6,33,34] [27,28,33,12] [5,28,33,12] [27,6,33,12] [5,6,33,12]
  p8-15:  [27,28,11,34] [5,28,11,34] [27,6,11,34] [5,6,11,34] [27,28,11,12] [5,28,11,12] [27,6,11,12] [5,6,11,12]
  p16-23: [25,26,31,32] [25,6,31,32] [25,26,31,12] [25,6,31,12] [15,16,21,22] [15,16,21,12] [15,16,11,22] [15,16,11,12]
  p24-31: [29,30,35,36] [29,30,11,36] [5,30,35,36] [5,30,11,36] [39,40,45,46] [5,40,45,46] [39,6,45,46] [5,6,45,46]
  p32-39: [25,30,31,36] [15,16,45,46] [13,14,19,20] [13,14,19,12] [17,18,23,24] [17,18,11,24] [41,42,47,48] [5,42,47,48]
  p40-47: [37,38,43,44] [37,6,43,44] [13,18,19,24] [13,14,43,44] [37,42,43,48] [17,18,47,48] [13,18,43,48] [1,2,7,8]
  ```
  — [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **Neighbor mask.** `tableNeighbors` sets N=0x01, NE=0x02, E=0x04, SE=0x08, S=0x10, SW=0x20, W=0x40, NW=0x80 when the neighbor holds the same tile ID. Out-of-map coordinates are clamped to the edge (`xp1 = [x+1, xsize-1].min` and so on), so the map border counts as "same terrain". `NEIGHBORS_TO_AUTOTILE_INDEX` (256 entries) converts the mask to a pattern:
  ```
  46,44,46,44,43,41,43,40,46,44,46,44,43,41,43,40, 42,32,42,32,35,19,35,18,42,32,42,32,34,17,34,16,
  46,44,46,44,43,41,43,40,46,44,46,44,43,41,43,40, 42,32,42,32,35,19,35,18,42,32,42,32,34,17,34,16,
  45,39,45,39,33,31,33,29,45,39,45,39,33,31,33,29, 37,27,37,27,23,15,23,13,37,27,37,27,22,11,22, 9,
  45,39,45,39,33,31,33,29,45,39,45,39,33,31,33,29, 36,26,36,26,21, 7,21, 5,36,26,36,26,20, 3,20, 1,
  46,44,46,44,43,41,43,40,46,44,46,44,43,41,43,40, 42,32,42,32,35,19,35,18,42,32,42,32,34,17,34,16,
  46,44,46,44,43,41,43,40,46,44,46,44,43,41,43,40, 42,32,42,32,35,19,35,18,42,32,42,32,34,17,34,16,
  45,38,45,38,33,30,33,28,45,38,45,38,33,30,33,28, 37,25,37,25,23,14,23,12,37,25,37,25,22,10,22, 8,
  45,38,45,38,33,30,33,28,45,38,45,38,33,30,33,28, 36,24,36,24,21, 6,21, 4,36,24,36,24,20, 2,20, 0
  ```
  — [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **mkxp-z uses the same scheme.** `atInd = tileInd / 48 - 1`, `subInd = tileInd % 48`, `autotileRects[subInd*4]`, with four 16×16 pieces per 32×32 cell. Its constants are `autotileW = 3*32` (96), `autotileH = 4*32` (128), `atFrames = 8` and `atFrameDur = 15`; the frame advances every 15 `Tilemap::update` calls. Frame count is `width/96`, or `width/32` for 32px-high autotiles. Static autotiles are copied into all 8 atlas slots, so mkxp-z caps autotile animation at 8 frames — [mkxp-z tilemap.cpp](https://github.com/mkxp-z/mkxp-z/blob/dev/src/display/tilemap.cpp)
- **Essentials frame timing.** `AUTOTILE_FRAME_DURATION = 5   # In 1/20ths of a second` gives 0.25 s per frame. The comment says "If an autotile's filename ends with "[x]", its frame duration will be x/20". The frame is computed as `((System.uptime - @timer_start) / duration).floor % frames`, i.e. wall-clock time, not ticks — [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)
- **Essentials pre-expands at load time.** `AutotileExpander.expand` turns each 96×128 frame into a 32px-wide column of all 48 composed 32×32 tiles (`frames_count = width / 96`). An image `SOURCE_TILE_HEIGHT * 6` tall (96×192) is an Essentials "expanded format": for patterns 1, 2, 4 and 8 (the four single inner-corner cases) it copies whole hand-drawn 32×32 tiles from rows 4–5 instead of composing quarters — [Essentials AutotileExpander.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/003_AutotileExpander.rb)
- **Extra autotiles.** Essentials' `EXTRA_AUTOTILES` lets a tileset's top tiles be replaced by more autotiles. "Large autotiles" have 48 layouts "in the same 8x6 layout as you see when you double-click on a real autotile in RMXP", and "single tile autotiles" include examples like "Flowers1" and "Waterfall". The comment adds that these are "only useful if the tiles are animated" — [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)
- **The same quarter-tile system is described for MV/MZ** at 48px tiles: four 24×24 mini-tiles, each "ALWAYS goes specifically in a specific corner", and the top-left tile "is used only for the tile selection UI" — [RPG Maker blog: How Autotiles Work](https://rpgmakerweb.com/blog/classic-tutorial-how-autotiles-work)
- **MZ sheet sizes (official MZ help).** Tiles are 48×48.

  | Sheet | Size | Contents |
  |---|---|---|
  | A1 (animations) | 768×576 | ocean, deep sea and water animated by three basic patterns side by side; waterfalls by stacking 3 vertically |
  | A2 (ground) | 768×576 | |
  | A3 (buildings) | 768×384 | |
  | A4 (walls) | 768×720 | |
  | A5 (normal) | 384×768 | 8×16, no autotiles |
  | B–E | 768×768 | 16×16 tiles |

  — [RPG Maker MZ Help](https://rpgmakerofficial.com/product/MZ_help-en/01_11_01.html)
- **VX Ace sizes (community-reported).** 32px tiles. A1 and A2 512×384, A3 512×256, A4 512×480, A5 256×512, B–E 512×512 — [itch.io post](https://itch.io/post/5588876); [itch.io post](https://itch.io/post/5585164). XP, VX and Ace use 32×32 tiles and MV uses 48×48. A commenter notes the VX/Ace and MV/MZ autotile formats are "pretty close to identical" while XP "is quite different" — [itch.io](https://itch.io/post/5588876); [Steam VX Ace thread](https://steamcommunity.com/app/220700/discussions/0/558749824981443170)

### Inferences

#### Verified derivation (my own script check against the tables above)
I ran a script over Essentials' `NEIGHBORS_TO_AUTOTILE_INDEX`. For each of the 256 masks, the pattern is exactly determined by four independent quarter states. Each quarter looks at its two adjacent cardinal neighbors and the diagonal between them (TL: N, W, NW; TR: N, E, NE; BL: S, W, SW; BR: S, E, SE) and takes one of these states:

| State | Condition | TL minis | TR minis | BL minis | BR minis |
|---|---|---|---|---|---|
| outer corner | neither cardinal same | 13 | 18 | 43 | 48 |
| vertical edge | only the N/S cardinal same | 25/37 | 30/42 | 19/31 | 24/36 |
| horizontal edge | only the W/E cardinal same | 15/17 | 14/16 | 45/47 | 44/46 |
| inner corner | both cardinals same, diagonal not | 5 | 6 | 11 | 12 |
| fill | all three same | 27/29/39/41 | 26/28/38/40 | 21/23/33/35 | 20/22/32/34 |

Results:
- 47 distinct state tuples map one-to-one onto patterns 0–46.
- Pattern 47 (`[1,2,7,8]`, the top-left 32×32 icon) is never selected by any neighbor mask.
- Minis 3, 4, 9 and 10 (the top-middle 32×32 of the sheet) are never used.

Sheet layout in 32px tiles:
- Row 0: [icon][unused][inner-corner quad].
- Rows 1–3: a 3×3 "island" block: outer corners, edges, center.

Where a state lists several minis, Essentials chooses among them per pattern so neighbouring quarters come from the same source tile. Using the table verbatim reproduces RMXP's look exactly.

#### Recommendations
- **Import conversion: RMXP autotile to blob-47 is a solved, deterministic step.** For each frame f and pattern p in 0..46, blit the 4 minis from `AUTOTILE_PATTERNS[p]`, offset by f·96, into a 32×32 tile. This is what Essentials' `AutotileExpander` does. At runtime, compute the 8-bit mask and look up `NEIGHBORS_TO_AUTOTILE_INDEX[mask]`. Treat out-of-bounds neighbors as "same" to match RMXP edge behavior.
- **Format detection by dimensions** (heuristic, to confirm with the user in the import wizard):

  | Dimensions | Interpretation |
  |---|---|
  | h=128, w%96==0 | RMXP autotile, frames = w/96 |
  | h=192, w%96==0 | Essentials expanded autotile |
  | h=32, w%32==0 | RMXP single-tile animated strip, frames = w/32. Ambiguous with a 1-row strip; ask |
  | w=256 | RMXP tileset, 32px, 8 columns. Ambiguous with VX Ace A5 at 256×512 |
  | w=128 | 16px-native RMXP-layout sheet, upscale ×2 |
  | h=64, w%48==0 | 16px-native RMXP-style autotile, upscale ×2 |
  | 512×384 / 512×256 / 512×480 / 512×512 | VX/Ace A1–A2 / A3 / A4 / B–E |
  | 768×576 / 768×384 / 768×720 / 384×768 / 768×768 | MV/MZ A1–A2 / A3 / A4 / A5 / B–E |
  | anything else | loose sheet: slice manually or by alpha connected components |

- **Detect native resolution with a pixel-doubling test.** If every 2×2 block is uniform, the art is 16px Gen-3 scaled ×2. I implemented this test and used it on the samples in §3.
- **VX/Ace/MV A2 layout (unverified).** From memory, a VX/Ace/MV A2 ground autotile is a 2×3-tile block: icon, inner corners, then a 2×2 outer ring. If so it can be remapped into the RMXP 3×3-plus-inner-corner mini-tile positions at import. I did not verify this layout from a primary source.
- **Animated autotile timing for our renderer:** default 250 ms per frame, honor a `[x]` suffix as x·50 ms, and do not cap the frame count. The catalog has an 11-frame water autotile (§3), which mkxp-z's 8-frame cap would truncate.

### Gaps
- RMXP's own engine timing. mkxp-z gives 15 updates per frame, and RMXP's default 40 FPS would make that 0.375 s, but I did not verify the 40 FPS default this session.
- I did not find an official Enterbrain document for the VX/Ace A1–A4 internal block layout; only community dimension lists.
- The OpenRGSS `Tilemap` doc page (an alternative reference implementation) returned HTTP 520.

---

## 3. What the actual catalog assets look like (inspection of ~14 entries)

### Takeaway
The catalog is not a uniform RMXP library. A metadata sweep of the 538 DeviantArt entries whose original image dimensions were available finds:
- 33% are 256px RMXP sheets.
- 14% are 128px-wide sheets of 16px-native art in RMXP layout.
- About 35% are loose or unaligned sheets.
- About 35 are RMXP autotiles or animated strips.
- About 17 are MV 48px sheets.

The ~14 sampled entries break down as:
- About half are 32px RMXP-layout sheets (256px wide), mostly Gen-3 16px art scaled ×2 exactly.
- RMXP-format autotiles (96×128 per frame, up to 11 frames) and 32px animated single-tile strips.
- 16px-native loose sheets, sometimes RGB with a baked checkerboard background instead of alpha.
- Large "megasets" (up to 2400×2400).
- MV/MZ 48px sheets.
- A pokeemerald decomp tileset (8×8 4bpp tiles plus metatile binaries).

Credit terms vary per entry: mostly "credit required", often non-commercial. DeviantArt original downloads require login, and the public preview of large images is resized or JPEG-compressed.

### Cited Findings
- **Catalog legend.** Credits column ☆ = "need to credit artist or artists (always check the description under the link …)" (574 rows). ❉ = "no credits needed / not specified, but pls give them credits" (105 rows). 17 rows say "Ripped (up to you)". By source: DeviantArt 613, Eevee Expo 67, The Spriters Resource 18, Reddit 4, others ≤2. By generation: Gen 3 506, Gen 4 53, Gen 5 51 — local file `asset-catalog/tilesets.csv` / `dump.json` (my count)
- **DeviantArt metadata without login.** The public oEmbed endpoint `https://backend.deviantart.com/oembed?url=<deviation URL>` returns JSON with `width`, `height`, `imagetype`, a direct image `url`, tags, pubdate and download counts. For small images the `url` is the original file (`/f/<uuid>/<name>.png?token=…`). For large images it is a resized preview (`…/v1/fill/w_126,h_3577/…-pre.png`, or for 2400×2400 `…/v1/fill/w_894,h_894,q_70,strp/…-pre.jpg`) — [DeviantArt oEmbed (example)](https://backend.deviantart.com/oembed?url=https://www.deviantart.com/peekychew/art/Public-Tileset-Dump-3-4-Beach-and-Sea-828233122)
- **Login.** Every DeviantArt page fetched showed "Log in to download" for the original file — the pages listed in rows 1–9 below.

Per-entry findings (dimensions from the page, oEmbed, or my header/pixel check on downloaded previews):

1. **PeekyChew, "Public Tileset Dump 3/4 – Beach and Sea"** (Outdoor, Gen 3) — [DeviantArt](https://www.deviantart.com/peekychew/art/Public-Tileset-Dump-3-4-Beach-and-Sea-828233122)
   - 448×448px, 48.18 KB. PNG colour type 2 (RGB, **no alpha**) with a baked orange checkerboard background.
   - Art is not 2×-doubled, so 16px native.
   - Loose layout: fences, palms, rocks and RMXP-style lake/pool 3×3 frames, not grid-indexed.
   - Terms: "If you'd like to use for commercial purposes please contact me first…", credit PeekyChew.
2. **J-Treecko252, "Path Tiles EX – Dirt"** (Outdoor/Paths, Gen 3) — [DeviantArt](https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469)
   - 256×768, 15.63 KB, RGBA, fully opaque, exactly 2×-pixel-doubled.
   - An **RMXP 8-column 32px sheet** of hand-made grass/dirt transition pieces (3×3 blocks, inner corners, decorative path shapes). It is not in autotile format.
   - Description: "Primarily for use in the Pokémon Essentials Engine, but you may use as you like"; "Free to Edit/Use" with credit.
   - The series has ~35 variants (dirt, sand, snow, cobble, asphalt…), including snow versions of the same path types: "Compacted Snow", "Cobbled Road Snow", "Stone Road (Snow)" (catalog rows).
3. **J-Treecko252, "Tree Tiles Ver 01"** (Outdoor/Trees) — [DeviantArt](https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004)
   - 256×1856, RGBA with transparency, 2×-doubled RMXP sheet.
   - The **same tree arrangement is repeated in 4 colour variants** (green, snow-covered, olive/autumn, pink), plus a bush row: a ready-made seasonal set with identical layouts (my visual inspection).
4. **J-Treecko252, "Animated Grass Tiles Ver.01"** (Animated) — [DeviantArt](https://www.deviantart.com/j-treecko252/art/Animated-Grass-Tiles-Ver-01-884673465)
   - 256×32, RGBA, 2×-doubled. 8 frames of a 32×32 tile, i.e. an **RMXP single-tile animated autotile strip** (height 32).
5. **Rayquaza-dot, "BW Water Autotile"** (Animated, Gen 5 style) — [DeviantArt](https://www.deviantart.com/rayquaza-dot/art/BW-Water-Autotile-293271655)
   - 1056×128, 14.99 KB, RGBA, 2×-doubled. **11 frames of 96×128 RMXP autotile**; the image shows the icon/inner-corner row plus the 3×3 island block per frame.
   - "Credit goes to Epicday and BoOmxBiG." Login to download.
6. **skatefilter5, "Pokemon A1 Neutral Ground"** (Paths) — [DeviantArt](https://www.deviantart.com/skatefilter5/art/Pokemon-A1-Neutral-Ground-891202440)
   - 384×768, 34.2 KB, 48px tiles. The description says it is made for RPG Maker MV/MZ by halving RMXP tiles onto a 16px grid and scaling 300%.
   - The dimensions equal the **MV A5** sheet, not A1, despite the name. No credit terms stated.
7. **UltimoSpriter, "Misc B/W Tiles – Seasons Edit"** (Outdoor collection, Gen 5) — [DeviantArt](https://www.deviantart.com/ultimospriter/art/Misc-B-W-Tiles-Seasons-Edit-724089908)
   - 956×836, served as a JPEG. Loose sheet on a baked purple checkerboard.
   - Labeled **SUMMER / AUTUMN / WINTER / SPRING** bands, each holding the same trees, flowers, hedges and ground pieces in the same relative positions (visual inspection).
8. **ChaoticCherryCake, "Free Tileset 16x16"** (Outdoor collection) — [DeviantArt](https://www.deviantart.com/chaoticcherrycake/art/Free-Tileset-16x16-816674437)
   - 960×800, RGBA, 16px native.
   - Loose: trees in green/dark/orange/olive/snow variants, 16px RMXP-style pond and cliff autotile blocks, houses with baked drop shadows.
9. **Ekat99, "Mega Outdoor Tileset"** (Collection) — [DeviantArt](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)
   - Page says 128×3600, 86.8 KB, so 16px-native 8-column RMXP layout needing ×2. The public preview I received was resampled to 126×3577.
   - "a public use tileset for non-commercial projects", credit Ekat, Vurtax (FRLG rips), Heartlessdragoon (RSE rips), Heroalistar, Zein.
   - Warns that with Essentials v19+ the sheet uses much of the canvas height limit.
10. **TheDeadHeroAlistair, "Project Heliodor Ground Megaset"** (Collection) — [DeviantArt](https://www.deviantart.com/thedeadheroalistair/art/Project-Helidor-Ground-Megaset-903477198)
    - 2400×2400, 522.69 KB, tagged rmxp. Public preview is an 894×894 JPEG at q70, so useless for slicing.
    - Terms: credit (including upstream artists), **no commercial use**, "freely share any changes".
11. **glassbetelgeuse, "Tiles – Emerald Shallow Water Autotile"** (Auto Tilesets, Eevee Expo #1313) — [Eevee Expo](https://eeveeexpo.com/resources/1313/)
    - v1.0, Jul 11 2023, MediaFire download.
    - "Just pop it in your Graphics/Autotiles folder"; "Because of transparency, it works best on the second layer". Credit to the pokeemerald decompilation for rips.
    - Dimensions not stated.
12. **glassbetelgeuse, "Tiles – Emerald Outdoors"** (Eevee Expo #1529) — [Eevee Expo](https://eeveeexpo.com/resources/1529/)
    - v1.0, Jun 7 2024. "also contains autotiles for the animated tiles".
    - Credit Heartlessdragoon (rips) and pokeemerald (animated tiles); author credit "not required".
13. **CinnaYva, "Gen 3 Snow Tileset – Update"** (Eevee Expo #1631) — [Eevee Expo](https://eeveeexpo.com/resources/1631/)
    - First release Feb 8 2025, last update Jun 7 2026 ("New Snow Colors + Doors"). Google Drive hosted. Credit "Cinna".
    - No dimensions or format stated on the page.
14. **TeamAquasHideout, Team Aqua's Asset Repo "Volcano Secondary"** (Mega Collection, GitHub) — [GitHub](https://github.com/TeamAquasHideout/Team-Aquas-Asset-Repo/tree/main/Tilesets/The%20Great%20Tileset%20Exchange/Full%20Tilesets/Volcano%20Secondary)
    - Files: `tiles.png` (5,856 B), `tiles.4bpp`, `tiles.4bpp.lz`, `metatiles.bin` (6,144 B), `metatile_attributes.bin` (512 B), `palettes/`, `example.png`, `credits.md`.
    - This is a **pokeemerald decomp tileset**, not RMXP (GitHub API listing).

- **Not inspected.** The Spriters Resource FRLG "Animated Tiles" sheet ([link](https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/sheet/164543/)) is behind a Cloudflare challenge ("Just a moment…"), and WebFetch got 403.

- **Catalog-wide dimension sweep (all 613 DeviantArt rows).** I queried oEmbed metadata only, with no image downloads. 611 returned dimensions and 2 returned 404. In 538 rows oEmbed served the **original** image, so the dimensions are exact. 73 returned a **resized preview**, so their true size is unknown: 43 Outdoor, 12 Animated, 8 In+Out+Misc, 5 Indoor, 5 In+Out. Of these, 54 had no image type and 19 were PNG previews. The cap appears to be about 3577px tall; e.g. a 98×3577 preview implies a much taller original. Classification of the 538 originals by dimensions (method: [DeviantArt oEmbed](https://backend.deviantart.com/oembed?url=https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004), my script over `tilesets.csv`):

  | Count | Classification |
  |---|---|
  | 179 (33%) | exactly 256px wide: RMXP 32px 8-column sheets (4 of them are 256×512, ambiguous with VX Ace A5) |
  | 77 (14%) | 128px wide: 16px-native art in RMXP 8-column layout (e.g. Ekat99's sheets), needs ×2 |
  | 17 | RMXP 96×128 autotiles: 6 static (1 frame), 1×2, 5×4, 1×5, 1×6, 2×8, 1×11 frames |
  | 18 | 32px-high strips: 13 with 8 frames, 2 with 6, others 2/4/7. RMXP single-tile animated autotiles (grass, flowers) |
  | 17 | MV/MZ sheet sizes (768×768, 768×384, 384×768): 16 by skatefilter5, 1 by KingTapir |
  | 2 | 512×384 (VX/Ace A1/A2 size): Ekat99 house, FloofyPanthar elevator GIF. Likely coincidental, not VX format |
  | 38 | other multiples of 32 |
  | 96 | multiples of 16 only (16px-native loose sheets) |
  | 94 | not 16-aligned at all (loose sprite art, showcases, previews) |
  | 11 | GIF (animated showcase previews, e.g. MikeJAJ Neo Sinnoh buildings 500×500; Magiscarf water animations) |

  Further details:
  - Original sizes: median width 256 (max 1184), median height 448 (max 3040). No original-served image exceeds 4096px.
  - Per tab, originals only:
    - Outdoor 323: 106 are 256 wide.
    - Indoor 79: 44 are 256 wide.
    - Animated 45: 13 RMXP autotiles, 16 strips, 14 are 256 wide.
    - DeviantArt "Auto Tilesets" 7: only 2 are canonical 96×128, plus 1 4-frame 384×128 and 1 7-frame 224×32 strip; the rest are compilations, e.g. 384×416 and 768×144.
  - Publication years range 2008–2025, peaking in 2021 (227 entries).

### Inferences
- **The importer needs several modes:**
  - (a) RMXP 256px sheet: grid-slice at 32px.
  - (b) 16px-native sheet: nearest-neighbor ×2, then treat as (a). Or keep everything at 16px internally and render at ×2.
  - (c) RMXP autotile: run the §2 expansion.
  - (d) single-tile animated strip.
  - (e) loose sheet: rectangle/lasso selection, colour-key removal for RGB or checkerboard backgrounds, optional alpha connected-component auto-slicing.
  - (f) MV/MZ 48px: only accept when the art is an exact ×3 of 16px. Downscale ÷3, then ×2, and verify per pixel.
  - (g) Decomp tilesets: separate importer or skip.
- **Recommended internal canonical unit: 32px tiles** (RMXP standard, ×2 Gen-3), with a flag for whether the source was 16px native, so a future 16px internal mode is possible.
- **Never slice from DeviantArt previews.** Large images arrive resized or JPEG-compressed. The editor should require the user to supply the downloaded original (login) and store `sourceUrl`, `artist`, `creditText` and `licenseNotes` with every imported sheet so the game can generate a credits screen.
- **License caution for the project.** Many entries are non-commercial and credit-required, and several are game rips ("Ripped (up to you)"). The game is free and non-commercial, but per-asset credit metadata should be mandatory in the editor's asset registry.
- **Expected importer mix, from the sweep.**
  - About ½ of DeviantArt entries map straight onto the RMXP grid: 33% are 256 wide and 14% are 128 wide (×2).
  - About ⅓ are loose or unaligned sheets that need manual stamp slicing.
  - Only about 35 are proper RMXP animated or auto tiles.
  - About 17 are MV 48px.

  So the stamp/region-slicing UI is as important as the autotile importer.
- **Some originals are taller than 4096px.** Previews are capped around 3577px tall at reduced width. A 98×3577 preview of a 256px-wide sheet would mean a ~9,300px-tall original, which is inference. Never upload whole source sheets as runtime textures. Repack only the tiles actually used into ≤4096² atlases (§7), as Essentials' own column-wrapping workaround hints.
- **The catalog already contains same-layout seasonal variants** (J-Treecko tree sheet, UltimoSpriter Seasons Edit, J-Treecko snow path variants, ChaoticCherryCake tree colours). Seasonal theming fed by region-offset mapping is realistic for trees, paths and ground.

### Gaps
- Exact dimensions and autotile format of the Eevee Expo downloads were not verified. The pages don't state them, and files are on MediaFire/Google Drive, which I did not download per the no-bulk-download constraint.
- Whether DeviantArt "Download" for these entries yields the same PNG or a zip was not verifiable without login.
- I did not decode the pokeemerald `metatiles.bin` layout. 6,144 B / 512 B is consistent with 256 metatiles × 24 B (triple-layer) and 2 B attributes, but that is inference.

---

## 4. Autotiling algorithms, which to use, multi-terrain transitions, and path auto-shaping

### Takeaway
The art is RMXP autotiles plus 3×3-plus-inner-corner path sheets, so the natural runtime model is the **8-neighbor blob-47 (quarter-tile) autotile, per terrain, on per-terrain overlay layers ordered by terrain priority**. This is exactly what RMXP/Essentials do, and it can be fed losslessly from RMXP autotiles at import. Dual-grid and corner-Wang sets suit new art made for them, but would force re-drawing the catalog's assets.

### Cited Findings
- **Taxonomy and tile counts.**
  - Edge sets ("S-E2") need 16 tiles. Corner sets ("S-V2") need 16. The blob pattern is "47 tiles … which is only some of the 256 tiles" of corner+edge (S-V2E2), reducible to 16 with rotation/mirroring.
  - "the tile classification does *not* fully specify how to autotile them" — [Boris the Brave, Classification of Tilesets](https://www.boristhebrave.com/2021/11/14/classification-of-tilesets/)
- **Quarter-tile autotiling.**
  - Each quarter is chosen from "the terrain of the current cell, and the 3 other cell it's adjacent or diagonal to". The method is "best known for being the tiling built into the RPG Maker engine".
  - With rotation, 5 half-size quarter tiles suffice; without, 14–20.
  - Precomposing yields "the 48 tiles of the blob pattern". Limits: "Larger curves and borders: No; Multiple terrains: No"; "There's no obvious extension for quarter tiles".
  - Two workarounds: (1) overlay a separate autotiling per terrain with transparency; (2) design tiles per terrain pair and pick the two most prominent per quarter — [Boris the Brave, Quarter-Tile Autotiling](https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/)
- **Dual grid.**
  - The render tilemap is offset by half a tile and is one larger in each dimension. Each render tile reads 4 world cells at its corners: "the corners of the mesh tile land on the centers of the four neighbors".
  - The demo needs 5 overlay tiles plus 1 base (with rotation). Benefits listed: tiny tileset, composable overlays, logic map separate from visuals, "No Ambiguous Tiles" — [Excalibur.js, Dual Tilemap Autotiling Technique](https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique)
  - Advantages of the jess::codes method: "only 16 (or 6) tiles are required … perfectly rounded corners … tiles align to the world grid" — [dual-grid GDScript port](https://github.com/jamesplease/dual-grid-tilemap-system-godot-gdscript); [Godot forum](https://forum.godotengine.org/t/dual-grid-tile-system-implementation/115685)
- **Tiled Wang/terrain sets.**
  - Corner sets and Edge sets each need 16 tiles for 2 terrains. Mixed sets need 256, "but reduced sets like the 47-tile Blob tileset also work". With Tiled 1.5+ transformations the blob set reduces to "a mere 15 tiles".
  - A set can hold up to 254 terrains. With no direct transition between two terrains, the brush inserts intermediate ones (e.g. dirt on cobblestone via sand). Each corner has one terrain.
  - Probability weights per tile and terrain; probability 0 keeps a tile known but unused — [Tiled manual: Terrains](https://doc.mapeditor.org/en/stable/manual/terrain/)
- **LDtk.** Auto-layer rules are "grid patterns that will decide if a specific tile should be painted", matched against IntGrid values. In 1.5.0, rule size became automatic from 1×1 to 9×9. Modulo (every X columns/Y rows) has existed since 0.3.0 and Perlin-random areas since 0.1.5 — [LDtk auto-layer rules](https://ldtk.io/docs/general/auto-layers/auto-layer-rules/); [LDtk 1.5.0 devlog](https://deepnight.itch.io/ldtk/devlog/663374/150-new-logo-and-20x-faster); [LDtk v0.3.0](https://github.com/deepnight/ldtk/releases/tag/v0.3.0-beta); [LDtk v0.1.5](https://github.com/deepnight/ldtk/releases/tag/v0.1.5-alpha)
- **Godot 4 terrain sets.** Modes "Match Corners and Sides", "Match Corners", "Match Sides" correspond to Godot 3's 3×3, 2×2 and 3×3-minimal bitmasks. Peering bits pick the tile and `-1` means empty. Terrains live inside a terrain set and "a tile may define several terrains at once" for transitions — [Godot docs: Using TileSets](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html)
- **RMXP/Essentials rule.** Neighbor equality is by exact tile ID on the same layer (`data[x, ym1, layer] == t`), so different autotiles never "connect", and map borders count as same (clamped) — [TileDrawingHelper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/004_TileDrawingHelper.rb)
- **Not used:** a Red Blob Games autotile page found in search is labeled as written by an LLM for an experiment comparing LLM output with human writing, so I did not use it as a source — [redblobgames index-claude-statico](https://www.redblobgames.com/articles/autotile/index-claude-statico.html)

### Inferences (recommended model)
- **Data model: logical terrain per cell, visuals derived.** Store `terrain[x][y]` as an enum of logical kinds, for example:
  - `ground` (theme-specific: grass / snow / sand)
  - `path` (enemy route)
  - `water`, `deepWater`
  - `tallGrass` (decor, buildable or not per rules)
  - `cliff` / `ledge`
  - `blocked`
  - …

  Never store art tile IDs as the source of truth. Visual tiles are recomputed whenever terrain or theme changes. This is what makes "Mario Maker-feel" painting and theme swapping both work.
- **Algorithm: blob-47 via the RMXP quarter rule**, which is §2's verified table. Reasons:
  - (a) Most catalog autotiles are already RMXP 96×128 and convert losslessly.
  - (b) Hand-made path sheets in 3×3-plus-inner-corner layout (like J-Treecko's) can be turned into a synthetic 96×128 autotile at import. The import wizard asks the user to click the 3×3 block plus the inner-corner tile. The 13-tile layout supplies every mini-tile the pattern table references.
  - (c) It handles 1-tile-wide paths, T-junctions and diagonal-touching cells correctly.

  Use 4-bit/16-tile edge matching only for fences/rails ("edge set") objects.
- **Multiple terrains: priority-ordered overlay layers (Boris workaround 1, the RMXP way).**
  - Each theme defines a **base fill** (summer grass, winter snow) drawn everywhere.
  - Each other terrain has a z-rank, e.g. `water(10) < sand(20) < tallGrass(30) < path(40)`.
  - For each terrain T, draw T's autotile on its own render layer wherever `terrain==T`, computing the neighbor mask with "neighbor is T". Transparent edges in RMXP autotiles let the base fill show through.
  - When 3+ terrains meet, every overlay simply fringes onto the base, which matches how Essentials maps look.
  - Optionally allow "neighbor counts as same if its rank ≥ rank(T)" per terrain. Example: water's mask treats a bridge as water, so the shoreline does not draw under the bridge.
- **Optional extra fidelity: Tiled-style intermediate transitions.** If a theme lacks a direct path↔water edge, insert a 1-cell sand ring automatically, or simply forbid adjacency in validation. I'd recommend validation over magic.
- **Enemy path auto-shaping.**
  - The path is a terrain stroke. Every paint or erase recomputes masks in the 3×3 neighborhood of each changed cell (dirty-region update), so shapes update live as in Mario Maker.
  - Separately, derive the **gameplay route** from path cells: BFS/DFS from spawn tiles to exit tiles. Validate that a route exists and that it does not branch unless branches are allowed. Store an ordered waypoint list in the export so the game never re-derives it from visuals.
  - Path art choice (dirt, cobble, snow-cobble) is per theme. The path *cells* are gameplay data.
- **Cliffs/ledges and water shores.** In Gen-3 art, shores are part of the water autotile (§3 #5). Cliffs are hand-placed multi-tile pieces with a 3/4-view face, which are not autotile-friendly. Treat cliffs as **multi-tile objects with edge variants** (§5), or as an "edge set" terrain with a manually assigned 47-slot mapping. Don't promise auto-cliffs for v1.
- **Dual grid is a good choice only for new, purpose-drawn art.** It needs corner-based tiles the catalog generally lacks. Mixing dual-grid and RMXP terrains in one map adds a half-tile render offset that complicates picking and gameplay overlays.
- **Variation.** Add Tiled-style per-tile probability: several "fill" variants (flowers in grass) chosen by a deterministic hash of (x, y, seed). Exports stay stable and themes stay consistent.

### Gaps
- I did not read the official LDtk docs for rule groups, "break on match", or the out-of-bounds policy; the pages fetched lacked those details.
- I found no published algorithm specifically for RMXP-style multi-terrain priority. The overlay model above is my synthesis of Boris's workaround 1 and Essentials' per-layer behavior.

---

## 5. Multi-tile objects (trees, buildings, fences, signs)

### Takeaway
Define objects as **stamps**: a rectangular sheet region (in tiles) plus a per-cell role mask with roles *footprint/base* (blocks building and path, drawn under units), *overhang* (drawn above units via y-sort), and *empty*. Add an anchor (base row) and an optional animation. RMXP encodes the same idea per tile as `priority` and `passage`, and Essentials sorts priority tiles by `y + priority` rows. Y-sort units and overhangs by their base line.

### Cited Findings
- **RMXP/Essentials per-tile approach.**
  - Priority 0 draws under characters. Priority ≥1 is y-sorted with `z = y*32 + priority*32 + 33`, so tree tops with priority 1–2 cover characters standing 1–2 rows below them.
  - Passage bits block movement. The bush bit 0x40 hides the lower part of a character.
  - Passability is decided per tile, top layer first — [TilemapRenderer.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb); [Game_Map.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/004_Game%20classes/004_Game_Map.rb)
- **LDtk.** Auto-layer rules can paint tile groups; a 1×1 to 9×9 pattern grid is supported. (Its "Stamp" tile mode was not verified in the pages fetched) — [LDtk 1.5.0 devlog](https://deepnight.itch.io/ldtk/devlog/663374/150-new-logo-and-20x-faster)
- **Godot.**
  - Tall tiles need their **Y Sort Origin** set to the visual base, not the center. Y Sort must be enabled on the layer and its parents.
  - Community guidance: keep only props that interleave with characters on y-sorted layers; floors stay unsorted — [Godot forum: YSort stacking](https://forum.godotengine.org/t/best-practice-for-stacking-tilemaplayer-nodes-with-ysort-in-godot-4-4/120306); [Godot forum: How to use YSort with tilemaps](https://forum.godotengine.org/t/how-to-use-ysort-with-tilemaps-in-godot-4/4776)
- **Tiled.** The tileset editor includes a per-tile collision-shape editor and properties (Class, Probability) — [Tiled manual: Editing Tilesets](https://doc.mapeditor.org/en/stable/manual/editing-tilesets/)
- **Catalog art examples.**
  - J-Treecko tree sheets (256px RMXP) contain 2×2 to 3×4-tile trees with trunk and shadow on the bottom row.
  - ChaoticCherryCake houses include large baked gray drop shadows extending below and right of the footprint.
  - Ekat99 warns megasheets should be sliced to only the objects needed.
  
  (My inspection, §3) — [Tree Tiles Ver 01](https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004); [Free Tileset 16x16](https://www.deviantart.com/chaoticcherrycake/art/Free-Tileset-16x16-816674437); [Mega Outdoor Tileset](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)

### Inferences (recommended stamp definition)
- **Stamp schema** (editor asset registry):
  ```json
  {
    "id": "tree.round.large",
    "kind": "tree_large",
    "source": {"sheet": "jtreecko_trees_v01", "x": 0, "y": 6, "w": 3, "h": 4},
    "cells": ["oOo", "oOo", "bBb", ".B."],
    "anchor": {"row": 3, "col": 1},
    "blocks": {"build": true, "path": true},
    "shadow": {"layer": "groundDecal"},
    "anim": null
  }
  ```
  Field notes:
  - `source` is in tile units. `w`/`h` must equal the logical footprint bounding box of `kind` in every theme.
  - `cells` roles: `o` = overhang drawn above units, `O` = overhang that also blocks, `b` = base drawn under units, `B` = base that blocks, `.` = empty/transparent.
  - `anchor` is the base line used for y-sorting.
- **Separate logical footprint from visual bounds.** Gameplay data stores `{kind, x, y}` and the kind's footprint mask, e.g. `tree_large` occupies the 2 bottom-middle cells. Visual bounds can be larger: canopy, shadows, chimney. Tower placement checks only the footprint. Units can walk visually behind overhang cells, which are not blocking.
- **Depth rule for 3/4 view** (Phaser):
  - Ground and terrain layers sit at depth 0–N.
  - Base parts can be baked into a ground-objects tile layer.
  - Each stamp's overhang is one pre-composited Image with origin at its bottom edge and `depth = anchorRowWorldY + tileSize` (Essentials-style "priority rows").
  - Units use `depth = footY`; towers use `depth = baseY`.
  - So a unit north of a tree (smaller y) draws under its canopy and a unit south draws over the trunk. For 1-row-overhang objects this reproduces RMXP priority 1.
- **Tall grass / bush:** a terrain flag `hidesLowerBody`. The game draws a cropped grass overlay over the bottom ~12–16px of units in that cell, the analog of RMXP's 0x40 bush flag.
- **Fences and walls:** use an edge-set autotile (16 tiles, 4-bit cardinal) defined as a stamp family `fence.{mask}`, painted like terrain on an object layer.
- **Shadows:** keep baked shadows only if they fall entirely inside the stamp's rectangle. Otherwise split the shadow into a ground-decal part, so a shadow can't be drawn over a unit.
- **Snap and placement UX:** stamp placement snaps the anchor cell to the grid, previews blocked cells in red, and refuses to overlap another stamp's blocking footprint or path cells.

### Gaps
- I found no authoritative document on how specific catalog artists assign RMXP priorities to tree tops, since that data lives in `.rxdata` that isn't distributed. Assume the editor must author it.

---

## 6. Theming and seasonal swaps (summer / winter / night, identical gameplay)

### Takeaway
Keep gameplay data theme-free: terrain kinds, path cells, object kinds with footprints. A **theme pack** maps each logical terrain kind to an autotile/fill set and each object kind to a stamp with an identical footprint. Swapping themes then never touches gameplay. Stardew Valley (same-layout per-season tilesheets) and Tiled (swap the tileset image, layout must match) work at the image level. Our editor should work at the logical level, with image-level swap as a cheap special case. Pokémon BW changes accessibility in winter, which is an anti-pattern for this project.

### Cited Findings
- **Tiled has no first-class theme system.**
  - The common technique is overwriting or redirecting the tileset image, but "The replacement tileset will still need to have the exact same layout".
  - Changing the tileset's Image property in Tileset Properties, or the external tileset's `source` in the map file, also works.
  - For different layouts, the "Mass Replace Tiles" script remaps old→new tile pairs — [Tiled forum: swap between tilesets](https://discourse.mapeditor.org/t/a-way-to-swap-between-tilesets/2709); [Tiled forum: update tileset](https://discourse.mapeditor.org/t/how-to-update-my-tileset/547); [Tiled forum: mass replace](https://discourse.mapeditor.org/t/trouble-understanding-set-up-of-mass-replace-tiles-script-for-tiled/6587)
- **Stardew Valley (community sources).**
  - Vanilla outdoor tilesheets exist per season with season prefixes (e.g. `spring_outdoorsTileSheet`). The seasonal sheets share a layout, and some tiles are blank in one season but filled in another.
  - Mods use Content Patcher's `{{Season}}` token in the tilesheet path to load per-season sheets.
  
  (Official wiki page returned 403; these are forum/mod sources) — [Starbound/Chucklefish forum](https://forums.playstarbound.com/threads/i-have-a-few-newbie-questions-about-map-editing.135617/); [Stardew forums](https://forums.stardewvalley.net/threads/content-patcher-custom-tilesheet-problem.29470/latest); [itch.io asset author: identical seasonal layouts](https://itch.io/post/13334958)
- **Pokémon Black/White seasons.**
  - Each season lasts one in-game month, cycling every 4 months. Deerling and Sawsbuck forms and encounters change.
  - Winter snow **opens areas** otherwise inaccessible, e.g. above Icirrus City, Route 8, Moor of Icirrus, Twist Mountain, Dragonspiral Tower — [PokemonDB: B/W Seasons](https://www.pokemondb.net/black-white/seasons); [Serebii: B/W Seasons](https://serebii.net/blackwhite/seasons.shtml); [StrategyWiki](https://strategywiki.org/wiki/Pok%C3%A9mon_Black_and_White/Seasons)
- **Catalog evidence of same-layout seasonal sets:**
  - J-Treecko "Tree Tiles Ver 01": 4 colour bands of identical tree layouts.
  - UltimoSpriter "Seasons Edit": SUMMER/AUTUMN/WINTER/SPRING bands.
  - J-Treecko path series: grass/sand/snow variants of the same path type, e.g. "Cobbled Road Grass", "Cobbled Road Snow".
  - ChaoticCherryCake tree colour variants.
  
  (§3) — [Tree Tiles Ver 01](https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004); [Misc B/W Tiles – Seasons Edit](https://www.deviantart.com/ultimospriter/art/Misc-B-W-Tiles-Seasons-Edit-724089908); [Path Tiles EX Cobbled Road Snow](https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Cobbled-Road-Snow-884688431)

### Inferences (recommended theme model)
- **Theme pack JSON (editor-side), one per theme:**
  ```json
  {
    "id": "winter",
    "inherits": "summer",
    "baseFill": "snow_fill",
    "terrain": {
      "path": {"autotile": "jt_cobble_snow"},
      "water": {"autotile": "ice_water", "anim": true},
      "tallGrass": {"autotile": "snowy_tallgrass"}
    },
    "objects": {
      "tree_large": ["tree.round.large.snow", "tree.round.large.snow.alt"],
      "rock_small": ["rock.small.snowcap"]
    },
    "postFx": null
  }
  ```
  - Night can be `{ "inherits": "summer", "postFx": {"tint": "#4060a0", "multiply": 0.55}, "objects": {"lamp": ["lamp.lit"]} }`. Recolor by shader or tint instead of new art, overriding only lit objects.
- **Hard interchangeability constraints, validated when a theme is built:**
  - (1) Every logical terrain kind used by any map has a mapping in every theme, directly or via `inherits`.
  - (2) Every object kind's stamp in every theme has the identical footprint mask and anchor; the visual overhang may differ.
  - (3) Terrain mappings are blob-47-complete, or RMXP-autotile-derived, which is complete by construction.
  - (4) Animated vs static may differ per theme (frozen water), but the gameplay flag must not.
  - (5) Variant lists may have different lengths. Pick by `hash(x, y, mapSeed) % n` per theme so the choice is deterministic.
- **Fallback chain when a theme lacks a visual:** theme → its `inherits` parent → `default` theme, plus an editor warning badge ("winter: 3 kinds falling back").
  - For objects, an optional per-theme recolor fallback (palette swap or tint on the summer stamp) beats showing summer art in winter.
  - Never fall back by changing a footprint.
- **Image-level fast path:** when a source sheet has same-layout seasonal bands (J-Treecko trees), register the sheet once with `variants: {summer: {dy:0}, winter: {dy: N}, …}`. Stamps then reference `(sheet, x, y)` and the theme applies the offset. This is the Stardew/Tiled model, used opportunistically.
- **Export format for the game:** the map JSON holds only logical data (terrain grid, path waypoints, object instances `{kind, x, y, variantSeed}`), plus `themes: ["summer", "winter", "night"]`. Either:
  - (a) the game resolves visuals at load from shipped theme packs and atlases, or
  - (b) the editor pre-bakes per-theme tile layers (Tiled-compatible JSON per theme).

  I'd recommend (b) for runtime simplicity: Phaser loads one tilemap JSON per theme, all with identical dimensions, and gameplay comes from the logical file. That guarantees identical gameplay by construction.
- **Avoid the BW pattern:** gameplay must not read theme. Lint rule: theme packs cannot contain fields that affect `blocks`, `buildable`, `path` or `speed`.

### Gaps
- Primary documentation of Stardew's vanilla seasonal tilesheet mechanism (official wiki) was blocked (403). The claims rest on community sources.
- Bulbapedia (primary fan reference for BW seasons) was blocked (403). I used PokemonDB, Serebii and StrategyWiki.
- I found no documented feature in LDtk or Godot specifically for seasonal or theme tileset swapping. The Godot/LDtk docs fetched did not cover it.

---

## 7. Phaser rendering requirements

### Takeaway
Target **Phaser 4** (launched April 2026; npm `phaser@4.2.1` current). Phaser 3.90.0 (May 2025) is the last v3. Use:
- `pixelArt: true` with integer camera zoom;
- 32px tiles packed into ≤4096×4096 atlases with 1px+ extrusion (margin 1 / spacing 2);
- Phaser 4's built-in Tiled-style tile animations, new in v4;
- `TilemapGPULayer` for static ground layers (single tileset per layer, WebGL only).

Objects and overhangs are sprites with y-based depth.

### Cited Findings
- **Release status.**
  - Phaser 4 "launched in April 2026". Tilemaps are listed among things "likely unchanged" for migration "unless using GPU layer".
  - The WebGL pipeline was replaced by a render-node architecture — [Phaser: Phaser 3 vs Phaser 4 (May 2026)](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4)
  - Phaser v3.90.0 "Tsugumi" (23 May 2025) is described as "likely the last version in the v3 tree" — [Phaser v3.90 released](https://phaser.io/news/2025/05/phaser-v390-released)
  - The npm package on unpkg reports `"version": "4.2.1"` — [unpkg phaser@4.2.1 package.json](https://unpkg.com/phaser@4.2.1/package.json)
- **TilemapGPULayer (Phaser 4) restrictions, from the source doc comment:**
  - "Use a single tileset, with a single texture image."
  - "Maximum tilemap size of 4096x4096 tiles."
  - "Maximum of 2^23 (8388608) unique tile IDs."
  - "Tiles may be animated."
  - "Orthographic tilemaps only."
  - WebGL only.
  - "The layer can be edited, but it will not update automatically. Regenerate … by calling `generateLayerDataTexture`".
  - With NEAREST min-filtering it renders sharp pixels. In LINEAR it renders "smooth borders between tiles … with no seams or bleeding".
  - "It has a fixed cost per pixel on screen" and is created via `Tilemap.createLayer(..., gpu=true)`.
  
  — [phaser@4.2.1 TilemapGPULayer.js](https://unpkg.com/phaser@4.2.1/src/tilemaps/TilemapGPULayer.js); [Phaser API docs: TilemapGPULayer](https://docs.phaser.io/api-documentation/class/tilemaps-tilemapgpulayer)
- **Standard TilemapLayer (Phaser 4).** Supports multiple tilesets per layer (`map.createLayer('Ground', [tiles1, tiles2])`), all orientations, and "Both `TilemapLayer` and `TilemapGPULayer` support animated tiles", parsed from Tiled tileset animation data. Layers render in creation order, and `setDepth` overrides — [phaser@4.2.1 skills/tilemaps/SKILL.md](https://unpkg.com/phaser@4.2.1/skills/tilemaps/SKILL.md)
- **Animation mechanism (Phaser 4).**
  - `Tileset.getAnimatedTileId(tileIndex, milliseconds)` is marked `@since 4.0.0`. It reads `tileData[index].animation` (frames with `tileid` and `duration`) and binary-searches by elapsed time.
  - `TilemapLayerWebGLRenderer` calls `tileset.getAnimatedTileId(tile.index, timeElapsed)`, and the layer's `preUpdate` advances an `ElapseTimer`.
  - The Phaser 3.90.0 `TilemapLayerWebGLRenderer.js` contains no animation code (my grep) — [phaser@4.2.1 Tileset.js](https://unpkg.com/phaser@4.2.1/src/tilemaps/Tileset.js); [phaser@4.2.1 TilemapLayerBase.js](https://unpkg.com/phaser@4.2.1/src/tilemaps/TilemapLayerBase.js); [phaser@3.90.0 TilemapLayerWebGLRenderer.js](https://unpkg.com/phaser@3.90.0/src/tilemaps/TilemapLayerWebGLRenderer.js)
- **Phaser 3 era.**
  - The official forum answer says Phaser 3 renders tile layers without tile animations: convert to sprites or "run a simple timer changing the tile ID".
  - The 2018 `phaser-animated-tiles` plugin parses Tiled animations but has compatibility issues with newer 3.x versions (forks exist) — [Phaser discourse: animated tilemap](https://phaser.discourse.group/t/animated-tilemap/1285); [Phaser news: animated tiles plugin (2018)](https://www.phaser.io/news/2018/03/phaser-3-animated-tiles-plugin); [Phaser discourse: 3.5 animated tiles](https://phaser.discourse.group/t/phaser-3-5-animated-tiles-tiled/11148)
- **Pixel-art configuration (Phaser 4).**
  - `{ render: { pixelArt: true } }` for 1:1 pixels. It sets `antialias`/`antialiasGL` false and turns on `roundPixels`.
  - `{ render: { smoothPixelArt: true } }` for scaled or rotated pixel art.
  - "In general, don't mix rounded pixel art with smooth pixel art".
  - Rounding works only without scale or rotation. "Non-integer scale will produce non-integer pixel positions". A camera is "safe" for rounding only if not zoomed and `roundPixels` is enabled.
  
  — [Phaser 4 Pixel Art Guide (phaser@4.2.0 docs)](https://cdn.jsdelivr.net/npm/phaser@4.2.0/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md); [phaser@4.2.1 game-setup SKILL.md](https://unpkg.com/phaser@4.2.1/skills/game-setup-and-config/SKILL.md)
- **Extrusion.** `tile-extruder` copies tile edge pixels outward to stop "bleeding". Load the result with `map.addTilesetImage("tileset", "tileset-extruded", 48, 48, 1, 2)`: a 1px extrusion gives margin 1, spacing 2. Zoomed cameras may need more than 1px — [tile-extruder README](https://github.com/sporadic-labs/tile-extruder). Godot's equivalent is "Use Texture Padding", which "adds a 1-pixel transparent edge around each tile to prevent texture bleeding when filtering is enabled" — [Godot docs: Using TileSets](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html)
- **Max texture size (WebGL2, Web3D Survey).**

  | Platform | ≥4096 | ≥8192 | ≥16384 |
  |---|---|---|---|
  | Overall | 100% | 98% | 86% |
  | Android | 100% | 75% | 3% |
  | iOS | | 100% | |

  — [web3dsurvey MAX_TEXTURE_SIZE (WebGL2)](https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE). A search snippet of the same page earlier showed Android 8192 at ~59%, so the figure moves as the sample changes. The older WebGL-fundamentals estimate was ~99% support for 4096 and ~50% above that — [WebGL2 Fundamentals: cross-platform issues](https://webgl2fundamentals.org/webgl/lessons/webgl-cross-platform-issues.html)
- **Essentials precedent.** Essentials itself works around GPU limits by wrapping tall tilesets into columns, and Ekat99 warns megasheets eat the Essentials v19+ canvas height limit — [TilesetWrapper.rb](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/006_Map%20renderer/002_TilesetWrapper.rb); [Mega Outdoor Tileset](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)

### Inferences (concrete rendering recommendations)
- **Engine:** Phaser 4.x. Built-in tile animation removes the need for `phaser-animated-tiles` or timer hacks. Phaser 3 would need a manual tile-ID swap on a timer.
- **Pixel scale:** author at 32px (2× Gen 3). Game config `pixelArt: true`, camera zoom ∈ {1, 2} only, `Scale.FIT` with integer zoom computed from the window. Keep sprite positions integer, with origin 0 or even-sized sprites. On small screens prefer zoom 1 with a smaller viewport over zoom 1.5.
- **Atlas packing (editor export step):**
  - Pack only the tiles the map's theme actually uses into **one atlas per theme per layer group**, ≤4096×4096.
  - Extrude by 1px (2px if any non-integer zoom is ever allowed), and write `margin`/`spacing` into the Tiled-format tileset JSON.
  - Capacity: at 32px tiles plus 2px spacing, a 4096² page holds about 113×113 ≈ 12,700 tiles. A single RMXP autotile expanded to 47 tiles × 11 frames is 517 tiles, so a theme with ~10 animated autotiles plus a few hundred static tiles fits easily in one page. That keeps GPU layers possible (single tileset rule).
- **Animated tiles in the export:** expand each RMXP autotile frame into its 47 composed tiles. In the tileset JSON, give each frame-0 tile an `animation: [{tileid, duration}, …]` array pointing to its frame-k siblings (duration 250 ms default, or from `[x]`). Single-tile strips (J-Treecko grass, 8 frames) are the same with 1 tile per frame. Phaser 4 animates both layer types.
- **Layer stack** (per theme, all orthographic, same size):
  1. `ground` (base fill + terrain overlays): GPU layer if all on one atlas; otherwise one CPU TilemapLayer per terrain priority.
  2. `groundDecor` (flowers, shadows, object bases): CPU or GPU layer.
  3. Units, towers and object overhangs as Sprites/Images with `depth = baselineY` (§5).
  4. `fx` and UI.

  For a TD map of ~30×20 to 60×40 cells, even 5–8 CPU tile layers are a few thousand tiles, far below Phaser's limits, so performance is not a concern. The GPU layer's fixed per-pixel cost matters more on low-end mobile; test there.
- **Editor-side rendering:** the editor (also browser/Phaser or Canvas) should use the same atlas and animation data so WYSIWYG holds. Editing a GPU layer needs `generateLayerDataTexture()` after edits, so the editor should use CPU TilemapLayers and the game GPU layers.
- **Night theme:** implement as a camera-level colour filter or tint in Phaser 4 plus a few lit-object overrides, rather than full night art. This stays within "visual only" and avoids doubling atlas size.

### Gaps
- No Phaser 4 source confirms the default value of `roundPixels` when `pixelArt` is false (a Phaser 3.70 note said it became true by default). Set it explicitly.
- No benchmark numbers for TilemapGPULayer versus TilemapLayer on mobile were found. The 2024 preview advised testing on target hardware.
- I did not verify whether Phaser 4's Tiled parser reads per-tile `animation` from **external** `.tsj` tilesets or only embedded ones. Exporting embedded tilesets avoids the question.
