/**
 * 等角スプライトの焼き込み（オフラインの道具）。
 *
 * 形そのものは `src/render/models3d.js` にある（VR と共有している）。
 * ここが持つのは「ゲームの射影にぴたりと合わせて焼く」ための
 * カメラ・ライト・2パス（陰影とマスク）の段取りだけ。
 *
 * ゲーム側（RoomScene / furnitureTexture）の射影は
 *   画面x = offX + (gx - gy) * 32
 *   画面y = offY + (gx + gy) * 16 - z(px)
 * なので、方位45度・仰角30度の正射影で 1ワールド単位 = 45.2548px にすると一致する。
 *
 * ■ 出力の形（リカラーを殺さないための工夫）
 * 1枚の PNG に横ならびで2枚ぶん入れる。左が「陰影」、右が「どの色を塗るか」。
 *   左(shade): 本体色・張地色を **白** にして焼いた絵。金や黒鍵など色を変えない
 *              ところは、そのままの色で焼いてある
 *   右(mask) : R = 本体色の割合 / G = 張地色の割合 / A=0 は「色を変えない」
 * ゲーム側は out = shade * (白*(1-R-G) + 本体色*R + 張地色*G) で合成する。
 */
import * as THREE from 'three';
import { PX, PX_PER_HEIGHT, PX_PER_UNIT, roundedBoxGeo, SHAPES, WALL_SHAPES, WU } from '../../src/render/models3d.js';

export const HEIGHT_UNIT = PX_PER_HEIGHT;

/** スーパーサンプリング（4倍で描いて縮める） */
const SS = 4;

// ---------------------------------------------------------------- レンダリング

let rendererCache = null;
function getRenderer() {
  if (rendererCache) return rendererCache;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  rendererCache = r;
  return r;
}

/** 影を落とすためだけの床（背景は透明のまま） */
function shadowFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'shadowFloor';
  return floor;
}

/**
 * まわりの映り込み（環境光）。
 * これが無いと metalness の高い金がほぼ真っ黒になり、ロココの金彩が死ぬ。
 * 部屋を模した上下のグラデーションを1枚作って IBL に使う
 */
let envCache = null;
function environment(renderer) {
  if (envCache) return envCache;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, '#fffdf8'); // 天井
  grad.addColorStop(0.42, '#f3e9dc');
  grad.addColorStop(0.55, '#d8c3a6');
  grad.addColorStop(1, '#7a6455'); // 床
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  envCache = rt.texture;
  return envCache;
}

/**
 * 三点照明。手続き生成の「面ごとの固定の陰影」と違い、丸みが出る。
 * 白い面が焼き飽和（1.0 で潰れる）しないよう強さを抑えてある。
 * 潰れると、そこにリカラーの色を掛けても白っぽいままになってしまう。
 * 環境光は弱めにして、手続き生成に近い「面ごとの差がはっきりある」感じを残す
 */
function lights(scene, span, center) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbda894, 0.16));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  // 光の向きは家具の大きさによらず一定にする（相対位置で置く）。
  // ここを絶対座標にすると、大きい家具ほど光が斜めから当たってしまう
  key.position.copy(center).add(new THREE.Vector3(4.4, 5.0, 1.1));
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const d = span;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0014;
  scene.add(key.target);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0f5, 0.26);
  fill.position.copy(center).add(new THREE.Vector3(-2.2, 1.6, -3.4));
  fill.target.position.copy(center);
  scene.add(fill.target);
  scene.add(fill);
  return key;
}

/** ゲームの射影と一致する正射影カメラ */
function isoCamera(W, H, offX, offY, center) {
  // 画像の中心に来るワールド点 T を、アンカー（マスの奥角）が (offX, offY) に
  // 落ちるように決める。sx(T) = W/2 - offX, sy(T) = H/2 - offY
  const sxT = W / 2 - offX;
  const syT = H / 2 - offY;
  const tdx = sxT / 32; // T.x - T.z
  const tsum = center; // T.x + T.z
  const target = new THREE.Vector3(
    (tsum + tdx) / 2,
    (tsum * 16 - syT) / PX_PER_HEIGHT,
    (tsum - tdx) / 2,
  );
  const camera = new THREE.OrthographicCamera(
    -W / 2 / PX_PER_UNIT, W / 2 / PX_PER_UNIT,
    H / 2 / PX_PER_UNIT, -H / 2 / PX_PER_UNIT,
    0.01, 80,
  );
  // 方位45度・仰角30度（tan30 = y / √2）
  const dir = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize();
  camera.position.copy(target).addScaledVector(dir, 30);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return { camera, target };
}

/** 陰影パス / マスクパスを切り替える */
function setPass(root, pass) {
  root.traverse((o) => {
    if (o.name === 'shadowFloor') {
      o.visible = pass === 'shade';
      return;
    }
    if (!o.isMesh) return;
    if (pass === 'mask') {
      if (!o.userData.shadeMat) o.userData.shadeMat = o.material;
      o.material = o.userData.shadeMat.userData.mask ?? o.userData.shadeMat;
    } else if (o.userData.shadeMat) {
      o.material = o.userData.shadeMat;
    }
  });
}

/**
 * 1枚レンダリングして data URL を返す。
 * 返る PNG は幅が 2*width。左が陰影、右がマスク
 *
 * @param {{shape:string, W:number, D:number, H:number, seatZ:number,
 *          rot:number, width:number, height:number, offX:number, offY:number}} o
 */
export function renderSprite(o) {
  const W = o.width;
  const H = o.height;
  // レンダラーは使い回す。毎回作ると WebGL のコンテキスト数の上限に当たるし、
  // 環境マップ（PMREM）もコンテキストに紐づくので作り直しになる
  const renderer = getRenderer();
  renderer.setSize(W * SS, H * SS, false);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  scene.environmentIntensity = 0.36;
  const build = SHAPES[o.shape];
  if (!build) throw new Error('unknown shape: ' + o.shape);
  const model = new THREE.Group();
  build(model, o.W, o.D, o.H, o.seatZ ?? Math.min(o.H * 0.5, o.H));

  // rot は「家具の回転」。占有マスの真ん中を軸にまわす。
  // ゲーム側 (IsoPainter.map) の rot1 は「背もたれが -gx 側に来る」向きなので、
  // Three.js では +90度（rotation.y = +rot * PI/2）が対応する
  model.position.sub(new THREE.Vector3(o.W / 2, 0, o.D / 2));
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = (o.rot * Math.PI) / 2;
  const gw = o.rot % 2 === 0 ? o.W : o.D;
  const gd = o.rot % 2 === 0 ? o.D : o.W;
  pivot.position.set(gw / 2, 0, gd / 2);
  scene.add(pivot);

  const floor = shadowFloor();
  floor.position.set(gw / 2, 0, gd / 2);
  scene.add(floor);

  const center = new THREE.Vector3(gw / 2, PX(o.H) * 0.45, gd / 2);
  const key = lights(scene, Math.max(gw, gd) * 1.3 + 1.2, center);
  key.target.position.copy(center);

  const { camera } = isoCamera(W, H, o.offX, o.offY, gw + gd);

  const out = document.createElement('canvas');
  out.width = W * 2;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  setPass(scene, 'shade');
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, W, H);

  setPass(scene, 'mask');
  renderer.shadowMap.enabled = false;
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, W, 0, W, H);

  // 焼き飽和の点検：白い面が 250 を超えていたら、色を掛けても白く見えてしまう
  const px = ctx.getImageData(0, 0, W, H).data;
  const hist = new Uint32Array(256);
  let lit = 0;
  let hot = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    lit++;
    const l = Math.max(px[i], px[i + 1], px[i + 2]);
    hist[l]++;
    if (l >= 250) hot++;
  }
  // はみ出しの点検：枠に接していたら、その絵は切れている
  let clipped = 0;
  const opaque = (x, y) => px[(y * W + x) * 4 + 3] > 60;
  for (let x = 0; x < W; x++) {
    if (opaque(x, 0) || opaque(x, H - 1)) clipped++;
  }
  for (let y = 0; y < H; y++) {
    if (opaque(0, y) || opaque(W - 1, y)) clipped++;
  }

  const at = (q) => {
    let n = 0;
    for (let v = 0; v < 256; v++) {
      n += hist[v];
      if (n >= lit * q) return v;
    }
    return 255;
  };

  const url = out.toDataURL('image/png');
  return { url, lit, hot, clipped, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

/**
 * 壁に掛けるものを1枚焼く。返る PNG は床のものと同じ「左=陰影 / 右=マスク」。
 * 左の壁ぶんは焼かない（右の壁の左右反転で作れるので、ゲーム側で反転する）。
 *
 * @param {{shape:string, w:number, h:number, count:number,
 *          width:number, height:number, offX:number, offY:number}} o
 */
export function renderWallSprite(o) {
  const W = o.width;
  const H = o.height;
  const renderer = getRenderer();
  renderer.setSize(W * SS, H * SS, false);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  // 壁のものは正面から見るぶん陰影が付きにくいので、環境光を床より少し強くする
  scene.environmentIntensity = 0.5;
  const build = WALL_SHAPES[o.shape];
  if (!build) throw new Error('unknown wall shape: ' + o.shape);
  const model = new THREE.Group();
  build(model, o.w, o.h, o.count);
  scene.add(model);

  // 影を受けるのは壁（垂直な面）。床のときとは向きが違う
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.18 }));
  wall.position.set(WU(o.w / 2), PX(o.h / 2), -0.004);
  wall.receiveShadow = true;
  wall.name = 'shadowFloor';
  scene.add(wall);

  const center = new THREE.Vector3(WU(o.w / 2), PX(o.h / 2), 0.08);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbda894, 0.18));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.65);
  // 壁のものは正面寄りから当てる。斜めから当てると落ち影が大きくずれて、
  // 壁から浮いて見えてしまう
  key.position.copy(center).add(new THREE.Vector3(1.5, 2.1, 3.2));
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const d = Math.max(WU(o.w), PX(o.h)) * 0.8 + 0.6;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0009;
  key.target.position.copy(center);
  scene.add(key.target);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0f5, 0.3);
  fill.position.copy(center).add(new THREE.Vector3(-2.6, -0.6, 2.2));
  fill.target.position.copy(center);
  scene.add(fill.target);
  scene.add(fill);

  const { camera } = isoCamera(W, H, o.offX, o.offY, WU(o.w));

  const out = document.createElement('canvas');
  out.width = W * 2;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  setPass(scene, 'shade');
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, W, H);

  setPass(scene, 'mask');
  renderer.shadowMap.enabled = false;
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, W, 0, W, H);

  const px = ctx.getImageData(0, 0, W, H).data;
  let clipped = 0;
  const opaque = (x, y) => px[(y * W + x) * 4 + 3] > 60;
  for (let x = 0; x < W; x++) if (opaque(x, 0) || opaque(x, H - 1)) clipped++;
  for (let y = 0; y < H; y++) if (opaque(0, y) || opaque(W - 1, y)) clipped++;
  let lit = 0;
  let hot = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    lit++;
    if (Math.max(px[i], px[i + 1], px[i + 2]) >= 250) hot++;
  }

  return { url: out.toDataURL('image/png'), lit, hot, clipped, p95: 224 };
}

window.renderWallSprite = renderWallSprite;
// ---------------------------------------------------------------- 立体の部品（アバター・ペット用）
//
// アバターとペットは、歩きの振り・呼吸・まばたき・16種のモーションが
// **連続した値**で動く。姿勢ごとに焼くと組み合わせが爆発するうえ、
// モーションの途中の絵が作れない。
//
// そこで「形（シルエット）は今までどおり手続きで置き、面の陰影だけを
// 3Dから焼いた部品で与える」ことにした。部品は真正面からの正射影で焼くので
// **シルエットは今までの平らな絵とまったく同じ**まま、丸みだけが乗る。
// 色は Phaser の tint（掛け算）で乗るので、マスクも合成も要らない。

const PARTS = {
  /** 球。頭・手・しっぽの先・ペットの体 */
  ball: () => new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), partMat()),
  /** 角の丸い棒。腕・脚・胴・くつ */
  pill: () => new THREE.Mesh(roundedBoxGeo(2, 2, 1.5, 0.84), partMat()),
  /** 角の浅い板。まっすぐな髪・帯 */
  slab: () => new THREE.Mesh(roundedBoxGeo(2, 2, 1.1, 0.34), partMat()),
  /** 裾の広がった筒。スカート */
  frustum: () => new THREE.Mesh(new THREE.CylinderGeometry(0.575, 1, 2, 48, 1, true), partMat()),
};

function partMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

/**
 * 部品を1枚焼く。返るのは**グレースケール1枚**（マスクは要らない）。
 * ゲーム側は Phaser の tint で色を掛けるだけでいい。
 *
 * 明るいところが 1.0 に近くなるように焼いてある。暗く焼くと、
 * 色を掛けたときに今までの平らな絵より全体が沈んでしまう
 */
export function renderPart(o) {
  const N = o.size;
  const renderer = getRenderer();
  renderer.setSize(N * SS, N * SS, false);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  scene.environmentIntensity = 0.22;
  const mesh = PARTS[o.kind]();
  scene.add(mesh);

  // 左上手前からの光。平らな絵の「上が明るく下にかげ」に合わせている
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(-1.3, 1.7, 2.1);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.34);
  rim.position.set(1.5, -0.9, 0.5);
  scene.add(rim);

  // 真正面からの正射影。余白を少しだけ取って縁をなめらかにする
  const pad = 1 + 2 / N;
  const camera = new THREE.OrthographicCamera(-pad, pad, pad, -pad, 0.1, 40);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const out = document.createElement('canvas');
  out.width = N;
  out.height = N;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, N, N);

  const px = ctx.getImageData(0, 0, N, N).data;
  const hist = new Uint32Array(256);
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    lit++;
    hist[px[i]]++;
  }
  const at = (q) => {
    let n = 0;
    for (let v = 0; v < 256; v++) {
      n += hist[v];
      if (n >= lit * q) return v;
    }
    return 255;
  };
  return { url: out.toDataURL('image/png'), p20: at(0.2), p60: at(0.6), p95: at(0.95) };
}

window.renderPart = renderPart;
window.PART_KINDS = Object.keys(PARTS);

window.renderSprite = renderSprite;
window.HEIGHT_UNIT = HEIGHT_UNIT;
window.SHAPE_NAMES = Object.keys(SHAPES);
window.WALL_SHAPE_NAMES = Object.keys(WALL_SHAPES);
