# Asset licensing and ingestion for the tileset catalog (acquire, catalog, credit, IP risk, editor manifest)

> Researched 2026-10-21. This is informational research, not legal advice. "Cited Findings" are sourced facts (including first-hand observations of public pages made on 2026-10-21). "Inferences" are the researcher's analysis and recommendations. No image files were downloaded. Pages were only read to check their terms.

## 1. Who the catalog depends on, and what those artists' terms actually say

### Takeaway
The catalog is concentrated: 131 distinct artist strings, with the top 10 accounting for 419 of 711 rows (59%). 85% of rows are marked ☆ (credit required). Every sampled top-artist page asks for credit or uses a CC-BY-family license. None of them addresses raw-sheet redistribution, so the safe reading is "use in a game with credit = yes; re-hosting the raw sheet as a resource = not granted". Several "fan-made" sets (Ekat99, Phyromatical, KingTapir) openly mix in rips of official Pokémon tiles, so "fan-made" does not mean "original".

### Cited Findings
**Catalog statistics (computed from the CSV):**
- 711 rows. Credits column: ☆ = 574, ☆ variants ("check descriptions", Drive README, "depends") = 4, ❉ = 105, ❉ variants ("no information given" ×7, "not necessary but appreciated" ×2, "unsure" ×1) = 10, "Ripped (up to you)" = 17, "?" = 1. — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)
- Sources: DeviantArt 613, Eevee Expo 67, The Spriters Resource 18, Reddit 4, PokeCommunity 2, Bisafans 2, Imgur 1, PokeMMO 1, TCRF 1, Discord (PokéCommunity) 1, GitHub (Team Aqua's Asset Repo) 1. — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)
- Generation: Gen 3 = 506, Gen 4 = 53, Gen 5 = 51, Gen 2 = 15, Gen 7 = 11, Gen 8 = 11, other/unknown = 64. Tabs: Outdoor 382, Indoor 90, Misc 80, Animated 62, "In+Out+Misc" 55, Indoor+Outdoor 28, Auto 14. — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)
- Top artists by row count, with their credit flags:

| Artist | Rows | Flags | Source(s) |
|---|---|---|---|
| Ekat99 | 122 | all ☆ | DA 119, Eevee Expo 3 |
| J-Treecko252 | 101 | all ☆ | DA |
| Aveontrainer | 38 | ☆ 25, ❉ 12, ❉(unsure) 1 | DA |
| Phyromatical | 37 | all ☆ | DA |
| KingTapir | 28 | all ☆ | DA |
| Magiscarf | 26 | ❉ 21, ☆ 5 | DA |
| UltimoSpriter | 20 | all ☆ | DA |
| skatefilter5 | 18 | ❉ 17, ☆ 1 | DA |
| Hek-el-grande | 15 | all ☆ | DA |
| Zeo254 | 14 | ☆ 13, ❉ 1 | DA |
| ditto209 | 14 | all ❉ | DA |
| TheDeadHeroAlistair | 12 | all ☆ | DA |

  Source: [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)

**Stated terms on sampled pages (read 2026-10-21):**
- **Ekat99, "Mega Outdoor Tileset":**
  - The description says the set is public use for non-commercial projects and asks for credit to Ekat plus upstream contributors: Vurtax (FRLG rips), Heartlessdragoon (RSE rips), Heroalistar (palm trees) and Zein (pine tree).
  - It invites users to slice objects out of the sheet.
  - It says nothing on recolor, redistribution or asking permission.
  - Sheet: 128x3600 px, 86.8 KB. Shows "Log in to download".
  - [DeviantArt](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)
- **Ekat99, Eevee Expo bundle "Ekat's Public Gen 3 Tilesets 4.0":**
  - 81 sets plus a .txt with full per-set credits. The page lists 24 credited contributors, including Heartless Dragoon and Pokémon Rejuvenation.
  - It notes the tiles must be resized 2x for Essentials, which means they are native 16 px.
  - Last updated Mar 1, 2022.
  - [Eevee Expo](https://eeveeexpo.com/resources/621/)
- **J-Treecko252, "Apartment Building Tiles 01":**
  - "Free to Edit/Use, just give credit". Primarily for Essentials, but the artist says it may be used however you like.
  - No non-commercial clause, and redistribution is not addressed.
  - 256x1248 px (8 tiles × 32 px).
  - [DeviantArt](https://www.deviantart.com/j-treecko252/art/Apartment-Building-Tiles-01-903544904)
- **Magiscarf, "[Free] New Tiles Mastersheet":**
  - Free to use and edit for non-commercial purposes. The page shows a Creative Commons BY-NC-SA 3.0 license.
  - No specific credit wording.
  - 1728x1776 px.
  - [DeviantArt](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390)
- **Phyromatical, "DoT Day6 – Bridgeton Tileset":**
  - Credit is required for Phyromatical, plus upstream credits to kaliser (bridges) and zetavares852 and TyranitarDark (trees).
  - No terms on commercial use, editing or redistribution. No license shown.
  - A May 2026 comment asks whether fangame use is OK, and there is no artist reply.
  - Other Phyromatical rows are titled "Pokemon League ripped" and "Hearthome Gym Rips".
  - [DeviantArt](https://www.deviantart.com/phyromatical/art/DoT-Day6-Bridgeton-Tileset-649657763); [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)
- **KingTapir, "Alola Tile Dump #7":**
  - Published under a "Personal Use License" for non-commercial fan-game projects, with a request for credit.
  - Editing and redistribution are not addressed.
  - Four other KingTapir rows are titled "(CHECK DESCRIPTION)".
  - [DeviantArt](https://www.deviantart.com/kingtapir/art/Alola-Tile-Dump-7-873115278)
- **Aveontrainer, "PokeCenter":** No usage terms at all. The only note credits Deadhero Allistair for a reference. — [DeviantArt](https://www.deviantart.com/aveontrainer/art/PokeCenter-966014361)
- **TheDeadHeroAlistair, "Project Heliodor Trees Megaset":**
  - Credit is required. Only available for non-commercial purposes.
  - Asks users to also credit the artists whose trees were edited (Remy, Serg!o); those credits are on the sheet.
  - 2096x1232 px.
  - [DeviantArt](https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Trees-Megaset-895896602)
- **ditto209, "Winter Tileset":** The artist says feel free to use the tiles. The page shows a CC BY 3.0 license. 256x672 px. — [DeviantArt](https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260)
- **Zeo254, "PUBLIC TILES WITH CREDITS":**
  - No terms beyond the title.
  - A 2015 commenter asked whether the tiles are from scratch and whether commercial use is OK. No answer was visible.
  - [DeviantArt](https://www.deviantart.com/zeo254/art/PUBLIC-TILES-WITH-CREDITS-336602354)
- **UltimoSpriter, "Black City Tiles":** For public use with credit. Origin not stated (rip vs. original). 2011. — [DeviantArt](https://www.deviantart.com/ultimospriter/art/Black-City-Tiles-206842186)
- **Hek-el-grande, "Pkmn league and statues":** Credit required. The artist says they drew their own statues rather than recolor Nintendo's sprites. — [DeviantArt](https://www.deviantart.com/hek-el-grande/art/Pkmn-league-and-statues-284477144)
- **skatefilter5, "Outside Stuff/Main Trees":**
  - No terms. The artist describes converting and resizing a tileset in Paint for RPG Maker MV/MZ, which suggests an edit of someone else's sheet rather than original work.
  - Links an external pack via fumacrom.com, an ad-link shortener.
  - [DeviantArt](https://www.deviantart.com/skatefilter5/art/Main-Trees-891202430)

**Platform rules:**
- DeviantArt's ToS says other people's content should not be uploaded, downloaded or otherwise copied without the copyright owner's consent (s.19). Users may not reproduce, distribute or make derivative works of Content (s.4). DeviantArt does not claim ownership of user content (s.16). — [DeviantArt Terms of Service](https://www.deviantart.com/about/policy/service/)

### Inferences
- **Usable terms buckets (recommendation):**
  - **(a) Explicit license.** Treat CC BY 3.0 (ditto209) and CC BY-NC-SA 3.0 (Magiscarf) as the clearest grants. They allow redistribution with attribution, and NC-SA adds non-commercial use and share-alike on adaptations. Edited or atlased derivatives of Magiscarf tiles should be marked BY-NC-SA.
  - **(b) Credit plus non-commercial, in prose** (Ekat99, KingTapir, TheDeadHeroAlistair). Fine for a free fan game with credit.
  - **(c) Credit only, no scope stated** (J-Treecko252, Phyromatical, UltimoSpriter, Hek-el-grande, Zeo254). Use with credit. Treat redistribution of the raw sheet as not granted.
  - **(d) No terms at all** (Aveontrainer PokeCenter, skatefilter5). Consent is not established under DA ToS s.19, so message the artist or skip.
- "Redistribution" in practice:
  - A public web game must send tile pixels to every player's browser. That is the "use in a game" artists grant, so it is generally understood as acceptable.
  - What is not granted by bucket (b)–(d) wording is publishing the raw, whole sheets as a downloadable resource dump, which a public git repo effectively is.
  - Keep raw sheets in a private repo, or git-ignored local storage. Ship only the sliced/packed tiles that maps actually use.
- **Credits are transitive.** Ekat99, Phyromatical and TheDeadHeroAlistair all list upstream contributors. The manifest needs per-pack "upstream credits", not one artist field.
- The catalog's ☆/❉ flag is a useful prior but is not authoritative:
  - Magiscarf rows are ❉, yet the page carries a CC BY-NC-SA license, which legally requires attribution.
  - Ekat99's rows are ☆, but the Eevee Expo bundle carries its own credits .txt that should be snapshotted.
- **Recommendation:** credit every artist regardless of ☆/❉. It costs nothing and matches community norms (see section 3).

### Gaps
- Only about 12 of 131 artists' pages were sampled, and one page each for most of them. Terms can differ per deviation: KingTapir's "(CHECK DESCRIPTION)" items and Phyromatical's "ripped" items were not opened.
- Artist profile/journal-level blanket terms (common on DA) were not checked.
- Comment threads (where artists often answer "can I use this?") were only partially visible.
- No sampled artist explicitly forbade or permitted re-hosting the raw sheet, so the redistribution reading above is an inference.

## 2. Acquisition mechanics: getting the real files without breaking ToS, and how long it takes

### Takeaway
DeviantArt is the bottleneck: 613 of 711 rows. Since March 9, 2026, DeviantArt caps "free downloads" at 10 per week for free and Core Basic accounts, 150 for Core+/Pro/Pro+, and 300 for Core Max. The page preview is not a reliable substitute: tall sheets are downscaled by non-integer factors and large sheets are served as JPEGs. Several key artists also publish bundled zips on Eevee Expo (MediaFire links, no login observed), which bypass the per-item DA cost entirely. Recommended route: bundles first, then a logged-in manual DA session within the quota, plus a local matcher script that never scrapes.

### Cited Findings
**DeviantArt download quota:**
- DeviantArt's official team update (published Mar 9, 2026; later updated) sets weekly limits:
  - Non-Core and Core Basic: 10 free downloads.
  - Core+, Core Pro and Core Pro+: 150.
  - Core Max: 300 (doubled as of June 28, 2026).
  - The stated reason is stopping automated mass-downloading and keeping View/Download stats meaningful.
  - Your own work, premium downloads and Sta.sh are exempt.
  - The page also mentions a "monthly limit of 40", which contradicts the weekly figures.
  - [DeviantArt team update](https://www.deviantart.com/team/journal/An-adjustments-being-made-to-1307747979)
- The quota is enforced on both the website button and the API:
  - The API `/api/v1/oauth2/deviation/download/{id}` returns HTTP 400 "Free download limit reached." (error_code 2).
  - The website button shows a quota message suggesting Core.
  - A user reported the limit applies only to deviations where the artist enabled downloads.
  - [gallery-dl issue #9217](https://github.com/mikf/gallery-dl/issues/9217)
- Archive Team independently records that from March 2026 DeviantArt requires a paid account to download originals of more than 10 pictures per week. — [Archive Team wiki](https://wiki.archiveteam.org/index.php/DeviantArt)
- Every sampled deviation showed "Log in to download" to an anonymous visitor (Ekat99, J-Treecko252, Magiscarf, Phyromatical, KingTapir, Aveontrainer, ditto209, TheDeadHeroAlistair, UltimoSpriter, Hek-el-grande, skatefilter5, Zeo254). — e.g. [Ekat99](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036), [J-Treecko252](https://www.deviantart.com/j-treecko252/art/Apartment-Building-Tiles-01-903544904)

**Preview image vs. original (first-hand inspection of page HTML on 2026-10-21; no images downloaded):**
- J-Treecko252, original 256x1248: the embedded "fullview" is a PNG at w_256,h_1248, the same dimensions. — [page](https://www.deviantart.com/j-treecko252/art/Apartment-Building-Tiles-01-903544904)
- Ekat99, original 128x3600: the embedded preview is a PNG at w_126,h_3577, a non-integer downscale that would break the 16 px grid. — [page](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)
- Magiscarf, original 1728x1776: the embedded preview is a JPEG at w_882,h_906, q_70. Lossy, about half resolution, no alpha. — [page](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390)
- A gallery-dl user reports the API serves downscaled versions unless certain conditions are met, and that even CDN versions are resampled. They suggest contacting artists for originals. — [gallery-dl #9217](https://github.com/mikf/gallery-dl/issues/9217)

**DeviantArt ToS and API terms:**
- The ToS adds `noai`/`noimageai` robots directives. Automated systems that fail to respect them are in breach. Users must not interfere with or disrupt the Service. — [DeviantArt ToS](https://www.deviantart.com/about/policy/service/)
- The API License Agreement:
  - Grants a revocable licence to use the API through the licensee's service.
  - Prohibits attempting to exceed rate limits, with block/suspend/terminate as the penalty.
  - Prohibits interfering with the API or site.
  - Requires attribution where DeviantArt content is displayed.
  - Has no explicit clause on storing downloaded content.
  - [DeviantArt API License Agreement](https://www.deviantart.com/about/policy/api/)
- The developer docs moved to `deviantart.readme.io`. The reference returned 403 to an automated fetch, so endpoint scopes could not be quoted. — [DeviantArt developers](https://www.deviantart.com/developers/)

**Eevee Expo:**
- `/resources/621/download` (Ekat's bundle) and `/resources/1604/download` (IgnathiusNZX river/lake autotiles) both return a 301 redirect straight to MediaFire zip pages. No login was required to reach the redirect. — [Eevee Expo 621](https://eeveeexpo.com/resources/621/), [Eevee Expo 1604](https://eeveeexpo.com/resources/1604/)
- Eevee Expo's general terms have no resource-specific credit or redistribution rules. Users retain copyright, and the footer says "Please support the official releases". — [Eevee Expo terms](https://eeveeexpo.com/help/terms/)
- The catalog includes NocTurn's "Tiles – Ready to Use: KingTapir Tilesets" (EE 636). This is a third-party compilation of a top DA artist. — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)

**The Spriters Resource:**
- Returned HTTP 403 to automated fetches (page and FAQ).
- Its FAQ, as summarised in search results, says the site holds no rights over ripped images. Character designs and art belong to the original companies, and the site is community-driven.
- [TSR FAQ](https://spriters-resource.com/page/faq) (via search snippet)

### Inferences
**Effort estimate (researcher's estimate):**
- 613 DA items at 10/week on a free account is about 61 weeks. At 150/week (Core+ for 1–2 months) it is about 4–5 weeks. At 300/week it is about 2–3 weeks.
- Human time is about 2–4 min per item: open the page, read the terms, download, let the script record it. That is roughly 25–45 hours for all 711.
- Conclusion: do not try to ingest the whole catalog. Ingest on demand.

**Recommended respectful workflow:**
1. **Prefer artist bundles and mirrors.** These are legitimate, quota-free, and usually include the credits files:
   - Ekat's Public Gen 3 Tilesets (EE 621, 81 sets in one zip; covers a large share of Ekat99's 122 rows).
   - NocTurn's KingTapir pack (EE 636).
   - Eevee Expo water/autotile resources.
   - The Google Drive folder cited in the Sochipa row.
2. **DeviantArt:** the user downloads manually while logged in, within the weekly quota (optionally Core+ for one month). Do not use gallery-dl, the API or the tokenised CDN URLs embedded in page HTML to bypass the quota. That would be circumvention against the ToS and the API licence.
3. Use the page preview only after verifying that the preview dimensions equal the stated original dimensions. The local tool can compare the PNG size to the "WxH px" the page shows. Reject JPEG previews.
4. **Local helper script (no network fetching of images):**
   - Watches a `downloads/` inbox.
   - Fuzzy-matches each file to a catalog row: DA filenames embed the slugged title, the artist and a deviation code, e.g. `apartment_building_tiles_01_by_j_treecko252_dexy3pk`.
   - Records sha256, dimensions, date retrieved and a pasted or saved copy of the description text (terms snapshot).
   - Detects the tile size (16/32/48) and slices or normalises the sheet.
5. For "no terms" rows, send a short DA note to the artist. Several artists invite requests in comments, and the gallery-dl thread itself suggests contacting artists for originals.
6. Skip external ad-shortener links such as skatefilter5's fumacrom.com. They are an untrusted download source.

**Starter subset for a first themed map plus a winter variant (about 25–40 items; picked from the catalog):**
- **Outdoor base:** Ekat's EE 621 bundle (one zip). It contains rips, so flag it `ripped:partial`. For a lower-rip alternative, use TheDeadHeroAlistair's Project Heliodor Ground, Trees and Caves megasets (3 DA downloads).
- **Water/autotiles:**
  - IgnathiusNZX "AutoTiles for Rivers and Lakes" (EE 1604).
  - lolalime "Auto Water Tiles" (EE 1145).
  - Slaqueen "Free water autotile" (DA).
  - J-Treecko252 "Animated White Sand Shore Autotile" (DA).
- **Trees:**
  - Anon Alpaca "Big Tree Pack" (EE 602).
  - Ekat99 Outdoor Collection Big Trees and Conifer.
  - Optionally a few of J-Treecko252's 15 "Tree Tiles Ver 01–15" sheets.
- **Buildings:** a handful of J-Treecko252 building sheets plus Ekat99 building rows.
- **Winter variant:**
  - ditto209 "Winter Tileset" (CC BY 3.0).
  - CinnaYva "Gen 3 Snow Tileset – Update" (EE 1631).
  - PeekyChew "Public Tileset Dump 1/4 – Snow".
  - KingTapir "Snowpoint Outskirt Tiles".
  - Ekat99 "Gen 3 Snowpoint Temple and Snow Tiles".
  - J-Treecko252 "Path Tiles EX" snow variants (5).
  - Magiscarf "Buildings Tiles w/ Snow".
- That totals about 15–25 DA downloads, which is 2–3 weeks on a free account or a single week on Core+.

**Tile-size reality check:**
- Ekat's sets are native 16 px; the EE page says to resize 2x for Essentials.
- J-Treecko252's are 32 px (256 px = 8 × 32).
- skatefilter5's are RPG Maker MV/MZ (48 px).
- The pipeline must normalise to one game tile size with integer nearest-neighbour scaling only.

### Gaps
- The exact OAuth scopes, grant type and response fields of `/deviation/download/{deviationid}` could not be verified (the readme.io docs returned 403).
- Whether DA's display rules (which sizes get "fullview" PNG vs. downscaled or JPEG previews) are documented officially was not found. The observation is based on three pages.
- Which sampled deviations have the artist-side download toggle disabled could not be told from a logged-out view.
- The DeviantArt team update's weekly vs. "monthly 40" contradiction is unresolved.
- Not checked:
  - Eevee Expo's on-site attachments (vs. external links) may require login.
  - Reddit and Imgur image hosting terms.
  - PokeCommunity attachment rules (403 to fetch).
  - Bisafans.
  - Team Aqua's Asset Repo (GitHub) licence.
  - The Spriters Resource's 2025-era download format and ToS text (403).

## 3. Credits: community conventions and per-asset provenance

### Takeaway
The community norm is "credit every resource you didn't make", typically as a "Resource – Creator" list under a Credits heading, including upstream credits. Bundles often ship their own credits .txt. The game should store provenance per pack and per upstream contributor, and generate its credits screen from the packs actually referenced by shipped maps.

### Cited Findings
- **Community norm:**
  - A PokeCommunity discussion gives the rule of thumb to always credit anything you didn't make yourself, in a simple "Resource Name – Creator Name" format under a Credits heading.
  - Engine forks add "minimum required credits"; the Essentials BES fork names Pira, Clara and the original Essentials team.
  - Fan-game credit lists typically name Essentials' Flameguru, Poccil and Maruno.
  - [PokeCommunity / Mintlify (via search)](https://www.mintlify.com/espparki1/PokemonValhalla/resources/credits); [PokeCommunity thread](https://www.pokecommunity.com/threads/383915) (403 on direct fetch; summarised from search results)
- **Bundles ship credits files.** Ekat's EE bundle includes a txt with complete credits for each set and lists 24 contributors on the page. — [Eevee Expo 621](https://eeveeexpo.com/resources/621/)
- **Sheets carry upstream credits:**
  - Ekat99's Mega Outdoor Tileset names Vurtax, Heartlessdragoon, Heroalistar and Zein. — [DeviantArt](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)
  - Phyromatical credits kaliser, zetavares852 and TyranitarDark. — [DeviantArt](https://www.deviantart.com/phyromatical/art/DoT-Day6-Bridgeton-Tileset-649657763)
  - TheDeadHeroAlistair credits Remy and Serg!o and says further credits are on the sheet image itself. — [DeviantArt](https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Trees-Megaset-895896602)
- **Artists care where their work ends up.** KingTapir asks for credit because they like being able to find where their resources are used. — [DeviantArt](https://www.deviantart.com/kingtapir/art/Alola-Tile-Dump-7-873115278)
- **Ripped sheets conventionally credit the site and ripper.** Wikis using TSR rips cite "The Spriters Resource" plus the ripper's name. — [Super Mario Wiki file page (example)](https://www.mariowiki.com/File:SSBB_Icon_fighter_stock_Squirtle_c4.png)
- **CC licences add formal requirements.** CC BY 3.0 (ditto209) and CC BY-NC-SA 3.0 (Magiscarf) require attribution and a licence reference; NC-SA also requires same-licence adaptations. — [ditto209](https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260), [Magiscarf](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390)

### Inferences
**Credits-screen format (recommendation):**
- Group the screen by category (Tilesets / Autotiles / Sprites / Music / Code), one line per pack:
  - Format: `Pack title — Artist (+ upstream: A, B, C) — source site`.
  - Add the licence name where one exists (e.g. "CC BY-NC-SA 3.0").
- Add a closing disclaimer: Pokémon is a trademark of Nintendo / Creatures / GAME FREAK / The Pokémon Company; this is a free, non-commercial fan project not affiliated with them.
- Mirror the same list in a `CREDITS.md` and on the game's landing page. Fan games conventionally credit in-game and on the download or landing page.

**Provenance record per pack (and per upstream contributor):**
- `artist`, `artist_profile_url`, `source_url`
- `source_site`, `deviation_id` or `resource_id`
- `title`
- `retrieved_at`, `retrieved_by`
- `file_sha256`, `original_dimensions`
- `license_spdx` or `license_text_snapshot`: the verbatim description saved as a text file next to the raw pack, because descriptions can change.
- `credit_required` (bool), `credit_line` (exact preferred wording)
- `upstream_credits[]`
- `commercial_allowed` (yes / no / unspecified)
- `edit_allowed` (yes / no / unspecified)
- `redistribution_raw` (yes / no / unspecified)
- `permission_contact`: link to a DM or comment if the artist was asked.
- `ripped_from_official` (see section 4)

**Auto-generation:**
- At export or build time, walk every shipped map.
- Collect the tile IDs used and resolve them to packs, including packs pulled in via upstream credits.
- Emit `credits.json`, which the Phaser credits scene renders.
- An unused pack never appears; a used pack can never be missing.
- **CI check:** fail the build if any used pack has `credit_required=true` but an empty `credit_line`, or `license_status=unknown`.

### Gaps
- No official Eevee Expo or Relic Castle credit-format guideline was found. Relic Castle's site is gone (see section 4), and Eevee Expo's terms are silent on credits.
- The PokeCommunity thread couldn't be fetched directly.
- The Essentials engine credits are irrelevant here because the game is Phaser, not Essentials. They matter only if Essentials-derived assets or scripts are reused.

## 4. IP risk for a free Pokémon-style fan game, and how fan projects reduce it

### Takeaway
Enforcement against free fan games is real but selective. It concentrates on projects that get press, raise money, sit on ad-supported hosts, or reuse official assets at scale. Recent actions (Relic Castle, March 2024; Pokémon FPS, July 2025) show it continues. The tileset layer is a smaller risk driver than using the Pokémon name, Pokémon sprites, music or monetisation. Within the tilesets, Spriters Resource rips and ROM-base extractions (and rip-containing "fan" sheets) are copies of Nintendo/Game Freak artwork. They carry materially higher risk than original Gen-3-style fan pixel art.

### Cited Findings
**Enforcement history:**

| Date | Event | Source |
|---|---|---|
| Mar 2011 | Pokémon Tower Defense (Sam & Dan Games) was removed from the Android Market after 120k+ downloads. The Flash version stayed playable via Newgrounds at the time. | [DroidGamers](https://www.droidgamers.com/2011/03/31/pokemon-tower-defense-pulled-off-the-android-market-faster-then-we-thought-it-would-but-has-a-new-home/) |
| Aug 2016 | Pokémon Uranium was released Aug 6. It had 1.5M+ downloads within weeks, then got a Nintendo DMCA that removed the download links. It was later pulled from The Game Awards fan-creation nominations. | [Wikipedia – Pokémon fan games](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| 2016 | A 2026 feature says Uranium's lead developer kept updating the game after the notice, and that the reporting on C&D vs. DMCA is contested. | [Aftermath, Oct 1 2026](https://aftermath.site/pokemon-fangames-fansplaining/) |
| Sep 2016 | A Nintendo DMCA covered 562 Game Jolt games (Mario/Zelda/Pokémon). It cited Game Jolt's banner ads and pre-load ads. AM2R was hit the same season. | [Engadget](https://www.engadget.com/2016-09-05-nintendo-issues-dmca-takedown-for-hundreds-of-fan-games.html); [Kotaku](https://kotaku.com/website-says-nintendo-threat-forced-them-to-pull-hundre-1786069047) |
| Dec 2016 | Pokémon Prism (a Gold/Silver ROM hack in development since 2008) got a C&D days before release; it leaked anyway. The task brief's "Prism 2020" date appears to be wrong. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| 2017 | Pixelmon was shut down at TPC's request. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| Apr 2018 | Pokémon Brick Bronze (Roblox) was removed. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| Aug 29, 2018 | Pokémon Essentials and its wiki got a takedown, attributed to its reuse of official game assets. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| Dec 2020 / Jan 2021 | Nintendo of America notices led Game Jolt to remove 379 fan games. Grounds: trademark use, plus Game Jolt's ad revenue. No compensation was sought. | [Nintendo Life](https://www.nintendolife.com/news/2021/01/nintendo_issues_mass_dmca_takedown_379_fan-made_games_forcibly_removed); [Techdirt](https://www.techdirt.com/2021/01/15/nintendo-hates-you-gaming-giant-lobs-dmca-nuke-hundreds-fan-games) |
| Mar 21, 2024 | Relic Castle (a 20k-member fan-game forum that never hosted game files) shut down after a DMCA notice. The sender was not confirmed by the site; outlets and Wikipedia attribute it to Nintendo/TPC. | [Kotaku](https://kotaku.com/pokemon-fan-games-relic-castle-shutdown-dmca-reason-1851359618); [Techdirt](https://www.techdirt.com/2024/03/28/site-that-listed-information-about-3rd-party-pokemon-fan-games-shuts-down-under-threat); [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games) |
| Jul 2025 | TPC issued copyright claims against footage of "Pokemon FPS" within a week of it appearing. | [GamesHub](https://www.gameshub.com/news/news/pokemon-fps-fan-game-11618/) |

- **Pokémon Infinite Fusion:** its creator says he has never made money from it, suggests that is part of why Nintendo hasn't acted, and calls the game free marketing for TPC. — [Aftermath, Oct 2026](https://aftermath.site/pokemon-fangames-fansplaining/)

**What triggers action:**
- Don McGowan, former TPC chief legal officer, says TPC learned of projects from news links, and that the worst thing for a fan project is getting press. On crowdfunding, TPC waits to see whether a Kickstarter-style project gets funded and engages if it does. — [Aftermath interview, Mar 13 2024](https://aftermath.site/pokemon-lawyer-cease-desist-fan-project-pikachu-movie); [VGC summary](https://videogameschronicle.com/news/former-pokemon-lawyer-says-fundraising-and-press-coverage-lead-to-fan-project-takedowns)
- Reggie Fils-Aimé (then NoA president) framed the line as crossing from homage into monetizing Nintendo's IP. — [Twinfinite](https://twinfinite.net/news/reggie-fils-aime-nintendos-stance-fan-made/)
- At its 2024 shareholder Q&A, Nintendo said its basic IP policy is to take appropriate action against any infringement, and that this will not change. — [Nintendo Life, Jul 2024](https://nintendolife.com/news/2024/07/nintendo-on-inappropriate-use-of-its-ip-and-games-action-must-be-taken)
- Wikipedia's synthesis of the triggers: YouTube/Twitch visibility, monetization/funding, and reuse of official assets (the Essentials case). Creators often "play it safe" in promotion. — [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_fan_games)

**Ripped assets:**
- The Spriters Resource disclaims any rights over ripped images. They remain the property of the original companies. — [TSR FAQ (via search)](https://spriters-resource.com/page/faq)
- An itch.io commenter's view (opinion, not policy): TSR rips are tolerated for fangames but not for monetary use or game jams. — [itch.io post](https://itch.io/post/6153373)
- In the catalog, 17 rows are flagged "Ripped (up to you)" (TSR sheets of R/B/Y, G/S/C, RSE and FRLG tilesets). Several DA "fan" sets self-describe as containing rips (Ekat99 credits FRLG/RSE rippers; Phyromatical "Pokemon League ripped"). — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv); [Ekat99](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036)
- PokeRogue (a free browser roguelite, 2024) states it is non-profit with no monetization. Reviewers noted it could still be shut down at any time. — [Retro Dodo](https://retrododo.com/pokerogue-is-an-unmissable-pokemon-roguelite-and-its-free-to-play-in-your-browser/)

### Inferences
**Risk ranking for this project (highest first):**
1. Monetization, donations or crowdfunding of any kind, including Patreon "for server costs".
2. Using the Pokémon name or logo in the game title or domain, official Pokémon sprites, cries or music, or making it look official.
3. Press, viral or streamer attention.
4. Hosting on ad-supported portals: the Game Jolt notices cited the host's ad revenue.
5. Shipping ripped official tiles (TSR, ROM-base extractions, rip-containing fan sheets).
6. Original "Gen 3 style" fan tiles.

The tileset choice mostly affects risk item 5, and it matters more if the game is ever forced to rebrand. Original fan tiles survive a rebrand to a non-Pokémon "monster TD"; rips do not.

**Mitigations long-running projects use (synthesised):**
- Strictly free, with no donations.
- Low-key promotion.
- A non-Pokémon working title or domain.
- A clear non-affiliation disclaimer.
- Host on your own static site without ads (not an ad-funded portal).
- Keep the game playable from a mirror if a host takes it down.
- Isolate official-IP content (Pokémon sprites/names) behind a swappable "skin", so the game can pivot to original creatures quickly.
- Prefer original tiles and keep rips out of shipped builds.

**Recommendation on rips:**
- Treat `ripped_from_official` as a hard gate. Default to excluding rip packs from public builds, and allow them only in private or local experiments.
- Treat ROM-base packs (PokeCommunity/PokeMMO IPS patches, GitHub ROM-hack asset repos) as "official derivative" until proven otherwise.
- Extracting them also requires a ROM; do not source ROMs.

**A free Phaser TD with Pokémon creatures is still infringing in a strict sense.** Fair use is a defence raised after the fact, not a permission. The realistic goal is to lower the probability and the impact of a takedown, not to be legally "clean". — consistent with [Odin Law](https://odinlaw.com/blog-fan-games-legal-risks/) and [Game Developer](https://www.gamedeveloper.com/business/are-fan-games-fair-use-) framing (not fetched in full)

### Gaps
- No primary source was found on whether the original Flash Pokémon Tower Defense (or PTD2/PTD3) was ever taken down by Nintendo/TPC. Only the 2011 Android Market removal is documented. Fan re-uploads on itch.io circulate.
- itch.io: no documented mass Pokémon DMCA was found (unlike Game Jolt).
- No confirmed 2026 takedown of a Pokémon fan game was found in searches (to October 2026).
- PokeRogue's current status and any action against it are unverified.
- The sender and stated content of the Relic Castle DMCA were never publicly confirmed.

## 5. Concrete requirements for the editor's asset-pack pipeline and manifest

### Takeaway
The editor needs a pack-level manifest that carries provenance and licence state, plus normalisation metadata (native tile size, scale, autotile format). The repo should be split so raw third-party sheets never land in a public repo. Maps must reference packs by stable IDs so a whole pack can be swapped. Every exported map must carry the list of credits it requires.

### Cited Findings
- **Mixed native tile sizes in the catalog.** Ekat's sets need 2x resizing for Essentials (native 16 px); J-Treecko252 sheets are 256 px wide (8 × 32 px); skatefilter5 targets RPG Maker MV/MZ. — [Eevee Expo 621](https://eeveeexpo.com/resources/621/); [J-Treecko252](https://www.deviantart.com/j-treecko252/art/Apartment-Building-Tiles-01-903544904); [skatefilter5](https://www.deviantart.com/skatefilter5/art/Main-Trees-891202430)
- **Upstream credits and rip content exist inside "fan" packs.** — [Ekat99](https://www.deviantart.com/ekat99/art/Mega-Outdoor-Tileset-887616036); [Phyromatical](https://www.deviantart.com/phyromatical/art/DoT-Day6-Bridgeton-Tileset-649657763)
- **Licences vary per item** (CC BY 3.0, CC BY-NC-SA 3.0, prose terms, none). — [ditto209](https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260); [Magiscarf](https://www.deviantart.com/magiscarf/art/Free-New-Tiles-Mastersheet-648639390); [Aveontrainer](https://www.deviantart.com/aveontrainer/art/PokeCenter-966014361)
- **Descriptions are mutable and artists add update logs** (TheDeadHeroAlistair keeps an update log). This makes a dated terms snapshot necessary. — [DeviantArt](https://www.deviantart.com/thedeadheroalistair/art/Project-Heliodor-Trees-Megaset-895896602)
- **Some catalog rows point at ROM-patch or ROM-hack resources** that need extraction: IPS tileset patches on PokeCommunity/PokeMMO, and Team Aqua's Asset Repo on GitHub. — [tilesets.csv](file:///C:/Users/Micha/Desktop/TDMapMaker/asset-catalog/tilesets.csv)

### Inferences
**Proposed `pack.json` (one per pack; raw files live beside it):**
```json
{
  "pack_id": "da-ditto209-winter-tileset-419617260",
  "version": 1,
  "title": "Winter Tileset",
  "catalog_row": 123,
  "source": {
    "site": "deviantart",
    "url": "https://www.deviantart.com/ditto209/art/Winter-Tileset-419617260",
    "item_id": "419617260",
    "retrieved_at": "2026-10-21",
    "retrieved_via": "manual-download|bundle|artist-sent|preview-verified",
    "files": [{"path": "raw/winter_tileset.png", "sha256": "...", "w": 256, "h": 672}]
  },
  "artist": {"name": "ditto209", "profile": "https://www.deviantart.com/ditto209"},
  "upstream_credits": [{"name": "…", "role": "trees edited from", "url": null}],
  "license": {
    "spdx": "CC-BY-3.0",
    "terms_snapshot": "raw/terms_2026-10-21.txt",
    "credit_required": true,
    "credit_line": "Winter Tileset by ditto209 (CC BY 3.0)",
    "commercial": "no|yes|unspecified",
    "edits": "yes|no|unspecified",
    "raw_redistribution": "yes|no|unspecified",
    "permission": {"status": "not-needed|requested|granted|denied", "evidence_url": null},
    "status": "ok|needs-review|blocked"
  },
  "ripped_from_official": "none|partial|full|unknown",
  "official_source_games": ["FRLG"],
  "style": {"generation": "Gen 3", "palette_family": "GBA"},
  "format": {
    "kind": "tileset|autotile|animated|object-sheet",
    "autotile_layout": "rmxp|rmvx-a1|rmvx-a2|custom|null",
    "native_tile_px": 16,
    "target_tile_px": 32,
    "scale": 2,
    "frames": null,
    "has_alpha": true
  },
  "theme_tags": ["winter", "outdoor"],
  "visibility": "public-ok|private-only"
}
```

**Repo layout and visibility:**
- Keep `asset-packs-raw/` (raw sheets, terms snapshots, bundles) in a private repo, a git submodule, or git-ignored local storage. Any pack with `raw_redistribution != "yes"`, or with `ripped_from_official != "none"`, gets `visibility: private-only` automatically.
- The public game repo receives only the build output: packed atlases containing the used tiles, plus `credits.json`.
- **CI guard:** reject commits that add files under `raw/`, or any atlas built from a `private-only` pack whose `license.status != ok`.

**Stable references for pack swapping:**
- Maps reference `pack_id` plus a pack-local `tile_key`, never global atlas indices.
- The editor supports a pack-swap mapping (`old_pack:tile_key → new_pack:tile_key`) with a diff view of unmapped tiles.
- Maps can be re-skinned, for example "remove all rip packs" or "winter variant = same layout, winter pack mapping".
- Model terrain semantics (grass / path / water / cliff / tree-blocker) per tile key, so a swap preserves gameplay (buildable vs. path).

**Per-map export:**
- Every exported map embeds `required_packs[]` and `credits[]`: resolved credit lines, including upstream credits.
- It also embeds a `risk` summary: any `ripped_from_official` or `license.status != ok`.
- **Game build:** union all shipped maps into `credits.json`, and warn if any pack has `status != ok`.

**Ingestion tool requirements:**
- Import from the inbox folder and match files to CSV rows (title slug, artist, DA deviation ID or code).
- Paste in or save the terms text and record sha256 and dimensions.
- Verify preview dimensions against the stated original, and reject JPEG previews.
- Auto-detect the tile grid (16/32/48) and use integer-scale nearest-neighbour only.
- Slice into a tile palette with transparency kept, and support RMXP-style autotile expansion.
- Queue "needs permission" rows for artist messages.

### Gaps
- Exact RPG Maker autotile layouts (RMXP 96×128 vs. VX/MV A1/A2) and how Phaser/Tiled should represent them were not researched here; verify against RPG Maker or Tiled docs.
- No reviewed community standard exists for a fan-asset provenance manifest. The schema above is the researcher's proposal.
