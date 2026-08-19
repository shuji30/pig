/** 4方向 A* 経路探索。歩けないマスは blocked(gx, gy) === true で表す */
export type BlockedFn = (gx: number, gy: number) => boolean;

interface Node {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: Node | null;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function findPath(
  start: { gx: number; gy: number },
  goal: { gx: number; gy: number },
  width: number,
  height: number,
  blocked: BlockedFn,
): Array<{ gx: number; gy: number }> | null {
  if (goal.gx < 0 || goal.gy < 0 || goal.gx >= width || goal.gy >= height) return null;
  if (blocked(goal.gx, goal.gy)) return null;
  if (start.gx === goal.gx && start.gy === goal.gy) return [];

  const key = (gx: number, gy: number) => gy * width + gx;
  const h = (gx: number, gy: number) => Math.abs(gx - goal.gx) + Math.abs(gy - goal.gy);

  const open: Node[] = [{ gx: start.gx, gy: start.gy, g: 0, f: h(start.gx, start.gy), parent: null }];
  const best = new Map<number, number>([[key(start.gx, start.gy), 0]]);
  const closed = new Set<number>();

  while (open.length > 0) {
    // 小規模グリッドなので線形探索で十分
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.gx, cur.gy);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.gx === goal.gx && cur.gy === goal.gy) {
      const path: Array<{ gx: number; gy: number }> = [];
      for (let n: Node | null = cur; n && n.parent; n = n.parent) path.unshift({ gx: n.gx, gy: n.gy });
      return path;
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.gx + dx;
      const ny = cur.gy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (blocked(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + 1;
      const known = best.get(nk);
      if (known !== undefined && known <= ng) continue;
      best.set(nk, ng);
      open.push({ gx: nx, gy: ny, g: ng, f: ng + h(nx, ny), parent: cur });
    }
  }
  return null;
}

/** goal 自身が歩けない場合に、その周囲で最も近い歩けるマスへの経路を返す */
export function findPathAdjacent(
  start: { gx: number; gy: number },
  targets: Array<{ gx: number; gy: number }>,
  width: number,
  height: number,
  blocked: BlockedFn,
): { path: Array<{ gx: number; gy: number }>; goal: { gx: number; gy: number } } | null {
  let bestResult: { path: Array<{ gx: number; gy: number }>; goal: { gx: number; gy: number } } | null = null;
  for (const t of targets) {
    const path = findPath(start, t, width, height, blocked);
    if (!path) continue;
    if (!bestResult || path.length < bestResult.path.length) bestResult = { path, goal: t };
    if (path.length === 0) break;
  }
  return bestResult;
}
