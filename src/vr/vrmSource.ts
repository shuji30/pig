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
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';

/** 置き場所。`public/` に入れたものは、この名前でそのまま配られる */
export const VRM_URL = './avatar.vrm';

let bytes: Promise<ArrayBuffer | null> | null = null;

/** ファイルを1回だけ取ってくる。無ければ null（そのまま基本形にもどる） */
function fetchOnce(url: string): Promise<ArrayBuffer | null> {
  // テスト（node）からは取りにいかない。基本形のまま動けばよい
  if (typeof window === 'undefined') return Promise.resolve(null);
  bytes ??= fetch(url)
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .catch(() => null);
  return bytes;
}

/** テストや作り直しのため、取っておいたものを捨てる */
export function forgetVrm(): void {
  bytes = null;
}

function makeLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

/**
 * VRM をひとつ作る。置いていなければ `null`。
 *
 * 人ぶん（自分＋おきゃくさん）それぞれで呼ぶ。同じバイト列から作るので
 * 通信は1回きり。
 */
export async function loadVrm(url = VRM_URL): Promise<VRM | null> {
  const buf = await fetchOnce(url);
  if (!buf) return null;
  try {
    // parse は元のバイト列を書きかえることがあるので、人ぶんに写してから渡す
    const gltf = await makeLoader().parseAsync(buf.slice(0), '');
    return (gltf.userData.vrm as VRM | undefined) ?? null;
  } catch {
    // VRM として読めないファイルが置かれていても、ゲームは止めない
    return null;
  }
}
