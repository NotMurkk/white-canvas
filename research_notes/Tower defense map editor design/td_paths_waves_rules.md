# Tower defense map, path, terrain-rule and wave authoring: the gameplay data a grid-based TD map editor must produce and validate

Source-confidence note for the report writer: bloonswiki.com and fandom.com (Pokémon Tower Defense Wiki, Kingdom Rush Wiki) returned HTTP 403/402 to direct fetches during this session (October 2026). Findings from those sites below come from search-result summaries of the named pages, so treat them as medium confidence. The Arknights level file (GitHub raw JSON) and the Red Blob Games article were fetched and read in full and are high confidence. Local skill files supplied by the user are cited by path. Everything under "Inferences" is my own recommendation or reasoning, not a sourced fact.

## How do existing TDs (PTD, BTD6, Kingdom Rush, Arknights, Gemcraft, Defense Grid, WC3/Element TD, PvZ) structure maps, paths, splits/merges, crossings and flying units?

### Takeaway
The best-documented, closest analog to the planned editor is Arknights. Its level files keep three things apart: a tile grid of gameplay attributes (height, buildable class, passable mask), explicit routes (start, end, checkpoints, motion mode WALK or flying), and waves that reference routes by index. BTD6 adds the rule set for multi-path maps: alternate between active entrances and at splits, switch entrances per round (parity or prime rounds), and charge cash for removable obstacles. Pokémon Tower Defense's map internals are poorly documented online. Only its targeting options (Focus/Ignore Candy) and its fast-forward and zoom features could be confirmed.

### Cited Findings
**Arknights (the most complete public level data model found)**
- Level files have these top-level keys: `options`, `levelId`, `mapId`, `mapData`, `tilesDisallowToLocate`, `runes`, `globalBuffs`, `routes`, `extraRoutes`, `enemies`, `enemyDbRefs`, `waves`, `branches`, `predefines`, `hardPredefines`, `excludeCharIdList`, `randomSeed`, among others — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- `mapData.map` is a 2D integer array of indices into `mapData.tiles` (6 rows × 9 columns in stage 0-1). Each tile object has `tileKey` (e.g. `tile_road`, `tile_wall`, `tile_forbidden`, `tile_start`, `tile_end`), `heightType` (`LOWLAND`/`HIGHLAND`), `buildableType` (`MELEE`/`RANGED`/`NONE`), `passableMask` (`ALL`/`FLY_ONLY`), `playerSideMask`, `blackboard` (parameters) and `effects`. `mapData` also has `blockEdges`, `tags`, `effects` and `layerRects` (all null in this stage) — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- Routes are stored separately from tiles. Each has `motionMode` (`WALK` was observed; `E_NUM` also appeared), `startPosition`/`endPosition` as `{row, col}`, `spawnRandomRange` and `spawnOffset` `{x, y}`, and `checkpoints[]`. Each checkpoint has `type` `MOVE` or `WAIT_FOR_SECONDS`, plus `time`, `position`, `reachOffset`, `randomizeReachOffset` and `reachDistance`. Routes also carry the booleans `allowDiagonalMove`, `visitEveryTileCenter`, `visitEveryNodeCenter` and `visitEveryCheckPoint` — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- Waves contain `preDelay`, `postDelay`, `maxTimeWaitingForNextWave`, `fragments[]`, and `fragments[].actions[]`. Each action has `actionType` (`SPAWN`/`STORY`/`DISPLAY_ENEMY_INFO`), `key` (e.g. `enemy_1007_slime`), `count`, `preDelay`, `interval`, `routeIndex`, `blockFragment`, `autoPreviewRoute`, `autoDisplayEnemyInfo`, `hiddenGroup`, `randomSpawnGroupKey`, `randomSpawnGroupPackKey`, `weight` and `dontBlockWave` — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- Per-level `options` include `characterLimit` 8, `maxLifePoint` 20, `initialCost` 10, `maxCost` 99, `costIncreaseTime` 1.0 and `moveMultiplier` 0.5. `runes` entries carry `difficultyMask`, `professionMask` and `buildableMask` — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)

**Bloons TD 6**
- On maps with several active entrances, Bloons enter from each active entrance in turn. Some maps change which entrances are active from round to round. Bloons reaching a splitting junction typically alternate between its paths — [Bloonswiki: Maps](https://www.bloonswiki.com/Maps), [Bloonswiki: Track](https://bloonswiki.com/Track) (via search summary)
- Bazaar sends Bloons from the top left on even rounds and from the bottom right on odd rounds. On Lost Crevasse all three paths are active and newly spawned Bloons alternate between them. On Bloonarius Prime, swamp holes open on prime-numbered rounds and Bloons take a shorter right-side path — [Bloonswiki: Bazaar](https://www.bloonswiki.com/Bazaar), [Bloonswiki: Lost Crevasse](https://www.bloonswiki.com/Lost_Crevasse) (via search summary)
- Removables are interactive map elements that cost cash to remove. Difficulty does not change the price, but the Removable Cost Rate challenge rule does, and it can also disable removal. The Obstacle Demolition perk cuts each removable's cost by 80% or $2,000, whichever is lower, and does not affect Gizmos. Spillway has four valves, removable for $2,000 each, that block most towers from reaching the middle. Dark Path has four removal tiers: $250, $500, $1,000 and $1,000 — [Bloonswiki: Removable](https://www.bloonswiki.com/Removable), [Bloonswiki: Obstacle Demolition](https://www.bloonswiki.com/Obstacle_Demolition), [Bloonswiki: Spillway](https://www.bloonswiki.com/Spillway), [Dark Path mirror](https://breezewiki.discard.no/bloons/wiki/Dark_Path) (via search summary; the Removable page itself says its map list is incomplete)

**Kingdom Rush**
- Gray Ravens is the first level in the series with two enemy entrances, and Bandit's Lair is the first with two exits — [KR Wiki: Gray Ravens](https://kingdomrushtd.fandom.com/wiki/Gray_Ravens), [KR Wiki: Bandit's Lair](https://kingdomrushtd.fandom.com/wiki/Bandit%27s_Lair) (via search summary)
- Flying enemies cannot be engaged by soldiers. Perythons aim to reach the exits as fast as possible and cannot be engaged by soldiers or reached by druids. Razorwings cannot be engaged by soldiers or hit by bombards. Rocket Riders have a single-use turbo boost — [KR Wiki: Perython](https://kingdomrushtd.fandom.com/wiki/Perython), [KR Wiki: Saurian Razorwing](https://kingdomrushtd.fandom.com/wiki/Saurian_Razorwing), [KR Wiki: Rocket Rider](https://kingdomrushtd.fandom.com/wiki/Rocket_Rider) (via search summary)
- Gloomies (fliers) duplicate themselves, and the duplicates give no gold — [KR Wiki: Gloomy](https://kingdomrushtd.fandom.com/wiki/Gloomy) (via search summary)
- Players can call the next wave early by pressing a button when the wave icon appears — [TrueAchievements: Kingdom Rush](https://www.trueachievements.com/a382017/daring-achievement)

**Pokémon Tower Defense (Sam Otero)**
- According to the PTD wiki, Samuel Otero created the game and described the idea as capturing enemies and levelling up towers like Pokémon. The wiki gives a March 2011 release date for the Android/Flash game, which may refer to one specific release — [PTD Wiki (fandom)](https://pokemontowerdefense.fandom.com/wiki/Elite_4) (via search summary)
- Targeting options include "Focus Candy" (target enemies holding Candy or other items) and "Ignore Candy". Another option ignores enemies in the "red zone" and is useful when capturing. The game also has map zoom (100/75/50/25%) and fast-forward. Elite 4 is level 40 of PTD1 — [PTD Wiki (fandom)](https://pokemontowerdefense.fandom.com/wiki/File:Wave.png), [PTD Wiki: Elite 4](https://pokemontowerdefense.fandom.com/wiki/Elite_4) (via search summary)
- An unblocked-game listing says tamed Pokémon must be placed along the path, and that Pikachu acts only on terrestrial creatures. This is a low-quality source — [sites.google unblocked page](https://www.sites.google.com/site/unblockedgame76/pokemon-tower-defense)

**Maze TD / flow fields, WC3**
- In maze TDs, one breadth-first search from the goal produces a distance field (a "Dijkstra map") and a flow field (`came_from` pointers, equivalent to the negative gradient of distance). A single search serves every enemy. Multiple goals are handled by connecting every destination to one extra virtual node. Cells the search never reaches are disconnected — [Red Blob Games: Flow Field Pathfinding for Tower Defense](https://www.redblobgames.com/pathfinding/tower-defense/)
- Fieldrunners 2 is reported to have used a Dijkstra-based flow field "for simplicity and design reasons" — [Red Blob Games blog 2024-04-27](https://redblobgames.com/blog/2024-04-27-flow-field-pathfinding) (search snippet; attribution to this exact page not verified)
- A Warcraft III TD toolkit builds waves by adding ordered regions to a WaveManager, with creep waves set up per path — [HiveWorkshop: Tower Defence Toolkit](https://www.hiveworkshop.com/threads/tower-defence-toolkit-tdtk.324296/) (via search summary)
- The user's local TD skill lists three path representations: fixed waypoint lanes ("Most TD games use this"), grid A* for maze TD, and flow fields for crowds — [balancing.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/references/balancing.md)

### Inferences
- Arknights shows that gameplay tiles, routes and waves can be separate layers that cross-reference each other. That separation is exactly what a painted-path editor needs. Arknights routes are start, end and checkpoints over a walkable grid, not painted tile chains. The user's editor paints the chain directly, so it can compile the chain into the same kind of route objects. Arknights' `passableMask: FLY_ONLY` and `heightType`/`buildableType` model is a proven template for "terrain flags separate from visuals".
- BTD6 offers three proven branch semantics to support from day one: alternate per entrance, alternate per junction, and an active-entrance set chosen per round by a rule (parity, prime numbers, explicit list). These are deterministic, so balancing stays reproducible.
- Kingdom Rush's design premise is that fliers ignore ground blockers and the ground path. This argues for air routes as their own authored objects, not as a variant of the painted path.
- Arknights references routes by array index (`routeIndex`). In a git-committed, long-lived format, indices break silently when a route is deleted or reordered. The editor should use stable string IDs instead.

### Gaps
- PTD1/2/3 map internals (grid vs free placement, fixed placement "spots", water-only spots, how flying Pokémon move, multiple paths, the candy-stealing enemy behaviour) could not be verified. The fandom wiki blocked fetches and no archive or data dump was found. From memory and unverified: PTD levels had enemies walk in to steal Rare Candies and carry them back out, and placement was restricted to marked spots, some of them water. Confirm with the user or an archived SWF before relying on this.
- BTD6 tunnels and bridges (path passing under or over itself, Bloons hidden in tunnels) and line-of-sight blockers were not verified this session.
- Gemcraft, Defense Grid and Element TD path, flying and crossing rules were not researched (budget). Unverified recollection: Defense Grid fliers use a fixed separate flight path while ground enemies follow a shortest path around towers.
- Plants vs. Zombies was not verified. Unverified recollection: fixed straight lanes with no branching, and pool lanes require a Lily Pad before non-aquatic plants can be placed on water. That would be a strong "water-only / water-enabling tile" analog.
- Kingdom Rush's internal wave/path data format (Lua level files) could not be found online. Wiki pages list wave compositions per level but not the schema.
- The meaning of Arknights `motionMode: "E_NUM"` is unknown (probably an enum sentinel). The flying motion-mode value was not observed in the 0-1 file.

## How should a tile-painted path be converted into what enemies follow (graph, direction, junctions, branch choice, smoothing, progress)?

### Takeaway
Don't infer path connectivity from tile adjacency. Store directed connections per path cell (an "out" bitmask, like conveyor or pipe tiles), recorded from the paint stroke. Then compile those connections into a directed acyclic graph of spawns, splits, merges and exits, enumerate the routes, and precompute arc-length tables. With explicit connections, 2-wide and parallel paths are unambiguous by construction. Bridges and tunnels need either a second path layer or an explicit "crossing" cell.

### Cited Findings
- On a grid graph, A* differs only in `neighbors()` and `cost()`. The local pathfinding reference uses 4-neighbour adjacency, says to check the goal when popping, not pushing, and recommends one flow field (a Dijkstra pass from the goal outward) when many agents share a goal — [pathfinding.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/game-ai/references/pathfinding.md)
- BFS from the goal labels every reachable cell with its distance. Cells never reached are disconnected from the goal, which gives a reachability test. Multiple goals are merged through one virtual node. Units off a tile centre can interpolate flow vectors across the cell — [Red Blob Games: Flow Field Pathfinding for Tower Defense](https://www.redblobgames.com/pathfinding/tower-defense/)
- Waypoint following moves an enemy toward the next waypoint and advances the index within `ARRIVE_EPS`. Leaking happens past the last waypoint. "First" targeting picks the enemy with maximum `progress` and "last" the minimum — [balancing.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/references/balancing.md), [tower-defense SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/SKILL.md)
- Arknights routes expose traversal knobs (`allowDiagonalMove`, `visitEveryTileCenter`, `visitEveryNodeCenter`, `visitEveryCheckPoint`), timed waits (`WAIT_FOR_SECONDS` checkpoints), and spawn spread (`spawnRandomRange`, `spawnOffset`). The map also has a `blockEdges` field, which suggests edge-level blocking between cells; its semantics were not verified — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- BTD6 junction default: Bloons entering a split typically alternate between its paths — [Bloonswiki: Track](https://bloonswiki.com/Track) (via search summary)

### Inferences
**1. Store connectivity explicitly; never infer it from adjacency.**
- Each path cell stores a 4-bit outgoing mask: N=1, E=2, S=4, W=8. Incoming edges follow from neighbours' out bits. When a painting stroke enters cell B from cell A, the editor sets A.out |= dir(A→B). Two touching but unconnected lanes stay unconnected, so 2-wide roads and parallel paths never produce accidental junctions.
- A wide road look belongs in the terrain/visual layer. Gameplay paths stay logically 1-wide, with an optional per-lane lateral visual offset, as Arknights does with `spawnOffset`.
- The editor draws arrows on every path cell. A "flip segment" tool reverses a chain between two nodes. A "connect" tool adds or removes single edges, as a road tool would.
- Auto-orientation from shortest distance to the exit is not safe as the only rule. Example: a long branch with a turn near its split point can be closer, by graph distance, to the exit back through the split, so the inferred direction points backwards. Use stroke direction as the source of truth. Distance-based orientation can serve as a suggestion that validation then checks.

**2. Classify cells by in/out degree in the compiled graph.**
- in=0: must be a spawn cell. out=0: must be an exit cell.
- out≥2: split, which needs a branch policy. in≥2: merge (no policy needed).
- in=1 and out=1: interior cell, either straight or a turn, based on the in/out directions.
- in≥2 and out≥2 in one cell is ambiguous: it could be a "merge then split" junction or a straight-through X crossing. Require an explicit `junctionKind: "junction" | "crossing"`. A crossing means each entrant exits on the opposite side.

**3. Bridges and tunnels (the path over or under itself).**
- Preferred: path layers (`z: 0` ground, `z: 1` bridge/upper, or a `tunnel` layer). Each layer has its own out-mask grid, and a cell may hold one segment per layer. Layer metadata carries gameplay flags: a `tunnel` layer can be `targetable: false` (enemies hidden), and a bridge can be `blocksBuildBelow: true`.
- Changing layers happens only at explicit ramp cells, defined as a layer-link edge between (cell, z0) and (cell or neighbour, z1).
- Simpler alternative for flat X crossings: the `crossing` junction kind above. This needs no layers, but it cannot express "hidden under".

**4. Compile to a DAG, then enumerate routes.**
- Nodes are spawns, exits, splits, merges, crossings and layer ramps. Turn cells become polyline vertices, not nodes. An edge is a maximal chain of interior cells, with its ordered cells, its length, and a per-cell speed-multiplier integral (for mud/slow tiles).
- Reject cycles with a topological sort (Kahn's algorithm) unless a future explicit "loop N times" feature exists. Unbounded cycles make enemies circle forever.
- Routes are the enumerated spawn→exit edge sequences. Give each a stable ID derived from its choices (e.g. `spawn_west>N>E`) plus an optional author alias. Warn when a map has more than about 64 routes, since the count grows exponentially with stacked splits.

**5. Branch-choice policies (per split node, with per-group override).**
- `alternate`: round-robin counter per junction. This is the BTD6 default. Decide whether the counter resets each round; it should, for reproducibility.
- `weighted`: seeded RNG with weights per out-direction.
- `random`: uniform, seeded.
- `shortest`: by remaining length, or by remaining time including speed modifiers.
- `fixed`: always one direction.
- `byRound`: a rule such as `{"type":"byRound","rule":"parity","even":"N","odd":"E"}` or an explicit round list. This expresses BTD6's Bazaar and Bloonarius Prime behaviour.
- Per-spawn activation rules work the same way: `activeRounds` can be a list, a parity rule or `"prime"`.
- Group-level override: a wave group may pin a full `route` ID, as Arknights pins `routeIndex` and Kingdom-Rush-style waves assign a path. A pinned route beats junction policies.
- All randomness uses a seeded per-wave PRNG. Replays and headless balancing are then deterministic, and Arknights levels likewise carry a `randomSeed`.

**6. Movement geometry and smoothing.**
- The centreline polyline runs through tile centres. At each turn cell, replace the corner with a quarter-circle arc of radius r ≤ 0.5 tile so the enemy stays inside the tile. An arc of r = 0.5 is π/4 ≈ 0.785 tiles long, against 1.0 for the sharp corner.
- Precompute a cumulative arc-length table per route. Position at distance s is found by binary search plus interpolation. Speed modifiers scale ds/dt per cell.
- The visual lateral jitter (Arknights-style `spawnOffset`) is applied after sampling the centreline, so gameplay distance is unaffected.

**7. Progress for targeting across branches.**
- Store `routeId` and `s` (distance travelled) per enemy, plus `remaining = L_route − s`.
- On a multi-route map, "first" should mean the minimum remaining distance (or remaining time), not the maximum distance travelled. Routes differ in length, and raw progress mis-ranks an enemy on a short branch that is about to leak.
- "Last" is the maximum remaining distance.
- Show remaining distance as an on-hover readout in the editor's playtest mode.

**8. Flying routes.**
- Air routes are any-angle waypoint polylines in tile coordinates. Endpoints may sit off-grid (e.g. y = −0.5) so units fly in from outside the map.
- Two authoring modes: auto `straight` (spawn→exit line) and `polyline` (hand-placed points, smoothed with Catmull-Rom or kept straight).
- They are not tied to path cells or terrain, apart from optional `FLY_ONLY` cells and air no-fly zones, following the Arknights `passableMask` idea.
- The enemy definition says whether a unit is `ground` or `air`. A flying-type Pokémon need not automatically be an air unit; let the enemy definition decide.

**9. Example: authored path layer and compiled output.**
Hex digit = out-mask, `.` = no path. Grid-row strings keep git diffs line-local.
```json
{
  "path": {
    "encoding": "outmask-hex:N=1,E=2,S=4,W=8;.=none",
    "layers": [
      { "id": "ground", "z": 0, "targetable": true,
        "out": [
          "........................",
          "......2222224...........",
          "......1.....4...........",
          "2222226.....2222224.....",
          "......4...........4.....",
          "......2222222222222222222"
        ]
      },
      { "id": "tunnel", "z": -1, "targetable": false, "out": [ "........................" ] }
    ],
    "junctions": [
      { "cell": [6, 3], "kind": "junction", "policy": { "type": "alternate", "resetEachRound": true } }
    ]
  },
  "spawns": [
    { "id": "spawn_west", "cell": [0, 3], "kind": "ground", "edge": "W",
      "active": { "type": "always" } },
    { "id": "sky_north", "pos": [10.5, -0.5], "kind": "air" }
  ],
  "exits": [ { "id": "exit_east", "cell": [23, 5], "edge": "E", "livesMultiplier": 1 } ],
  "airRoutes": [
    { "id": "air_main", "from": "sky_north", "to": "exit_east", "mode": "polyline",
      "points": [[10.5, -0.5], [16.5, 2.5], [24.5, 5.5]] }
  ]
}
```
Compiled output (derived; regenerate on export or in the game loader, never hand-edited):
```json
{
  "compiled": {
    "gameplayHash": "sha256:…",
    "compilerVersion": "1.0.0",
    "nodes": [
      { "id": "n0", "kind": "spawn", "ref": "spawn_west", "cell": [0, 3] },
      { "id": "n1", "kind": "split", "cell": [6, 3] },
      { "id": "n2", "kind": "merge", "cell": [18, 5] },
      { "id": "n3", "kind": "exit", "ref": "exit_east", "cell": [23, 5] }
    ],
    "edges": [
      { "id": "e0", "from": "n0", "to": "n1", "layer": "ground", "length": 6.0, "timeFactor": 1.0 }
    ],
    "routes": [
      { "id": "spawn_west>N", "spawn": "spawn_west", "exit": "exit_east",
        "edges": ["e0", "e1", "e3"], "length": 31.57, "expectedShare": 0.5 },
      { "id": "spawn_west>S", "spawn": "spawn_west", "exit": "exit_east",
        "edges": ["e0", "e2", "e3"], "length": 27.14, "expectedShare": 0.5 }
    ]
  }
}
```
Strong architectural recommendation: put the compiler, validator and simulation in one plain-TypeScript package with no Phaser dependency, imported by both the editor and the game. They then can never disagree about what a map means.

### Gaps
- No published source was found describing how BTD6 or Kingdom Rush internally store branch choice (per-junction counters vs pre-assigned routes), or how BTD6 defines "first" across branches of different length.
- No source was found on how commercial TDs handle stroke-based path painting. The out-mask and stroke approach above is my design, by analogy with road and pipe tools.

## What must the editor validate before save/export, and which design-quality metrics should a "clear check"-like tool show?

### Takeaway
Validation should be layered. Schema and reference integrity come first. Then path-graph soundness: every path cell must be forward-reachable from a spawn and backward-reachable to an exit, the graph must have no cycles, and ambiguous cells must be resolved. After that come terrain and obstacle consistency, then wave references. Errors block export; warnings do not. The analytics that matter most are per-route length and time, a coverage heatmap (path length within range R of each buildable cell), chokepoint and multi-pass cells, buildable area by placement class, and branch balance. All can be computed in milliseconds on a TD-sized grid.

### Cited Findings
- BFS from the goal gives a reachability test: cells cut off from the goal are never reached — [Red Blob Games: Flow Field Pathfinding for Tower Defense](https://www.redblobgames.com/pathfinding/tower-defense/)
- A maze TD that can fully block the goal soft-locks enemies. The local skill says to forbid placements that sever the path — [tower-defense SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/SKILL.md)
- Level-design practice: validate the critical path with a flood fill that respects gates. The blockout checklist includes "no soft-lock" and "plays well as untextured geometry", and says to playtest with players, not only the designer — [level-design SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/SKILL.md), [pacing-and-flow.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/references/pacing-and-flow.md)
- The core coverage formula: `time_in_range = path_length_in_range / enemy_speed`, and `damage_dealt = effective_dps × time_in_range`. A lane holds if the summed damage from covering towers is at least the enemy HP, adjusted for overlapping enemies and single-target limits — [balancing.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/references/balancing.md)
- Arknights encodes per-level placement limits (`characterLimit`, `tilesDisallowToLocate`) and per-tile `buildableType`. Placement restrictions are data, checked per cell — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- BTD6 obstacles can gate build area. On Spillway, four valves block most towers from reaching the middle until removed — [Bloonswiki: Spillway](https://www.bloonswiki.com/Spillway) (via search summary)

### Inferences
**Validation catalogue** (E = error, blocks export; W = warning; I = info). Each issue carries a cell or ID so the editor can click to focus it, like a compiler problem list.

*Schema and integrity*
- E: `schemaVersion` is supported (else run migrations); IDs are unique; every reference resolves (spawn, exit, route, junction, obstacle, zone, terrain type, enemy, tower IDs against the pinned game registry version).
- E: all cells, footprints and points are inside grid bounds (air points may use a margin of about 1 tile).

*Path graph*
- E: every ground spawn has at least one route to an exit.
- E: no orphan or dead-end cells. The set of path cells must equal the intersection of forward reachability from all spawns and backward reachability from all exits. Report the cells that fall outside it.
- E: every out bit points to a path cell on the same layer, or off-grid only at an exit, or to an explicit layer ramp.
- E: out-degree 0 only at exits, in-degree 0 only at spawns.
- E: no directed cycles (Kahn's algorithm), unless the map uses an explicit, bounded loop feature.
- E: a cell with in≥2 and out≥2 must declare `kind: junction | crossing`. Each split needs a policy; the editor auto-inserts `alternate` and shows it.
- E: path cells must have walkable terrain. No obstacle footprint may overlap a path cell. No tower may be pre-placed on a path.
- E/W: spawns and exits must sit on the map edge, facing outward, unless flagged `portal: true` (cave mouth, warp pad). Then they become W/I.
- W: adjacent but unconnected path cells (likely visual confusion for players). W: a path running along the map edge (coverage only from one side).
- W: route length below a minimum (configurable per difficulty, e.g. under N tiles or under T seconds for the reference enemy). W: spawn and exit closer than X tiles.
- W: more than about 64 enumerated routes. I: route count, split and merge count, crossings.

*Air routes*
- E: each air route starts at an air-capable spawn (or a ground spawn marked `airAlso`) and ends at an exit. It has at least 2 points and non-zero length.
- W: an air route never passes within reference range R of any buildable cell (an unanswerable flier).

*Terrain, obstacles, zones*
- E: obstacle footprints don't overlap each other or path cells. `removal.cost ≥ 0`. The removal prerequisite graph is acyclic (the Dark Path-style tier chain). `becomes` names a valid terrain type.
- W: buildable cells unreachable in practice, meaning no cell of that placement class lies within range R_max of any route (dead real estate). I: buildable cells available only after a removal.
- E: each placement class required by the game's starter roster is present, if the map design requires it. Example: a map that advertises water towers must have water cells.

*Waves (if embedded or referenced)*
- E: every group's `spawn` and `route` exist, and the route belongs to that spawn. Movement types match: a ground enemy on an air route is an error, and so is an air enemy on a ground path unless the enemy definition allows it.
- E: `count ≥ 1`, `intervalSec ≥ minInterval`, `startSec ≥ 0`. Enemy IDs exist in the registry. Every difficulty overlay references existing groups.
- W: a group spawns while its spawn is inactive that round under `activeRounds`. W: a boss round has no telegraph text.

*Themes (seasonal skins)*
- E: theme files contain only visual keys (tileset frames, obstacle sprites, music, palette, ambient FX) and no gameplay fields.
- W: a terrain or obstacle key used by the map has no art in a declared theme.
- Show a "gameplay hash" (a hash of canonicalised gameplay layers and waves) that must be identical across all themes. This guarantees "same layout, same gameplay".

**Design-quality metrics (the "clear check" dashboard)**
- *Per-route length and time*: L in tiles, plus time-on-path for each reference enemy speed, T = Σ cellLen / (v × speedMult). Show the shortest, longest and share-weighted mean, and the time to first possible coverage (seconds from spawn until an enemy is within R of any buildable cell). Low values make early leaks unfair.
- *Coverage heatmap*: for each buildable cell c and reference range R, cov(c) = Σ over routes of share(route) × (length of route within distance R of c's centre). Compute by sampling each route every 0.1 tile; a 30×20 grid with about 2,000 samples is about 1.2M distance checks, well under 50 ms. Render a per-placement-class heatmap with an R slider. Divide by speed to get "seconds in range", which plugs directly into the local `damage_dealt` formula.
- *Multi-pass / chokepoint score*: the number of distinct edges, or distinct non-contiguous passes of the same route, within R of a cell. The famous "loop spots" score high here. Flag maps whose top 1% of cells hold more than X% of total coverage: a single dominant spot is a "solved map" risk.
- *Buildable area %*: by placement class (land, water, high ground), before and after all removals. Include the cash needed to unlock everything (Σ removal costs) against the expected cumulative cash by round N.
- *Branch balance*: for each split, the ratio of the branches' lengths and times, plus coverage potential per branch, meaning the best achievable coverage at R from cells that see only that branch. Very asymmetric branches are fine if intentional, so show the numbers rather than enforcing symmetry.
- *Merge pressure*: route-share-weighted traffic per edge after merges. Merges concentrate density, which favours splash damage.
- *Exit safety*: coverage available in the last 20% of each route. If it is very low, any leak through the early defences is unrecoverable.
- *Air vs ground separation*: the distance between air routes and ground coverage hot spots. Shows whether anti-air must be placed separately.

### Gaps
- No published thresholds were found for "good" values of these metrics (minimum path length, buildable %, coverage concentration). They must be calibrated against the user's own playtests. The numbers above are illustrative.
- No source was found documenting the validation rules of existing TD editors (e.g. the BTD6 or Kingdom Rush internal tools, or the Warcraft III TD community's conventions).

## How should waves be authored as data (rounds → groups, bosses, rewards, difficulty, early-send), and what balancing tooling helps?

### Takeaway
All the sourced systems converge on wave → group/action. A group is an enemy type with modifiers, a count, a start offset, and either a spawn interval or a first-to-last duration. Groups target a route or spawn by reference. Arknights adds fragment sequencing, random spawn groups and difficulty masks; BTD6 adds per-round entrance rules. Store one canonical timing form (start + count + interval) and show the others as derived. Keep waves in their own versioned file that references map IDs. Build an analytics panel (HP per round, HP arrival rate, cumulative cash, required DPS) and a swimlane timeline.

### Cited Findings
- The local TD skill models a wave as a list of `(enemy_type, count, spacing)` spawned over time. It recommends geometric HP growth of about 1.1–1.2× per wave against a roughly linear income curve. Income is kill bounty × kills plus a wave-clear bonus. Leaks should cost lives and bounty. Specials (flying, bosses) should be telegraphed one wave ahead. It also recommends an early-send bonus and spike → breather → spike pacing — [tower-defense SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/SKILL.md), [balancing.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/references/balancing.md)
- Pacing as data: author beats with an `intensity` from 0 to 1 and a type (teach, combat, rest, climax). Intensity should form a rising sawtooth, with a rest before the climax and an introduce → develop → twist → test teaching loop — [level-design SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/SKILL.md), [pacing-and-flow.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/references/pacing-and-flow.md)
- Arknights waves have `preDelay`, `postDelay` and `maxTimeWaitingForNextWave`, and are split into `fragments` (each with a `preDelay`). Fragments contain actions with `key`, `count`, `preDelay`, `interval`, `routeIndex` and `blockFragment`, plus `randomSpawnGroupKey`/`weight` for random alternatives. Difficulty-specific modifiers carry a `difficultyMask` (`runes`) — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- A BTD6 Bloon group is defined by a Bloon type (with or without Bloon Mods), a duration (the time between the first and last Bloon spawning), and, for random rounds, the range of rounds it can appear on — [Bloonswiki: Apopalypse (BTD6)](https://www.bloonswiki.com/Apopalypse_(BTD6)) (via search summary)
- The BTD6 round list writes each round's composition as groups with counts, such as round 1 = "Red×20", with a duration column — [Bloonswiki: Rounds (BTD6)](https://www.bloonswiki.com/Rounds_(BTD6)) (via search summary)
- BTD6 entrance activation can depend on the round (Bazaar parity, Bloonarius Prime prime rounds) — [Bloonswiki: Bazaar](https://www.bloonswiki.com/Bazaar) (via search summary)
- Kingdom Rush lets players call a wave early via a button when the wave icon appears. Wiki level pages list per-wave compositions — [TrueAchievements: Kingdom Rush](https://www.trueachievements.com/a382017/daring-achievement), [KR Wiki: Bandit's Lair](https://kingdomrushtd.fandom.com/wiki/Bandit%27s_Lair) (via search summary)
- In the WC3 TD toolkit, creep waves are defined per path through a WaveManager of ordered regions — [HiveWorkshop: TDTK](https://www.hiveworkshop.com/threads/tower-defence-toolkit-tdtk.324296/) (via search summary)

### Inferences
**Recommended wave file** (separate from the map so layout and waves diff and version independently; it can hold several wave sets per map, e.g. campaign or challenge):
```json
{
  "format": "pokeTD.waves",
  "schemaVersion": 1,
  "mapId": "viridian_forest",
  "mapGameplayHash": "sha256:…",
  "registryVersion": "enemies@2026.10",
  "defaults": { "intervalSec": 0.8, "betweenRoundsSec": 0, "autoStart": false },
  "difficulties": {
    "easy":   { "hpMult": 0.8,  "speedMult": 1.0, "cashMult": 1.2, "startCash": 800, "lives": 150 },
    "normal": { "hpMult": 1.0,  "speedMult": 1.0, "cashMult": 1.0, "startCash": 650, "lives": 100 },
    "hard":   { "hpMult": 1.25, "speedMult": 1.1, "cashMult": 0.9, "startCash": 600, "lives": 50 }
  },
  "rounds": [
    {
      "n": 1, "intent": "teach", "intensity": 0.1,
      "bonusCash": 100,
      "earlySend": { "allowed": true, "cashPerSecondSkipped": 1 },
      "telegraph": null,
      "groups": [
        { "id": "r1_rattata", "enemy": "rattata", "level": 3, "count": 8,
          "startSec": 0.0, "intervalSec": 1.0,
          "spawn": "spawn_west", "route": null, "branchPolicy": "map" },
        { "id": "r1_pidgey", "enemy": "pidgey", "level": 3, "count": 4,
          "startSec": 6.0, "intervalSec": 1.5,
          "spawn": "sky_north", "route": "air_main",
          "difficulty": ["normal", "hard"] }
      ]
    },
    {
      "n": 10, "intent": "climax", "intensity": 1.0,
      "bonusCash": 300,
      "telegraph": { "text": "A wild Onix approaches!", "showOnRound": 9 },
      "groups": [
        { "id": "r10_onix", "enemy": "onix", "level": 14, "count": 1,
          "startSec": 2.0, "boss": true, "livesCost": 20,
          "spawn": "spawn_west", "route": "spawn_west>S",
          "modifiers": { "hpMult": 1.0, "shield": 0 } },
        { "id": "r10_escort", "enemy": "geodude", "level": 10, "count": 6,
          "startSec": 3.0, "intervalSec": 0.6, "spawn": "spawn_west",
          "branchPolicy": { "type": "weighted", "weights": { "N": 1, "S": 2 } } }
      ]
    }
  ],
  "freeplay": { "fromRound": 31, "hpGrowth": 1.15, "generator": "pool", "seed": 12345 }
}
```
- *Timing*: the canonical form is `startSec + count + intervalSec`. The editor also shows `endSec = startSec + (count − 1) × intervalSec`, the BTD6-style "duration". Dragging the end handle on the timeline edits `intervalSec`. Optional `fragments` (Arknights-style blocking sub-phases) can come later: `"blockUntil": "groupCleared:r10_onix"`.
- *Rewards*: per-kill bounty lives in the enemy definition (the game registry), so it is not duplicated per map. Round `bonusCash` lives in the wave file. Difficulty `cashMult` scales both. Early-send bonus is per round. Leaks cost `livesCost` (default from the enemy definition; bosses higher) and forfeit the bounty, per the local skill.
- *Difficulty*: one wave file with overlays (multipliers plus per-group `difficulty` masks, as Arknights uses `difficultyMask`) beats three copied files, because edits stay in sync. Allow explicit per-difficulty group replacement for real redesigns.
- *Pokémon-specific fields*: `level` (scales stats), `shiny`/`variant`, `catchable` (PTD's capture mechanic), and `holdsItem` (supports Focus/Ignore Candy-style targeting). Movement type comes from the enemy definition (`ground`/`air`), with a per-group override only if the design allows it.
- *Entrance rules*: per-spawn `active` rules (always, parity, prime, list) live in the map file, because they belong to the map. Waves can override them per round with `"spawnsActive": ["spawn_west"]`.

**Balancing tooling (computed live in the wave editor)**
- Per round: total effective HP, `ΣHP = Σ count × hp(enemy, level) × hpMult`, shown as a bar chart with a reference band for 1.1–1.2× geometric growth (the local skill's guideline). Points outside the band are flagged as "spike" or "breather", which is fine if intended and matches the round's `intent`.
- HP arrival rate at the exit: shift each group's spawn timeline by its route's travel time and plot HP per second arriving at the exit per route. The peak gives the minimum DPS needed if nothing is killed early.
- Cumulative cash curve: start cash + Σ (bounties + round bonuses) up to round n. Compare it against the cost of the reference defence needed for that round's peak HP rate (DPS/$ of reference towers). Show a "pressure ratio" line, where above 1 means the player can't afford the answer, matching the skill's "almost afford" target.
- Swimlane timeline: one lane per spawn or route, each group a bar from start to end with enemy icons. Overlapping bars show density, and boss markers and telegraphs are visible. Scrub to preview the spawn sequence on the map with ghost enemies.
- Intensity overlay: the author's `intensity` per round against the computed pressure ratio. Divergence shows rounds that are labelled "rest" but play hard, and the reverse.

### Gaps
- The exact BTD6 internal round-data schema (field names or units for group start/end) could not be confirmed. Mod-helper documentation was not reachable. Only the wiki-level description (type, modifiers, duration, count) is sourced.
- The Kingdom Rush wave schema (Lua data) and its path-assignment fields were not found. That waves assign groups to specific paths is suggested by multi-entrance levels, but the format is not sourced.
- PTD's wave data (levels, catchable flags, candy carriers) was not found.

## How should terrain gameplay rules be encoded per cell, separately from visuals (water-only, no-build, removable obstacles, high ground, LOS, slow tiles, type-restricted tiles)?

### Takeaway
Use a terrain-type registry (each type is a bundle of gameplay flags), plus a per-cell terrain grid, plus sparse overlay layers for things that don't fit a base type: obstacles with footprints and removal costs, zones (no-build, no-fly), and modifiers (range bonus, slow). Visuals are a separate theme mapping from terrain and obstacle keys to art. Arknights' per-tile `heightType`/`buildableType`/`passableMask` and BTD6's priced, ordered removables are the sourced precedents.

### Cited Findings
- Arknights tiles carry gameplay attributes independent of art: `tileKey`, `heightType` (LOWLAND/HIGHLAND), `buildableType` (MELEE/RANGED/NONE), `passableMask` (ALL/FLY_ONLY), `playerSideMask`, a `blackboard` of parameters and `effects`. There is also a level-wide `tilesDisallowToLocate`. Rune modifiers can be filtered by `buildableMask` and `professionMask` — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- BTD6 removables cost cash, and the price is independent of difficulty but scaled by a challenge rule that can also disable removal. Some maps have ordered tiers (Dark Path: $250 → $500 → $1,000 → $1,000). Obstacles can wall off build area (Spillway valves, $2,000 each). A perk discounts them — [Bloonswiki: Removable](https://www.bloonswiki.com/Removable), [Bloonswiki: Spillway](https://www.bloonswiki.com/Spillway), [Dark Path mirror](https://breezewiki.discard.no/bloons/wiki/Dark_Path), [Bloonswiki: Obstacle Demolition](https://www.bloonswiki.com/Obstacle_Demolition) (via search summary)
- Kingdom Rush fliers ignore ground blockers: soldiers can't engage them, and some towers (druids, bombards) can't reach them. Targetability is a per-unit/per-tower rule, not a terrain rule — [KR Wiki: Perython](https://kingdomrushtd.fandom.com/wiki/Perython), [KR Wiki: Saurian Razorwing](https://kingdomrushtd.fandom.com/wiki/Saurian_Razorwing) (via search summary)
- The local pathfinding reference notes that `cost()` can return terrain weights for varied movement cost (slow terrain) — [pathfinding.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/game-ai/references/pathfinding.md)

### Inferences
**Model: terrain types are flag bundles, plus overlays.**
- The terrain-type registry lives in the game repo as shared data, not per map, so every map means the same thing by "water":
```json
{
  "terrainTypes": {
    "grass":     { "placement": ["land"],         "walkable": false, "flyable": true, "losBlock": false, "height": 0 },
    "highgrass": { "placement": ["land"],         "walkable": false, "flyable": true, "losBlock": false, "height": 0, "rangeMult": 0.9 },
    "water":     { "placement": ["water"],        "walkable": false, "flyable": true, "losBlock": false, "height": 0 },
    "cliff":     { "placement": ["land", "high"], "walkable": false, "flyable": true, "losBlock": false, "height": 1, "rangeMult": 1.15 },
    "rockwall":  { "placement": [],               "walkable": false, "flyable": true, "losBlock": true,  "height": 2 },
    "void":      { "placement": [],               "walkable": false, "flyable": true, "losBlock": false, "height": -1 },
    "path_dirt": { "placement": ["path"],         "walkable": true,  "flyable": true, "losBlock": false, "speedMult": 1.0 },
    "path_mud":  { "placement": ["path"],         "walkable": true,  "flyable": true, "losBlock": false, "speedMult": 0.7 }
  }
}
```
- *Placement as tags plus predicates*: a cell offers placement tags (`land`, `water`, `high`, `path`), and each tower or Pokémon declares `canPlaceOn` as an any-of list. Examples: Water-types get `["water", "land"]`, or only `["water"]` for Magikarp-like units. Rock/Ground types can get `["land", "high"]`. `path` placement allows trap-style units, mirroring Arknights MELEE-on-road. This keeps type-restricted tiles data-driven. Adding "lava, Fire-types only" later is a registry entry, not code.
- *No-build zones*: a sparse `zones[]` overlay with `rule: noBuild | noFly | noAir` and a cell list or rects. It sits on top of the terrain, so a bridge deck over water can be no-build without a fake terrain type.
- *Removable obstacles*: instances, not terrain:
```json
{ "id": "boulder_2", "type": "boulder", "origin": [4, 2],
  "footprint": [[0,0],[1,0],[0,1],[1,1]],
  "losBlock": true, "becomes": "grass",
  "removal": { "cost": 450, "requires": ["boulder_1"], "removable": true } }
```
  The cost is difficulty-invariant but scaled by a global `removalCostMult` (the BTD6 precedent). `requires` gives Dark Path-style tiers. `becomes` defines the cells after removal. Pokémon-flavour option: removal needs a Pokémon with Cut or Rock Smash present instead of cash, as `{"requiresAbility": "cut"}`.
- *Elevation and range*: an integer `height` per terrain. A tower's effective range is `range × rangeMult(cell) × heightBonus(height)`. Keep the bonus a single global table (e.g. +15% per level), so all maps behave the same.
- *Line of sight*: `losBlock` cells and obstacles. A tower may target an enemy only if a grid ray (Amanatides–Woo voxel traversal) from tower centre to enemy crosses no `losBlock` cell whose height exceeds the tower's height. Towers can carry `ignoresLOS` (mortar-style). Precompute per-cell visibility masks against path samples for the heatmap.
- *Slow and fast path tiles*: `speedMult` on the path terrain (mud, tall grass, ice). The path compiler integrates it into edge time, so time-on-path metrics and flow are correct.
- *Range-modifying tiles*: `rangeMult` on the terrain type, or a modifier overlay `{"kind": "rangeMult", "value": 1.2, "cells": [...]}` for one-off "rune" tiles (the Arknights rune analog). The editor previews the modified range circle on hover.
- *Map file grid encoding*: a legend plus row strings for diff-friendliness:
```json
{
  "grid": { "width": 24, "height": 16, "tileSize": 32 },
  "terrain": {
    "legend": { ".": "grass", "~": "water", "^": "cliff", "#": "rockwall", "=": "path_dirt", "m": "path_mud" },
    "rows": [ "........~~~~~~..........", "...^^...~~~~~~....###..." ]
  },
  "zones":     [ { "id": "bridge_nobuild", "rule": "noBuild", "cells": [[12,3],[12,4]] } ],
  "modifiers": [ { "id": "focus_stone", "kind": "rangeMult", "value": 1.2, "cells": [[9,7]] } ],
  "obstacles": [ ],
  "themes":    { "default": "spring", "available": ["spring", "autumn", "winter", "halloween"] }
}
```
- *Themes*: `themes/<theme>.json` maps terrain keys to tileset and autotile rules, and obstacle types to sprites, plus music and ambience. A theme cannot override any gameplay flag. The validator enforces this, and the "gameplay hash" proves it. Path visuals use autotiling driven by the out-masks, so the art follows the logical path.
- Path cells as terrain vs. a separate layer: keep the path's directed connectivity in the path layer (previous section). Terrain under path cells just says "walkable path surface, speedMult X". Painting a path should auto-set the terrain under it, with a guard against painting a path over water unless the cell is bridged.

### Gaps
- No source was found for how BTD6 encodes water vs land placement or line of sight in data. Only behaviour descriptions exist on the wiki, and those pages weren't reachable.
- No source was found for PTD's water-placement rules.
- Specific elevation/range-bonus numbers from shipped games were not found. The +15% figure above is a placeholder.

## How can the editor support in-editor playtest and a "clear check" analog (headless simulation, auto-placed reference towers, beatability proof, test waves, speed controls)?

### Takeaway
Make the simulation a deterministic, fixed-timestep, Phaser-free module shared by the game and the editor. The editor can then (a) play the map interactively with speed controls and wave injection, (b) run thousands of times faster in a Web Worker for bot verification, and (c) re-run recorded human clears as regression tests. The export gate, the "clear check", is a stored record tying the gameplay hash, sim version, strategy and seed to a pass result. Editing gameplay invalidates it, as uploading in Super Mario Maker requires clearing the level first (the user's framing).

### Cited Findings
- PTD offered fast-forward and map zoom (100/75/50/25%) — [PTD Wiki (fandom)](https://pokemontowerdefense.fandom.com/wiki/File:Wave.png) (via search summary)
- Kingdom Rush lets players call waves early from the wave icon — [TrueAchievements: Kingdom Rush](https://www.trueachievements.com/a382017/daring-achievement)
- Arknights level data carries a `randomSeed` field, and random spawn groups are data-driven (`randomSpawnGroupKey`, `weight`). Randomness is part of the authored level — [ArknightsGameData level_main_00-01.json](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/levels/obt/main/level_main_00-01.json)
- A precomputed field serves all enemies at once, which is cheap for crowds — [Red Blob Games: Flow Field Pathfinding for Tower Defense](https://www.redblobgames.com/pathfinding/tower-defense/)
- The local skill's "can this lane hold?" DPS-vs-HP check, and its advice to scale movement by `dt` so speed is frame-rate independent — [tower-defense SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/tower-defense/SKILL.md)
- Level-design practice: playtest and iterate, and validate with players, not only the designer — [level-design SKILL.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/SKILL.md), [pacing-and-flow.md](C:/Users/Micha/Desktop/newbloons/.claude/skills/level-design/references/pacing-and-flow.md)

### Inferences
**Simulation core**
- Fixed tick (e.g. 30 or 60 Hz), integer or fixed-step time, seeded PRNG (e.g. a mulberry32/xoshiro-style generator per round). The input log holds placements, upgrades, sells, early-sends and removals as `{tick, action}`. The same input log plus the same map and wave files plus the same sim version reproduce the same outcome.
- Run headless in a Web Worker at "as fast as possible": a 40-round map with a few hundred enemies per round should simulate in well under a second. Phaser only renders snapshots, and the editor's play mode is the game's renderer pointed at the in-memory map.

**Playtest controls**
- Speed 0.25×/1×/2×/4×/8×/max, pause, single-tick step.
- "Send round N now", "send group X", "spawn N of enemy E on route R".
- God mode (infinite cash or lives), "freeze enemies", show route choice per enemy, show the remaining-distance readout.
- Overlays: leak markers per route, kill-density heatmap, per-tower damage share, live coverage heatmap.

**Bot strategies for beatability**
- *Greedy coverage bot*: every N seconds of game time, buy the most cost-efficient affordable reference tower at the cell with the highest uncovered coverage score for its placement class. Upgrade when the marginal DPS per $ beats a new tower. It uses the heatmap from the metrics section.
- *Scripted reference build*: an author-saved placement list per round. This is effectively a stored clear replay.
- *Per-route stress*: force every group onto each route in turn, so a branch that is only safe under `alternate` gets exposed.

**Clear-check gate (export blocker or badge)**
```json
"clearCheck": {
  "gameplayHash": "sha256:…",
  "simVersion": "sim@1.4.0",
  "results": [
    { "difficulty": "normal", "strategy": "bot:greedy_v2", "seed": 12345, "passed": true,  "livesLeft": 87, "roundsCleared": 40 },
    { "difficulty": "hard",   "strategy": "replay:mike_2026-10-21", "seed": 777, "passed": true, "livesLeft": 12 },
    { "difficulty": "hard",   "strategy": "bot:minimal", "seed": 12345, "passed": false, "failedRound": 23 }
  ]
}
```
- A pass by at least one strategy per shipped difficulty is required. If `gameplayHash` changes, the badge goes stale, and stored human replays are re-run automatically as regression tests.
- Also track a lower bound on difficulty: a "minimal" bot (e.g. one tower type, no upgrades) should fail hard mode. If it passes, the map is probably too easy. This gives a "difficulty margin" metric.
- Theme changes don't affect the hash (gameplay only), so seasonal skins never need re-verification. That is a concrete payoff of the gameplay/visual split.
- Caveat: a bot clear proves solvability, not fun or fairness. Keep the human-playtest checklist from the level-design skill (pacing sawtooth, telegraphed specials, no unfair first encounters) as an export reminder rather than an automated gate.

### Gaps
- No source was found describing how commercial TD studios (Ninja Kiwi, Ironhide, Hypergryph) verify map beatability internally, or whether they use bots.
- No source was found for Super Mario Maker's clear-check rules in this session. The analogy rests on the user's own framing.
- Simulation performance figures above are estimates, not measurements. They should be benchmarked on the user's actual entity counts.
