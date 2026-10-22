import { useEffect, useRef } from 'react';
import type { EditorController } from '../editor/EditorController.ts';
import { libKey, libraryView, type LibraryItem, type LibraryList } from '../editor/palette.ts';
import { useStore } from '../editor/store.ts';
import type { ToolId } from '../editor/tools.ts';
import { LayerChecks } from './Inspector.tsx';

const TOOLS: { id: ToolId; name: string; key: string; hint: string }[] = [
  { id: 'select', name: 'Select', key: 'V', hint: 'Click to inspect: objects, markers, junctions, flight paths. Drag objects and waypoints. Drag on empty ground (or Shift+drag) to box-select for copy and paste.' },
  { id: 'path', name: 'Enemy path', key: 'R', hint: 'Drag in the direction enemies walk. Right-drag erases.' },
  { id: 'spawn', name: 'Spawn', key: 'S', hint: 'Click a path cell at the map edge; a click next to the path snaps onto it. Right-click removes.' },
  { id: 'exit', name: 'Exit', key: 'E', hint: 'Click the last path cell; a click next to it snaps onto it. Right-click removes.' },
  { id: 'air', name: 'Flight path', key: 'Q', hint: 'Click an air spawn, click waypoints, click an exit. Drag handles to adjust; right-click deletes one.' },
  { id: 'terrain', name: 'Terrain', key: 'T', hint: 'Paint grass, water… Right-click picks a terrain.' },
  { id: 'stamp', name: 'Objects', key: 'O', hint: 'Green = fits. A click one cell off a spot that fits snaps to it; hold Shift for exact. Right-click removes.' },
  { id: 'zone', name: 'Zones', key: 'Z', hint: 'Paint no-build cells or range zones (high ground, fog). Right-drag clears.' },
  { id: 'eraser', name: 'Eraser', key: 'X', hint: 'Removes the top thing: object, marker, path, zone.' },
  { id: 'tower', name: 'Test tower', key: 'C', hint: 'Drop probe towers where towers fit to see their range and how much path they reach. Not saved. Click again or right-click to remove.' },
];

export function Palette({ editor }: { editor: EditorController }) {
  const tool = useStore(editor.store, (s) => s.tool);
  const brush = useStore(editor.store, (s) => s.brush);
  const terrainMode = useStore(editor.store, (s) => s.terrainMode);
  const showGrid = useStore(editor.store, (s) => s.showGrid);
  const showArrows = useStore(editor.store, (s) => s.showArrows);
  const showBuildable = useStore(editor.store, (s) => s.showBuildable);
  const opacity = useStore(editor.store, (s) => s.buildableOpacity);
  const muted = useStore(editor.store, (s) => s.muted);
  const showCoverage = useStore(editor.store, (s) => s.showCoverage);
  const coverageMax = useStore(editor.store, (s) => s.coverageMax);
  const testRange = useStore(editor.store, (s) => s.testRange);
  const testTowers = useStore(editor.store, (s) => s.testTowers);
  const clipInfo = useStore(editor.store, (s) => s.clipInfo);
  const showTrails = useStore(editor.store, (s) => s.showTrails);
  const lastRun = useStore(editor.store, (s) => s.lastRun);
  const current = TOOLS.find((t) => t.id === tool)!;

  return (
    <aside className="palette">
      <h2>Tools</h2>
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={t.id === tool ? 'tool selected' : 'tool'} onClick={() => editor.setTool(t.id)} title={`${t.name} (${t.key})`}>
            <span>{t.name}</span>
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <p className="hint">{current.hint}</p>

      {tool === 'select' && (
        <>
          <h2>Box selection</h2>
          <LayerChecks editor={editor} />
          <p className="clip-info">{clipInfo ? `Clipboard: ${clipInfo.w}×${clipInfo.h} (${clipInfo.layers.join(', ')})` : 'Clipboard is empty.'}</p>
          <p className="hint">
            <kbd>Ctrl</kbd>+<kbd>C</kbd> copy · <kbd>Ctrl</kbd>+<kbd>X</kbd> cut · <kbd>Ctrl</kbd>+<kbd>V</kbd> paste · <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>A</kbd> whole map. The clipboard works across maps and tabs.
          </p>
        </>
      )}
      {tool === 'terrain' && (
        <>
          <h2>Brush</h2>
          <div className="segmented">
            {(['pencil', 'rect', 'fill'] as const).map((m) => (
              <button key={m} className={m === terrainMode ? 'on' : ''} onClick={() => editor.setTerrainMode(m)}>
                {m === 'pencil' ? 'Pencil' : m === 'rect' ? 'Rectangle' : 'Fill'}
              </button>
            ))}
          </div>
          <Library editor={editor} list="terrain" title="Terrain" selected={brush.terrain} />
        </>
      )}
      {tool === 'path' && <Library editor={editor} list="path" title="Path style" selected={brush.path} />}
      {tool === 'spawn' && (
        <>
          <h2>Spawn type</h2>
          <Swatches
            items={[
              { id: 'ground', name: 'Ground (walks the path)', color: '#e83030' },
              { id: 'air', name: 'Air (flies straight)', color: '#60c0f0' },
            ]}
            selected={brush.spawn}
            onPick={(id) => editor.setBrush({ spawn: id as 'ground' | 'air' })}
          />
        </>
      )}
      {tool === 'zone' && <Library editor={editor} list="zone" title="Zone" selected={brush.zone} />}
      {tool === 'stamp' && <Library editor={editor} list="stamp" title="Objects" selected={brush.stamp} />}
      {tool === 'tower' && (
        <>
          <h2>Test towers</h2>
          <label className="range-row">
            Range <input type="range" min={1} max={8} step={0.5} value={testRange} onChange={(e) => editor.setTestRange(Number(e.target.value))} aria-label="Test tower range" />
            <span>{testRange} tiles</span>
          </label>
          {testTowers.length > 0 ? (
            <ul className="tower-list">
              {testTowers.map((t) => (
                <li key={`${t.x},${t.y}`} className={t.ok ? '' : 'bad'}>
                  ({t.x}, {t.y}) <span>{t.ok ? `${t.expected.toFixed(1)} tiles in range` : 'blocked now'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No test towers yet.</p>
          )}
          {testTowers.length > 0 && <button onClick={() => editor.clearTestTowers()}>Clear test towers</button>}
          <p className="hint">Tiles in range are per enemy: each route counts by the share of enemies the clear check sends down it.</p>
        </>
      )}

      <h2>Overlays</h2>
      <div className="checks">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => editor.setOverlay({ showGrid: e.target.checked })} /> Grid <kbd>G</kbd>
        </label>
        <label>
          <input type="checkbox" checked={showArrows} onChange={(e) => editor.setOverlay({ showArrows: e.target.checked })} /> Path arrows <kbd>A</kbd>
        </label>
        <label>
          <input type="checkbox" checked={showBuildable} onChange={(e) => editor.setOverlay({ showBuildable: e.target.checked })} /> Where towers fit <kbd>B</kbd>
        </label>
        {showBuildable && (
          <>
            <input type="range" min={0.15} max={0.9} step={0.05} value={opacity} onChange={(e) => editor.setOverlay({ buildableOpacity: Number(e.target.value) })} aria-label="Overlay opacity" />
            <div className="legend">
              <span><i style={{ background: '#40e060' }} />land</span>
              <span><i style={{ background: '#40a0ff' }} />water</span>
              <span><i style={{ background: '#ff3040' }} />none</span>
            </div>
          </>
        )}
        <label>
          <input type="checkbox" checked={showCoverage} onChange={(e) => editor.setOverlay({ showCoverage: e.target.checked })} /> Coverage heatmap <kbd>H</kbd>
        </label>
        {showCoverage && (
          <div className="heat-legend">
            <i />
            <span>0</span>
            <span>{coverageMax.toFixed(1)} tiles of path in range · range {testRange}</span>
          </div>
        )}
        <label title={lastRun ? 'Trails from the last playtest; the next edit clears them' : 'Play the map (P) to see where enemies went'}>
          <input type="checkbox" checked={showTrails} onChange={(e) => editor.setOverlay({ showTrails: e.target.checked })} /> Last-run trails <kbd>L</kbd>
        </label>
        {showTrails && lastRun && (
          <div className="legend">
            <span><i style={{ background: '#ffb040' }} />ground</span>
            <span><i style={{ background: '#60c0f0' }} />air</span>
            <span>
              {lastRun.enemies} enemies · {lastRun.leaked} leaked
            </span>
          </div>
        )}
        <label>
          <input type="checkbox" checked={!muted} onChange={(e) => editor.setOverlay({ muted: !e.target.checked })} /> Sounds <kbd>M</kbd>
        </label>
      </div>
    </aside>
  );
}

/**
 * A searchable list with pins and recents. Pinned items come first and keep 1-9 shortcuts stable;
 * "/" jumps to the search box.
 */
function Library({ editor, list, title, selected }: { editor: EditorController; list: LibraryList; title: string; selected: string }) {
  const prefs = useStore(editor.store, (s) => s.library);
  // re-read items when the content behind them changes
  useStore(editor.store, (s) => (list === 'stamp' ? s.stamps : list === 'zone' ? s.zoneTypes : s.terrains));
  const items = editor.libraryItems(list);
  const view = libraryView(items, list, prefs);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      e.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const digit = (item: LibraryItem) => {
    const n = view.ordered.indexOf(item);
    return n >= 0 && n < 9 ? n + 1 : undefined;
  };
  const row = (item: LibraryItem) => (
    <LibraryRow
      key={item.id}
      item={item}
      selected={item.id === selected}
      pinned={prefs.pins.includes(libKey(list, item.id))}
      digit={digit(item)}
      onPick={() => editor.setBrush({ [list]: item.id })}
      onPin={() => editor.togglePin(list, item.id)}
    />
  );

  return (
    <>
      <h2>{title}</h2>
      {items.length > 5 || prefs.query ? (
        <input
          ref={search}
          className="lib-search"
          type="search"
          placeholder={`Search ${title.toLowerCase()} ( / )`}
          value={prefs.query}
          onChange={(e) => editor.setLibraryQuery(e.target.value)}
          onKeyDown={(e) => {
            // Esc clears and leaves; Enter picks the first match and goes back to the map
            if (e.key === 'Escape') editor.setLibraryQuery('');
            else if (e.key === 'Enter' && view.ordered[0]) editor.setBrush({ [list]: view.ordered[0].id });
            else return;
            e.currentTarget.blur();
          }}
          aria-label={`Search ${title}`}
        />
      ) : null}
      {view.recent.length > 0 && !prefs.query && (
        <div className="lib-recent" aria-label="Recent">
          {view.recent.map((i) => (
            <button key={i.id} className={i.id === selected ? 'on' : ''} onClick={() => editor.setBrush({ [list]: i.id })} title={`${i.name} (recent)`}>
              <span className="chip" style={{ background: i.color }} />
              {i.name}
            </button>
          ))}
        </div>
      )}
      {view.pinned.length > 0 && (
        <>
          <h3 className="lib-group">Pinned</h3>
          <ul className="swatches">{view.pinned.map(row)}</ul>
          {view.rest.length > 0 && <h3 className="lib-group">All</h3>}
        </>
      )}
      <ul className="swatches">{view.rest.map(row)}</ul>
      {view.ordered.length === 0 && <p className="hint">Nothing matches "{prefs.query}".</p>}
    </>
  );
}

function LibraryRow({ item, selected, pinned, digit, onPick, onPin }: { item: LibraryItem; selected: boolean; pinned: boolean; digit?: number; onPick: () => void; onPin: () => void }) {
  return (
    <li className="lib-row">
      <button className={selected ? 'swatch selected' : 'swatch'} onClick={onPick}>
        <span className="chip" style={{ background: item.color }} />
        <span className="label">{item.name}</span>
        {item.note && <span className="note">{item.note}</span>}
        {digit && <kbd>{digit}</kbd>}
      </button>
      <button className={pinned ? 'pin on' : 'pin'} onClick={onPin} title={pinned ? 'Unpin' : 'Pin to the top'} aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name}`} aria-pressed={pinned}>
        {pinned ? '★' : '☆'}
      </button>
    </li>
  );
}

function Swatches({ items, selected, onPick }: { items: { id: string; name: string; color: string; note?: string }[]; selected: string; onPick: (id: string) => void }) {
  return (
    <ul className="swatches">
      {items.map((t, i) => (
        <li key={t.id}>
          <button className={t.id === selected ? 'swatch selected' : 'swatch'} onClick={() => onPick(t.id)}>
            <span className="chip" style={{ background: t.color }} />
            <span className="label">{t.name}</span>
            {t.note && <span className="note">{t.note}</span>}
            {i < 9 && <kbd>{i + 1}</kbd>}
          </button>
        </li>
      ))}
    </ul>
  );
}
