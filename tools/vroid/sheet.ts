/**
 * VRoid Studio でモデルを作るときの みほん を並べる。
 *
 * きせかえで選べる 髪型10種・ふく4種・肌5色・髪7色・ふく8色 を、
 * **ゲーム本体と同じ絵の出しかた**（`render/avatarPreview.ts`）で描く。
 * 絵を直せばこの資料もついてくるので、別に描き起こさない。
 *
 *   npm run dev → http://localhost:5173/tools/vroid/sheet.html
 */
import Phaser from 'phaser';
import {
  CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLE_NAMES,
  OUTFIT_NAMES, OUTFITS, SKIN_COLORS,
} from '../../src/config';
import { makeAvatarPreviewCanvas } from '../../src/render/avatarPreview';
import type { AvatarLook } from '../../src/types';

const base: AvatarLook = {
  name: 'みほん', skin: SKIN_COLORS[0], hair: HAIR_COLORS[1], eyes: EYE_COLORS[0],
  shirt: CLOTH_COLORS[0], pants: CLOTH_COLORS[5], shoes: '#3b2b28',
  hairStyle: 0, outfit: 'shirt',
} as AvatarLook;

class S extends Phaser.Scene {
  create() {
    const out = document.getElementById('out')!;
    const section = (title: string, note: string, items: Array<[string, AvatarLook]>) => {
      out.insertAdjacentHTML('beforeend', `<h1>${title}</h1><p>${note}</p>`);
      const g = document.createElement('div');
      g.className = 'grid';
      for (const [label, look] of items) {
        const f = document.createElement('figure');
        f.appendChild(makeAvatarPreviewCanvas(this, look));
        f.insertAdjacentHTML('beforeend', `<figcaption>${label}</figcaption>`);
        g.appendChild(f);
      }
      out.appendChild(g);
    };
    section('髪型 10種', 'VR では切り替わりません（VRM 1ファイルに1種類）。どれか1つを選んで作ります。',
      HAIR_STYLE_NAMES.map((n, i) => [`${i} ${n}`, { ...base, hairStyle: i }] as [string, AvatarLook]));
    section('ふく 4種', '同じく VR では切り替わりません。',
      OUTFITS.map((o, i) => [`${i} ${OUTFIT_NAMES[i]}`, { ...base, outfit: o }] as [string, AvatarLook]));
    section('肌の色 5種', 'きせかえで選べる色。VRoid 側は明るい肌にしておくと、どの色もきれいに乗ります。',
      SKIN_COLORS.map((c, i) => [c, { ...base, skin: c }] as [string, AvatarLook]));
    section('髪の色 7種', '同上。VRoid 側は明るい髪にしておきます。',
      HAIR_COLORS.map((c, i) => [c, { ...base, hair: c }] as [string, AvatarLook]));
    section('ふくの色 8種', 'VRoid 側の衣装は白〜淡色に。掛け算で乗せるので、濃い服だと色が変わりません。',
      CLOTH_COLORS.map((c) => [c, { ...base, shirt: c }] as [string, AvatarLook]));
  }
}
new Phaser.Game({ type: Phaser.CANVAS, width: 1, height: 1, scene: S, parent: document.createElement('div') });
