# Starter tilesets: download checklist

These are enough art for the first summer map and its winter version. They come from the research report (`reports/Tower defense map editor design.md`, "Ten downloads a week makes art the critical path").

**Where to put files:** save every download into `downloads/` at the repo root. Zips and already-extracted folders are both fine. Then run `npm run packs:import`. For each download, the importer:
- matches it to its catalog row (DeviantArt files match exactly by the code in their name);
- rejects JPEG previews;
- detects autotiles, animated strips and tile size;
- records hashes and a snapshot of the terms;
- writes `assets/raw/<pack>/pack.json`.

`downloads/` and `assets/raw/` are git-ignored, so raw sheets never get committed.

Files it can't match stay in `downloads/` with candidate rows and the exact line to add to `downloads/match.json` (Eevee Expo zips usually need one). After importing, open each new `pack.json`, read the terms snapshot, and set `ripped_from_official`, `upstream_credits` and named tiles/regions. Then reference the pack from a theme and run `npm run art`.

**For every item:**
1. Keep the original file name.
2. Copy the page's description or terms text into a `.txt` with the same name. Artists' terms change, so we keep a dated copy.
3. Never use the page preview image. DeviantArt previews are resized or JPEG, and they break the tile grid.

## Batch A: bundles (no DeviantArt quota, do these first)

Eevee Expo resource pages link to MediaFire or Google Drive zips. Keep each zip's credits `.txt`.

| Done | What | For | Link | Credit |
|---|---|---|---|---|
| [x] | Ekat's Public Gen 3 Tilesets (81 sets, 16 px native) | Outdoor base, trees, buildings | https://eeveeexpo.com/resources/621/ | ☆ (credits file in zip). Contains some official rips: imported as `ee-621` and `ee-621-32px` with `ripped_from_official: "partial"` |
| [x] | IgnathiusNZX: AutoTiles for Rivers and Lakes | Water autotiles | https://eeveeexpo.com/resources/1604/ | ☆ (imported as `ee-1604`) |
| [ ] | lolalime: Auto Water Tiles | Water autotiles (alternative) | https://eeveeexpo.com/resources/1145/ | ☆ (the download needs an Eevee Expo login) |
| [ ] | Anon Alpaca: Big Tree Pack | Trees | https://eeveeexpo.com/resources/602/ | ☆ (hosted on MEGA: download it in a browser) |
| [x] | CinnaYva: Gen 3 Snow Tileset – Update | Winter base | https://eeveeexpo.com/resources/1631/ | ☆ (imported as `ee-1631` and `ee-1631-16px`) |

### What the themes use from Batch A

Region keys are `pack/asset@col,row,w,h` in the sheet's native tiles. `npm run packs:objects -- <pack> <asset> --out preview.png` lists the separate objects on a sheet, which helps find them.

| Kind | Summer | Winter |
|---|---|---|
| Ground | `ee-621/mega_outdoor_tileset:0,0` | `ee-621/gen_3_snow:6,3` |
| Water | `ee-1604/sweet_water` (animated) | `ee-621-32px/snow_2` (ice) |
| Enemy path | `ee-621-32px/default_2` | `ee-1631/snowpath` |
| Tree (2×3) | `ee-621/mega_outdoor_tileset@0,105,2,3` | `ee-621/gen_3_snow@2,2,2,3` |
| Small tree (1×2) | `ee-621/mega_outdoor_tileset@5,111,1,2` | `ee-621/gen_3_snow@4,2,1,2` |
| House (5×5) | `ee-621/brick_house_tiles_revamp@0,0,5,5` | `ee-1631/customtilesetsnow@0,75,5,5` |
| Bush | `ee-621/mega_outdoor_tileset@0,5,1,1` | `ee-621/gen_3_snow@0,1,1,1` |
| Rock | `ee-621/mega_outdoor_tileset@0,183,1,1` | `ee-621/gen_3_snow@2,5,1,1` |
| Flowers | `ee-621/brick_house_tiles_revamp@7,8,1,1` | `ee-1631/customtilesetsnow@6,23,1,1` |

Every entry has the placeholder as its fallback, so a clone without the downloads still builds.

## Batch B: DeviantArt, week 1 (10 downloads, the free-account cap)

You need to be logged in, and the Download button gives the original file.

| Done | What | For | Link | Credit |
|---|---|---|---|---|
| [ ] | J-Treecko252: Path Tiles EX Dirt | Enemy path (summer) | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469 | ☆ |
| [ ] | J-Treecko252: Path Tiles EX Compacted Snow | Enemy path (winter) | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Compacted-Snow-884688441 | ☆ |
| [ ] | Slaqueen: Free water autotile | Animated water | https://www.deviantart.com/slaqueen/art/Free-water-autotile-811989710 | ☆ |
| [ ] | J-Treecko252: Animated White Sand Shore Autotile | Shorelines | https://www.deviantart.com/j-treecko252/art/Animated-White-Sand-Shore-Autotile-898198420 | ☆ |
| [ ] | Ekat99: Outdoor Collection Big Trees | Trees | https://www.deviantart.com/ekat99/art/Outdoor-Collection-Big-Trees-887616654 | ☆ |
| [ ] | Ekat99: Outdoor Collection Conifer | Trees (good in winter too) | https://www.deviantart.com/ekat99/art/Outdoor-Collection-Conifer-887616775 | ☆ |
| [ ] | ditto209: Winter Tileset | Winter (CC BY 3.0) | https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260 | ❉ (CC BY: credit anyway) |
| [ ] | J-Treecko252: Tree Tiles Ver 01 | Trees, with seasonal colour bands | https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004 | ☆ |
| [ ] | TheDeadHeroAlistair: Project Heliodor Ground Megaset | Lower-rip ground alternative | https://www.deviantart.com/thedeadheroalistair/art/Project-Helidor-Ground-Megaset-903477198 | ☆ |
| [ ] | TheDeadHeroAlistair: Project Heliodor Trees Megaset | Trees (credit the tree artists he lists too) | https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Trees-Megaset-895896602 | ☆ |

## Batch C: DeviantArt, week 2

| Done | What | For | Link | Credit |
|---|---|---|---|---|
| [ ] | PeekyChew: Public Tileset Dump 1/4 – Snow | Winter decor | https://www.deviantart.com/peekychew/art/Public-Tileset-Dump-1-4-Snow-827821330 | ☆ |
| [ ] | KingTapir: Snowpoint Outskirt Tiles | Winter | https://www.deviantart.com/kingtapir/art/Snowpoint-Outskirt-Tiles-877324918 | ☆ (read the description: "Personal Use License") |
| [ ] | Ekat99: Gen 3 Snowpoint Temple and Snow Tiles | Winter | https://www.deviantart.com/ekat99/art/Gen-3-Snowpoint-Temple-and-Snow-Tiles-878878345 | ☆ |
| [ ] | Magiscarf: Buildings Tiles w/ Snow | Winter buildings | https://www.deviantart.com/magiscarf/art/Buildings-Tiles-w-Snow-808246734 | ❉ (check the licence; his master sheet is CC BY-NC-SA) |
| [ ] | J-Treecko252: Path Tiles EX Stone Road | Second path style | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Stone-Road-884688722 | ☆ |
| [ ] | J-Treecko252: Path Tiles EX – Stone Road (Snow) | Its winter twin | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Stone-Road-Snow-884688518 | ☆ |
| [ ] | J-Treecko252: Path Tiles EX Cobbled Road | Third path style | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Cobbled-Road-884688709 | ☆ |
| [ ] | J-Treecko252: Path Tiles EX Cobbled Road Snow | Its winter twin | https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Cobbled-Road-Snow-884688431 | ☆ |
| [ ] | TheDeadHeroAlistair: Project Heliodor Composite RPG Maker XP Tileset | Full RMXP sheet | https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Composite-RPG-Maker-XP-Tileset-901089466 | ☆ |

Path Tiles EX comes in summer/snow pairs with the same layout. That is exactly what a seasonal theme swap needs: same shapes, different art.
