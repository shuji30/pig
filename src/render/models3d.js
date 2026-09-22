import * as THREE from 'three';

/**
 * 家具・壁かけの **3Dモデル**。ゲームと焼き込みの道具で共有する。
 *
 * - `tools/sprite-render/` は、これを等角の正射影で焼いて PNG にする（オフライン）
 * - `src/vr/` は、これをそのまま部屋に並べて VR で見せる（実行時）
 *
 * どちらも同じ関数から形が出るので、**スプライトと VR の家具がずれない**。
 * ここには「形」だけを置く。カメラ・ライト・焼き込みは道具の側にある。
 *
 * ## 寸法の約束
 * - 水平は **1ワールド単位 = 1マス**（= 画面で 32px）。
 * - 高さは `PX(px)` でワールド単位に直す（データ定義の height は px）。
 * - 結果として 1ワールド単位はだいたい 1m になる。いすの座面 20px が
 *   0.51m、テーブル 30px が 0.77m と、実物どおりの寸法で出る。
 *
 * ## 色
 * マテリアルには `userData.ch` で「どの色を塗るところか」が入っている。
 *   'base' = 本体色 / 'acc' = 張地色 / それ以外 = 焼いたままの色（金・黒鍵など）
 * 焼き込みの道具は `userData.mask` に差し替えてマスクを焼き、
 * VR 側は `ch` を見て実際の色のマテリアルに差し替える。
 */
export const PX_PER_UNIT = 32 / Math.cos(Math.PI / 4); // 45.2548
export const PX_PER_HEIGHT = PX_PER_UNIT * Math.cos(Math.PI / 6); // 39.19


/** 高さ(px) → ワールド単位 */
export const PX = (px) => px / PX_PER_HEIGHT;

// ---------------------------------------------------------------- 素材
// ch: 'base' = 本体色（リカラー対象）, 'acc' = 張地色（リカラー対象）,
//     それ以外は焼いたままの色（金・黒鍵・炎など）
const MASK = {
  base: 0xff0000,
  acc: 0x00ff00,
};

const materials = new Map();
function mat(ch, opts = {}) {
  const key = ch + ':' + JSON.stringify(opts);
  const hit = materials.get(key);
  if (hit) return hit;
  const recolorable = ch === 'base' || ch === 'acc';
  const m = new THREE.MeshStandardMaterial({
    color: recolorable ? 0xffffff : (opts.color ?? 0xffffff),
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0.04,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  // どの色を塗るところか。焼き込みはマスクに、VR は実際の色に差し替える
  m.userData.ch = ch;
  m.userData.mask = new THREE.MeshBasicMaterial({
    color: MASK[ch] ?? 0x000000,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
  });
  materials.set(key, m);
  return m;
}

const M = {
  base: () => mat('base', { roughness: 0.55 }),
  /** 張地（布）。ざらっとさせて木地と質感を分ける */
  acc: () => mat('acc', { roughness: 0.92, metalness: 0 }),
  accSmooth: () => mat('acc', { roughness: 0.4, metalness: 0.06 }),
  gold: () => mat('gold', { color: 0xe0bd67, roughness: 0.3, metalness: 0.5 }),
  goldLight: () => mat('goldLight', { color: 0xfaeab0, roughness: 0.24, metalness: 0.45 }),
  ivory: () => mat('ivory', { color: 0xfbf7f0, roughness: 0.45 }),
  dark: () => mat('dark', { color: 0x3a2f33, roughness: 0.5 }),
  soot: () => mat('soot', { color: 0x4a3b42, roughness: 0.95 }),
  sand: () => mat('sand', { color: 0xe7d9b8, roughness: 1 }),
  leaf: () => mat('leaf', { color: 0x5d9e63, roughness: 0.85 }),
  fish: () => mat('fish', { color: 0xf0a05c, roughness: 0.6 }),
  flame: () => mat('flame', { color: 0xffd77a, roughness: 1 }),
  flameHot: () => mat('flameHot', { color: 0xfff3cf, roughness: 1 }),
  glass: () => mat('glass', { color: 0xdfeef8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4 }),
  water: () => mat('water', { color: 0x74b6db, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.8 }),
  sky: () => mat('sky', { color: 0xbcdcf0, roughness: 0.9 }),
};

// ---------------------------------------------------------------- 形の道具

/**
 * 角を丸めた直方体。中心が原点で、ちょうど w×h×d に収まる。
 *
 * ExtrudeGeometry は「押し出し量 + 面取りぶん」だけ大きくなるので、
 * そのぶんを引いてから作る。ここを間違えると全部の家具の高さがずれる
 */
export function roundedBoxGeo(w, h, d, r) {
  r = Math.max(0.001, Math.min(r, w / 2.05, d / 2.05, h / 2.05));
  const bs = r * 0.7; // 面取りで外へふくらむぶん
  const hw = w / 2 - bs;
  const hd = d / 2 - bs;
  const cr = Math.max(0.0005, Math.min(r, hw * 0.95, hd * 0.95));
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hd);
  shape.lineTo(hw - cr, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  shape.lineTo(hw, hd - cr);
  shape.quadraticCurveTo(hw, hd, hw - cr, hd);
  shape.lineTo(-hw + cr, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  shape.lineTo(-hw, -hd + cr);
  shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);
  const depth = Math.max(0.0005, h - 2 * bs);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bs,
    bevelSize: bs,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depth / 2, 0); // y が [-h/2, h/2] に収まる
  return geo;
}

/**
 * 手続き生成の `painter.box(u0,v0,u1,v1,z0,z1,色)` と同じ引数で置ける箱。
 * u,v はマス、z は px。3D なので角は丸めてある
 */
function box(g, u0, v0, u1, v1, z0, z1, material, r = 0.028) {
  const w = Math.abs(u1 - u0);
  const d = Math.abs(v1 - v0);
  const h = PX(Math.abs(z1 - z0));
  const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r), material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.set((u0 + u1) / 2, PX(Math.min(z0, z1)) + h / 2, (v0 + v1) / 2);
  g.add(m);
  return m;
}

/** 楕円体。rx は画面横方向の px、ry は画面縦方向の px（手続き生成の blob に合わせた） */
function blob(g, u, v, z, rx, ry, material) {
  const R = rx / PX_PER_UNIT;
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), material);
  m.scale.set(1, PX(ry) / R, 1);
  m.castShadow = true;
  m.position.set(u, PX(z), v);
  g.add(m);
  return m;
}

/** 小さい球（くるみボタン・彫刻のつぶ） */
function stud(g, u, v, z, rpx, material) {
  const R = rpx / PX_PER_UNIT;
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 10), material);
  // 名前だけ付けておく。VR で鏡にするときに外すため（焼いた絵は変わらない）
  m.name = 'stud';
  m.position.set(u, PX(z), v);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** 円柱（脚・軸） */
function cyl(g, u, v, z0, z1, rTop, rBottom, material) {
  const h = PX(Math.abs(z1 - z0));
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 18, 1), material);
  m.position.set(u, PX(Math.min(z0, z1)) + h / 2, v);
  m.castShadow = true;
  g.add(m);
  return m;
}

/**
 * 猫脚（カブリオレレッグ）。手続き生成では4段の箱でしか表せなかったS字を、
 * ここでは本当に曲げる。3D にした甲斐がいちばん出るところ
 */
function cabriole(g, u, v, du, dv, s, hpx, material) {
  const H = PX(hpx);
  const pts = [
    [0.44, 0.0], [0.6, 0.05], [0.48, 0.14], [0.3, 0.32],
    [0.33, 0.52], [0.48, 0.72], [0.6, 0.88], [0.5, 1.0],
  ];
  const profile = pts.map(([r, y]) => new THREE.Vector2(r * s, y * H));
  const leg = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), material);
  leg.castShadow = true;
  // 外へ張り出す向きへ少し倒す（ロココらしい反り）
  leg.rotation.x = dv * 0.09;
  leg.rotation.z = -du * 0.09;
  leg.position.set(u, 0, v);
  g.add(leg);
  const foot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.42, 16, 12), M.gold());
  foot.position.set(u, H * 0.04, v);
  foot.castShadow = true;
  g.add(foot);
}

/** 4隅に猫脚を立てる */
function cabrioleLegs(g, W, D, s, hpx, material) {
  const m = s * 1.1;
  cabriole(g, m, m, -1, -1, s, hpx, material);
  cabriole(g, W - m, m, 1, -1, s, hpx, material);
  cabriole(g, m, D - m, -1, 1, s, hpx, material);
  cabriole(g, W - m, D - m, 1, 1, s, hpx, material);
}

/** くるみボタン留めのクッション。天面をふくらませる */
function tufted(g, u0, v0, u1, v1, z, thickness, material) {
  const w = u1 - u0;
  const d = v1 - v0;
  const h = PX(thickness);
  const geo = roundedBoxGeo(w, h, d, Math.min(w, d, h) * 0.42);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.set((u0 + u1) / 2, PX(z) + h / 2, (v0 + v1) / 2);
  g.add(m);
  const cols = Math.max(1, Math.round(w / 0.34));
  const rows = Math.max(1, Math.round(d / 0.34));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      stud(g, u0 + ((i + 0.5) * w) / cols, v0 + ((j + 0.5) * d) / rows, z + thickness - 0.6, 2.2, M.gold());
    }
  }
}

/** 笠木の中央にのせるロゼット（ロココの彫刻） */
function rosette(g, u, v, z, r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r / PX_PER_UNIT, 18, 12), material);
  m.scale.set(1, 0.9, 0.55);
  m.position.set(u, PX(z), v);
  m.castShadow = true;
  g.add(m);
  return m;
}

// ---------------------------------------------------------------- 形ごとの組み立て
// 引数はゲームのデータ定義そのまま（W,D はマス / H, seatZ は px）。
// 手続き生成（render/furnitureTexture.ts の paint）と同じ構成にしてあるので、
// 「同じ家具の、丸みと陰影があるほう」に見える

export const SHAPES = {
  /**
   * ラグ。テクスチャの高さの余裕が 2px しかない（maxZOf）ので、
   * 段差ではなく「織りの厚み」と面の傾きで見せる
   */
  rug(g, W, D) {
    box(g, 0, 0, W, D, 0, 0.9, M.base(), 0.06);
    box(g, 0.16, 0.16, W - 0.16, D - 0.16, 0.9, 1.45, M.acc(), 0.05);
    const r = Math.min(W, D) * 0.26;
    const med = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, PX(0.35), 40), M.base());
    med.position.set(W / 2, PX(1.45), D / 2);
    med.receiveShadow = true;
    g.add(med);
    const med2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, PX(0.35), 32), M.goldLight());
    med2.position.set(W / 2, PX(1.75), D / 2);
    g.add(med2);
    // 金の縁取り（細い枠）
    const ring = new THREE.Mesh(roundedBoxGeo(W - 0.28, PX(0.3), D - 0.28, 0.02), M.gold());
    ring.position.set(W / 2, PX(1.5), D / 2);
    g.add(ring);
    const inner = new THREE.Mesh(roundedBoxGeo(W - 0.36, PX(0.4), D - 0.36, 0.02), M.acc());
    inner.position.set(W / 2, PX(1.55), D / 2);
    g.add(inner);
  },

  /** 箱もの（チェスト・棚・かがみ など）。前面に金彩パネル */
  box(g, W, D, H) {
    const onLegs = H <= 50;
    const bodyZ = onLegs ? 11 : 5;
    if (onLegs) cabrioleLegs(g, W, D, 0.15, bodyZ + 2, M.base());
    else box(g, -0.02, -0.02, W + 0.02, D + 0.02, 0, bodyZ, M.gold(), 0.02);

    box(g, 0.03, 0.03, W - 0.03, D - 0.03, bodyZ, H - 5, M.base(), 0.04);
    box(g, 0.1, D - 0.03, W - 0.1, D + 0.02, bodyZ + 5, H - 10, M.gold(), 0.015);
    box(g, 0.17, D + 0.005, W - 0.17, D + 0.04, bodyZ + 8, H - 13, M.acc(), 0.02);
    if (H >= 50) {
      const mid = (bodyZ + H) / 2;
      box(g, 0.07, D - 0.03, W - 0.07, D + 0.03, mid, mid + 3, M.gold(), 0.012);
    }
    // 取っ手
    for (let i = 0; i < Math.max(1, Math.round(W)); i++) {
      stud(g, (W * (i + 0.5)) / Math.max(1, Math.round(W)), D + 0.05, (bodyZ + H) / 2 - 1, 2.4, M.goldLight());
    }
    box(g, -0.06, -0.06, W + 0.06, D + 0.06, H - 5, H - 2, M.gold(), 0.02);
    box(g, -0.03, -0.03, W + 0.03, D + 0.03, H - 2, H, M.acc(), 0.02);
  },

  /** ロケット。箱の積み上げではなく、本物の円錐＋円筒で作れる */
  rocket(g, W, D, H) {
    const cx = W / 2;
    const cv = D / 2;
    const rad = Math.min(W, D) * 0.3;
    // 台輪
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.25, rad * 1.45, PX(H * 0.05), 28), M.gold());
    base.position.set(cx, PX(H * 0.025), cv);
    base.castShadow = true;
    g.add(base);
    // 胴（下ほど太い）
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.86, rad, PX(H * 0.55), 28, 1), M.base());
    body.position.set(cx, PX(H * 0.05 + H * 0.275), cv);
    body.castShadow = true;
    g.add(body);
    // ノーズコーン
    const nose = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.86, PX(H * 0.34), 28), M.acc());
    nose.position.set(cx, PX(H * 0.6 + H * 0.17), cv);
    nose.castShadow = true;
    g.add(nose);
    stud(g, cx, cv, H * 0.94 + 2, 2.6, M.goldLight());
    // 帯
    const belt = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.9, rad * 0.06, 8, 32), M.gold());
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(cx, PX(H * 0.58), cv);
    g.add(belt);
    // フィン（三角の板を3枚）
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(rad * 1.1, 0);
      sh.lineTo(0, PX(H * 0.3));
      const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: rad * 0.12, bevelEnabled: false }), M.acc());
      fin.rotation.y = -a;
      fin.position.set(cx + Math.cos(a) * rad * 0.8, PX(H * 0.05), cv - Math.sin(a) * rad * 0.8);
      fin.castShadow = true;
      g.add(fin);
    }
    // 窓
    const win = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.3, 16, 12), M.glass());
    win.position.set(cx, PX(H * 0.55), cv + rad * 0.82);
    g.add(win);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.3, rad * 0.055, 8, 20), M.gold());
    rim.position.set(cx, PX(H * 0.55), cv + rad * 0.84);
    g.add(rim);
  },

  /** 猫脚テーブル。甲板は大理石（accent） */
  table(g, W, D, H) {
    const legH = Math.max(6, H - 8);
    cabrioleLegs(g, W, D, 0.17, legH, M.base());
    box(g, 0.14, 0.14, W - 0.14, D - 0.14, legH - 6, legH, M.base(), 0.03); // 幕板
    box(g, -0.05, -0.05, W + 0.05, D + 0.05, legH, legH + 3, M.gold(), 0.025);
    box(g, -0.02, -0.02, W + 0.02, D + 0.02, legH + 3, H, M.accSmooth(), 0.03); // 甲板
  },

  /** いす。背もたれの枠は本当に曲げる */
  chair(g, W, D, H, seatZ) {
    cabrioleLegs(g, W, D, 0.14, seatZ, M.base());
    box(g, 0.1, 0.1, W - 0.1, D - 0.1, seatZ - 3, seatZ + 1, M.base(), 0.035);
    box(g, -0.02, -0.02, W + 0.02, D + 0.02, seatZ + 1, seatZ + 3, M.gold(), 0.02);
    tufted(g, 0.14, 0.14, W - 0.14, D - 0.14, seatZ + 3, 5, M.acc());

    if (H > seatZ + 14) {
      const top = PX(H - 4) - PX(seatZ + 3);
      const half = (W - 0.26) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-half, 0, 0),
        new THREE.Vector3(-half * 1.08, top * 0.42, -0.03),
        new THREE.Vector3(-half * 0.9, top * 0.82, -0.06),
        new THREE.Vector3(0, top, -0.075),
        new THREE.Vector3(half * 0.9, top * 0.82, -0.06),
        new THREE.Vector3(half * 1.08, top * 0.42, -0.03),
        new THREE.Vector3(half, 0, 0),
      ]);
      const frame = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.033, 10, false), M.base());
      frame.castShadow = true;
      const back = new THREE.Group();
      back.add(frame);
      const panel = box(back, -half * 0.85, -0.028, half * 0.85, 0.028, 0, 0, M.acc());
      panel.geometry.dispose();
      panel.geometry = roundedBoxGeo(half * 1.7, top * 0.86, 0.05, 0.03);
      panel.position.set(0, top * 0.43, -0.02);
      rosette(back, 0, -0.08, 0, 5.6, M.goldLight());
      back.children[back.children.length - 1].position.y = top + PX(1.5);
      back.position.set(W / 2, PX(seatZ + 3), 0.16);
      g.add(back);
    }
  },

  /** ソファ・カナッペ。背もたれを高く、肘掛けは木地で巻き込む */
  sofa(g, W, D, H, seatZ) {
    const frameZ = Math.max(6, seatZ - 8);
    cabrioleLegs(g, W, D, 0.15, frameZ, M.base());
    box(g, 0.05, 0.05, W - 0.05, D - 0.05, frameZ - 4, seatZ, M.base(), 0.04);
    box(g, -0.02, -0.02, W + 0.02, D + 0.02, seatZ, seatZ + 2, M.gold(), 0.02);

    // 背もたれ（木の枠 + 張地のパネル）。肘掛けより高くして「ソファ」に見せる
    box(g, 0.05, 0.06, W - 0.05, 0.24, seatZ + 2, H - 4, M.base(), 0.05);
    box(g, 0.16, 0.24, W - 0.16, 0.3, seatZ + 6, H - 9, M.acc(), 0.05);
    box(g, 0.03, 0.04, W - 0.03, 0.26, H - 4, H - 1, M.gold(), 0.03);
    rosette(g, W / 2, 0.15, H, 6.4, M.goldLight());
    rosette(g, W * 0.22, 0.15, H, 3.6, M.goldLight());
    rosette(g, W * 0.78, 0.15, H, 3.6, M.goldLight());

    // 肘掛け（木地。上を半円柱で巻き込ませる）
    const armTop = Math.min(seatZ + 12, H - 12);
    for (const side of [0, 1]) {
      const u0 = side === 0 ? 0.05 : W - 0.26;
      const u1 = side === 0 ? 0.26 : W - 0.05;
      box(g, u0, 0.3, u1, D - 0.06, seatZ + 2, armTop, M.base(), 0.04);
      const roll = new THREE.Mesh(
        new THREE.CylinderGeometry((u1 - u0) / 2, (u1 - u0) / 2, D - 0.36, 18),
        M.base(),
      );
      roll.rotation.x = Math.PI / 2;
      roll.position.set((u0 + u1) / 2, PX(armTop), (0.3 + D - 0.06) / 2);
      roll.castShadow = true;
      g.add(roll);
      stud(g, (u0 + u1) / 2, D - 0.08, armTop, 3, M.goldLight());
    }

    // 座面クッション
    const inner0 = 0.3;
    const inner1 = W - 0.3;
    const n = Math.max(1, Math.round(W));
    const cw = (inner1 - inner0) / n;
    for (let i = 0; i < n; i++) {
      tufted(g, inner0 + i * cw + 0.03, 0.34, inner0 + (i + 1) * cw - 0.03, D - 0.12, seatZ + 2, 7, M.acc());
    }
  },

  /** ベッド。掛け布団はふくらませ、枕をのせる */
  bed(g, W, D, H) {
    cabrioleLegs(g, W, D, 0.16, 12, M.base());
    box(g, 0.05, 0.05, W - 0.05, D - 0.05, 6, 16, M.base(), 0.04);
    box(g, -0.02, -0.02, W + 0.02, D + 0.02, 16, 17, M.gold(), 0.02);

    // ヘッドボード（上辺をアーチにする）
    box(g, 0.05, 0.08, W - 0.05, 0.26, 17, H - 8, M.base(), 0.05);
    const archR = (W - 0.1) / 2;
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(archR, archR, 0.18, 36, 1, false, 0, Math.PI), M.base());
    arch.rotation.x = Math.PI / 2;
    arch.rotation.y = Math.PI / 2;
    arch.position.set(W / 2, PX(H - 8), 0.17);
    arch.scale.set(1, 1, 0.5);
    arch.castShadow = true;
    g.add(arch);
    box(g, 0.17, 0.26, W - 0.17, 0.3, 22, H - 12, M.acc(), 0.04);
    rosette(g, W / 2, 0.16, H - 3, 6.8, M.goldLight());

    // フットボード
    box(g, 0.05, D - 0.2, W - 0.05, D - 0.05, 17, 30, M.base(), 0.04);
    box(g, 0.03, D - 0.22, W - 0.03, D - 0.03, 30, 33, M.gold(), 0.02);

    // 寝具（マット → 掛け布団 → 枕）
    box(g, 0.1, 0.3, W - 0.1, D - 0.22, 17, 26, M.ivory(), 0.04);
    const quilt = new THREE.Mesh(roundedBoxGeo(W - 0.2, PX(9), D - 1.05, 0.09), M.acc());
    quilt.position.set(W / 2, PX(30.5), (0.95 + D - 0.22) / 2);
    quilt.castShadow = true;
    g.add(quilt);
    for (let i = 0; i < Math.max(1, Math.round(W)); i++) {
      const p = new THREE.Mesh(roundedBoxGeo((W - 0.3) / Math.max(1, Math.round(W)) - 0.06, PX(8), 0.4, 0.1), M.ivory());
      p.position.set(0.15 + ((i + 0.5) * (W - 0.3)) / Math.max(1, Math.round(W)), PX(30), 0.56);
      p.castShadow = true;
      g.add(p);
    }
  },

  /** はちうえ。葉は球のかたまり */
  plant(g, W, D, H) {
    const potH = Math.max(11, H * 0.27);
    const r = 0.2;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.72, PX(potH - 4), 24), M.base());
    pot.position.set(0.5, PX(4 + (potH - 4) / 2), 0.5);
    pot.castShadow = true;
    g.add(pot);
    cyl(g, 0.5, 0.5, 0, 4, r * 0.78, r * 0.86, M.gold());
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 8, 28), M.gold());
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(0.5, PX(potH), 0.5);
    g.add(lip);

    const leafZ = potH + 4;
    const span = H - leafZ;
    cyl(g, 0.5, 0.5, leafZ, leafZ + span * 0.5, 0.022, 0.03, M.acc());
    blob(g, 0.5, 0.5, leafZ + span * 0.38, span * 0.3, span * 0.26, M.acc());
    blob(g, 0.36, 0.6, leafZ + span * 0.62, span * 0.27, span * 0.23, M.acc());
    blob(g, 0.66, 0.42, leafZ + span * 0.64, span * 0.25, span * 0.21, M.acc());
    blob(g, 0.5, 0.48, leafZ + span * 0.9, span * 0.27, span * 0.23, M.acc());
  },

  /** 燭台。軸をろくろ挽きにして、炎をのせる */
  lamp(g, W, D, H) {
    const foot = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0.24, 0], [0.23, 0.1], [0.14, 0.22], [0.09, 0.35], [0.075, 1]].map(
          ([r, y]) => new THREE.Vector2(r, y * PX(11)),
        ),
        24,
      ),
      M.base(),
    );
    foot.position.set(0.5, 0, 0.5);
    foot.castShadow = true;
    g.add(foot);
    cyl(g, 0.5, 0.5, 11, H - 26, 0.048, 0.06, M.base());
    // 節（ロココらしい膨らみ）
    for (const t of [0.3, 0.62]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), M.goldLight());
      k.scale.set(1, 0.62, 1);
      k.position.set(0.5, PX(11 + (H - 37) * t), 0.5);
      g.add(k);
    }
    // 受け皿
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, PX(6), 24), M.goldLight());
    cup.position.set(0.5, PX(H - 23), 0.5);
    cup.castShadow = true;
    g.add(cup);
    cyl(g, 0.5, 0.5, H - 20, H - 5, 0.075, 0.082, M.acc()); // ろうそく
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.055, PX(9), 16), M.flame());
    fl.position.set(0.5, PX(H - 5 + 4.5), 0.5);
    g.add(fl);
  },

  /** 丸いもの（まるテーブル・スツール）。本当に丸くできる */
  round(g, W, D, H) {
    const r = Math.min(W, D) * 0.47;
    const foot = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[r * 0.8, 0], [r * 0.78, 0.18], [r * 0.4, 0.5], [r * 0.22, 1]].map(
          ([rr, y]) => new THREE.Vector2(rr, y * PX(6)),
        ),
        28,
      ),
      M.base(),
    );
    foot.position.set(W / 2, 0, D / 2);
    foot.castShadow = true;
    g.add(foot);
    cyl(g, W / 2, D / 2, 5, H - 7, 0.075, 0.1, M.gold());
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), M.goldLight());
    knob.scale.set(1, 0.6, 1);
    knob.position.set(W / 2, PX(H * 0.55), D / 2);
    g.add(knob);
    const topH = PX(6);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, topH, 40), M.base());
    top.position.set(W / 2, PX(H - 6) + topH / 2, D / 2);
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r, PX(2.4), 8, 48), M.gold());
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(W / 2, PX(H - 4), D / 2);
    g.add(edge);
    const inlay = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, PX(1.2), 36), M.acc());
    inlay.position.set(W / 2, PX(H + 0.4), D / 2);
    g.add(inlay);
  },

  /** スピネット（ロココピアノ）。鍵盤を前へ張り出させて「ピアノ」と分かるようにする */
  piano(g, W, D, H) {
    const legH = H * 0.45;
    cabrioleLegs(g, W, D, 0.155, legH, M.base());
    // 胴は奥半分。手前は鍵盤のために空ける
    box(g, 0.06, 0.1, W - 0.06, D * 0.62, legH, H * 0.82, M.base(), 0.04);
    box(g, 0.04, 0.08, W - 0.04, D * 0.64, H * 0.82, H * 0.86, M.gold(), 0.025);
    // 鍵盤の棚（手前へ張り出す）
    box(g, 0.08, D * 0.58, W - 0.08, D - 0.04, legH * 0.92, legH + 4, M.base(), 0.03);
    const kz = legH + 4;
    box(g, 0.11, D * 0.62, W - 0.11, D - 0.07, kz, kz + 3.5, M.ivory(), 0.012);
    const keys = Math.max(6, Math.round(W * 7));
    for (let i = 1; i < keys; i++) {
      if (i % 7 === 3 || i % 7 === 0) continue; // ミ-ファ と シ-ド の間には黒鍵が無い
      const u = 0.13 + ((W - 0.26) * i) / keys;
      box(g, u - 0.019, D * 0.62, u + 0.019, D * 0.62 + (D - 0.07 - D * 0.62) * 0.62, kz + 3.5, kz + 5.4, M.dark(), 0.005);
    }
    // 譜面台と楽譜
    box(g, 0.1, 0.1, W - 0.1, 0.16, H * 0.86, H, M.base(), 0.03);
    box(g, 0.18, 0.16, W - 0.18, 0.19, H * 0.88, H - 3, M.acc(), 0.012);
    rosette(g, W / 2, D * 0.63, H * 0.86, 5.6, M.goldLight());
    // ふた（少し開ける）
    const lid = new THREE.Mesh(roundedBoxGeo(W - 0.1, PX(2.6), D * 0.52, 0.02), M.base());
    lid.position.set(W / 2, PX(H * 0.87), D * 0.36);
    lid.rotation.x = -0.1;
    lid.castShadow = true;
    g.add(lid);
  },

  /** だんろ。開口の奥だけを黒くして、炎が見えるようにする */
  fireplace(g, W, D, H) {
    const pillar = 0.26;
    const openTop = H - 26;
    box(g, 0, 0.16, pillar, D - 0.12, 0, H - 10, M.base(), 0.04);
    box(g, W - pillar, 0.16, W, D - 0.12, 0, H - 10, M.base(), 0.04);
    // まぐさ（開口の上）。ここを入れないと、開口が天井まで抜けて「扉」に見える
    box(g, pillar - 0.02, 0.16, W - pillar + 0.02, D - 0.12, openTop, H - 10, M.base(), 0.03);
    box(g, 0, 0.16, W, D - 0.12, H - 10, H - 4, M.base(), 0.04); // 笠木
    box(g, -0.05, 0.12, W + 0.05, D - 0.08, H - 4, H, M.goldLight(), 0.03);
    // 火床：奥の壁と底だけ黒くする
    box(g, pillar, 0.2, W - pillar, 0.33, 0, openTop, M.soot(), 0.01);
    box(g, pillar, 0.2, W - pillar, D - 0.16, 0, 2.5, M.soot(), 0.01);
    box(g, pillar - 0.02, 0.18, W - pillar + 0.02, 0.22, openTop - 3, openTop, M.gold(), 0.01);
    // まき
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W - pillar * 2 - 0.22, 12), M.soot());
      log.rotation.z = Math.PI / 2;
      log.position.set(W / 2, PX(4.5 + i * 3.6), D * 0.46 + (i - 1) * 0.06);
      log.castShadow = true;
      g.add(log);
    }
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.19, PX(19), 18), M.flame());
    f1.position.set(W / 2, PX(19), D * 0.46);
    g.add(f1);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, PX(14), 16), M.flameHot());
    f2.position.set(W / 2, PX(19), D * 0.46);
    g.add(f2);
    stud(g, W / 2, 0.3, H + 1, 3.2, M.gold());
  },

  /** すいそう。水を濃いめにして、四隅に金の柱を立てて「水槽」と分かるようにする */
  aquarium(g, W, D, H) {
    box(g, 0.08, 0.18, W - 0.08, D - 0.14, 0, H * 0.45, M.base(), 0.035); // 台
    box(g, 0.05, 0.15, W - 0.05, D - 0.11, H * 0.45, H * 0.5, M.gold(), 0.02);
    const z0 = H * 0.5;
    box(g, 0.14, 0.24, W - 0.14, D - 0.2, z0, z0 + 5, M.sand(), 0.01); // 砂
    box(g, 0.135, 0.235, W - 0.135, D - 0.195, z0 + 3, H - 5, M.water(), 0.01); // 水
    blob(g, 0.3, D / 2, z0 + 7, 3.4, 7, M.leaf());
    blob(g, W - 0.32, D / 2 - 0.06, z0 + 7, 3, 6, M.leaf());
    const fish = (u, v, z, sz) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(sz / PX_PER_UNIT, 14, 10), M.fish());
      f.scale.set(1.5, 0.8, 0.6);
      f.position.set(u, PX(z), v);
      g.add(f);
    };
    fish(W * 0.45, D / 2, H * 0.78, 3.4);
    fish(W * 0.62, D / 2 + 0.04, H * 0.68, 2.6);
    // ガラス
    const glass = new THREE.Mesh(roundedBoxGeo(W - 0.26, PX(H - 5 - z0), D - 0.4, 0.008), M.glass());
    glass.position.set(W / 2, PX(z0 + (H - 5 - z0) / 2), (0.23 + D - 0.19) / 2);
    g.add(glass);
    // 四隅の金の柱
    for (const u of [0.14, W - 0.14]) {
      for (const v of [0.24, D - 0.2]) cyl(g, u, v, z0, H - 3, 0.022, 0.022, M.gold());
    }
    box(g, 0.11, 0.21, W - 0.11, D - 0.17, H - 4, H - 1, M.goldLight(), 0.015);
  },

  /** きんぶちテレビ */
  tv(g, W, D, H) {
    box(g, W / 2 - 0.3, 0.42, W / 2 + 0.3, 0.58, 0, 6, M.base(), 0.03);
    cyl(g, W / 2, 0.5, 6, 14, 0.055, 0.07, M.base());
    box(g, 0.05, 0.34, W - 0.05, 0.6, 13, H, M.gold(), 0.04); // 額縁
    box(g, 0.13, 0.6, W - 0.13, 0.64, 17, H - 5, M.acc(), 0.02); // 画面
    rosette(g, W / 2, 0.47, H, 6.4, M.goldLight());
  },
};

// ---------------------------------------------------------------- 壁に掛けるもの
// 壁の上の座標 (u, hh) は、床とは別の射影で画面へ写る（core/wall.ts）。
//   右の壁: 画面x = u,  画面y = 高さ - hh + u/2
// これは「gy = 0 の壁に沿って gx を進む」ことと同じなので、
//   ワールド x = u / 32、ワールド y = hh / 39.19、ワールド z = 壁からの出っぱり
// と置けば、床と同じカメラでそのまま焼ける。
// 左の壁は右の壁の**左右反転**なので、焼くのは右のぶんだけでいい（ゲーム側で反転する）。

/** 壁に沿った px → ワールド単位 */
/**
 * 壁ぞいの距離(px) → ワールド単位。壁の1マスは 32px（`WALL_COL_W`）。
 * 焼く道具（tools/sprite-render/scene.js）も使うので、外へ出してある
 */
export const WU = (u) => u / 32;
/** 壁の上の「丸」の半径。画面での見た目の大きさを合わせるための係数 */
const WR = (r) => r / 34;

/** 壁の上の箱。u,hh は px、d は壁からの出っぱり（ワールド単位） */
function wbox(g, u0, h0, u1, h1, d0, d1, material, r = 0.02) {
  const w = WU(Math.abs(u1 - u0));
  const hh = PX(Math.abs(h1 - h0));
  const dd = Math.abs(d1 - d0);
  const m = new THREE.Mesh(roundedBoxGeo(w, hh, dd, r), material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.set(WU((u0 + u1) / 2), PX((h0 + h1) / 2), (d0 + d1) / 2);
  g.add(m);
  return m;
}

/** 壁の上の円盤（壁に垂直な軸の円柱） */
function wdisc(g, u, hh, rpx, d0, d1, material) {
  const dd = Math.abs(d1 - d0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(WR(rpx), WR(rpx), dd, 28), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(WU(u), PX(hh), (d0 + d1) / 2);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** 壁の上の球 */
function wball(g, u, hh, rpx, d, material, squash = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(WR(rpx), 16, 12), material);
  m.scale.set(1, 1, squash);
  m.position.set(WU(u), PX(hh), d);
  m.castShadow = true;
  g.add(m);
  return m;
}

/**
 * 金の額縁＋中身、という共通の作り。
 * 枠は**4本の棒**で組む。1枚の箱にすると中身が隠れてしまう（実際やらかした）
 */
function wframed(g, w, h, frameMat, innerMat, thick, depth) {
  wbox(g, thick * 0.6, thick * 0.6, w - thick * 0.6, h - thick * 0.6, 0, depth * 0.42, innerMat, 0.01);
  wbox(g, 0, 0, w, thick, 0, depth, frameMat, 0.016);
  wbox(g, 0, h - thick, w, h, 0, depth, frameMat, 0.016);
  wbox(g, 0, thick, thick, h - thick, 0, depth, frameMat, 0.016);
  wbox(g, w - thick, thick, w, h - thick, 0, depth, frameMat, 0.016);
}

export const WALL_SHAPES = {
  /** まど。枠を深くして、奥に空を置く */
  window(g, w, h) {
    wframed(g, w, h, M.base(), M.sky(), 4, 0.18);
    // 桟
    wbox(g, w / 2 - 1.6, 4, w / 2 + 1.6, h - 4, 0.06, 0.15, M.base(), 0.008);
    wbox(g, 4, h / 2 - 1.6, w - 4, h / 2 + 1.6, 0.06, 0.15, M.base(), 0.008);
    if (w > 60) wbox(g, w * 0.75 - 1.2, 4, w * 0.75 + 1.2, h - 4, 0.06, 0.15, M.base(), 0.008);
    wbox(g, 4, 4, w - 4, h - 4, 0.15, 0.163, M.glass(), 0.008); // ガラス
    wbox(g, -2, -4, w + 2, 1, 0, 0.3, M.base(), 0.02); // 窓台
    wball(g, w / 2, h + 3, 3.2, 0.12, M.gold());
  },

  /** 絵。額を厚くして、中の絵を奥に置く */
  painting(g, w, h) {
    wframed(g, w, h, M.gold(), M.acc(), 5, 0.18);
    const r = Math.min(w, h);
    // 中の絵：色面と丸で「何か描いてある」感じ。奥まった面の少し前に置く
    wbox(g, 6, h * 0.5, w - 6, h - 6, 0.076, 0.082, M.acc(), 0.01);
    wball(g, w * 0.38, h * 0.62, r * 0.15, 0.082, M.acc(), 0.35);
    wball(g, w * 0.62, h * 0.5, r * 0.11, 0.082, M.acc(), 0.35);
    wball(g, w * 0.5, h * 0.72, r * 0.1, 0.082, M.acc(), 0.35);
    wball(g, w / 2, h + 2, 3.4, 0.12, M.goldLight());
  },

  /** かがみ。鏡面は環境マップを映すので、3Dにするといちばん差が出る */
  mirror(g, w, h) {
    const t = 3.5;
    const glass = new THREE.Mesh(
      roundedBoxGeo(WU(w - t), PX(h - t), 0.05, 0.012),
      mat('silver', { color: 0xeef4fa, roughness: 0.04, metalness: 1 }),
    );
    glass.position.set(WU(w / 2), PX(h / 2), 0.05);
    g.add(glass);
    wbox(g, 0, 0, w, t, 0, 0.16, M.gold(), 0.016);
    wbox(g, 0, h - t, w, h, 0, 0.16, M.gold(), 0.016);
    wbox(g, 0, t, t, h - t, 0, 0.16, M.gold(), 0.016);
    wbox(g, w - t, t, w, h - t, 0, 0.16, M.gold(), 0.016);
    wball(g, w / 2, h + 3, 3.6, 0.12, M.goldLight());
  },

  /** かべどけい */
  clock(g, w, h) {
    const r = Math.min(w, h) / 2;
    wdisc(g, w / 2, h / 2, r, 0, 0.16, M.gold());
    wdisc(g, w / 2, h / 2, r - 4, 0.14, 0.19, M.base());
    wdisc(g, w / 2, h / 2, r - 1.4, 0.05, 0.145, M.goldLight());
    // 針
    wbox(g, w / 2 - 0.8, h / 2, w / 2 + 0.8, h / 2 + r * 0.6, 0.19, 0.21, M.dark(), 0.004);
    wbox(g, w / 2, h / 2 - 0.7, w / 2 + r * 0.45, h / 2 + 0.7, 0.19, 0.21, M.dark(), 0.004);
    wball(g, w / 2, h / 2, 2, 0.21, M.gold());
  },

  /** かべしょくだい。腕を前へ出す */
  sconce(g, w, h) {
    wbox(g, w * 0.3, 0, w * 0.7, h * 0.32, 0, 0.07, M.gold(), 0.02);
    wbox(g, w * 0.42, h * 0.28, w * 0.58, h * 0.54, 0.05, 0.16, M.gold(), 0.02);
    wbox(g, w * 0.18, h * 0.5, w * 0.82, h * 0.58, 0.1, 0.26, M.gold(), 0.02);
    for (const cu of [w * 0.32, w * 0.68]) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(WR(2.4), WR(2.6), PX(h * 0.24), 14), M.ivory());
      candle.position.set(WU(cu), PX(h * 0.7), 0.18);
      candle.castShadow = true;
      g.add(candle);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(WR(2.6), PX(h * 0.14), 14), M.flame());
      fl.position.set(WU(cu), PX(h * 0.89), 0.18);
      g.add(fl);
    }
  },

  /** かべだな。板が本当に前へ出るので、3Dにするとよく分かる */
  shelf(g, w, h) {
    const d = 0.3;
    wbox(g, 0, h * 0.3, w, h * 0.4, 0, d, M.base(), 0.02); // 棚板
    wbox(g, 0, h * 0.4, w, h * 0.43, 0, d * 1.02, M.gold(), 0.012); // 前縁の金
    // 受け（ブラケット）
    for (const u of [w * 0.14, w * 0.86]) {
      wbox(g, u - 3, h * 0.04, u + 3, h * 0.3, 0, d * 0.62, M.base(), 0.02);
    }
    // 上の小物
    wball(g, w * 0.3, h * 0.52, 5.4, d * 0.5, M.acc());
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(WR(3.4), WR(4.4), PX(h * 0.34), 16), M.acc());
    vase.position.set(WU(w * 0.55), PX(h * 0.6), d * 0.5);
    vase.castShadow = true;
    g.add(vase);
    wball(g, w * 0.78, h * 0.5, 4.2, d * 0.5, M.goldLight());
  },

  /** はなづな。たわんだ弧に沿って花をつなぐ */
  garland(g, w, h) {
    const n = Math.max(9, Math.round(w / 6));
    const sag = h * 0.42;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 2 + (w - 4) * t;
      const hh = h - 4 - sag * 4 * t * (1 - t);
      pts.push(new THREE.Vector3(WU(u), PX(hh), 0.07));
    }
    const rope = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 3, WR(2.2), 8, false),
      M.base(),
    );
    rope.castShadow = true;
    g.add(rope);
    for (let i = 0; i <= n; i += 2) {
      const p = pts[i];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const fl = new THREE.Mesh(new THREE.SphereGeometry(WR(2.1), 10, 8), M.acc());
        fl.position.set(p.x + Math.cos(a) * WR(2.8), p.y + Math.sin(a) * PX(2.8), p.z + 0.03);
        fl.castShadow = true;
        g.add(fl);
      }
      const c = new THREE.Mesh(new THREE.SphereGeometry(WR(1.7), 10, 8), M.goldLight());
      c.position.set(p.x, p.y, p.z + 0.06);
      g.add(c);
    }
    for (const u of [2, w - 2]) {
      wbox(g, u - 2, h - 9, u + 2, h - 2, 0.05, 0.1, M.gold(), 0.012);
      wball(g, u, h - 2, 2.8, 0.09, M.goldLight());
    }
  },

  /** かざりざら。本物の皿の形（浅い回転体）にする */
  plate(g, w, h, count) {
    const per = w / count;
    const r = Math.min(h * 0.9, per) * 0.46;
    for (let i = 0; i < count; i++) {
      const u = per * (i + 0.5);
      const hh = h / 2 + (i % 2 === 1 ? h * 0.12 : 0);
      const R = WR(r);
      const profile = [
        [0, 0.0], [R * 0.5, 0.004], [R * 0.72, 0.016], [R * 0.9, 0.04],
        [R * 1.0, 0.062], [R * 1.02, 0.05], [R * 0.93, 0.03], [R * 0.7, 0.008], [0, 0.002],
      ].map(([rr, y]) => new THREE.Vector2(rr, y));
      const dish = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), M.base());
      dish.rotation.x = -Math.PI / 2;
      dish.position.set(WU(u), PX(hh), 0.01);
      dish.castShadow = true;
      g.add(dish);
      wdisc(g, u, hh, r * 1.06, 0.061, 0.068, M.gold());
      wdisc(g, u, hh, r * 0.46, 0.062, 0.07, M.acc());
      wball(g, u, hh, r * 0.2, 0.072, M.goldLight());
    }
  },

  /** かべのグリーン。上の鉢から葉が垂れる */
  vine(g, w, h) {
    const potW = Math.min(w * 0.5, 16);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(WR(potW / 2), WR(potW / 2.6), PX(10), 18),
      M.base(),
    );
    pot.position.set(WU(w / 2), PX(h - 6), 0.1);
    pot.castShadow = true;
    g.add(pot);
    wdisc(g, w / 2, h - 2, potW / 2 + 1.5, 0.02, 0.18, M.gold());
    const strands = w > 40 ? 4 : 3;
    for (let sIdx = 0; sIdx < strands; sIdx++) {
      const dir = sIdx % 2 === 0 ? -1 : 1;
      const spread = (Math.floor(sIdx / 2) + 1) * (w * 0.16);
      const len = h - 12 - sIdx * 2;
      for (let i = 1; i <= 7; i++) {
        const t = i / 7;
        const u = w / 2 + dir * spread * t;
        const hh = h - 10 - len * t;
        wball(g, u, hh, 3.2 - t * 0.8, 0.09 + (i % 2) * 0.03, M.acc());
        if (i % 2 === 0) wball(g, u + dir * 3.4, hh + 1.6, 2.4, 0.13, M.acc());
      }
    }
  },

  /** タペストリー。布を少したわませる */
  tapestry(g, w, h) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(WR(2.6), WR(2.6), WU(w + 6), 14), M.gold());
    rod.rotation.z = Math.PI / 2;
    rod.position.set(WU(w / 2), PX(h - 2), 0.1);
    rod.castShadow = true;
    g.add(rod);
    // 布：横に何枚かに割って、下へ行くほど手前へふくらませる
    const n = 10;
    for (let i = 0; i < n; i++) {
      const u0 = 1 + ((w - 2) * i) / n;
      const u1 = 1 + ((w - 2) * (i + 1)) / n;
      const wave = 0.018 * Math.sin((i / n) * Math.PI * 3);
      wbox(g, u0, 3, u1, h - 4, 0.05 + wave, 0.088 + wave, M.base(), 0.008);
    }
    // 中の明るい面（布と同じ色。ここを金にすると全面が金色になってしまう）
    wbox(g, 4, 6, w - 4, h - 8, 0.09, 0.098, M.base(), 0.01);
    wball(g, w / 2, h * 0.55, Math.min(w, h) * 0.16, 0.1, M.acc(), 0.3);
    for (let i = 0; i <= 4; i++) wball(g, (w / 4) * i, 2, 2.6, 0.1, M.acc());
  },
};
