import { describe, expect, it } from 'vitest';
import { createScoreBoard } from './scores';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('score board', () => {
  it('has no best score for a game nobody has played', () => {
    const board = createScoreBoard(memoryStorage());
    expect(board.best('water-cannon')).toBeUndefined();
  });

  it('keeps the best score per game', () => {
    const board = createScoreBoard(memoryStorage());
    board.record('water-cannon', 120);
    board.record('water-cannon', 340);
    board.record('ring-toss', 900);
    board.record('water-cannon', 80);
    expect(board.best('water-cannon')).toBe(340);
    expect(board.best('ring-toss')).toBe(900);
  });

  it('lists top scores highest first, earliest first on a tie', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    board.record('water-cannon', 50);
    board.record('water-cannon', 200);
    board.record('water-cannon', 200);
    board.record('water-cannon', 10);
    expect(board.top('water-cannon', 3).map((e) => [e.score, e.at])).toEqual([
      [200, 2],
      [200, 3],
      [50, 1],
    ]);
  });

  it('survives corrupt storage', () => {
    const storage = memoryStorage();
    storage.setItem('tessl-carnival:scores', '{not json');
    const board = createScoreBoard(storage);
    expect(board.best('water-cannon')).toBeUndefined();
    board.record('water-cannon', 5);
    expect(board.best('water-cannon')).toBe(5);
  });

  it('ignores malformed entries and keeps the valid ones', () => {
    const storage = memoryStorage();
    storage.setItem(
      'tessl-carnival:scores',
      JSON.stringify([
        null,
        7,
        'water-cannon',
        [],
        {},
        { gameId: 'water-cannon', score: 300 },
        { gameId: 'water-cannon', at: 1 },
        { score: 999, at: 1 },
        { gameId: 42, score: 999, at: 1 },
        { gameId: 'water-cannon', score: '999', at: 1 },
        { gameId: 'water-cannon', score: -5, at: 1 },
        { gameId: 'water-cannon', score: 999, at: '1' },
        { gameId: 'water-cannon', score: 120, at: 2 },
        { gameId: 'water-cannon', score: 250, at: 3 },
        { gameId: 'ring-toss', score: 60, at: 4 },
      ]),
    );
    const board = createScoreBoard(storage, () => 10);
    expect(board.best('water-cannon')).toBe(250);
    expect(board.top('water-cannon', 5).map((e) => e.score)).toEqual([250, 120]);
    expect(board.best('ring-toss')).toBe(60);

    board.record('water-cannon', 180);
    const stored: unknown = JSON.parse(storage.getItem('tessl-carnival:scores') ?? '');
    expect(stored).toEqual([
      { gameId: 'ring-toss', score: 60, at: 4 },
      { gameId: 'water-cannon', score: 250, at: 3 },
      { gameId: 'water-cannon', score: 120, at: 2 },
      { gameId: 'water-cannon', score: 180, at: 10 },
    ]);
  });

  it('ignores entries with a score or time too large to be finite', () => {
    const storage = memoryStorage();
    storage.setItem(
      'tessl-carnival:scores',
      '[{"gameId":"water-cannon","score":1e999,"at":1},' +
        '{"gameId":"water-cannon","score":900,"at":-1e999},' +
        '{"gameId":"water-cannon","score":40,"at":1}]',
    );
    const board = createScoreBoard(storage);
    expect(board.top('water-cannon', 5).map((e) => e.score)).toEqual([40]);
  });

  it('ignores stored JSON that is not a list', () => {
    const storage = memoryStorage();
    storage.setItem('tessl-carnival:scores', JSON.stringify({ gameId: 'water-cannon' }));
    const board = createScoreBoard(storage);
    expect(board.top('water-cannon', 3)).toEqual([]);
  });

  it('survives storage that refuses a read', () => {
    const storage = memoryStorage();
    const board = createScoreBoard({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: storage.setItem,
    });
    expect(board.best('water-cannon')).toBeUndefined();
    expect(() => board.record('water-cannon', 15)).not.toThrow();
  });

  it('keeps working when storage refuses a write', () => {
    const storage = memoryStorage();
    storage.setItem(
      'tessl-carnival:scores',
      JSON.stringify([{ gameId: 'ring-toss', score: 70, at: 1 }]),
    );
    const board = createScoreBoard({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => board.record('water-cannon', 40)).not.toThrow();
    expect(board.best('water-cannon')).toBe(40);
    expect(board.best('ring-toss')).toBe(70);
    board.record('water-cannon', 90);
    expect(board.best('water-cannon')).toBe(90);
  });

  it('rejects negative and non-numeric scores', () => {
    const board = createScoreBoard(memoryStorage());
    expect(() => board.record('water-cannon', -1)).toThrow();
    expect(() => board.record('water-cannon', Number.NaN)).toThrow();
  });
});
