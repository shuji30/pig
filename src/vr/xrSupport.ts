/**
 * ヘッドセット（WebXR）に入れるかを調べる。**three も Phaser も読まない。**
 *
 * `VrView` から切り出してある。入れない理由は遊ぶ人にしか直せないもの
 * （http でひらいている・ブラウザが対応していない・ランタイムが動いて
 * いない）ばかりなので、「入れません」だけで終わらせず、そのまま伝える。
 */

/**
 * 調べた結果。`retry` は「あとから直せる見込みがあるか」で、
 * ボタンを出しておくかの判断に使う（ランタイムを起動して押し直せる）
 */
export interface Support {
  ok: boolean;
  retry: boolean;
  why: string;
}

/** 例外を短い1行にする（画面にそのまま出す） */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.name === 'Error' ? e.message : `${e.name}: ${e.message}`;
  return String(e);
}

export async function xrSupport(): Promise<Support> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { ok: false, retry: false, why: 'https でないとヘッドセットに入れません（いまは http でひらいています）' };
  }
  if (!navigator.xr) {
    return { ok: false, retry: false, why: 'このブラウザは WebXR に対応していません。Chrome か Edge でひらいてください' };
  }
  try {
    if (await navigator.xr.isSessionSupported('immersive-vr')) return { ok: true, retry: true, why: '' };
  } catch (e) {
    return { ok: false, retry: true, why: `ヘッドセットを見にいけませんでした（${errText(e)}）` };
  }
  // ランタイム（SteamVR / Pimax Play / Oculus など）が動いていないとここへ来る。
  // あとから起動して押し直せるよう、ボタンは残す（`retry`）
  return {
    ok: false,
    retry: true,
    why: 'ヘッドセットが見つかりません。SteamVR などの OpenXR を先に起動して、もう一度おしてください',
  };
}

/** その空間が使えるか。使えないランタイムでは requestReferenceSpace が投げる */
export async function hasSpace(session: XRSession, type: XRReferenceSpaceType): Promise<boolean> {
  try {
    await session.requestReferenceSpace(type);
    return true;
  } catch {
    return false;
  }
}
