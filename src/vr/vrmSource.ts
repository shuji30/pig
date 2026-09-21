/**
 * VRM（VRoid Studio などで作った人型モデル）を読む。
 *
 * ## なぜ VRM か
 * 立体のアバターを「球と円柱を積んで」作ると、どれだけ調整しても
 * 基本形の寄せ集めに見える。人が彫ったモデルには届かない。
 * VRoid Studio なら同じ品質のものをGUIで作れて、出てくる VRM は
 * glTF なのでそのまま読める。ボーン名も規格で決まっているので、
 * こちらの姿勢をそのまま流しこめる。
 *
 * ## 無いときは
 * `public/avatar.vrm` を置いていなければ `null` を返す。
 * 呼びもと（`avatar3d.ts`）は、そのときは今までどおり基本形のアバターを使う。
 * **VRM が無くてもゲームは動く**ようにしてある。
 *
 * ## 読みかた
 * ファイルは1回だけ取ってきて、バイト列を取っておく。人ぶんの実体は
 * そこから毎回 parse して作る（three-vrm には複製の口が無く、
 * `SkeletonUtils.clone` では表情や一人称の管理が元のモデルを指したままになる）。
 * parse はアバター1人につき1回だけで、毎フレームではない。
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type * as THREE from 'three';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';

/**
 * 置き場所。`public/` に入れたものは、この名前でそのまま配られる。
 *
 * **上から順に**探して、最初に見つかったものを使う。
 * - `.vrm`  VRoid Studio。表情・一人称・揺れもの が入っている
 * - `.glb`  ふつうのリグ付き glTF（Tripo の自動リグ、Mixamo、Blender など）
 */
export const MODEL_URLS = ['./avatar.vrm', './avatar.glb'] as const;
/** 後方互換。古い呼びかたを残してある */
export const VRM_URL = MODEL_URLS[0];

export interface Loaded {
  /** VRM として読めたときだけ入る */
  vrm: VRM | null;
  /** 置きかえ先のルート。VRM のときは `vrm.scene` と同じ */
  scene: THREE.Object3D;
}

/** 置いてあるファイルを1回だけ探す。無ければ null（そのまま基本形にもどる） */
async function findOnce(urls: readonly string[]): Promise<{ url: string; buf: ArrayBuffer } | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      // 置いていないときにサーバーが index.html を返すことがある。中身で見分ける
      if (buf.byteLength > 12 && new DataView(buf).getUint32(0, true) === 0x46546c67) {
        return { url, buf };
      }
    } catch {
      // つぎの名前を試す
    }
  }
  return null;
}

/**
 * カメラが足すレイヤー。
 *
 * `VRMFirstPerson.setup()` は、頭に付いた頂点を レイヤー10（三人称）へ、
 * 残りを レイヤー9（一人称）へ分ける。自分のカメラは 9 を足して
 * 「頭以外の自分の体」を見る。鏡のカメラは全部見るので頭も映る。
 */
export const FIRST_PERSON_LAYER = 9;
export const THIRD_PERSON_LAYER = 10;

/** テストや作り直しのため、取っておいたものを捨てる */
export function forgetVrm(): void {
  raw = null;
}

let raw: Promise<{ url: string; buf: ArrayBuffer } | null> | null = null;

function makeLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

/**
 * モデルをひとつ作る。置いていなければ `null`。
 *
 * 人ぶん（自分＋おきゃくさん）それぞれで呼ぶ。同じバイト列から作るので
 * 通信は1回きり。
 */
export async function loadAvatarModel(urls: readonly string[] = MODEL_URLS): Promise<Loaded | null> {
  // テスト（node）からは取りにいかない。基本形のまま動けばよい
  if (typeof window === 'undefined') return null;
  raw ??= findOnce(urls);
  const found = await raw;
  if (!found) return null;
  try {
    // parse は元のバイト列を書きかえることがあるので、人ぶんに写してから渡す
    const gltf = await makeLoader().parseAsync(found.buf.slice(0), '');
    const vrm = (gltf.userData.vrm as VRM | undefined) ?? null;
    return { vrm, scene: vrm?.scene ?? gltf.scene };
  } catch {
    // 読めないファイルが置かれていても、ゲームは止めない
    return null;
  }
}
