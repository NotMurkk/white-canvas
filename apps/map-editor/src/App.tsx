import { useEffect, useMemo, useRef } from 'react';
import { NewMapDialog, OpenMapDialog } from './components/Dialogs.tsx';
import { BalancePanel } from './components/BalancePanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Palette } from './components/Palette.tsx';
import { ProblemsPanel } from './components/ProblemsPanel.tsx';
import { WavesPanel } from './components/WavesPanel.tsx';
import { EditorController } from './editor/EditorController.ts';
import { HOSTED } from './editor/storage.ts';
import { useStore } from './editor/store.ts';

/** `gameUrl` is the page that plays a saved map (the app's /play route). */
export function App({ gameUrl }: { gameUrl: string }) {
  const editor = useMemo(() => new EditorController(), []);
  const host = useRef<HTMLDivElement>(null);
  const s = useStore(editor.store, (st) => st);

  useEffect(() => {
    if (!host.current) return;
    editor.mount(host.current, new URLSearchParams(location.search).get('map') ?? 'phase0-meadow');
    return () => editor.destroy();
  }, [editor]);

  const editing = s.mode === 'edit' && s.status === 'ready';
  const saveLabel = s.saveState === 'saving' ? 'Saving…' : s.dirty ? 'Save' : 'Saved';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TD Map Maker</div>
        <button onClick={() => editor.store.set({ dialog: 'new' })} disabled={s.mode !== 'edit'}>
          New
        </button>
        <button onClick={() => (void editor.refreshMapList(), editor.store.set({ dialog: 'open' }))} disabled={s.mode !== 'edit'}>
          Open
        </button>
        <div className="map-name">
          <input
            key={`${s.mapId}:${s.mapName}`}
            defaultValue={s.mapName}
            aria-label="Map name"
            onBlur={(e) => editor.rename(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="muted">
            {s.mapId}.map.json · {s.mapSize}
          </span>
          {s.dirty && <span className="dirty" title="Unsaved changes">●</span>}
          <span
            className={`clear-chip ${s.clear.status === 'passed' && s.clear.savedCurrent ? 'ok' : s.clear.status === 'failed' ? 'bad' : 'draft'}`}
            title="Clear check: every round simulated with no towers. Saved maps need a current pass to be merged."
            onClick={() => editor.store.set({ rightTab: 'problems' })}
          >
            {s.clear.status === 'passed' && s.clear.savedCurrent ? '✓ Cleared' : s.clear.status === 'failed' ? 'Draft · fails check' : s.clear.status === 'running' ? 'Checking…' : 'Draft · save to clear'}
          </span>
        </div>
        <div className="actions">
          <button onClick={() => editor.undo()} disabled={!s.canUndo || !editing} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={() => editor.redo()} disabled={!s.canRedo || !editing} title="Redo (Ctrl+Y)">
            Redo
          </button>
          <button className={s.dirty ? 'save dirty' : 'save'} onClick={() => void editor.save()} disabled={!editing || s.saveState === 'saving'} title={HOSTED ? 'Download the map and waves files to put in maps/ (Ctrl+S)' : 'Save to maps/ (Ctrl+S)'}>
            {saveLabel}
          </button>
          <select className="theme-select" value={s.theme} onChange={(e) => void editor.switchTheme(e.target.value)} disabled={!editing} title="Preview theme (art only)" aria-label="Preview theme">
            {s.themes.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.built}>
                {t.name}
                {s.mapThemes.supported.includes(t.id) ? '' : ' (not shipped)'}
              </option>
            ))}
          </select>
          <a className="button" href={`${gameUrl}?map=${encodeURIComponent(`/maps/${s.mapId}.map.json`)}&theme=${encodeURIComponent(s.theme)}`} target="_blank" rel="noreferrer" title="Open the saved file in the reference game">
            Saved in game ↗
          </a>
          {s.mode === 'edit' ? (
            <span className="play-group">
              <select value={s.startRound} onChange={(e) => editor.store.set({ startRound: Number(e.target.value) })} title="Start playtest from round" aria-label="Start round">
                {(s.waves?.rounds.length ? s.waves.rounds : [null]).map((_, i) => (
                  <option key={i} value={i}>
                    from round {i + 1}
                  </option>
                ))}
              </select>
              <button className="primary" onClick={() => editor.play()} disabled={!editing} title="Playtest the unsaved map (P)">
                ▶ Play
              </button>
            </span>
          ) : (
            <button className="primary" onClick={() => editor.stopPlay()} title="Back to editing (Esc)">
              ■ Stop
            </button>
          )}
        </div>
      </header>

      <Palette editor={editor} />

      <main className="viewport-wrap">
        <div className="viewport" ref={host} />
        {s.status === 'loading' && <div className="overlay">Loading map…</div>}
        {s.status === 'error' && (
          <div className="overlay error">
            <strong>Could not open the map</strong>
            <pre>{s.error}</pre>
            <div className="row">
              <button onClick={() => editor.store.set({ dialog: 'new' })}>New map</button>
              <button onClick={() => (void editor.refreshMapList(), editor.store.set({ dialog: 'open' }))}>Open another</button>
            </div>
          </div>
        )}
        {s.mode === 'play' && <div className="play-banner">Playtesting the unsaved map · Esc to return</div>}
        {s.mode === 'edit' && s.paste && (
          <div className="play-banner paste-banner">
            Pasting {s.paste.w}×{s.paste.h} · click to place (again and again) · right-click or Esc to stop
          </div>
        )}
        {s.restore && (
          <div className="banner">
            Unsaved changes from {new Date(s.restore.savedAt).toLocaleTimeString()} were found for this map.
            <button className="primary" onClick={() => void editor.restoreAutosave()}>
              Restore
            </button>
            <button onClick={() => void editor.discardAutosave()}>Discard</button>
          </div>
        )}
        {(s.saveState === 'conflict' || s.saveState === 'error') && (
          <div className="banner error">
            <span>{s.saveMessage}</span>
            {s.saveState === 'conflict' && (
              <button className="primary" onClick={() => void editor.save(true)}>
                Overwrite
              </button>
            )}
            <button onClick={() => editor.store.set({ saveState: 'idle' })}>Dismiss</button>
          </div>
        )}
        {s.toast && <div className={`toast ${s.toast.tone}`}>{s.toast.text}</div>}
      </main>

      <aside className="side">
        <nav className="tabs">
          <button className={s.rightTab === 'problems' ? 'on' : ''} onClick={() => editor.store.set({ rightTab: 'problems' })}>
            Check{' '}
            {s.errors > 0 ? <span className="badge error">{s.errors}</span> : s.warnings > 0 ? <span className="badge warn">{s.warnings}</span> : <span className="badge ok">✓</span>}
          </button>
          <button className={s.rightTab === 'waves' ? 'on' : ''} onClick={() => editor.store.set({ rightTab: 'waves' })}>
            Waves <span className="badge">{s.waves?.rounds.length ?? 0}</span>
          </button>
          <button className={s.rightTab === 'balance' ? 'on' : ''} onClick={() => editor.store.set({ rightTab: 'balance' })}>
            Balance
          </button>
          <button className={s.rightTab === 'inspect' ? 'on' : ''} onClick={() => editor.store.set({ rightTab: 'inspect' })}>
            Inspect
          </button>
        </nav>
        {s.rightTab === 'problems' && <ProblemsPanel editor={editor} />}
        {s.rightTab === 'waves' && <WavesPanel editor={editor} />}
        {s.rightTab === 'inspect' && <Inspector editor={editor} />}
        {s.rightTab === 'balance' && (
          <div className="panel-body">
            <BalancePanel
              stats={s.stats}
              errors={s.clear.status === 'failed' ? s.clear.problems.map((p) => p.message) : []}
              computing={s.clear.status === 'running'}
              enemies={Object.fromEntries(s.enemies.map((e) => [e.id, { name: e.name, color: e.color }]))}
              startCash={s.waves?.startCash ?? 0}
              onPickRound={(i) => {
                editor.store.set({ rightTab: 'waves', startRound: i });
                requestAnimationFrame(() => document.getElementById(`round-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
            />
          </div>
        )}
      </aside>

      <footer className="statusbar">
        <span>{s.hover ? `x ${s.hover.x}, y ${s.hover.y}` : '—'}</span>
        {s.hover?.lines.map((l, i) => (
          <span key={i} className={l.startsWith('✗') ? 'bad' : ''}>
            {l}
          </span>
        ))}
        <span className="right">zoom {s.zoom}× · F fit</span>
      </footer>

      {s.dialog === 'new' && <NewMapDialog editor={editor} />}
      {s.dialog === 'open' && <OpenMapDialog editor={editor} />}
    </div>
  );
}
