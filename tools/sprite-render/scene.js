import * as THREE from '/node_modules/three/build/three.module.js';

/**
 * 等角スプライトのレンダラー。
 *
 * ゲーム側の射影に**ぴたりと合わせる**のが要点。RoomScene / furnitureTexture では
 *   画面x = offX + (gx - gy) * 32
 *   画面y = offY + (gx + gy) * 16 - z(px)
 * なので、方位45度・仰角30度の正射影で、1ワールド単位 = 45.2548px にすると一致する。
 * 高さは 1ワールド単位 = 39.19px になる（cos30 をかけるため）。
 */
const PX_PER_UNIT = 32 / Math.cos(Math.PI / 4); // 45.2548
const PX_PER_HEIGHT = PX_PER_UNIT * Math.cos(Math.PI / 6); // 39.19
const SS = 4; // スーパーサンプリング（4倍で描いて縮める）

export const HEIGHT_UNIT = PX_PER_HEIGHT;

const IVORY = 0xf4ead9;
const GOLD = 0xcfa855;

/** ロココのいす。曲線が出せるのが手続き生成との違いなので、猫脚は本当に曲げる */
function buildChair(cloth) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.55, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.28, metalness: 0.85 });
  const fabric = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.92, metalness: 0 });

  // --- 猫脚（カブリオレレッグ）。S字の輪郭を回転体にする ---
  const profile = [];
  const pts = [
    [0.055, 0.0], [0.075, 0.03], [0.06, 0.09], [0.038, 0.2],
    [0.042, 0.33], [0.06, 0.45], [0.075, 0.56], [0.062, 0.64],
  ];
  for (const [r, y] of pts) profile.push(new THREE.Vector2(r, y));
  const legGeo = new THREE.LatheGeometry(profile, 24);
  const footGeo = new THREE.SphereGeometry(0.052, 20, 14);
  const legAt = (x, z, dx, dz) => {
    const leg = new THREE.Mesh(legGeo, wood);
    leg.castShadow = true;
    // 外へ張り出す向きへ少し倒す（ロココらしい反り）
    leg.rotation.x = dz * 0.1;
    leg.rotation.z = -dx * 0.1;
    leg.position.set(x, 0, z);
    group.add(leg);
    const foot = new THREE.Mesh(footGeo, gold);
    foot.position.set(x, 0.045, z);
    foot.castShadow = true;
    group.add(foot);
  };
  legAt(0.2, 0.2, -1, -1);
  legAt(0.8, 0.2, 1, -1);
  legAt(0.2, 0.8, -1, 1);
  legAt(0.8, 0.8, 1, 1);

  // --- 座面（角を丸めた板） ---
  const seat = new THREE.Mesh(roundedBox(0.72, 0.075, 0.72, 0.03), wood);
  seat.position.set(0.5, 0.675, 0.5);
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);
  const seatTrim = new THREE.Mesh(roundedBox(0.75, 0.022, 0.75, 0.01), gold);
  seatTrim.position.set(0.5, 0.64, 0.5);
  group.add(seatTrim);

  // --- クッション（くるみボタン留め） ---
  const cushion = new THREE.Mesh(roundedBox(0.66, 0.1, 0.66, 0.045), fabric);
  cushion.position.set(0.5, 0.755, 0.5);
  cushion.castShadow = true;
  group.add(cushion);
  const studGeo = new THREE.SphereGeometry(0.022, 14, 10);
  for (const dx of [-0.16, 0.16]) {
    for (const dz of [-0.16, 0.16]) {
      const stud = new THREE.Mesh(studGeo, gold);
      stud.position.set(0.5 + dx, 0.795, 0.5 + dz);
      group.add(stud);
    }
  }

  // --- 背もたれ：曲げた枠＋張り地＋笠木の彫刻 ---
  const back = new THREE.Group();
  const frameCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 0, 0),
    new THREE.Vector3(-0.33, 0.25, -0.03),
    new THREE.Vector3(-0.28, 0.48, -0.06),
    new THREE.Vector3(0, 0.58, -0.08),
    new THREE.Vector3(0.28, 0.48, -0.06),
    new THREE.Vector3(0.33, 0.25, -0.03),
    new THREE.Vector3(0.3, 0, 0),
  ]);
  const frame = new THREE.Mesh(new THREE.TubeGeometry(frameCurve, 48, 0.033, 12, false), wood);
  frame.castShadow = true;
  back.add(frame);
  const panel = new THREE.Mesh(roundedBox(0.54, 0.5, 0.055, 0.05), fabric);
  panel.position.set(0, 0.27, -0.03);
  panel.castShadow = true;
  back.add(panel);
  // 笠木のロゼット
  const rosette = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), gold);
  rosette.position.set(0, 0.585, -0.075);
  rosette.scale.set(1, 0.85, 0.6);
  back.add(rosette);
  back.position.set(0.5, 0.75, 0.16);
  group.add(back);

  return group;
}

/** 角を丸めた直方体（ExtrudeGeometry の bevel を使う） */
function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const z = -d / 2 + r;
  const w2 = w - r * 2;
  const d2 = d - r * 2;
  shape.moveTo(x, z);
  shape.lineTo(x + w2, z);
  shape.quadraticCurveTo(x + w2 + r, z, x + w2 + r, z + r);
  shape.lineTo(x + w2 + r, z + d2);
  shape.quadraticCurveTo(x + w2 + r, z + d2 + r, x + w2, z + d2 + r);
  shape.lineTo(x, z + d2 + r);
  shape.quadraticCurveTo(x - r, z + d2 + r, x - r, z + d2);
  shape.lineTo(x - r, z + r);
  shape.quadraticCurveTo(x - r, z, x, z);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h - r,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r * 0.8,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, h / 2, 0);
  return geo;
}

const MODELS = { chair: buildChair };

/**
 * 1枚レンダリングして data URL を返す。
 * @param {{model:string, cloth:number, rot:number, width:number, height:number, offX:number, offY:number}} o
 */
export function renderSprite(o) {
  const W = o.width;
  const H = o.height;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * SS, H * SS, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const model = MODELS[o.model](o.cloth);
  // rot は「家具の回転」。マスの真ん中を軸にまわす
  model.position.sub(new THREE.Vector3(0.5, 0, 0.5));
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = (-o.rot * Math.PI) / 2;
  pivot.position.set(0.5, 0, 0.5);
  scene.add(pivot);

  // 影を落とすためだけの床（背景は透明のまま）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShadowMaterial({ opacity: 0.22 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0.5, 0, 0.5);
  floor.receiveShadow = true;
  scene.add(floor);

  // 三点照明。手続き生成の「面ごとの固定の陰影」と違い、丸みが出る
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfa8a0, 1.5));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(3, 5, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const d = 1.6;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0015;
  key.target.position.set(0.5, 0.4, 0.5);
  scene.add(key.target);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.7);
  fill.position.set(-3, 2, -1.5);
  scene.add(fill);

  // --- カメラ：ゲームの射影と一致させる ---
  // 画像の中心に来るワールド点 T を、アンカー（マスの奥角）が (offX, offY) に
  // 落ちるように決める。sx(T) = W/2 - offX, sy(T) = H/2 - offY
  const sxT = W / 2 - o.offX;
  const syT = H / 2 - o.offY;
  const tdx = sxT / 32; // T.x - T.z
  const tsum = 1; // T.x + T.z（マスの真ん中あたりに置く）
  const tx = (tsum + tdx) / 2;
  const tz = (tsum - tdx) / 2;
  const ty = (tsum * 16 - syT) / PX_PER_HEIGHT;
  const target = new THREE.Vector3(tx, ty, tz);

  const camera = new THREE.OrthographicCamera(
    -W / 2 / PX_PER_UNIT,
    W / 2 / PX_PER_UNIT,
    H / 2 / PX_PER_UNIT,
    -H / 2 / PX_PER_UNIT,
    0.01,
    60,
  );
  // 方位45度・仰角30度（tan30 = y / √2）
  const dir = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize();
  camera.position.copy(target).addScaledVector(dir, 20);
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);

  // スーパーサンプリングぶんを縮める
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, W, H);
  const url = out.toDataURL('image/png');
  renderer.dispose();
  return url;
}

window.renderSprite = renderSprite;
window.HEIGHT_UNIT = HEIGHT_UNIT;
