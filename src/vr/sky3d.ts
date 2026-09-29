import * as THREE from 'three';

/**
 * 外の部屋（おにわ）から見える、遠くの景色。
 *
 * 部屋のまわりに、草原 → 海 → 山 → 空のドーム を同心円に置いて、
 * 「四角い芝の板の上」ではなく「どこかの丘の上」に立っているように見せる。
 *
 * ここに置くものは **すべて `MeshBasicMaterial`（光を受けない）**。
 * 遠景なので陰影はいらないし、部屋の明かりの影響で山が暗くなると
 * とたんに書き割りに見える。
 */

/** 空のドームの半径。カメラの far(120) の内側に収める */
const SKY_R = 96;
/**
 * 草原の端（ここから浜辺と海）。
 * **近いほど海がよく見える。** 立って見る目の高さ(1.5)では、
 * 水面は「目の高さ - 距離」の角度にしか開かないので、岸を遠ざけるほど
 * 海は細くなる。丘の上に載せても、手前の地面が隠してしまって逆効果。
 */
const SHORE = 18;
/** 水面の高さ。地面よりほんの少し下げる（ちらつき止め） */
const SEA_Y = -0.25;
/** 海の端 */
const SEA_EDGE = 90;

/** その番号に決まった乱数（0..1）。毎回おなじ景色が出るように */
function noise(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 捨ててよい印を付けたマテリアル（`disposeRoom3d` が見る） */
function mat(color: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.userData.owned = true;
  return m;
}

/** 上が青、地平線が白っぽい、縦のグラデーション */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2f7fcc'); // 真上
    grad.addColorStop(0.38, '#6fb2e8');
    grad.addColorStop(0.5, '#cfe8f7'); // 地平線
    grad.addColorStop(0.56, '#bcd9ea');
    grad.addColorStop(1, '#9dc3d8'); // 下（海の向こうのかすみ）
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** まんまるの光。太陽のまわりのにじみに使う */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,248,214,0.85)');
    grad.addColorStop(0.35, 'rgba(255,244,190,0.35)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 雲の絵の大きさ（横長。積雲は底が平ら） */
const CLOUD_W = 384;
const CLOUD_H = 240;

/**
 * ふわふわの雲の絵（アルファつき）。
 *
 * まるい玉をかさねた雲は、どうしても「だんご」に見える。
 * 積雲は **てっぺんが もくもく で、底が平ら**、輪郭は少しだけにじむ。
 * 円のグラデーションを「まん中はしっかり不透明、外ふちだけ薄く」して
 * 重ねると、そのかたちになる。最後に下半分へ影を敷いて厚みを出す。
 */
function cloudTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CLOUD_W;
  c.height = CLOUD_H;
  const ctx = c.getContext('2d');
  if (ctx) {
    const base = CLOUD_H * 0.8; // 平らな底
    const puffs = 9 + Math.floor(noise(seed, 51) * 5);
    for (let k = 0; k < puffs; k++) {
      const t = (k + 0.5) / puffs;
      // まん中ほど高く盛り上げる（両はしが下がると積雲らしくなる）
      const swell = Math.sin(t * Math.PI) ** 0.7;
      const r = 16 + swell * 34 * (0.65 + noise(seed, k + 60) * 0.7);
      const cx = 26 + t * (CLOUD_W - 52) + (noise(seed, k + 70) - 0.5) * 18;
      const cy = base - r * (0.35 + swell * 0.55 + noise(seed, k + 80) * 0.3);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.78, 'rgba(255,255,255,1)');
      grad.addColorStop(0.93, 'rgba(255,255,255,0.72)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 底をならす。積雲の下は水平にそろっている
    ctx.globalCompositeOperation = 'destination-out';
    const cut = ctx.createLinearGradient(0, base, 0, CLOUD_H);
    cut.addColorStop(0, 'rgba(0,0,0,0)');
    cut.addColorStop(0.35, 'rgba(0,0,0,0.75)');
    cut.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = cut;
    ctx.fillRect(0, base - 6, CLOUD_W, CLOUD_H - base + 6);
    // 下半分に影。ここが無いと、ただの白い切り絵に見える
    ctx.globalCompositeOperation = 'source-atop';
    const shade = ctx.createLinearGradient(0, CLOUD_H * 0.3, 0, base);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(0.55, 'rgba(206,220,236,0.35)');
    shade.addColorStop(1, 'rgba(172,193,216,0.72)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, CLOUD_W, CLOUD_H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 雲の絵は何枚か作って使い回す（部屋を建てるたびに描き直す） */
function cloudTextures(): THREE.CanvasTexture[] {
  return [cloudTexture(0), cloudTexture(1), cloudTexture(2), cloudTexture(3)];
}

/**
 * ひとつぶんの雲。絵を描いた板を、奥ゆきをずらして2〜3枚かさねる。
 * 1枚だと見る向きが変わったときに紙に見えるが、ずらして重ねると
 * かさなり方が変わって、かたまりに見える。
 */
function cloud(i: number, texes: THREE.CanvasTexture[]): THREE.Group {
  const g = new THREE.Group();
  const layers = 2 + Math.floor(noise(i, 11) * 2);
  for (let k = 0; k < layers; k++) {
    const tex = texes[Math.floor(noise(i, k + 90) * texes.length) % texes.length];
    const w = 20 * (0.72 + noise(i, k + 100) * 0.5);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, (w * CLOUD_H) / CLOUD_W),
      mat(0xffffff, { map: tex, transparent: true, depthWrite: false, opacity: 0.88, fog: false }),
    );
    m.position.set((noise(i, k + 110) - 0.5) * w * 0.55, (noise(i, k + 120) - 0.5) * w * 0.14, -k * 2.2);
    g.add(m);
  }
  return g;
}

/**
 * 遠くの景色ぜんぶ。部屋の中心に置いて使う。
 * @param size 部屋の一辺（マス数）
 * @param sunDir 太陽のある向き（部屋の中心から見て）。主光源とそろえる
 */
export function buildSky(size: number, sunDir: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sky';
  g.position.set(size / 2, 0, size / 2);

  // 空のドーム。いちばん先に描いて、あとのものを手前に重ねる
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 32, 20),
    mat(0xffffff, { map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.renderOrder = -1000;
  g.add(dome);

  // 部屋のまわりに続く草原。部屋の芝より すこし暗くして、遠さを出す
  const field = new THREE.Mesh(new THREE.CircleGeometry(SHORE, 48), mat(0x7bb35f));
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.03;
  g.add(field);
  // 砂浜
  const beach = new THREE.Mesh(new THREE.RingGeometry(SHORE - 2.5, SHORE + 0.6, 48), mat(0xe8dcb8));
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = -0.02;
  g.add(beach);
  // 波打ちぎわの白波
  const surf = new THREE.Mesh(new THREE.RingGeometry(SHORE + 0.4, SHORE + 1.6, 48), mat(0xf4fbfd));
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = SEA_Y + 0.08;
  g.add(surf);

  // 海。岸に近いところを明るくして、浅瀬に見せる
  const sea = new THREE.Mesh(new THREE.RingGeometry(SHORE + 0.4, SEA_EDGE, 48), mat(0x3a8dc6));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  g.add(sea);
  const shallow = new THREE.Mesh(new THREE.RingGeometry(SHORE + 1.4, SHORE + 7, 48), mat(0x79c6dd));
  shallow.rotation.x = -Math.PI / 2;
  shallow.position.y = SEA_Y + 0.04;
  g.add(shallow);
  // 波のすじ。遠くの水面が のっぺりしないように
  for (let i = 0; i < 5; i++) {
    const r = SHORE + 9 + i * 9;
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.5, 48),
      mat(0xffffff, { transparent: true, opacity: 0.16 - i * 0.025 }),
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = SEA_Y + 0.06;
    g.add(wave);
  }

  // 海の向こうの山。奥ほど かすませて、遠くに見せる
  // 奥の列は すきま無く並べる。海の「端」が見えてしまうのを隠す役でもある
  for (const [dist, count, lo, hi, color] of [
    [SEA_EDGE - 4, 24, 7, 15, 0x9db2cc],
    [SEA_EDGE - 16, 15, 10, 21, 0x81a0c2],
  ] as Array<[number, number, number, number, number]>) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + noise(i, dist) * 0.3;
      const h = lo + noise(i, dist + 1) * (hi - lo);
      const r = h * (0.85 + noise(i, dist + 2) * 0.6);
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat(color));
      m.position.set(Math.cos(a) * dist, h / 2 + SEA_Y, Math.sin(a) * dist);
      m.rotation.y = noise(i, dist + 3) * Math.PI;
      g.add(m);
    }
  }

  // 太陽。部屋の主光源とおなじ向きに置いて、影の向きと合わせる
  const sunPos = sunDir.clone().normalize().multiplyScalar(SKY_R * 0.78);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 14), mat(0xfff8dc, { fog: false }));
  sun.position.copy(sunPos);
  g.add(sun);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 34),
    mat(0xffffff, { map: glowTexture(), transparent: true, depthWrite: false, fog: false }),
  );
  glow.position.copy(sunPos).multiplyScalar(0.99);
  glow.lookAt(g.position);
  g.add(glow);

  // 雲。板なので、部屋のまん中（見る人のいるあたり）へ向けておく。
  // 部屋の広さ(14)にくらべて雲は遠いので、歩いてもほとんどずれない
  const texes = cloudTextures();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + noise(i, 7) * 0.5;
    const d = 38 + noise(i, 8) * 34;
    const c = cloud(i, texes);
    c.position.set(Math.cos(a) * d, 12 + noise(i, 9) * 20, Math.sin(a) * d);
    c.scale.setScalar(0.85 + noise(i, 10) * 1.25);
    // lookAt はワールド座標。この group は部屋の中心に置いてあるので、
    // ねらう先も部屋の中心（＝見る人の立つあたり）をワールドで渡す
    c.lookAt(g.position.x, 1.5, g.position.z);
    g.add(c);
  }

  return g;
}
