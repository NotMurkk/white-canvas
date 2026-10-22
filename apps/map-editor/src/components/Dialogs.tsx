import { useState } from 'react';
import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

export function NewMapDialog({ editor }: { editor: EditorController }) {
  const [name, setName] = useState('New map');
  const [id, setId] = useState('new-map');
  const [idTouched, setIdTouched] = useState(false);
  const [width, setWidth] = useState(40);
  const [height, setHeight] = useState(24);
  const list = useStore(editor.store, (s) => s.mapList);
  const taken = list.some((m) => m.id === id);
  const valid = /^[a-z0-9][a-z0-9_-]*$/.test(id) && !taken && width >= 8 && height >= 8 && width <= 256 && height <= 256;
  return (
    <div className="dialog-backdrop" onClick={() => editor.store.set({ dialog: 'none' })}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void editor.newMap({ id, name, width, height });
        }}
      >
        <h2>New map</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!idTouched) setId(slug(e.target.value) || 'map');
            }}
          />
        </label>
        <label>
          File name
          <span className="with-suffix">
            <input
              value={id}
              onChange={(e) => {
                setIdTouched(true);
                setId(slug(e.target.value));
              }}
            />
            <span className="muted">.map.json</span>
          </span>
        </label>
        {taken && <p className="error-text">maps/{id}.map.json already exists.</p>}
        <div className="row">
          <label>
            Width
            <input type="number" min={8} max={256} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          <label>
            Height
            <input type="number" min={8} max={256} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted">40×24 at 32 px fills a 1280×768 screen. Starts as all grass in the summer theme.</p>
        <div className="row end">
          <button type="button" onClick={() => editor.store.set({ dialog: 'none' })}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!valid}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

export function OpenMapDialog({ editor }: { editor: EditorController }) {
  const list = useStore(editor.store, (s) => s.mapList);
  const current = useStore(editor.store, (s) => s.mapId);
  return (
    <div className="dialog-backdrop" onClick={() => editor.store.set({ dialog: 'none' })}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Open map</h2>
        {list.length === 0 && <p className="muted">No maps in maps/ yet.</p>}
        <ul className="map-list">
          {list.map((m) => (
            <li key={m.id}>
              <button disabled={m.id === current} onClick={() => void editor.openMap(m.id)}>
                <strong>{m.name}</strong>
                <span className="muted">
                  {m.id}.map.json · {m.width}×{m.height}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row end">
          <button onClick={() => editor.store.set({ dialog: 'none' })}>Close</button>
        </div>
      </div>
    </div>
  );
}
