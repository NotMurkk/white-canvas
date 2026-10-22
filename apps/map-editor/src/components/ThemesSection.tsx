import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';

/**
 * Seasonal themes for this map: which ones ship, which is the default, what art each lacks, and the
 * gameplay fingerprint, which no theme can change (themes carry no gameplay data at all).
 */
export function ThemesSection({ editor }: { editor: EditorController }) {
  const themes = useStore(editor.store, (s) => s.themes);
  const current = useStore(editor.store, (s) => s.theme);
  const mapThemes = useStore(editor.store, (s) => s.mapThemes);
  const coverage = useStore(editor.store, (s) => s.themeCoverage);
  const fingerprint = useStore(editor.store, (s) => s.clear.fingerprint);
  const savedCurrent = useStore(editor.store, (s) => s.clear.savedCurrent);

  return (
    <section className="themes-section">
      <h3>Themes</h3>
      <div className="fingerprint" title="Hash of terrain, path, zones, markers, branch policies, flight paths, objects, waves and content numbers. Names, themes and art are not part of it.">
        <span className="muted small">Gameplay fingerprint</span>
        <code>{fingerprint ? `${fingerprint.slice(0, 12)}…` : '…'}</code>
        <span className="small muted">{savedCurrent ? 'matches the saved clear check' : 'same in every theme'}</span>
      </div>
      <table className="theme-table">
        <thead>
          <tr>
            <th>Theme</th>
            <th title="Ships with this map">Ships</th>
            <th>Default</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => {
            const supported = mapThemes.supported.includes(t.id);
            const cov = coverage.find((c) => c.id === t.id);
            return (
              <tr key={t.id} className={t.id === current ? 'current' : ''}>
                <td>
                  <strong>{t.name}</strong>
                  {t.inherits && <span className="muted small"> ← {t.inherits}</span>}
                  {supported && cov && cov.notes.length > 0 && (
                    <ul className={cov.ok ? 'theme-notes' : 'theme-notes bad'}>
                      {cov.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                  {!t.built && <div className="small bad-text">atlas not built: run "npm run art"</div>}
                </td>
                <td>
                  <input type="checkbox" aria-label={`${t.name} ships with this map`} checked={supported} onChange={(e) => editor.setThemeSupported(t.id, e.target.checked)} />
                </td>
                <td>
                  <input type="radio" name="default-theme" aria-label={`${t.name} is the default`} checked={mapThemes.default === t.id} onChange={() => editor.setDefaultTheme(t.id)} />
                </td>
                <td>
                  <button className="small" disabled={t.id === current || !t.built} onClick={() => void editor.switchTheme(t.id)}>
                    {t.id === current ? 'Showing' : 'Preview'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Themes only swap art: same layout, same footprints, same gameplay. Add one with a themes/&lt;id&gt;.theme.json that inherits from summer, then run "npm run art".</p>
    </section>
  );
}
