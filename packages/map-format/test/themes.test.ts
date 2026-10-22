import { describe, expect, it } from 'vitest';
import { ThemeDoc, resolveTheme, themeChain } from '../src/index.ts';

const theme = (t: Record<string, unknown>) => ThemeDoc.parse({ format: 'ptd-theme', schemaVersion: 1, ...t });
const summer = theme({
  id: 'summer',
  name: 'Summer',
  atlas: 'summer',
  baseFill: 'base/ground:grass',
  terrain: { grass: { base: true }, water: { autotile: 'base/water' }, path_dirt: { autotile: 'base/dirt' } },
  objects: { tree: 'base/stamps@tree', rock: 'base/stamps@rock' },
});
const winter = theme({
  id: 'winter',
  name: 'Winter',
  inherits: 'summer',
  atlas: 'winter',
  baseFill: ['real-winter/ground:snow', 'snow/ground:snow'],
  terrain: { water: { autotile: ['real-winter/ice', 'snow/water'] } },
  objects: { tree: 'snow/stamps@tree' },
});
const themes = new Map([summer, winter].map((t) => [t.id, t]));
const have = new Set(['base/ground:grass', 'base/water', 'base/dirt', 'base/stamps@tree', 'base/stamps@rock', 'snow/ground:snow', 'snow/water', 'snow/stamps@tree']);
const available = (k: string) => have.has(k);

describe('theme resolution', () => {
  it('walks the inheritance chain child first', () => {
    expect(themeChain(themes, 'winter').map((t) => t.id)).toEqual(['winter', 'summer']);
  });

  it('overrides slot by slot and inherits the rest', () => {
    const r = resolveTheme(themes, 'winter', available, ['grass', 'path_dirt', 'water'], ['rock', 'tree']);
    expect(r.chain).toEqual(['winter', 'summer']);
    expect(r.baseFill).toBe('snow/ground:snow');
    expect(r.terrain).toEqual({ grass: { base: true }, path_dirt: { autotile: 'base/dirt' }, water: { autotile: 'snow/water' } });
    expect(r.objects).toEqual({ rock: 'base/stamps@rock', tree: 'snow/stamps@tree' });
    expect(r.missing).toEqual([]);
  });

  it('records fallbacks when the first choice is not available, and picks the real pack once it is', () => {
    const r = resolveTheme(themes, 'winter', available, ['grass', 'water'], []);
    expect(r.fallbacks).toEqual([
      { slot: 'baseFill', wanted: 'real-winter/ground:snow', used: 'snow/ground:snow' },
      { slot: 'terrain.water', wanted: 'real-winter/ice', used: 'snow/water' },
    ]);
    const withPack = resolveTheme(themes, 'winter', (k) => available(k) || k.startsWith('real-winter/'), ['grass', 'water'], []);
    expect(withPack.baseFill).toBe('real-winter/ground:snow');
    expect(withPack.fallbacks).toEqual([]);
  });

  it('falls back to the parent when a child override is unavailable', () => {
    const r = resolveTheme(themes, 'winter', (k) => available(k) && k !== 'snow/stamps@tree', [], ['tree']);
    expect(r.objects.tree).toBe('base/stamps@tree');
    expect(r.fallbacks.filter((f) => f.slot === 'objects.tree')).toEqual([{ slot: 'objects.tree', wanted: 'snow/stamps@tree', used: 'base/stamps@tree' }]);
  });

  it('reports content with no art at all', () => {
    const r = resolveTheme(themes, 'summer', available, ['grass', 'lava'], ['tree', 'statue']);
    expect(r.missing).toEqual(['terrain:lava', 'object:statue']);
  });

  it('rejects unknown parents, loops and gameplay keys', () => {
    const lost = theme({ id: 'lost', name: 'Lost', inherits: 'nope', atlas: 'lost', baseFill: 'base/ground:grass' });
    expect(() => themeChain(new Map([['lost', lost]]), 'lost')).toThrow(/unknown theme "nope"/);
    const a = theme({ id: 'a', name: 'A', inherits: 'b', atlas: 'a' });
    const b = theme({ id: 'b', name: 'B', inherits: 'a', atlas: 'b' });
    expect(() => themeChain(new Map([['a', a], ['b', b]]), 'a')).toThrow(/loops/);
    expect(() => theme({ id: 'x', name: 'X', atlas: 'x', baseFill: 'k', walkable: true })).toThrow();
  });
});
