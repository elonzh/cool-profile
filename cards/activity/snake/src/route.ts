export interface Point {
  x: number;
  y: number;
}
export interface SnakeRoute {
  poses: readonly (readonly Point[])[];
  eatenAt: ReadonlyMap<string, number>;
}
const key = (point: Point) => point.x + ',' + point.y;

// Reserve the left column to close a cycle; the remaining rows form a serpentine path.
function cycle(width: number, height: number): Point[] {
  const result: Point[] = [{ x: 0, y: 0 }];
  for (let y = 0; y < height; y++) {
    for (let step = 1; step < width; step++) {
      result.push({ x: y % 2 ? width - step : step, y });
    }
  }
  for (let y = height - 1; y > 0; y--) result.push({ x: 0, y });
  return result;
}

export function planSnake(width: number, food: readonly Point[], length = 5): SnakeRoute {
  const height = 10;
  const track = cycle(width, height);
  const indices = new Map(track.map((point, index) => [key(point), index]));
  const distance = (from: number, to: number) => (to - from + track.length) % track.length;
  const body = Array.from({ length }, (_, index) => length - 1 - index);
  const remaining = new Set(food.map((point) => indices.get(key(point))!));
  const poses: Point[][] = [];
  const eatenAt = new Map<string, number>();
  const record = () => poses.push(body.map((index) => track[index]!));
  record();
  const advanceTo = (target: number) => {
    const head = body[0]!;
    const tail = distance(head, body.at(-1)!);
    const position = track[head]!;
    // A shortcut may skip only empty cells ahead of the head and before the tail.
    // Keeping this order preserves the cycle as an always-available escape path.
    let selected = -1;
    let advance = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const index = indices.get(key({ x: position.x + dx, y: position.y + dy }));
      if (index === undefined) continue;
      const gap = distance(head, index);
      if (gap > advance && gap <= target && gap < tail) {
        selected = index;
        advance = gap;
      }
    }
    if (selected < 0) throw new Error('Snake route lost its cycle ordering');
    body.pop();
    body.unshift(selected);
    record();
    return selected;
  };
  while (remaining.size) {
    let target = track.length;
    for (const item of remaining) target = Math.min(target, distance(body[0]!, item));
    const selected = advanceTo(target);
    if (remaining.delete(selected)) eatenAt.set(key(track[selected]!), poses.length - 1);
  }
  // Complete the pose, including the tail, so the loop joins without a jump.
  while (body[0] !== 0) advanceTo(distance(body[0]!, 0));
  for (let step = 1; step < length; step++) advanceTo(1);
  return { poses, eatenAt };
}
