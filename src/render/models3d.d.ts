import type * as THREE from 'three';

/**
 * `models3d.js`（素の JS。焼き込みの道具と共有している）の型。
 * 中身は形を組み立てる手続きなので、外から見える約束だけをここに置く。
 */

/** 水平 1ワールド単位ぶんの画面 px（= 1マス = 32px を 45度から見た長さ） */
export declare const PX_PER_UNIT: number;
/** 高さ 1ワールド単位ぶんの画面 px */
export declare const PX_PER_HEIGHT: number;
/** 高さ(px) → ワールド単位。1ワールド単位はだいたい 1m */
export declare function PX(px: number): number;
export declare function roundedBoxGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry;

/**
 * 床に置く家具の形。`FurnitureShape` ごとに1つ。
 * @param g 組み立て先。原点が占有範囲の角で、+x が gx、+z が gy、+y が上
 * @param W 幅（マス） @param D 奥行（マス） @param H 高さ(px) @param seatZ 座面の高さ(px)
 */
export declare const SHAPES: Record<
  string,
  (g: THREE.Group, W: number, D: number, H: number, seatZ: number) => void
>;

/**
 * 壁に掛けるものの形。`WallShape` ごとに1つ。
 * @param g 組み立て先。+x が壁に沿う向き、+y が上、+z が壁からの出っぱり
 * @param w 壁に沿った幅(px。1マス = 32px) @param h 高さ(px) @param count かざりの個数
 */
export declare const WALL_SHAPES: Record<
  string,
  (g: THREE.Group, w: number, h: number, count: number) => void
>;
