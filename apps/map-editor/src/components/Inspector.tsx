import { useEffect, useState } from 'react';
import type { Direction } from '@tdmm/map-format';
import { parseRoundSpec } from '@tdmm/map-format';
import { CLIP_LAYERS, type ClipLayer } from '../editor/clipboard.ts';
import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';

const ARROW: Record<Direction, string> = { N: '↑ North', E: '→ East', S: '↓ South', W: '← West' };

/** Text input that commits on blur/Enter and shows a parse error inline. */
function CommitField({ value, onCommit, validate, label, width = 90 }: { value: string; onCommit: (v: string) => void; validate?: (v: string) => string | null; label: string; width?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const error = validate?.(text) ?? null;
  return (
    <span className="commit-field">
      <input
        aria-label={label}
        style={{ width }}
        className={error ? 'invalid' : ''}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (!error && text !== value ? onCommit(text) : setText(error ? value : text))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        title={error ?? undefined}
      />
    </span>
  );
}

function NumberCommit({ value, min, step = 1, onCommit, label }: { value: number; min: number; step?: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v >= min && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <input className="num-input" type="number" aria-label={label} min={min} step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

const LAYER_NAMES: Record<ClipLayer, string> = { terrain: 'Terrain', path: 'Path', objects: 'Objects', zones: 'Zones' };

/** Which layers the marquee copies, cuts and deletes. */
export function LayerChecks({ editor }: { editor: EditorController }) {
  const layers = useStore(editor.store, (s) => s.layers);
  return (
    <div className="layer-checks" role="group" aria-label="Layers">
      {CLIP_LAYERS.map((l) => (
        <label key={l}>
          <input type="checkbox" checked={layers[l]} onChange={(e) => editor.setLayers({ [l]: e.target.checked })} /> {LAYER_NAMES[l]}
        </label>
      ))}
    </div>
  );
}

export function Inspector({ editor }: { editor: EditorController }) {
  const inspect = useStore(editor.store, (s) => s.inspect);
  const stats = useStore(editor.store, (s) => s.stats);

  if (!inspect) {
    return (
      <div className="panel-body">
        <p className="muted">
          Pick the <strong>Select</strong> tool (V) and click something on the map: an object to make it removable in-game, a junction (yellow ring) to set how enemies split, a marker, or a flight path.
        </p>
      </div>
    );
  }
  if (inspect.kind === 'missing') return <div className="panel-body muted">That item no longer exists.</div>;

  if (inspect.kind === 'object') {
    const o = inspect.object;
    const removal = o.removal;
    return (
      <div className="panel-body inspector">
        <h3>{inspect.name}</h3>
        <p className="muted">
          <code>{o.id}</code> at ({o.x}, {o.y})
        </p>
        <label className="check-row">
          <input type="checkbox" checked={!!removal} onChange={(e) => editor.setRemoval(o.id, e.target.checked ? { cost: inspect.defaultCost, requires: [] } : null)} />
          Removable in-game for cash
        </label>
        {removal && (
          <>
            <label className="field-row">
              Cost $
              <NumberCommit label="Removal cost" value={removal.cost} min={0} step={50} onCommit={(cost) => editor.setRemoval(o.id, { ...removal, cost })} />
            </label>
            <p className="muted">Players click it in-game to pay and clear it. Its cells become buildable (orange in the overlay).</p>
            {inspect.removableOthers.length > 0 && (
              <>
                <h4>Must clear first</h4>
                <div className="checks">
                  {inspect.removableOthers.map((other) => (
                    <label key={other.id}>
                      <input
                        type="checkbox"
                        checked={removal.requires.includes(other.id)}
                        onChange={(e) => editor.setRemoval(o.id, { ...removal, requires: e.target.checked ? [...removal.requires, other.id] : removal.requires.filter((r) => r !== other.id) })}
                      />
                      {other.name} <code>{other.id}</code>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <button className="danger" onClick={() => editor.deleteSelection()}>
          Delete object
        </button>
      </div>
    );
  }

  if (inspect.kind === 'junction') {
    const { cell, policy, branches } = inspect;
    const weighted = policy.type !== 'alternate';
    const totalWeight = branches.reduce((n, b) => n + (policy.branches[b.dir]?.weight ?? 1), 0) || 1;
    // How many enemies took each branch per round in the no-tower simulation.
    const split = (dir: Direction) => {
      const b = branches.find((x) => x.dir === dir);
      if (!stats || !b) return null;
      return stats.map((r) => b.routes.reduce((n, id) => n + (r.byRoute[id] ?? 0), 0));
    };
    return (
      <div className="panel-body inspector">
        <h3>Junction ({cell[0]}, {cell[1]})</h3>
        <p className="muted">How enemies that don't have a fixed route pick a branch here. Each branch can also be limited to certain rounds.</p>
        <div className="segmented">
          {(['alternate', 'weighted', 'random'] as const).map((t) => (
            <button key={t} className={policy.type === t ? 'on' : ''} onClick={() => editor.editJunction(cell, 'Branch policy', (p) => void (p.type = t))}>
              {t === 'alternate' ? 'Alternate' : t === 'weighted' ? 'Weighted' : 'Random'}
            </button>
          ))}
        </div>
        <p className="muted small">
          {policy.type === 'alternate' && 'Enemies take each open branch in turn.'}
          {policy.type === 'weighted' && 'A fixed, repeatable pattern matching the weights (3:1 → E E N E E E N E…).'}
          {policy.type === 'random' && 'Random by weight, but seeded by the map, so every playthrough of a round matches.'}
        </p>
        <table className="branches">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Leads to</th>
              {weighted && <th>Weight</th>}
              <th>Open in rounds</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => {
              const br = policy.branches[b.dir];
              const weight = br?.weight ?? 1;
              const counts = split(b.dir);
              return (
                <tr key={b.dir}>
                  <td>{ARROW[b.dir]}</td>
                  <td className="muted">{b.exits.join(', ') || '—'}</td>
                  {weighted && (
                    <td>
                      <NumberCommit label={`Weight ${b.dir}`} value={weight} min={0} step={1} onCommit={(w) => editor.editJunction(cell, 'Branch weight', (p) => void (p.branches[b.dir] = { weight: w, rounds: p.branches[b.dir]?.rounds ?? 'all' }))} />
                      <span className="muted small"> {Math.round((weight / totalWeight) * 100)}%</span>
                    </td>
                  )}
                  <td>
                    <CommitField
                      label={`Rounds ${b.dir}`}
                      value={br?.rounds ?? 'all'}
                      validate={(v) => {
                        const r = parseRoundSpec(v);
                        return r.ok ? null : r.error;
                      }}
                      onCommit={(rounds) => editor.editJunction(cell, 'Branch rounds', (p) => void (p.branches[b.dir] = { weight: p.branches[b.dir]?.weight ?? 1, rounds }))}
                    />
                    {counts && <div className="muted small">sim: {counts.join(' · ')}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">Rounds: all, odd, even, 3, 2-5, 10+ (comma-separated).</p>
        {inspect.hasPolicy && <button onClick={() => editor.resetJunction(cell)}>Reset to plain alternate</button>}
      </div>
    );
  }

  if (inspect.kind === 'airRoute') {
    return (
      <div className="panel-body inspector">
        <h3>Flight path</h3>
        <p>
          <code>{inspect.id}</code>: {inspect.from} → {inspect.to}
        </p>
        <p className="muted">
          {inspect.points} waypoint{inspect.points === 1 ? '' : 's'} · {inspect.length} tiles · used by {inspect.usedBy} pinned group{inspect.usedBy === 1 ? '' : 's'}
        </p>
        <label className="check-row">
          <input type="checkbox" checked={inspect.smooth} onChange={(e) => editor.setAirSmooth(inspect.id, e.target.checked)} />
          Smooth curve through the waypoints
        </label>
        <p className="muted small">Drag the round handles with the Select or Flight path tool. Right-click a handle (Flight path tool) to delete it.</p>
        <button className="danger" onClick={() => editor.deleteSelection()}>
          Delete flight path
        </button>
      </div>
    );
  }

  if (inspect.kind === 'spawn') {
    return (
      <div className="panel-body inspector">
        <h3>{inspect.spawnKind === 'air' ? 'Air spawn' : 'Spawn'}</h3>
        <p>
          <code>{inspect.id}</code> at ({inspect.cell[0]}, {inspect.cell[1]})
        </p>
        <p className="muted">Routes: {inspect.routes.join(', ') || 'none yet'}</p>
        <p className="muted">Used by {inspect.usedBy} wave group{inspect.usedBy === 1 ? '' : 's'}.</p>
        {inspect.spawnKind === 'air' && <p className="muted small">Draw a flight path from here with the Flight path tool (Q); without one, flyers go straight to every exit.</p>}
        <button className="danger" onClick={() => editor.deleteSelection()}>
          Delete spawn
        </button>
      </div>
    );
  }

  if (inspect.kind === 'region') {
    const { region: r, counts } = inspect;
    return (
      <div className="panel-body inspector">
        <h3>
          Selection {inspect.w}×{inspect.h}
        </h3>
        <p className="muted">
          ({r.x0}, {r.y0}) to ({r.x1}, {r.y1}) · {counts.objects} object{counts.objects === 1 ? '' : 's'} · {counts.path} path cell{counts.path === 1 ? '' : 's'} · {counts.zones} zone cell{counts.zones === 1 ? '' : 's'}
        </p>
        <LayerChecks editor={editor} />
        <div className="row-buttons">
          <button onClick={() => editor.copySelection()} title="Ctrl+C">
            Copy
          </button>
          <button onClick={() => editor.copySelection(true)} title="Ctrl+X">
            Cut
          </button>
          <button onClick={() => editor.startPaste()} title="Ctrl+V">
            Paste
          </button>
          <button className="danger" onClick={() => editor.deleteSelection()} title="Delete">
            Delete
          </button>
        </div>
        <p className="muted small">Objects come along when the cell they stand on is inside the box. Pasting adds on top: terrain is replaced, existing paths keep their cells, and the ghost turns red with a reason where something doesn't fit.</p>
      </div>
    );
  }

  return (
    <div className="panel-body inspector">
      <h3>Exit</h3>
      <p>
        <code>{inspect.id}</code> at ({inspect.cell[0]}, {inspect.cell[1]})
      </p>
      <p className="muted">Reached by: {inspect.routes.join(', ') || 'no route yet'}</p>
      <button className="danger" onClick={() => editor.deleteSelection()}>
        Delete exit
      </button>
    </div>
  );
}
