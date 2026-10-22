import { describe, expect, it } from 'vitest';
import { RECENT_MAX, libraryView, matches, noteRecent, togglePin, type LibraryItem, type LibraryPrefs } from '../src/editor/palette.ts';

const items: LibraryItem[] = [
  { id: 'tree_round', name: 'Tree', color: '#000', category: 'tree' },
  { id: 'tree_pine', name: 'Small tree', color: '#000', category: 'tree' },
  { id: 'bush', name: 'Bush', color: '#000', category: 'tree' },
  { id: 'rock', name: 'Rock', color: '#000', category: 'rock' },
  { id: 'house_small', name: 'House', color: '#000', category: 'building' },
];
const prefs = (over: Partial<LibraryPrefs> = {}): LibraryPrefs => ({ query: '', pins: [], recent: [], ...over });

describe('palette library', () => {
  it('matches every word of the query against name, id and category', () => {
    expect(matches(items[1]!, 'small TREE')).toBe(true);
    expect(matches(items[4]!, 'build')).toBe(true);
    expect(matches(items[3]!, 'tree')).toBe(false);
    expect(matches(items[3]!, '  ')).toBe(true);
  });

  it('lists pinned items first (in pin order), then the rest, and 1-9 follow that order', () => {
    const v = libraryView(items, 'stamp', prefs({ pins: ['stamp:rock', 'terrain:rock', 'stamp:tree_pine'] }));
    expect(v.pinned.map((i) => i.id)).toEqual(['rock', 'tree_pine']);
    expect(v.ordered.map((i) => i.id)).toEqual(['rock', 'tree_pine', 'tree_round', 'bush', 'house_small']);
    const searched = libraryView(items, 'stamp', prefs({ query: 'tree', pins: ['stamp:rock', 'stamp:tree_pine'] }));
    expect(searched.ordered.map((i) => i.id)).toEqual(['tree_pine', 'tree_round', 'bush']);
  });

  it('pins toggle, and recents stay most-recent-first and capped per list', () => {
    let p = togglePin(prefs(), 'stamp', 'rock');
    expect(p.pins).toEqual(['stamp:rock']);
    p = togglePin(p, 'stamp', 'rock');
    expect(p.pins).toEqual([]);

    p = noteRecent(prefs({ recent: ['terrain:water'] }), 'stamp', 'bush');
    p = noteRecent(p, 'stamp', 'rock');
    p = noteRecent(p, 'stamp', 'bush');
    expect(p.recent).toEqual(['stamp:bush', 'stamp:rock', 'terrain:water']);
    for (let i = 0; i < 10; i++) p = noteRecent(p, 'stamp', `k${i}`);
    expect(p.recent.filter((r) => r.startsWith('stamp:'))).toHaveLength(RECENT_MAX);
    expect(p.recent).toContain('terrain:water');
    // recents leave out pinned items
    expect(libraryView(items, 'stamp', prefs({ recent: ['stamp:bush', 'stamp:rock'], pins: ['stamp:rock'] })).recent.map((i) => i.id)).toEqual(['bush']);
  });
});
