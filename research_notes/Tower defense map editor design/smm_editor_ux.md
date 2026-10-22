# Super Mario Maker editor UX and "placement intelligence", applied to a grid-based top-down TD map editor

Scope note: researched October 2026. Facts in "Cited Findings" come from the linked source. Everything in "Inferences" is either reasoning from those facts or my own design recommendation for the TD map editor; recommendations are tagged **[REC]**. Several well-known SMM behaviours could not be confirmed from a fetchable source in this session. They sit in "Gaps" or are tagged **[UNVERIFIED]** and should not be stated as fact in the final report.

---

## 1. How the Super Mario Maker 1 / 3DS / 2 editor actually works

### Takeaway
SMM's editor is a small set of always-visible, single-purpose tools (part palette, Mr. Eraser, Undodog, Reset Rocket, Multigrab/Copy, clapperboard test-play, Coursebot). Behind them sits a part system with rich composition rules: shake for variants, mushroom to enlarge, wings or parachutes, items inside blocks, pipes and cannons, stacked enemies, and resize handles on lifts and semisolids. Every action has an audiovisual response tied to the music. Switching between edit and play is instant, and a course cannot be published until its creator has cleared it.

### Cited Findings

**Modes, test-play and the edit-play loop**
- The clapperboard icon toggles between test-play and the editor. When Mario loses a life in test-play, the game switches straight back to the Course Maker. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Minus on Wii U and SMM2, or Select on 3DS, replays the course from the start rather than from Mario's current editor position. In SMM2 you hold Minus, and an echoed clapperboard sound plays. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- In SMM2, Y moves Mario back near the centre of the screen if he has been dragged off-screen, so Mario's start position is a draggable object in the editor. X hides all menus for an unobstructed view. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- An "outline mode" shows Mario's movement paths to help with positioning. Players switch between editing and playing. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)
- A course must be played to completion before it can be published. — [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker). Nintendo's own manual says the creator must prove they can clear the course before uploading. — [Nintendo of Europe SMM manual, p.5](https://microsite.nintendo-europe.com/super-mario-maker-manual/enGB/page_05.html), as quoted in a search result. The page itself returned HTTP 503 when fetched.
- Clearing only proves the uploader could finish the course. Fan group Team 0% exists to get every course beaten by someone other than its uploader. — [Wikipedia: Team 0%](https://en.wikipedia.org/wiki/Team_0%25)
- Nintendo deletes uploaded courses that contain bugs the creator or the developers did not intend. — [Nintendo UK support: SMM2 course disappeared](https://nintendo.co.uk/en-gb/Support/Nintendo-Switch/A-Course-I-Uploaded-Seems-to-Have-Disappeared-Where-Did-it-Go-Super-Mario-Maker-2--1588842.html)

**Palette and unlocking**
- SMM1 and 3DS let you customise the order of elements in the palette. SMM2 groups parts into four scroll-wheel categories (Terrain, Items, Enemies, Gizmos), and recently used parts appear at the top. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- In SMM2 you hold A, or hold on the touch screen, to pin a part so a newly selected part does not push it off the row. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker). Guides describe the same thing: hold the icon for about a second until a pushpin appears. — [Tom's Guide SMM2 tips](https://tomsguide.com/how-to/super-mario-maker-2-tips-how-to-build-levels-like-a-pro)
- SMM1 starts with one row of elements. A new set originally unlocked the next day if the player had spent at least five minutes in the editor. A day-one patch changed this so that placing enough parts unlocks the next set. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker); [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker), which describes the original plan as nine days of gradual unlocks, later tied to creation effort.

**Composing parts (attachments, variants, nesting)**
- Shaking a part changes its form, for example a green Koopa becomes a red one and a vertical Trampoline becomes a sideways one. Shaking also removes items placed inside blocks, pipes, Bill Blasters or Lakitus. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)
- Dropping a Super Mushroom on most parts enlarges them. Since v1.20, dropping one on a power-up other than a mushroom makes that power-up progressive. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- In SMM2, a context menu replaces both shaking and the Wings element, and adds parachutes for some parts. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Elements can be placed inside blocks, pipes, Bill Blasters or Lakitus. Enemies can be stacked. The full list of modifiers is Super Mushroom, Wings, Key, stacking, pipe or Bill Blaster contents, block contents, Lakitu throwing, Clown Car piloting and Track movement. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker); [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker), which adds shells worn as helmets and cannons firing chosen objects.
- Some parts have direct-manipulation handles. You drag Semisolid Platforms and Bill Blasters to change their length or height. Lifts and Fire Bars have movement paths. One-Way Walls and Burners turn by tapping a yellow arrow icon. In SMM2, Snake Blocks and Piranha Creepers have a path modifier. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- In SMM2 you create slopes by picking a direction and setting a length, and gentle slopes are an option. — [Prima Games via search](https://primagames.com/news/super-mario-maker-2-reveals-epic-new-story-mode-themes-and-more); [Super Mario Wiki: Slope](https://mariowiki.com/Slope)

**Terrain auto-shaping**
- In the Course Maker, Ground "connects with other Ground blocks". In SMM2 it can also connect to Slopes and to the fixed Ground at the start and end of the course, which earlier games did not allow. — [Super Mario Wiki: Ground (block)](https://www.mariowiki.com/Ground_(block))
- Ground sometimes shows decorative background elements on top of it, such as flowers. One-tile-wide Ground can look like coral or dead bushes depending on the theme. Ground has a distinct look in each theme. — [Super Mario Wiki: Ground (block)](https://www.mariowiki.com/Ground_(block))
- Changing a course's theme changes the editor's assets, objects and music. SMM1 has four game styles and six themes. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker). In SMM2, switching to the extra 3D World style requires resetting the course. — [Wikipedia: Super Mario Maker 2](https://en.wikipedia.org/wiki/Super_Mario_Maker_2)

**Editing tools: erase, undo, reset, multi-select, copy, camera**
- Mr. Eraser erases parts. In SMM2, holding L or R also erases. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Undodog undoes the last action. It comes from Mario Paint's undo. In SMM2, holding B also undoes. The 3DS manual says each tap undoes your last action. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Super Mario Wiki: Undodog](https://www.mariowiki.com/Undodog). Guides confirm a quick hold of B undoes the most recent action in SMM2. — [Tom's Guide](https://tomsguide.com/how-to/super-mario-maker-2-tips-how-to-build-levels-like-a-pro)
- Reset Rocket erases the whole course, using a wipe transition from Mario Paint. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Multigrab selects an area to move all its parts, or to erase them with Mr. Eraser. It uses L/R on Wii U, L on 3DS and ZL/ZR on SMM2. Copy duplicates a single object or a Multigrab selection. In SMM2 you press ZL/ZR a second time during Multigrab to copy. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Tom's Guide](https://tomsguide.com/how-to/super-mario-maker-2-tips-how-to-build-levels-like-a-pro)
- In SMM2 the right stick zooms. Zooming out slightly widens the Multigrab range, and a Japanese guide notes this widens the copyable area. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [kamigame.jp copy guide](https://kamigame.jp/%E3%83%9E%E3%83%AA%E3%82%AA%E3%83%A1%E3%83%BC%E3%82%AB%E3%83%BC2/%E6%94%BB%E7%95%A5%E3%82%AC%E3%82%A4%E3%83%89/%E3%82%B3%E3%83%94%E3%83%BC.html)

**Areas, links, course settings**
- An area icon switches between the main area and the sub-area. Mario can also switch by entering a Warp Pipe, but an exit pipe has to be placed first. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- In SMM1, placing Mario inside a pipe turns it into a Warp Pipe leading to the sub-area. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)
- The timer ranges from 10 to 500 seconds in 10-second steps. SMM1 autoscroll has three speeds, shown as a turtle, a rabbit and a cheetah. SMM2 custom scrolling, shown as a bird, sets direction and speed at chosen points. A modifier sets course length. In SMM2, a ship icon sets the height and speed of rising water, poison or lava. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- SMM2 lets creators raise the vertical height limit for vertical courses. — [Wikipedia: Super Mario Maker 2](https://en.wikipedia.org/wiki/Super_Mario_Maker_2)

**Limits and counters**
- SMM2 gives Ground its own limit of 4,000 blocks, separate from other blocks. — [Super Mario Wiki: Ground (block)](https://www.mariowiki.com/Ground_(block))
- Upload quotas: SMM1 started with limited uploads and raised them as a creator received stars. — [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker). SMM2's upload limit was raised from 32 to 64 in July 2019. — [TechRaptor](https://techraptor.net/content/super-mario-maker-2-raises-course-upload-limit-from-32-to-64)
- Contradictory claim: a DualShockers article on Tezuka's E3 comments says the game has no cap on how many objects can appear at once. — [DualShockers](https://www.dualshockers.com/takashi-tezuka-details-mario-maker-this-isnt-your-typical-course-editor/). This conflicts with the documented SMM2 4,000-ground limit, and it was pre-release coverage. Treat it as unreliable.

**Sound and audiovisual feedback**
- Placing a part plays a vocal call of its name. Its pitch and length shift to match the main melody of the music. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Editor background music is an ambient arrangement that changes with style and theme, and its channels fade in and out at random. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- Opening the Soundfrog menu darkens the screen, silences the music and shows a row of sound effects. SMM2 sorts effects into feelings, stingers, reactions, animations and music. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker). Microphone-recorded sounds are replaced or removed when a course is uploaded. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker); [Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Maker)
- Mascot idle animations come from Mario Paint, where Undodog dances when you are idle and returns to his spot when you move the mouse. — [Super Mario Wiki: Undodog](https://www.mariowiki.com/Undodog)

**Input**
- Wii U: touching the GamePad shows a hand on the TV that follows your input, and the hand style can be changed. 3DS: you edit on the 5:3 touch screen while the top screen previews the course, with only a glove cursor. SMM2 supports both touch and buttons. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)
- SMM2 Co-op Making: two players share a Joy-Con pair. Player 1 has the top row and scroll wheels. Player 2 gets a bar of all parts but cannot pause or scroll the screen. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Wikipedia: SMM2](https://en.wikipedia.org/wiki/Super_Mario_Maker_2)

**Coursebot (save/load)**
- Coursebot saves the current course. Loading a saved course overwrites the canvas. SMM1 holds 120 courses per Wii U profile. Local courses can be grouped into four-course worlds, but only single courses can be uploaded. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker); [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)

### Inferences
- The edit-play loop is the core of SMM, not the palette. Death returns you to the editor instantly. Play starts from wherever Mario stands, with restart-from-start one button away. The outline of Mario's last run stays visible. Together these make iteration nearly free. **[REC]** The TD editor's top priority after painting should be an equally instant playtest round-trip: launch the Phaser build with the in-memory map, start at a chosen wave, and return to the editor with camera, selection and undo history intact. After returning, show last-run enemy trails and leak points as an overlay, the TD version of the outline.
- SMM composes parts by dropping one part onto another: mushroom on enemy, wings on part, item into block. That lets the palette stay flat while the space of outcomes grows multiplicatively. **[REC]** Use the same drop-onto-target composition for TD modifiers: drop "removable obstacle reward" onto a rock, "speed tile" onto a path cell, or a "spawn group" onto a start marker. While dragging, highlight any valid target the cursor is over.
- Shake-for-variant and the SMM2 context menu reveal hidden variants without growing the palette. **[REC]** Add a "cycle variant" action (hotkey or mouse wheel while hovering) for decor such as tree species, flower colours and rock shapes, plus a right-click context menu for an object's properties.
- Recently used parts plus pinning keep the working set in reach. **[REC]** Use a palette with categories (Terrain, Path, Gameplay markers, Obstacles, Decor), a recent strip and pin-to-strip.
- Gradual unlocking is a consumer onboarding device, and the day-one patch shows players resented the time gate. **[REC]** Do not copy it for an internal tool. Instead, collapse rarely used palette sections by default.
- **[UNVERIFIED]** I recall SMM refusing invalid drops: the part springs back or doesn't place, with a short sound, and Mr. Eraser and parts have small bounce animations. No fetched source confirmed this; see Gaps.

### Gaps
- The exact SMM1, 3DS and SMM2 per-part limits (enemy cap, block cap, pipes and so on), and how the editor shows them, apart from SMM2's 4,000 ground cap. The Super Mario Wiki "Object limits" section sits in a 400k-character page I could not read in budget.
- The exact feedback for invalid placement (sound, wobble, refusal) and how parts are dragged off the grid was not confirmed by any fetched source.
- Undo history depth, redo, and whether Reset Rocket can be undone or asks for confirmation are not documented in the fetched pages.
- The SMM tile grid and course dimensions, such as maximum length, were not confirmed in this session.
- The fetch-blocked Nintendo manual pages (microsite.nintendo-europe.com returned 503) probably contain the authoritative control and limit details.

---

## 2. What Nintendo developers said about the design philosophy

### Takeaway
Sourced statements are thin but consistent. SMM began as an internal Nintendo course-editing tool that was pitched to Takashi Tezuka. He wanted the playfulness of Mario Paint on the GamePad, judged course-making more approachable than drawing, and explicitly wanted players to treat it as a game rather than an editor tool. I found no Iwata Asks, GDC or CEDEC talk specifically about SMM's editor UX.

### Cited Findings
- SMM started as an internal tool for Nintendo's developers, and the team then pitched it as a standalone game to Tezuka. — [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker); also summarised in [Gaming Trend](https://gamingtrend.com/news/super-mario-maker-was-originally-a-mario-paint-game-according-to-creator) and [Trusted Reviews](https://www.trustedreviews.com/news/super-mario-maker-was-planned-as-a-mario-paint-game-for-wii-u-2926075)
- Tezuka had wanted a Wii U Mario Paint follow-up using the GamePad. He considered a course-making tool more marketable than an art program and told Polygon that making courses is less daunting than drawing. He said he wanted to bring Mario Paint's fun into the course editor. — [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker), citing Polygon 2014
- Tezuka said Nintendo's internal level-making tools are much more complicated than the consumer interface and are driven by keyboard and mouse. The plan was to move that toolset to the GamePad touchscreen to make creating easier. — [search summary of TIME / Gaming Trend coverage](https://gamingtrend.com/news/super-mario-maker-was-originally-a-mario-paint-game-according-to-creator); secondary source, paraphrased
- Tezuka at E3 said it isn't a typical course editor, that you should just enjoy it rather than think of it as an editor tool, and that players don't need to make "really good courses". His example of creative freedom was putting wings on a Piranha Plant. — [DualShockers](https://www.dualshockers.com/takashi-tezuka-details-mario-maker-this-isnt-your-typical-course-editor/)
- Director Yamashita, in a Nintendo Dream interview, said the artists were excited by fast prototyping, and that early concepts were whimsical, such as Goombas and ? Blocks growing legs. Tezuka said multiple cursor hands were added partly to support left-handed players. — [Nintendo Everything (Nintendo Dream translation)](https://nintendoeverything.com/super-mario-maker-origins-of-costumes-cursors-and-a-message-to-fans/)
- For SMM2, Tezuka said the theme was to expand on what the first game could do. He described post-launch content as a give-and-take between developers and players, with player levels used as reference for new content. — [Wikipedia: Super Mario Maker 2](https://en.wikipedia.org/wiki/Super_Mario_Maker_2)
- A 1994 Nintendo patent described pausing a game, editing it and sharing changes, using an example called "Mario Factory". — [Wikipedia: Super Mario Maker](https://en.wikipedia.org/wiki/Super_Mario_Maker)
- In the NSMBU Iwata Asks, the GamePad course-making idea came up during NSMBU development, and the director consulted Tezuka and Kimura. — [search result summarising Iwata Asks NSMBU](https://iwataasks.nintendo.com/interviews/wiiu/nsmbu/0/0)
- Tezuka has described enjoying working within constraints rather than just following designs. — [search summary of Iwata Asks, Super Mario Bros. 25th anniversary](https://iwataasks.nintendo.com/interviews/wii/mario25th/4/3). General philosophy, not SMM-specific.

### Inferences
- The "internal tool turned toy" history matters for this project in reverse. The user is building an internal tool but wants SMM-level polish. The lesson I take from the sources: keep the depth of the internal tool (keyboard and mouse, precise data, validation) and borrow the consumer layer's immediacy (direct manipulation, instant feedback, one-click playtest). Skip the whimsy that costs build time, such as mascots and hand cursors.
- Nintendo gave no explicit rationale for the clear check. The plausible reason, my inference, is a quality floor: it guarantees every published course is at least completable by its author. Nintendo's deletion of courses with unintended bugs points the same way.
- Nintendo gave no explicit rationale for limits. Plausibly, my inference, they bound performance, memory and save size. That matches how LittleBigPlanet's thermometer works (see section 3).

### Gaps
- Probably no Iwata Asks exists for Super Mario Maker. Iwata died in July 2015, before release. I found none.
- I found no GDC or CEDEC talk by Tezuka, Kimura, Oshino or Yamashita on SMM editor UX. If one exists, it was not in search results.
- I found no developer statement explaining why parts snap to the grid, why limits exist, or why the clear check exists.

---

## 3. Lessons from comparable editors (and TD-specific path authoring)

### Takeaway
The best ideas to copy are LDtk's semantic IntGrid layer driving auto-layers, plus its entity field constraints and singleton limits; Tiled's terrain brushes that update neighbours and route through intermediate terrains, plus its probability-based random variation; RPG Maker XP and Essentials' per-tile priority, passage, bush flag and terrain tags for 3/4-view depth; Porymap's separate collision and elevation overlay with an opacity slider; and LittleBigPlanet's complexity meter. For TD paths, existing tools either use waypoint polylines or node routes (Tiled, Funovus, Citadel Clash) or painted path tiles with explicit or derived direction (Panda3D project, Unreal TD framework). No sourced Kingdom Rush or Bloons editor documentation was found.

### Cited Findings

**LDtk**
- Auto-layers are IntGrid layers with a linked tileset and rules that paint tiles automatically. "Pure" auto-layers hold only rules and read their data from a separate IntGrid layer, which suits deriving several visual layers, such as foreground and background, from one IntGrid source. — [LDtk docs: Auto-layers](https://ldtk.io/docs/general/auto-layers/)
- Rules are grid patterns deciding whether a tile is painted. For example, paint grass when a cell is "walls" and the cell above is not. Painting IntGrid values draws tiles automatically. SHIFT+R, or unchecking Render, shows the raw IntGrid without painted tiles. — [LDtk docs: Auto-layer rules](https://ldtk.io/docs/general/auto-layers/auto-layer-rules/)
- Entities are generic placed data, such as a player start or items. They can be drawn as a rectangle, circle or tile and can carry constraints. You can cap an entity's count, for example one PlayerStart, and adding another then moves the existing one. Custom fields support bounds, nullability, arrays of enums with min and max counts, and display modes. For example, a radius float within [16,128] is drawn as a circle around the entity, and a value can be displayed above the instance. — [LDtk docs: Entities](https://ldtk.io/docs/general/editor-components/entities/)

**Tiled**
- Terrain (Wang) sets come in corner, edge and mixed types. A full two-terrain corner or edge set has 16 tiles. A full mixed set has 256, though reduced sets like the 47-tile blob also work. Edge sets suit roads, fences and platforms. — [Tiled manual: Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)
- The terrain brush picks tiles that fit the surroundings and updates neighbouring tiles when needed. If two terrains have no direct transition, it routes through an intermediate one, for example dirt to sand to cobblestone. On an empty map it may do nothing, because no transitions to "nothing" exist. A Patterns tab highlights missing combinations. — [Tiled manual: Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)
- Probability properties on tiles and terrains weight random variation. Probability 0 keeps a tile out of automatic use while the tools can still read its terrain. Terrain fill mode for the stamp, bucket and shape-fill tools fills with random valid tiles; for bucket and shape fill, only the boundary has to match existing tiles. — [Tiled manual: Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)
- For TD enemy routes in Tiled, the community advice is a polyline object for the route, a polygon for looping paths, and plain rectangles for isolated spawn points. — [Tiled forum: Waypoint paths for enemy spawns](https://discourse.mapeditor.org/t/waypoint-paths-for-enemy-spawns/189)

**RPG Maker XP / Pokémon Essentials / RPG Maker MZ**
- In the XP-era tileset database, priority sets how close to the foreground a tile draws, with higher meaning closer. The bush flag makes the bottom of an event on that tile partly transparent, as if standing in tall grass or shallow water. Passage sets whether characters can walk on a tile. — [Essentials Docs Wiki: Tilesets (search summary)](https://essentialsdocs.fandom.com/wiki/Tilesets?oldid=223). The page itself returned 402 on fetch; content seen via search snippet only.
- In RPG Maker MZ, "star" passage tiles can be entered and are used to hide characters behind buildings, meaning they draw above the character. — [RPG Maker MZ Help](https://rpgmakerofficial.com/product/MZ_help-en/01_08_10.html)
- Third-party plugins for MV and MZ use terrain tags on star tiles to encode how far a tile is from the ground, so large sprites aren't wrongly hidden. This shows that a single above/below flag isn't enough for tall sprites. — [Hudell: Cyclone Tile Priority](https://hudell.itch.io/cyclone-tile-priority)

**Porymap (Pokémon decomp map editor)**
- Collision and elevation are painted as their own layer. Each value pairs an elevation, one per selector row, with passability. Special types include Transition (stairs), Impassable (no elevation, so it can be interacted with from any level), Surf (start surfing only from elevation 3) and Multi-Level (bridges remember the previous elevation). Collision painting uses the same tools as metatile painting except Smart Paths. Right-click on the map picks up a tile's collision type. Collision edits are included in undo and redo. An opacity slider controls how visible the collision overlay is over the map. — [Porymap manual: Editing map collisions](https://huderlem.github.io/porymap/manual/editing-map-collisions.html)

**LittleBigPlanet (complexity budget)**
- A thermometer gauge, always visible in Create mode, fills with the number and kind of objects. When it is full, the level "overheats" and nothing more can be added. Some items, such as music sequencers and samples, cost much more than others. LBP3's Dynamic Thermometer stops counting parts far from the player, which enables larger levels. — [LBPUnion guide](https://www.lbpunion.com/?p=3391); [PlayStation Blog, LBP3 create tools](https://blog.us.playstation.com/2014/08/12/littlebigplanet-3-new-create-tools-and-features-detailed/)
- A developer described the thermometer as only a rough estimate of complexity, and said it had rarely been maxed out. — [Console-Tribe (Italian)](https://console-tribe.com/news/cinquanta-livelli-per-littlebigplanet-8824)

**Levelhead (Butterscotch Shenanigans)**
- Reviewers called the Workshop editor super intuitive yet very powerful once learned. It includes precise hazard placement, paths for moving blocks, and linking actions between objects. — [TouchArcade hands-on / review](https://toucharcade.com/2018/09/14/levelhead-hands-on); [Xbox Wire](https://news.xbox.com/en-us/2020/04/30/build-your-first-level-levelhead-xbox-game-pass/)
- Seth Coster's GDC 2020 talk "Forgiveness Mechanics: Reading Minds for Responsive Gameplay" draws on Levelhead. It argues that responsive input means producing the outcome the player intended from imprecise input, not literally executing it. — [GDC Vault](https://www.gdcvault.com/play/1026606/Forgiveness-Mechanics-Reading-Minds-for); [Game Developer](https://gamedeveloper.com/design/video-using-forgiveness-mechanics-to-design-better-games)

**TD-specific path authoring in existing tools**
- Funovus, a commercial UGC engine, builds roads from nodes and groups nodes into routes for spawning waves. Routes can also be built from standalone nodes, which suits hidden lanes. — [Funovus wiki: Tower Defense Feature Overview](https://wiki.funovus.com/master/Tower-Defense-Feature-Overview)
- A Panda3D hobby TD toggles tiles between grass and dirt, then places numbered waypoints on dirt tiles. Removing a waypoint renumbers the rest. — [Panda3D forum: WIP Tower Defense](https://discourse.panda3d.org/t/wip-tower-defense/11032)
- An Unreal marketplace TD framework arranges tiles in the editor, sets path-tile direction with arrow keys, and flips or mirrors with Ctrl and right-click. — [Unreal TD framework listing](https://docs.unrealengine.com/marketplace/ja/product/tower-defense-framework)
- The browser game Citadel Clash requires waypoints to run and recommends placing start and end waypoints just outside the map. — [Citadel Clash (itch.io)](https://karaokeczar.itch.io/tower-defense)

**Trackmania**
- I could not confirm whether Trackmania requires validation (driving your own track) before publishing. One 2022 case had an author time set via a plugin without in-editor validation, and staff declined to change it. — [devtrackers.gg](https://devtrackers.gg/trackmania/p/3cc94621-changing-midori-author-time-totd-23-07-2022)

### Inferences
- **[REC] The data model to copy is LDtk's:** gameplay lives in semantic grid layers (terrain type, path, buildability flags), and visuals are derived from them. That gives the seasonal-theme requirement almost for free: one semantic IntGrid, plus one auto-layer rule set or tileset mapping per season. Gameplay data stays identical by construction.
- **[REC]** Copy Tiled's neighbour updates and intermediate-terrain routing for autotiles. Use edge-style matching (4-neighbour, 16 variants) for the enemy path and blob or corner sets (47 tiles) for terrain such as water and cliffs. RPG Maker XP autotiles are effectively corner-based minitile sets, so the editor needs an XP-autotile-to-47-blob converter. That last point is my inference about the art pipeline, not a sourced claim.
- **[REC]** Copy Porymap's model of a gameplay overlay painted with the same tools as art, with an opacity slider and right-click pickup. The TD buildability, water-only and no-build layers are this kind of overlay.
- **[REC]** Copy RPG Maker's tile priority and bush semantics for 3/4 objects, but store them per object part rather than per tile. A tree is trunk cells (block, below the actor) plus canopy cells (above the actor). The MZ plugin ecosystem shows that a single star flag breaks for tall sprites.
- **[REC]** Copy LDtk's entity constraints. Start and end markers are entities with fields such as id, label, the wave groups allowed, and whether they spawn flying units. Gameplay radii are float fields drawn as circles. Singletons use LDtk's "adding one moves the existing one" behaviour.
- **[REC]** Copy LBP's always-visible budget meter for performance-relevant counts: decor sprite count, animated tiles, path cells, starts and ends, waves.
- For TD paths, my inference from the sources: a painted grid path, as the user chose, is the cleanest fit for a grid TD where towers occupy cells. Waypoint polylines are the better fit for flying routes, which ignore the grid path. Funovus's routes are a good model for multiple starts and ends: name each route as a sequence through the path graph.
- Butterscotch's forgiveness principle applies directly to painting. If the mouse jumps diagonally between frames, insert the connecting elbow cell so the path stays 4-connected. If the user drops an object one cell off a legal spot, snap it to the nearest legal anchor within one cell instead of refusing.

### Gaps
- No primary documentation was found for path authoring in Kingdom Rush, Bloons TD Battles, Pokémon Tower Defense, the Warcraft III or StarCraft editors, or Roblox TD kits. From general knowledge (unverified this session): Warcraft III TD maps typically use rectangular "regions" plus triggers that order spawned units to move region to region. That is a waypoint model, not a painted path.
- Levelhead dev-blog material on the Workshop's UX was not found. bscotch.net patch notes and the "Coffee with Butterscotch" podcast may have it.
- RPG Maker XP's exact rules (three map layers, priority 0 to 5, 4-direction passage, counter flag, terrain tags 0 to 7 with Essentials meanings such as grass and water) could not be fetched. Confirm them against the Essentials docs.
- Sprite Fusion and Ogmo 3 were not researched in budget.

---

## 4. Concrete "placement intelligence" rules and features for an SMM-quality top-down TD map editor

### Takeaway
SMM-level quality in a grid TD editor comes from four things. Every placement is previewed and validated before commit: a footprint ghost tinted green or red, with a reason shown. Terrain and path auto-shape themselves and re-shape their neighbours on paint and erase. Gameplay meaning is always visible as overlays: path arrows, buildable cells, ranges. And one-click playtest plus blocking validation make an invalid map hard to export. Almost all of the items below are my recommendations **[REC]**, grounded in the cited patterns above.

### Cited Findings
- SMM shows the outcome of the last run (Mario's path) in edit mode. — [Super Mario Wiki: Super Mario Maker](https://www.mariowiki.com/Super_Mario_Maker)
- The Tiled terrain brush updates neighbours on paint, and erasing terrain only works if transitions to empty exist. — [Tiled manual: Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)
- LDtk can draw a numeric field as a radius circle around an entity, and can toggle the rendered tiles off to show raw IntGrid data. — [LDtk docs: Entities](https://ldtk.io/docs/general/editor-components/entities/); [LDtk docs: Auto-layers](https://ldtk.io/docs/general/auto-layers/)
- Porymap uses an opacity-controlled gameplay overlay and includes collision edits in undo and redo. — [Porymap manual](https://huderlem.github.io/porymap/manual/editing-map-collisions.html)
- In SMM, a resize handle on semisolids and Bill Blasters and an arrow icon to rotate directional parts are examples of in-place direct manipulation. — [Super Mario Wiki: Course Maker](https://www.mariowiki.com/Course_Maker)

### Inferences (all **[REC]** unless stated)

**A. Grid, snapping, footprints, ghost preview**
1. Use a 32px cell grid in world space. All gameplay objects snap to cells. Decor can optionally snap to half-cells (16px) with a modifier key, but gameplay footprints always use whole cells.
2. Every multi-tile object definition has two masks:
   - a **footprint mask**: the cells it occupies for gameplay (blocks building, blocks the path);
   - a **visual mask**: the cells its sprite covers, such as a canopy rising two cells above a trunk.
   Its anchor is the bottom-centre of the base, as RPG Maker and Essentials events use, so tall 3/4 objects line up by their feet.
3. The ghost under the cursor shows the sprite at about 60% opacity. Each footprint cell gets a green tint if legal and red if not. Visual-only overlap of other objects shows as a neutral outline, which is legal.
4. When a placement is refused, the ghost wobbles, plays a short "nope" sound, and shows a one-line reason next to the cursor: "Blocked: overlaps Path at (12,7)", "Needs water", "No-build zone". The SMM feel comes from the immediacy, but an internal tool needs the reason text.
5. Forgiveness snapping (Levelhead principle): if the drop is illegal but a legal anchor exists within one cell, show the ghost snapping to it with a dashed connector, and commit there.

**B. Auto-shaping terrain and path**
6. Terrain is semantic: an IntGrid of grass, dirt, water, cliff, sand and so on. Visual tiles are derived through autotile rules: 47-blob for water and cliffs, 16 edge variants for the path. This mirrors LDtk auto-layers and Tiled terrain sets.
7. Painting or erasing a cell re-evaluates that cell and its 8 neighbours, as Tiled's terrain brush does. This "smart erase" means erasing a water cell re-edges the surrounding shore.
8. When two terrains have no transition art, either route through an intermediate terrain, as Tiled does (water to sand to grass), or flag a "missing transition" warning on the cell with a magenta marker. Don't silently pick a wrong tile.
9. Random variation: plain grass picks weighted random variants (Tiled probability). Use a deterministic seed per cell (hash of x, y and map seed) so variants are stable across reloads and diffs.
10. Theme swap: the season switcher re-renders every auto-layer with that season's rule set. Validation checks that every semantic value and object used has art in every enabled season. Missing art is an error, because the gameplay guarantee depends on it.

**C. Enemy path painting (grid)**
11. Pencil stroke: dragging paints path cells. If the pointer skips cells between frames, rasterise the segment (Bresenham), and when a step is diagonal insert the elbow cell so the path stays 4-connected. One stroke is one undo step.
12. Line tool: Shift-click paints a straight orthogonal or L-shaped run from the last painted cell. A rectangle tool for paths is probably unnecessary; for terrain, provide rectangle and flood fill.
13. Flow direction is derived. Build a graph from 4-connected path cells and run BFS from each Start marker to the End markers. Draw small animated chevrons along the derived direction, as SMM shows a trail.
14. Junction cells (3 or more path neighbours) become split or merge nodes. Splits get an inline control to set the branch rule (alternate, random weighted, or per-wave route assignment), with the default shown on the junction.
15. Live path validation shows an error badge on the cell:
   - **dead-end**: a path cell with one neighbour that is not a Start or End;
   - **unreachable**: a Start with no route to any End;
   - **orphan**: path cells not connected to any Start;
   - **cycle**: a loop that would trap enemies, unless explicitly allowed;
   - **2x2 blob**: a 2x2 block of path cells, which makes direction ambiguous;
   - **diagonal-only contact**: path cells touching only at corners.
16. Start and End markers are entities snapped to edge or interior cells. Each has a label, a colour and an id. A Start must sit on a path cell or the map edge adjacent to one. Dragging a marker off the path shows red.
17. Flying routes are waypoint polylines, snapped to cell centres by default, from a Start to an End, drawn dashed and colour-coded per route. They ignore the ground path and terrain but must stay inside map bounds or deliberately exit at the edge.

**D. Buildability and terrain gameplay rules**
18. Buildable is computed, never painted directly: in bounds AND not path AND no blocking footprint AND terrain class allows towers AND not covered by a no-build zone. Water-only cells are buildable only for water-class towers.
19. "Show buildable" overlay: green for any tower, blue for water-only, red hatch for no-build, grey for blocked by a removable obstacle. Use a Porymap-style opacity slider, plus a toggle for "Gameplay only" view, like LDtk's raw IntGrid render.
20. Removable obstacles are footprint entities with fields for removal cost and optional reward (SMM's item-in-block analogue: drop a reward onto the obstacle). A "preview cleared" toggle shows the map with all obstacles removed, including what becomes buildable.
21. Range-modifying tiles, such as high ground or tall grass, are a semantic terrain flag with a value like +1 range tile or −15%. On hover, the tooltip shows the modifier. With a test tower selected, the range preview circle reflects the modifier, drawn the way LDtk draws radius fields.
22. Test-tower stamp: an editor-only tower ghost you hover around any cell to see the range ring and the count of path cells covered. This is the most useful TD-specific placement aid, because the designer can see real coverage before playtesting.

**E. Layering and 3/4 depth (y-sort)**
23. Fixed render stack: ground terrain, then the ground path and path decals, then low decor (flowers, bush-flagged grass), then y-sorted actors and objects (enemies, towers, tree trunks, buildings), then canopies and roofs (above-actor parts), then gameplay overlays and editor UI.
24. Objects are y-sorted by their footprint's bottom row, not their sprite's top. Canopy parts always draw above actors, like RPG Maker priority and star tiles.
25. Readability rule (warning, not error): if canopy or roof visual cells cover more than N path cells or buildable cells, warn "Path hidden under canopy at …". Offer a fix: in-game, fade canopies when units walk under them.
26. Bush flag: an RPG Maker-style partial-occlusion flag for tall-grass and shallow-water cells, exported so the game can draw the lower part of enemies semi-transparent.

**F. Tools, contextual switching, input**
27. Contextual cursor:
   - over an entity: a move cursor, so you can drag it (SMM moves parts by grabbing them in any tool);
   - over empty space: paint with the current palette item;
   - Alt-click or right-click: eyedropper (Porymap and RPG Maker convention);
   - Space-drag or middle-drag: pan; wheel: zoom.
   Make the eraser explicit (E key, or holding a modifier), like SMM2's hold-L/R eraser.
28. The eraser erases the topmost item in the active layer under the cursor. Shift-erase erases across all layers in that cell. Erasing re-shapes neighbours (rule 7) and re-validates paths (rule 15).
29. Brush shapes: pencil, line, rectangle (filled and outline), flood fill (contiguous same semantic value), and a random-scatter brush for decor with density and variant weights.
30. Selection (SMM Multigrab and Copy): marquee selection with a layer filter (terrain, path, objects, markers, all). Supports move, copy, paste, delete and flip horizontal. Rotating 3/4 art is generally invalid; allow rotation only for semantic layers and path, and warn if any object in the selection lacks a flipped sprite. Pasting runs the same ghost and validity check as single placement.
31. Palette: categories, a recent strip, pin-to-strip (SMM2), a search box, and number-key shortcuts for pinned items.
32. Hover tooltip (always on, low-key): cell (x, y), semantic terrain, buildable status with reason, layers present, object name and id, and any modifiers.

**G. Undo, reset, save**
33. Command-pattern undo and redo (Ctrl+Z, Ctrl+Shift+Z) with unlimited depth per session. One stroke, drag or paste is one step. Undo should restore the camera to the changed area if it is off-screen; SMM's undo always shows its result.
34. "Reset map" (Reset Rocket) needs a confirmation and is itself undoable.
35. Coursebot equivalent: local autosave (IndexedDB) plus explicit "Export JSON" for the git repo. Show the file's schema version and a dirty indicator. Git replaces SMM's 120-course slot model, so that model doesn't translate.

**H. Validation, limits and the "clear check"**
36. Always-visible counters, LBP-thermometer style: path cells, Starts and Ends, flying routes, waves, decor sprites, animated tiles. Each has a soft warning and a hard cap tuned to Phaser performance on low-end hardware.
37. Singletons and limits follow LDtk: if a map allows one boss exit, placing a second moves the first.
38. Clear-check analogue, a two-tier gate:
   - **Hard gate (blocks export):** static validation passes (rule 15 path checks, every wave references an existing Start, flying waves reference Starts that have a flying route, theme art complete, no overlapping footprints).
   - **Soft gate (recorded in JSON metadata):** a playtest or headless simulation reached the final wave with all enemy types reaching an End when no towers are placed. This proves every spawn can route. Store the editor version and date of the last successful check.
   This proves completability the way SMM's clear check does, without requiring the designer to beat the map.
39. Wave authoring next to the map: selecting a wave highlights its Start markers and routes on the map. Each enemy group shows time-to-exit computed from path length and speed. Warn if a flying group is assigned to a Start without a flying route.

**I. Feedback and polish (SMM feel, internal-tool budget)**
40. Give each action class a short, distinct sound: place, erase, refuse, undo, playtest start. Pitch-vary repeated placements during a stroke. A cheap nod to SMM's music-synced placement voices: quantise placement sounds to a soft editor loop if you add music, which is optional.
41. Micro-animations: placed objects pop (scale 0.9 to 1.0 over about 80 ms), erased objects shrink out, refused ghosts wobble. Path chevrons animate in the flow direction.
42. Playtest round-trip (section 1): a "Play from wave N" button, Esc returns to the editor in the same state, and last-run trails plus leak markers persist until the next edit.

**What doesn't translate from SMM**
- Physics-based composition, such as wings or a mushroom on an enemy, has no TD-map equivalent. Enemy and tower attributes belong in wave and unit data, not on the map.
- Daily or gated unlocks, upload quotas, Course World, Soundfrog custom sounds, and the Coursebot slot model don't apply; git and versioned JSON replace them.
- Sub-areas linked by pipes and doors have no direct analogue. The closest TD equivalent is a teleport or tunnel path link: a pair of path endpoints joined as one edge in the path graph. Build it only if the game supports it.
- Stylus and GamePad dual-screen design is less relevant for a desktop browser tool, but pointer-event support makes tablet and stylus painting work cheaply.

### Gaps
- No sourced TD-editor precedent was found for derived path direction, junction split rules, or "headless sim as clear check". These are original recommendations and should be validated against how the game's Phaser pathing actually consumes the JSON.
- Performance caps for the counters (rule 36) need measurement in the actual Phaser build. No source gives numbers.
- Whether RPG Maker XP autotile art converts cleanly to 47-blob or Tiled-style terrain sets was not researched here. It may belong to another researcher's scope (art pipeline).
