import * as THREE from 'three';
import type { PetDef } from '../data/pets';
import type { PetPose } from '../render/petArt';
import { PX } from '../render/models3d.js';

/**
 * ペットの立体。
 *
 * 寸法は `render/petArt.ts` の `drawPet()` から取っている（体の半径・頭の大きさ・
 * すわったときの沈み）。平らな絵と同じ姿勢の値（`PetPose`）を毎フレーム受け取るので、
 * 歩けばしっぽが振れ、すわれば体が沈む。
 *
 * 座標は `avatar3d.ts` と同じで、y が上・+z が体の正面・長さは px。
 */

const up = (artY: number) => PX(-artY);

/** 絵と同じ寸法の決め方（drawPet の冒頭とそろえてある） */
function metrics(def: PetDef, sit: boolean) {
  const bird = def.shape === 'bird';
  const hamster = def.shape === 'hamster';
  const turtle = def.shape === 'turtle';
  return {
    bird,
    hamster,
    turtle,
    bodyY: sit ? -7 : -9,
    bodyRx: bird ? 8.5 : hamster ? 8.8 : turtle ? 12 : 10.5,
    bodyRy: (sit ? 8.5 : 7.5) * (hamster ? 0.86 : turtle ? 0.72 : 1),
    headLift: hamster ? (sit ? 9 : 10.5) * 0.8 : turtle ? -4.6 : sit ? 9 : 10.5,
    headR: bird ? 6.6 : hamster ? 6.4 : turtle ? 5.6 : 7.6,
  };
}

export class Pet3d {
  readonly root = new THREE.Group();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  /** 体。中の楕円だけを姿勢で伸縮させたいので、おなかとは入れものを分けてある */
  private bodyGroup = new THREE.Group();
  private bodyMesh = new THREE.Mesh();
  /** 頭。かめだけこうらの前に出るので、外から位置を見たいことがある */
  head = new THREE.Group();
  private tail = new THREE.Group();
  private defKey = '';

  constructor(def: PetDef) {
    this.root.name = 'pet3d';
    this.setDef(def);
  }

  private mat(color: string, roughness = 0.9): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness: 0 });
    this.materials.push(m);
    return m;
  }

  private blob(rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
    mesh.scale.set(PX(rx), PX(ry), PX(rz));
    mesh.castShadow = true;
    return mesh;
  }

  setDef(def: PetDef): void {
    const key = `${def.shape}|${def.body}|${def.accent}|${def.eye}`;
    if (key === this.defKey) return;
    this.defKey = key;
    this.build(def);
  }

  private build(def: PetDef): void {
    this.root.clear();
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;

    const m = metrics(def, false);
    const body = this.mat(def.body);
    const accent = this.mat(def.accent);
    const eye = this.mat(def.eye, 0.35);

    // ---- 体 ----
    this.bodyGroup = new THREE.Group();
    this.bodyMesh = this.blob(m.bodyRx, m.bodyRy, m.bodyRx * 0.86, body);
    this.bodyGroup.add(this.bodyMesh);

    // おなか
    const belly = this.blob(m.bodyRx * 0.6, m.bodyRy * 0.62, m.bodyRx * 0.5, accent);
    belly.position.set(0, up(2), PX(m.bodyRx * 0.5));
    this.bodyGroup.add(belly);
    this.root.add(this.bodyGroup);

    // ---- 足（とりは省く。絵でも見えない） ----
    if (!m.bird) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const paw = this.blob(2.4, 2, 2.6, accent);
          paw.position.set(PX(sx * m.bodyRx * 0.5), up(-1.6), PX(sz * m.bodyRx * 0.45));
          this.root.add(paw);
        }
      }
    }

    // ---- 頭 ----
    const head = new THREE.Group();
    head.add(this.blob(m.headR, m.headR * 0.94, m.headR, body));
    for (const side of [-1, 1]) {
      const e = this.blob(1.5, 1.7, 1.2, eye);
      e.position.set(PX(side * m.headR * 0.42), up(-m.headR * 0.1), PX(m.headR * 0.82));
      head.add(e);
    }

    // 耳・くちばし。種類の見分けはここだけ
    const ear = (x: number, y: number, rx: number, ry: number, rz: number, mat: THREE.Material) => {
      const o = this.blob(rx, ry, rz, mat);
      o.position.set(PX(x), up(y), PX(-m.headR * 0.1));
      head.add(o);
    };
    switch (def.shape) {
      case 'rabbit':
        for (const s of [-1, 1]) ear(s * m.headR * 0.42, -m.headR * 1.5, 2.2, 6.4, 1.8, body);
        break;
      case 'dog':
        for (const s of [-1, 1]) ear(s * m.headR * 0.86, -m.headR * 0.2, 2.4, 4.2, 1.8, accent);
        break;
      case 'hamster':
        for (const s of [-1, 1]) ear(s * m.headR * 0.66, -m.headR * 0.86, 2.4, 2.4, 1.4, accent);
        break;
      case 'bird': {
        const beak = new THREE.Mesh(new THREE.ConeGeometry(PX(1.8), PX(4), 8), accent);
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, up(-m.headR * 0.1), PX(m.headR + 1.4));
        head.add(beak);
        break;
      }
      case 'turtle':
        break;
      default: // ねこ：とがった耳
        for (const s of [-1, 1]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(PX(2.6), PX(4.6), 8), body);
          cone.position.set(PX(s * m.headR * 0.6), up(-m.headR * 1.1), PX(-m.headR * 0.1));
          cone.castShadow = true;
          head.add(cone);
        }
    }

    this.head = head;
    this.root.add(head);

    // ---- しっぽ（とり・かめ以外） ----
    const tail = new THREE.Group();
    if (def.shape === 'cat') {
      for (let i = 0; i < 3; i++) {
        const seg = this.blob(2.7 - i * 0.4, 2.7 - i * 0.4, 2.7 - i * 0.4, body);
        seg.position.set(0, up(-i * 3.2), PX(-i * 2.7));
        tail.add(seg);
      }
    } else if (def.shape !== 'bird' && def.shape !== 'turtle') {
      tail.add(this.blob(2.4, 2.4, 2.4, body));
    }
    tail.position.set(0, up(-m.bodyRy * 0.2), PX(-m.bodyRx * 0.9));
    this.tail = tail;
    this.root.add(tail);

    // かめのこうら
    if (m.turtle) {
      const shell = this.blob(m.bodyRx * 0.92, m.bodyRy * 1.25, m.bodyRx * 0.8, accent);
      shell.position.y = up(2);
      this.root.add(shell);
    }
  }

  /** 絵と同じ姿勢にする */
  setPose(def: PetDef, pose: PetPose): void {
    const sit = pose.sitting || pose.sleeping;
    const m = metrics(def, sit);

    const bodyY = m.bodyY + pose.breathe * 0.5;
    this.bodyGroup.position.y = up(bodyY);
    this.bodyMesh.scale.set(PX(m.bodyRx), PX(m.bodyRy), PX(m.bodyRx * 0.86));

    // かめの頭はこうらの前へ出す（絵と同じ。上に置くとこうらに隠れる）
    this.head.position.set(
      0,
      up(bodyY - m.headLift + pose.breathe),
      PX(m.turtle ? m.bodyRx * 0.8 : m.bodyRx * 0.25),
    );

    // しっぽは歩くと振れる
    this.tail.rotation.y = pose.swing * 0.22;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
    this.root.clear();
  }
}
