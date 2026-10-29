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

  it('keeps the top 50 when a lower score is recorded', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    for (let score = 100; score < 150; score++) board.record('water-cannon', score);
    const before = board.top('water-cannon', 100);
    const entry = board.record('water-cannon', 5);
    expect(entry.score).toBe(5);
    expect(board.top('water-cannon', 100)).toEqual(before);
    expect(board.best('water-cannon')).toBe(149);
  });

  it('keeps a qualifying score and drops the lowest', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    for (let score = 100; score < 150; score++) board.record('water-cannon', score);
    board.record('water-cannon', 125);
    const scores = board.top('water-cannon', 100).map((e) => e.score);
    expect(scores).toHaveLength(50);
    expect(scores.filter((s) => s === 125)).toHaveLength(2);
    expect(scores).not.toContain(100);
    expect(Math.min(...scores)).toBe(101);
  });

  it('keeps the earlier of equal scores at the boundary', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    for (let score = 100; score < 150; score++) board.record('water-cannon', score);
    board.record('water-cannon', 100);
    const kept = board.top('water-cannon', 100);
    expect(kept).toHaveLength(50);
    expect(kept.at(-1)).toEqual({ gameId: 'water-cannon', score: 100, at: 1 });
  });

  it('keeps other games when the cap trims a game', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    board.record('ring-toss', 70);
    board.record('ring-toss', 30);
    for (let score = 100; score < 160; score++) board.record('water-cannon', score);
    expect(board.top('ring-toss', 10).map((e) => e.score)).toEqual([70, 30]);
    expect(board.top('water-cannon', 100)).toHaveLength(50);
  });

  it('rejects negative and non-numeric scores', () => {
    const board = createScoreBoard(memoryStorage());
    expect(() => board.record('water-cannon', -1)).toThrow();
    expect(() => board.record('water-cannon', Number.NaN)).toThrow();
  });
});
