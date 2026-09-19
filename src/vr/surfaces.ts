import * as THREE from 'three';
import { WALL_H, type FloorStyle, type WallStyle } from '../config';
import { applyTimeOfDay, TIME_OF_DAY, type TimeOfDay } from '../core/timeOfDay';
import { PX } from '../render/models3d.js';

/** 1マスを何 px で描くか（テクスチャの中の解像度） */
const TILE_PX = 128;

/** 0xrrggbb に時間帯の色調をかける。null ならそのまま */
export function toned(color: number, tod: TimeOfDay | null): number {
  return tod === null ? color : applyTimeOfDay(color, TIME_OF_DAY[tod]);
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2d context を作れない');
  return [el, ctx];
}

function texture(el: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

/**
 * 床の柄を 2×2 マスぶん描く。
 * 市松と板張りは「となりのマスと色が違う」のが柄そのものなので、
 * 1マスぶんでは繰り返せない。2マス周期でまとめて焼いて敷き詰める。
 *
 * @param repeatTiles 何マスぶん敷くか（部屋の一辺）
 */
export function floorTexture(style: FloorStyle, tod: TimeOfDay | null, repeatTiles: number): THREE.CanvasTexture {
  const [el, ctx] = canvas(TILE_PX * 2, TILE_PX * 2);
  const a = hex(toned(style.a, tod));
  const b = hex(toned(style.b, tod));
  const line = hex(toned(style.line, tod));

  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const x = tx * TILE_PX;
      const y = ty * TILE_PX;
      const even = (tx + ty) % 2 === 0;
      switch (style.pattern) {
        case 'plank': {
          // 板張り。列ごとに色を替えて、継ぎ目を1本入れる
          ctx.fillStyle = tx % 2 === 0 ? a : b;
          ctx.fillRect(x, y, TILE_PX, TILE_PX);
          ctx.fillStyle = line;
          ctx.fillRect(x, y, 2, TILE_PX);
          ctx.fillRect(x, y + TILE_PX / 2 - 1, TILE_PX, 2);
          break;
        }
        case 'quad': {
          // 4分割の細かい市松
          const h = TILE_PX / 2;
          for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
              ctx.fillStyle = (i + j + tx + ty) % 2 === 0 ? a : b;
              ctx.fillRect(x + i * h, y + j * h, h, h);
            }
          }
          break;
        }
        case 'star': {
          // 寄木。中央に菱形を置く
          ctx.fillStyle = even ? a : b;
          ctx.fillRect(x, y, TILE_PX, TILE_PX);
          ctx.fillStyle = even ? b : a;
          ctx.beginPath();
          ctx.moveTo(x + TILE_PX / 2, y + TILE_PX * 0.18);
          ctx.lineTo(x + TILE_PX * 0.82, y + TILE_PX / 2);
          ctx.lineTo(x + TILE_PX / 2, y + TILE_PX * 0.82);
          ctx.lineTo(x + TILE_PX * 0.18, y + TILE_PX / 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'inset': {
          // 目地つき。内側に一回り小さい面
          ctx.fillStyle = line;
          ctx.fillRect(x, y, TILE_PX, TILE_PX);
          ctx.fillStyle = even ? a : b;
          ctx.fillRect(x + 4, y + 4, TILE_PX - 8, TILE_PX - 8);
          break;
        }
        default: {
          // 市松
          ctx.fillStyle = even ? a : b;
          ctx.fillRect(x, y, TILE_PX, TILE_PX);
          ctx.fillStyle = line;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x, y, TILE_PX, 1);
          ctx.fillRect(x, y, 1, TILE_PX);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  return texture(el, repeatTiles / 2);
}

/**
 * 壁の柄を 1マスぶん（横）× 壁の高さ（縦）描く。
 * 縦は繰り返さないので、横だけ部屋の一辺のぶん敷く。
 */
export function wallTexture3d(style: WallStyle, tod: TimeOfDay | null, repeatTiles: number): THREE.CanvasTexture {
  const H = Math.round((WALL_H / 32) * TILE_PX);
  const [el, ctx] = canvas(TILE_PX, H);
  const a = hex(toned(style.a, tod));
  const b = hex(toned(style.b, tod));

  ctx.fillStyle = a;
  ctx.fillRect(0, 0, TILE_PX, H);

  switch (style.pattern) {
    case 'stripe':
      ctx.fillStyle = b;
      for (let i = 0; i < 4; i++) ctx.fillRect(i * (TILE_PX / 4), 0, TILE_PX / 8, H);
      break;
    case 'panel': {
      // 腰壁。下側を濃くして、腰の高さに見切りを入れる
      const waist = H * 0.62;
      ctx.fillStyle = b;
      ctx.fillRect(0, waist, TILE_PX, H - waist);
      ctx.fillStyle = a;
      ctx.fillRect(0, waist - 4, TILE_PX, 6);
      ctx.strokeStyle = a;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, waist + 14, TILE_PX - 24, H - waist - 28);
      break;
    }
    case 'dot':
      ctx.fillStyle = b;
      for (let j = 0; j * 40 < H; j++) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(i * 42 + (j % 2 ? 21 : 0) + 12, j * 40 + 20, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'brick': {
      // レンガ。1段ずつ半分ずらす
      const bh = 22;
      const bw = TILE_PX / 2;
      ctx.fillStyle = b;
      for (let j = 0; j * bh < H; j++) {
        const off = j % 2 ? bw / 2 : 0;
        for (let i = -1; i * bw + off < TILE_PX; i++) {
          ctx.fillRect(i * bw + off + 2, j * bh + 2, bw - 4, bh - 4);
        }
      }
      break;
    }
    default:
      break;
  }

  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(repeatTiles, 1);
  t.anisotropy = 8;
  return t;
}

/** 壁の高さ（ワールド単位）。だいたい 2.45m */
export const WALL_HEIGHT = PX(WALL_H);
