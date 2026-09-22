import * as THREE from 'three';
import { FLOOR_STYLES, WALL_STYLES } from '../config';
import { rotatedSize } from '../core/iso';
import { itemBottom, WALL_COL_W } from '../core/wall';
import { TIME_OF_DAY, type TimeOfDay } from '../core/timeOfDay';
import { findDef, isWallDef } from '../data/furniture';
import { recolored } from '../render/furnitureTexture';
import { PX, SHAPES, WALL_SHAPES } from '../render/models3d.js';
import type { FurnitureDef, PlacedFurniture, PlacedWall, RoomData } from '../types';
import { floorMirrorFor, isMirror, stripKnobs, wallMirrorFor } from './mirrors';
import { floorTexture, toned, WALL_HEIGHT, wallTexture3d } from './surfaces';
import type { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * 部屋を立体で組み立てる。
 *
 * 形は `render/models3d.js`（= スプライトを焼くのと同じ関数）から出すので、
 * **等角の画面と VR で家具の形が食い違わない**。ここがやるのは
 * 「どこに、どの向きで、何色で置くか」だけ。
 *
 * 座標系は models3d と同じ。+x が gx、+z が gy、+y が上で、
 * 1ワールド単位 = 1マス ≒ 1m。
 */

/** 差し替えたマテリアルを (もとのマテリアル → 色 → 複製) で覚えておく入れもの */
type PaintCache = Map<THREE.Material, Map<string, THREE.Material>>;

/**
 * 焼き込み用の白いマテリアルを、実際の色のものに差し替える。
 *
 * `models3d.js` のマテリアルは**全家具で共有**されていて、本体色と張地色は
 * 白のまま（焼いたあとにゲーム側で掛ける前提）。VR はその場で色を出すので、
 * `userData.ch` を見て色つきのものに置きかえる。
 *
 * `Material.clone()` は使わない。共有マテリアルの `userData` には焼き込み用の
 * マスク（これも Material）が入っていて、clone は userData を JSON で
 * 写そうとするため。必要な見た目だけを写した新しいマテリアルを作る。
 */
function paint(root: THREE.Object3D, def: FurnitureDef, cache: PaintCache): void {
  const want = (ch: unknown): string | null => {
    if (ch === 'base') return def.color;
    if (ch === 'acc') return def.accent ?? def.color;
    return null;
  };

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (Array.isArray(mesh.material)) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const color = want(src.userData.ch);
    if (!color) return;

    let byColor = cache.get(src);
    if (!byColor) {
      byColor = new Map();
      cache.set(src, byColor);
    }
    let painted = byColor.get(color);
    if (!painted) {
      painted = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: src.roughness,
        metalness: src.metalness,
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
      });
      painted.userData.owned = true; // 捨ててよい印（共有マテリアルと区別する）
      byColor.set(color, painted);
    }
    mesh.material = painted;
  });
}

/** 0xrrggbb を白に寄せる。天井を壁より明るくするのに使う */
function lighten(color: number, amount: number): number {
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff);
}

/** 床に置く家具1つ */
function placeFurniture(item: PlacedFurniture, cache: PaintCache): THREE.Object3D | null {
  const base = findDef(item.defId);
  if (!base || isWallDef(base)) return null;
  const def = recolored(base, item.recolor);
  const build = SHAPES[def.shape];
  if (!build) return null;

  const [W, D] = def.size;
  const model = new THREE.Group();
  build(model, W, D, def.height, def.seatHeight ?? Math.min(def.height * 0.5, def.height));

  // 焼き込み（renderSprite）と同じ組み立て。占有マスの真ん中を軸にまわす
  model.position.sub(new THREE.Vector3(W / 2, 0, D / 2));
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = (item.rot * Math.PI) / 2;
  const [gw, gd] = rotatedSize(def.size, item.rot);
  pivot.position.set(item.gx + gw / 2, 0, item.gy + gd / 2);

  paint(pivot, def, cache);
  // 鏡は塗り終わったあとで足す（反射面は塗る対象ではないし、影も落とさない）
  if (isMirror(def)) {
    const reflector = floorMirrorFor(def);
    if (reflector) {
      stripKnobs(model); // 引き出しのつまみが鏡面に乗ってしまう
      model.add(reflector);
    }
  }
  return pivot;
}

/** 壁に掛けるもの1つ */
function placeWallItem(item: PlacedWall, cache: PaintCache): THREE.Object3D | null {
  const base = findDef(item.defId);
  const shape = base?.wallShape;
  if (!base || !shape) return null;
  const def = recolored(base, item.recolor);
  const build = WALL_SHAPES[shape];
  if (!build) return null;

  const cols = def.size[0];
  const model = new THREE.Group();
  // 手続き生成と同じ「かざりの枚数」の決め方
  build(model, cols * WALL_COL_W, def.height, Math.max(1, cols * 2 - 1));

  const pivot = new THREE.Group();
  pivot.add(model);
  // WallLayer と同じ決めかた（背の高いものは壁の中へ寄せる）
  const bottom = PX(itemBottom(item.level, def.height));

  if (item.side === 'right') {
    // gy=0 の壁。模型の +x がそのまま gx、+z が部屋の内側
    pivot.position.set(item.col, bottom, 0);
  } else {
    // gx=0 の壁。90度まわすと +x が -gz を向くので、奥の端に置いて手前へ伸ばす。
    // （鏡映にすると面の裏表が反転するため、回転だけで済ませている）
    pivot.rotation.y = Math.PI / 2;
    pivot.position.set(0, bottom, item.col + cols);
  }

  paint(pivot, def, cache);
  if (isMirror(def)) {
    const reflector = wallMirrorFor(def);
    if (reflector) model.add(reflector);
  }
  return pivot;
}

/** 床・壁・天井まわり */
function shell(room: RoomData, tod: TimeOfDay | null): THREE.Group {
  const g = new THREE.Group();
  const size = room.size;
  const floorStyle = FLOOR_STYLES[room.floor % FLOOR_STYLES.length];
  const wallStyle = WALL_STYLES[room.wall % WALL_STYLES.length];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: floorTexture(floorStyle, tod, size), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(size / 2, 0, size / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // 張り替えたマスは、その柄のちいさな板を床の上に重ねる（枚数はふつう少ない）
  for (const [key, idx] of Object.entries(room.floorPatch)) {
    const [gx, gy] = key.split(',').map(Number);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
    const style = FLOOR_STYLES[idx % FLOOR_STYLES.length];
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ map: floorTexture(style, tod, 2), roughness: 0.85 }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(gx + 0.5, 0.002, gy + 0.5);
    patch.receiveShadow = true;
    g.add(patch);
  }

  // 壁は4面ぶん立てる。等角の画面では手前の2枚を描かないが、
  // 中から見る VR では抜けていると外が見えてしまう
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture3d(wallStyle, tod, size),
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const walls: Array<[number, number, number]> = [
    [size / 2, 0, 0], // gy=0（等角で見えている右の壁）
    [0, Math.PI / 2, size / 2], // gx=0（左の壁）
    [size / 2, Math.PI, size], // gy=size（手前。等角では描かれない）
    [size, -Math.PI / 2, size / 2], // gx=size
  ];
  for (const [x, ry, z] of walls) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(size, WALL_HEIGHT), wallMat);
    w.position.set(x, WALL_HEIGHT / 2, z);
    w.rotation.y = ry;
    w.receiveShadow = true;
    g.add(w);
  }

  // 天井。等角の画面には無いが、中から見ると「屋根がない部屋」に見えてしまう。
  // 壁より明るい色にして、閉じこめられた感じを出さないようにする
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: toned(lighten(wallStyle.a, 0.45), tod), roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(size / 2, WALL_HEIGHT, size / 2);
  g.add(ceiling);

  // 天井まわりのモールディング（ロココらしさと、境目のちらつき防止）
  const crownMat = new THREE.MeshStandardMaterial({ color: toned(0xfdfaf5, tod), roughness: 0.6 });
  for (const [x, ry, z] of walls) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(size, PX(7), 0.08), crownMat);
    c.position.set(x, WALL_HEIGHT - PX(4), z);
    c.rotation.y = ry;
    c.translateZ(0.04);
    g.add(c);
  }

  // 幅木（床と壁の境目）。ここが無いと壁が床に刺さって見える
  const skirtMat = new THREE.MeshStandardMaterial({ color: toned(0xffffff, tod), roughness: 0.6 });
  for (const [x, ry, z] of walls) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(size, PX(6), 0.06), skirtMat);
    s.position.set(x, PX(3), z);
    s.rotation.y = ry;
    s.translateZ(0.03);
    g.add(s);
  }

  return g;
}

/** 部屋の明かり。時間帯で色と強さを変える */
function lighting(room: RoomData, tod: TimeOfDay | null): THREE.Group {
  const g = new THREE.Group();
  const style = tod === null ? null : TIME_OF_DAY[tod];
  const brightness = style?.brightness ?? 1;
  const tint = new THREE.Color(style?.tintColor ?? 0xffffff);
  const size = room.size;

  // 下を向いた面（天井など）は HemisphereLight の「地面の色」で照らされる。
  // 実際の部屋では床からの照り返しなので、床の色を明るくしたものを使う
  const floorStyle = FLOOR_STYLES[room.floor % FLOOR_STYLES.length];
  const bounce = lighten(floorStyle.a, 0.55);
  g.add(new THREE.HemisphereLight(tint.getHex(), bounce, 1.9 * brightness));
  g.add(new THREE.AmbientLight(tint.getHex(), 0.5 * brightness));

  const key = new THREE.DirectionalLight(0xfff3e2, 2.1 * brightness);
  key.position.set(size * 0.35, WALL_HEIGHT * 1.6, size * 0.25);
  key.target.position.set(size / 2, 0, size / 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -size;
  key.shadow.camera.right = size;
  key.shadow.camera.top = size;
  key.shadow.camera.bottom = -size;
  key.shadow.camera.far = size * 3;
  key.shadow.bias = -0.0012;
  g.add(key);
  g.add(key.target);

  // 夜だけ、灯りをともす家具が実際に光る（等角の drawGlow と同じ決め方）
  if (style?.lampsOn) {
    for (const item of room.items) {
      const def = findDef(item.defId);
      if (!def || (def.shape !== 'lamp' && def.shape !== 'fireplace')) continue;
      const [gw, gd] = rotatedSize(def.size, item.rot);
      const lamp = new THREE.PointLight(0xffd79a, 3.2, 5.5, 2);
      lamp.position.set(item.gx + gw / 2, PX(def.height) * 0.9, item.gy + gd / 2);
      g.add(lamp);
    }
  }

  return g;
}

export interface Room3d {
  group: THREE.Group;
  /** 部屋にある鏡。いちばん近いものだけを生かすために持っておく */
  mirrors: Reflector[];
}

/**
 * 部屋まるごとの立体。呼ぶたびに作り直す（模様替えのたびに差し替える）。
 * 使い終わったら `disposeRoom3d()` を呼ぶこと。
 */
export function buildRoom3d(room: RoomData, tod: TimeOfDay | null): Room3d {
  const g = new THREE.Group();
  g.name = 'room3d';
  g.add(shell(room, tod));
  g.add(lighting(room, tod));

  const cache: PaintCache = new Map();
  for (const item of room.items) {
    const o = placeFurniture(item, cache);
    if (o) g.add(o);
  }
  for (const item of room.wallItems) {
    const o = placeWallItem(item, cache);
    if (o) g.add(o);
  }

  const mirrors: Reflector[] = [];
  g.traverse((o) => {
    if (o.name === 'mirror') mirrors.push(o as Reflector);
  });
  return { group: g, mirrors };
}

/**
 * 作り直すときに、前の部屋が持っていた GPU 上のものを捨てる。
 *
 * ジオメトリとテクスチャは部屋ごとに作っているので捨ててよい。
 * マテリアルは `models3d.js` が**使い回している**ものが混ざるので、
 * ここで作ったもの（`userData.owned`）だけを捨てる。
 */
export function disposeRoom3d(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material | THREE.Texture>();
  root.traverse((o) => {
    // 鏡はレンダーターゲットを持っているので、自前の後始末に任せる
    if (o.name === 'mirror') {
      (o as Reflector).dispose();
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && !seen.has(map)) {
        seen.add(map);
        map.dispose();
      }
      if (m.userData.owned) m.dispose();
    }
  });
}
