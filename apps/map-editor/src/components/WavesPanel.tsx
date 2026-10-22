import { useEffect, useMemo, useState } from 'react';
import type { WaveGroup } from '@tdmm/map-format';
import type { EditorController } from '../editor/EditorController.ts';
import { useStore } from '../editor/store.ts';
import { WaveTimeline } from './WaveTimeline.tsx';

/** Number input that commits on blur/Enter, so typing "120" is one undo step, not three. */
function NumberField({ value, min, step = 1, onCommit, label }: { value: number; min: number; step?: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v >= min && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <input
      className="num-input"
      type="number"
      aria-label={label}
      min={min}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function WavesPanel({ editor }: { editor: EditorController }) {
  const waves = useStore(editor.store, (s) => s.waves);
  const enemies = useStore(editor.store, (s) => s.enemies);
  const spawns = useStore(editor.store, (s) => s.spawns);
  const routes = useStore(editor.store, (s) => s.routes);
  const problems = useStore(editor.store, (s) => s.problems);
  const stats = useStore(editor.store, (s) => s.stats);
  const enemyLook = useMemo(() => Object.fromEntries(enemies.map((e) => [e.id, { name: e.name, color: e.color }])), [enemies]);
  if (!waves) return null;

  const edit = editor.editWaves.bind(editor);
  const defaultSpawn = spawns.find((s) => s.kind === 'ground')?.id ?? spawns[0]?.id ?? '';
  const groupProblem = (g: WaveGroup) => problems.find((p) => p.message.includes(`group "${g.id}"`));
  const newGroup = (roundIndex: number): WaveGroup => {
    const enemy = enemies.find((e) => !e.flying)?.id ?? enemies[0]?.id ?? 'grunt';
    return { id: editor.newGroupId(`r${roundIndex + 1}`), enemy, count: 8, startSec: 0, intervalSec: 1, spawn: defaultSpawn, route: null };
  };

  return (
    <div className="panel-body waves">
      <div className="wave-settings">
        <label>
          Start cash
          <NumberField label="Start cash" value={waves.startCash} min={0} step={50} onCommit={(v) => edit('Start cash', (w) => void (w.startCash = v))} />
        </label>
        <label>
          Lives
          <NumberField label="Lives" value={waves.lives} min={1} onCommit={(v) => edit('Lives', (w) => void (w.lives = v))} />
        </label>
      </div>
      {spawns.length === 0 && <p className="hint">Place a spawn first; groups say which spawn they come from.</p>}

      {waves.rounds.map((round, ri) => {
        const count = round.groups.reduce((n, g) => n + g.count, 0);
        const lasts = Math.max(0, ...round.groups.map((g) => g.startSec + (g.count - 1) * g.intervalSec));
        return (
          <section key={ri} className="round" id={`round-${ri}`}>
            <header>
              <strong>Round {ri + 1}</strong>
              <span className="muted">
                {count} enemies · spawns over {Math.round(lasts * 10) / 10}s
              </span>
              <span className="spacer" />
              <button className="small" title="Playtest from this round" onClick={() => (editor.store.set({ startRound: ri }), editor.play())}>
                ▶
              </button>
              <button className="small" title="Duplicate round" onClick={() => edit('Duplicate round', (w) => {
                const copy = structuredClone(w.rounds[ri]!);
                for (const g of copy.groups) g.id = editor.newGroupId(`r${ri + 2}`);
                w.rounds.splice(ri + 1, 0, copy);
              })}>
                ⧉
              </button>
              <button className="small danger" title="Delete round" onClick={() => edit('Delete round', (w) => void w.rounds.splice(ri, 1))}>
                ✕
              </button>
            </header>
            <label className="inline">
              Bonus cash
              <NumberField label="Bonus cash" value={round.bonusCash} min={0} step={10} onCommit={(v) => edit('Bonus cash', (w) => void (w.rounds[ri]!.bonusCash = v))} />
            </label>
            <WaveTimeline
              round={round}
              enemies={enemyLook}
              clearSec={stats?.[ri]?.clearSec}
              onMoveGroup={(gi, startSec) => edit('Move group', (w) => void (w.rounds[ri]!.groups[gi]!.startSec = startSec))}
            />
            {round.groups.map((g, gi) => {
              const set = (label: string, patch: Partial<WaveGroup>) => edit(label, (w) => void Object.assign(w.rounds[ri]!.groups[gi]!, patch));
              const problem = groupProblem(g);
              const spawnRoutes = routes.filter((r) => r.spawn === g.spawn);
              const color = enemies.find((en) => en.id === g.enemy)?.color ?? '#888888';
              return (
                <div key={g.id} className={problem ? `group bad ${problem.severity}` : 'group'} title={problem?.message}>
                  <div className="g-row">
                    <span className="chip small" style={{ background: color }} />
                    <select className="grow" value={g.enemy} onChange={(e) => set('Enemy', { enemy: e.target.value })} aria-label="Enemy">
                      {enemies.map((en) => (
                        <option key={en.id} value={en.id}>
                          {en.name}
                          {en.flying ? ' (flies)' : ''}
                        </option>
                      ))}
                      {!enemies.some((en) => en.id === g.enemy) && <option value={g.enemy}>{g.enemy} (unknown)</option>}
                    </select>
                    <span className="muted">×</span>
                    <NumberField label="Count" value={g.count} min={1} onCommit={(v) => set('Count', { count: Math.round(v) })} />
                    <button className="small danger" title="Remove group" onClick={() => edit('Remove group', (w) => void w.rounds[ri]!.groups.splice(gi, 1))}>
                      ✕
                    </button>
                  </div>
                  <div className="g-row">
                    <label>
                      start
                      <NumberField label="Start seconds" value={g.startSec} min={0} step={0.5} onCommit={(v) => set('Start', { startSec: v })} />s
                    </label>
                    <label>
                      every
                      <NumberField label="Interval seconds" value={g.intervalSec} min={0.05} step={0.1} onCommit={(v) => set('Interval', { intervalSec: v })} />s
                    </label>
                  </div>
                  <div className="g-row">
                    <label className="grow">
                      from
                      <select className="grow" value={g.spawn} onChange={(e) => set('Spawn', { spawn: e.target.value, route: null })} aria-label="Spawn">
                        {spawns.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.id}
                            {s.kind === 'air' ? ' (air)' : ''}
                          </option>
                        ))}
                        {!spawns.some((s) => s.id === g.spawn) && <option value={g.spawn}>{g.spawn || '—'} (missing)</option>}
                      </select>
                    </label>
                    <label className="grow">
                      route
                      <select className="grow" value={g.route ?? ''} onChange={(e) => set('Route', { route: e.target.value || null })} aria-label="Route">
                        <option value="">{spawnRoutes.length > 1 ? 'Alternate' : 'Auto'}</option>
                        {spawnRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.id}
                          </option>
                        ))}
                        {g.route && !spawnRoutes.some((r) => r.id === g.route) && <option value={g.route}>{g.route} (gone)</option>}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
            <button className="small" onClick={() => edit('Add group', (w) => void w.rounds[ri]!.groups.push(newGroup(ri)))}>
              + Group
            </button>
          </section>
        );
      })}
      <button onClick={() => edit('Add round', (w) => void w.rounds.push({ bonusCash: 100, groups: [newGroup(w.rounds.length)] }))}>+ Round</button>
    </div>
  );
}
