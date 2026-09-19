import type { RoomData } from '../types';

/**
 * 部屋の見た目を決めるものだけを並べた短い文字列。
 *
 * VR 側は毎フレームこれを見て、変わっていたら立体を組み直す。
 * 模様替え・設置・リカラー・引っ越しのたびに呼ぶ側へフックを足すより、
 * 「見て、違ったら作り直す」ほうが取りこぼしがない（家具はせいぜい数十個）。
 */
export function roomSignature(room: RoomData): string {
  const parts: string[] = [`${room.size}|${room.floor}|${room.wall}`];

  const patch = Object.keys(room.floorPatch).sort();
  for (const key of patch) parts.push(`p${key}:${room.floorPatch[key]}`);

  for (const it of room.items) {
    parts.push(`f${it.uid}:${it.defId}:${it.gx},${it.gy}:${it.rot}:${it.recolor?.color ?? ''}/${it.recolor?.accent ?? ''}`);
  }
  for (const it of room.wallItems) {
    parts.push(`w${it.uid}:${it.defId}:${it.side}${it.col},${it.level}:${it.recolor?.color ?? ''}/${it.recolor?.accent ?? ''}`);
  }
  return parts.join(';');
}
