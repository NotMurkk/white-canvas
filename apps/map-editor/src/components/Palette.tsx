import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';
import type { ToolId } from '../editor/tools.ts';

const TOOLS: { id: ToolId; name: string; key: string; hint: string }[] = [
  { id: 'select', name: 'Select', key: 'V', hint: 'Click to inspect: objects, markers, junctions, flight paths. Drag objects and waypoints. Delete removes.' },
  { id: 'path', name: 'Enemy path', key: 'R', hint: 'Drag in the direction enemies walk. Right-drag erases.' },
  { id: 'spawn', name: 'Spawn', key: 'S', hint: 'Click a path cell at the map edge. Right-click removes.' },
  { id: 'exit', name: 'Exit', key: 'E', hint: 'Click the last path cell. Right-click removes.' },
  { id: 'air', name: 'Flight path', key: 'Q', hint: 'Click an air spawn, click waypoints, click an exit. Drag handles to adjust; right-click deletes one.' },
  { id: 'terrain', name: 'Terrain', key: 'T', hint: 'Paint grass, water… Right-click picks a terrain.' },
  { id: 'stamp', name: 'Objects', key: 'O', hint: 'Trees, rocks, buildings. Green = fits. Right-click removes.' },
  { id: 'zone', name: 'Zones', key: 'Z', hint: 'Paint no-build cells or range zones (high ground, fog). Right-drag clears.' },
  { id: 'eraser', name: 'Eraser', key: 'X', hint: 'Removes the top thing: object, marker, path, zone.' },
];

export function Palette({ editor }: { editor: EditorController }) {
  const tool = useStore(editor.store, (s) => s.tool);
  const brush = useStore(editor.store, (s) => s.brush);
  const terrains = useStore(editor.store, (s) => s.terrains);
  const stamps = useStore(editor.store, (s) => s.stamps);
  const zoneTypes = useStore(editor.store, (s) => s.zoneTypes);
  const terrainMode = useStore(editor.store, (s) => s.terrainMode);
  const showGrid = useStore(editor.store, (s) => s.showGrid);
  const showArrows = useStore(editor.store, (s) => s.showArrows);
  const showBuildable = useStore(editor.store, (s) => s.showBuildable);
  const opacity = useStore(editor.store, (s) => s.buildableOpacity);
  const muted = useStore(editor.store, (s) => s.muted);
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
          <Swatches items={terrains} selected={brush.terrain} onPick={(id) => editor.setBrush({ terrain: id })} />
        </>
      )}
      {tool === 'path' && (
        <>
          <h2>Path style</h2>
          <Swatches items={terrains.filter((t) => t.pathStyle)} selected={brush.path} onPick={(id) => editor.setBrush({ path: id })} />
        </>
      )}
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
      {tool === 'zone' && (
        <>
          <h2>Zone</h2>
          <Swatches items={zoneTypes} selected={brush.zone} onPick={(id) => editor.setBrush({ zone: id })} />
        </>
      )}
      {tool === 'stamp' && (
        <>
          <h2>Objects</h2>
          <Swatches items={stamps.map((k) => ({ ...k, name: `${k.name}`, note: `${k.w}×${k.h}` }))} selected={brush.stamp} onPick={(id) => editor.setBrush({ stamp: id })} />
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
          <input type="checkbox" checked={!muted} onChange={(e) => editor.setOverlay({ muted: !e.target.checked })} /> Sounds <kbd>M</kbd>
        </label>
      </div>
    </aside>
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
