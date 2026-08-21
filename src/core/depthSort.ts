import { TILE_H, TILE_W } from '../config';
import { depthFor } from './iso';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const EPS = 1e-6;

/** 重なり順を決めるのに必要な情報だけ持った家具 */
export interface DepthItem {
  uid: string;
  gx: number;
  gy: number;
  w: number;
  d: number;
  /** 見た目の高さ(px)。画面上でどこまで上に伸びるか */
  height: number;
}

/**
 * a を b より先に（奥に）描くべきか。
 * 等角では「片方の軸で完全に奥にある」なら奥。
 */
export function isBehind(a: DepthItem, b: DepthItem): boolean {
  return a.gx + a.w <= b.gx + EPS || a.gy + a.d <= b.gy + EPS;
}

/** 画面上での外接矩形。重なりようがない相手とは順序を決めなくてよい */
function screenBounds(i: DepthItem): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: (i.gx - (i.gy + i.d)) * HW,
    x1: (i.gx + i.w - i.gy) * HW,
    y0: (i.gx + i.gy) * HH - i.height,
    y1: (i.gx + i.w + i.gy + i.d) * HH,
  };
}

function screenOverlap(a: DepthItem, b: DepthItem): boolean {
  const p = screenBounds(a);
  const q = screenBounds(b);
  return p.x0 < q.x1 - EPS && p.x1 > q.x0 + EPS && p.y0 < q.y1 - EPS && p.y1 > q.y0 + EPS;
}

/** 近似のスカラー深さ。同順位のときの並べ替えと、閉路を切るときの基準に使う */
function scalar(i: DepthItem): number {
  return depthFor(i.gx, i.gy, i.w, i.d);
}

/**
 * 奥から手前の順に並べ替える。
 *
 * スカラーひとつでは表せない配置があるため、
 * 「画面上で重なりうる」かつ「片方だけが奥」と言える組にだけ辺を張って
 * トポロジカルソートする。どちらも奥だと言える組（画面で離れている対角の配置など）は
 * 順序を決める必要がないので辺を張らない。
 *
 * 辺が矛盾して閉路になった場合は、近似のスカラーが小さいものから出して進める。
 * **並び順は入力順に依存しない**（同じ部屋なら常に同じ結果）。
 */
export function sortForDraw(items: readonly DepthItem[]): DepthItem[] {
  const n = items.length;
  if (n <= 1) return [...items];

  // スカラー順に見ていくことで、結果を入力順から切り離す
  const order = [...items].sort((a, b) => scalar(a) - scalar(b) || (a.uid < b.uid ? -1 : 1));
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = order[i];
      const b = order[j];
      if (!screenOverlap(a, b)) continue;
      const ab = isBehind(a, b);
      const ba = isBehind(b, a);
      if (ab === ba) continue; // どちらとも言える／言えないなら決めない
      const [from, to] = ab ? [i, j] : [j, i];
      after[from].push(to);
      indeg[to] += 1;
    }
  }

  const out: DepthItem[] = [];
  const done = new Array<boolean>(n).fill(false);
  for (let step = 0; step < n; step++) {
    // 入次数0のうち、スカラーがいちばん小さいもの（order は既にスカラー順）
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (!done[i] && indeg[i] === 0) {
        pick = i;
        break;
      }
    }
    // 閉路が残ったら、残りのうち先頭（スカラー最小）を出して進める
    if (pick < 0) {
      for (let i = 0; i < n; i++) {
        if (!done[i]) {
          pick = i;
          break;
        }
      }
    }
    done[pick] = true;
    out.push(order[pick]);
    for (const to of after[pick]) indeg[to] -= 1;
  }
  return out;
}
