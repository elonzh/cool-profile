import type { CalendarCell } from '@cool-profile/graphics';

export type Strategy = 'column' | 'row' | 'random';
export interface Shot {
  cell: CalendarCell;
  fromColumn: number;
  start: number;
  aim: number;
  hit: number;
  end: number;
}
export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function targetOrder(
  cells: readonly CalendarCell[],
  strategy: Strategy,
  seed: number,
): CalendarCell[] {
  const active = cells.filter((cell) => cell.value > 0);
  if (strategy === 'column') return active.sort((a, b) => a.column - b.column || b.row - a.row);
  if (strategy === 'row') return active.sort((a, b) => b.row - a.row || a.column - b.column);
  const random = randomGenerator(seed);
  const columns = new Map<number, CalendarCell[]>();
  for (const cell of active) {
    const column = columns.get(cell.column) ?? [];
    column.push(cell);
    columns.set(cell.column, column);
  }
  for (const column of columns.values()) column.sort((a, b) => b.row - a.row);
  const ordered: CalendarCell[] = [];
  while (columns.size) {
    const keys = [...columns.keys()].sort((a, b) => a - b);
    const key = keys[Math.floor(random() * keys.length)]!;
    const column = columns.get(key)!;
    ordered.push(column.shift()!);
    if (!column.length) columns.delete(key);
  }
  return ordered;
}

export function planBattle(
  cells: readonly CalendarCell[],
  columns: number,
  strategy: Strategy,
  seed: number,
  durationMs: number,
) {
  const ordered = targetOrder(cells, strategy, seed);
  const center = (columns - 1) / 2;
  let fromColumn = center;
  const weights = ordered.map((cell) => {
    const movement = 0.15 + (Math.abs(cell.column - fromColumn) / Math.max(1, columns)) * 2;
    fromColumn = cell.column;
    return { movement, flight: 0.3 + (7 - cell.row) * 0.035, explosion: 0.18 };
  });
  const scale =
    (durationMs * 0.88) /
    Math.max(
      1,
      weights.reduce(
        (total, weight) => total + weight.movement + weight.flight + weight.explosion,
        0,
      ),
    );
  let cursor = 0;
  fromColumn = center;
  const scores = [0];
  const shots: Shot[] = ordered.map((cell, index) => {
    const weight = weights[index]!;
    const start = cursor;
    const aim = start + weight.movement * scale;
    const hit = aim + weight.flight * scale;
    const end = hit + weight.explosion * scale;
    const shot = { cell, fromColumn, start, aim, hit, end };
    cursor = end;
    fromColumn = cell.column;
    scores.push(scores.at(-1)! + cell.value);
    return shot;
  });
  return { shots, scores, center, durationMs, battleEnd: cursor };
}

const smooth = (value: number) => value * value * (3 - 2 * value);
export function battleFrame(battle: ReturnType<typeof planBattle>, time: number) {
  const index = battle.shots.findIndex((shot) => time < shot.end);
  const shot = index < 0 ? undefined : battle.shots[index];
  let column = battle.center;
  if (shot)
    column =
      time < shot.aim
        ? shot.fromColumn +
          (shot.cell.column - shot.fromColumn) *
            smooth(Math.max(0, (time - shot.start) / (shot.aim - shot.start)))
        : shot.cell.column;
  else if (battle.shots.length) {
    const last = battle.shots.at(-1)!.cell.column;
    const returning = Math.min(
      1,
      Math.max(0, (time - battle.battleEnd) / (battle.durationMs - battle.battleEnd)),
    );
    column = last + (battle.center - last) * smooth(returning);
  }
  const cleared = shot ? index + Number(time >= shot.hit) : battle.shots.length;
  return {
    column,
    shot,
    cleared,
    collected: battle.scores[cleared]!,
    bullet:
      shot && time >= shot.aim && time < shot.hit
        ? (time - shot.aim) / (shot.hit - shot.aim)
        : undefined,
    explosion: shot && time >= shot.hit ? (time - shot.hit) / (shot.end - shot.hit) : undefined,
  };
}
