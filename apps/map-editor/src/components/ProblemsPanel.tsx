import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';
import { ThemesSection } from './ThemesSection.tsx';

export function ProblemsPanel({ editor }: { editor: EditorController }) {
  const problems = useStore(editor.store, (s) => s.problems);
  const routes = useStore(editor.store, (s) => s.routes);
  const buildable = useStore(editor.store, (s) => s.buildableCount);
  const errors = useStore(editor.store, (s) => s.errors);
  const clear = useStore(editor.store, (s) => s.clear);
  const dirty = useStore(editor.store, (s) => s.dirty);

  return (
    <div className="panel-body">
      <div className={`clear-card ${clear.status}`}>
        <div className="clear-head">
          <strong>Clear check</strong>
          <span className="clear-state">
            {clear.status === 'running' && 'checking…'}
            {clear.status === 'passed' && (clear.savedCurrent ? '✓ cleared and saved' : dirty ? '✓ passes · save to stamp it' : '✓ passes')}
            {clear.status === 'failed' && '✕ not cleared'}
          </span>
        </div>
        <p className="muted small">Like Mario Maker's clear check: every round is simulated with no towers. Every enemy must spawn and reach an exit. Saving stamps the result; the repo test refuses maps without a current stamp.</p>
        {clear.status === 'passed' && clear.summary && <p className="small">{clear.summary}</p>}
        {clear.status === 'failed' && (
          <ul className="clear-problems">
            {clear.problems.slice(0, 5).map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        )}
      </div>
      {problems.length === 0 ? (
        <div className="all-clear">
          <strong>✓ Ready to play</strong>
          <span>No problems. Every spawn reaches an exit and the waves check out.</span>
        </div>
      ) : (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={`${p.code}-${i}`}>
              <button className={`problem ${p.severity}`} onClick={() => editor.focusProblem(p)} disabled={!p.cells.length} title={p.cells.length ? 'Show on the map' : undefined}>
                <span className="sev">{p.severity === 'error' ? '✕' : '!'}</span>
                <span>{p.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors > 0 && <p className="hint">Errors don't stop you saving, but the game refuses the map, and the repo test fails, until they're fixed.</p>}

      <h3>Routes</h3>
      {routes.length === 0 ? (
        <p className="muted">No complete routes yet. Paint the path from a spawn to an exit.</p>
      ) : (
        <table className="routes">
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.id}</code>
                </td>
                <td>
                  {r.spawn} → {r.exit}
                </td>
                <td className="num">{r.kind === 'air' ? 'air' : `${r.length} tiles`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">{buildable} cells can take a tower.</p>
      <ThemesSection editor={editor} />
    </div>
  );
}
