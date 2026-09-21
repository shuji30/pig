/**
 * 立体のアバター（`avatarModel.ts`）への入口。**three を読まない。**
 *
 * `avatarModel.ts` は three と three-vrm を読むので、そこを静的に import
 * すると main のかたまりに入ってしまう（gzip で 200KB ぶん）。平らな絵で
 * 先に動きはじめて、モデルが届いたら差しかわる作りなので、**あとから
 * 読みこむ**のがちょうどよい。
 *
 * 使う側はここだけを見る。まだ読めていないあいだ `api()` は null で、
 * 呼びもとは平らな絵のままにしておけばよい。
 */
type Api = typeof import('./avatarModel');

let api: Api | null = null;
let loading: Promise<Api | null> | null = null;

/** 読めていれば中身。まだなら null */
export function modelApi(): Api | null {
  return api;
}

/** 読めているか */
export function modelReady(): boolean {
  return api !== null;
}

/**
 * 読みこみを始める（何度呼んでも1回だけ）。
 * `public/avatar.vrm` を置いていなければ `null` のまま。
 */
export function readyModel(): Promise<Api | null> {
  loading ??= (async () => {
    if (typeof window === 'undefined') return null;
    try {
      const mod = await import('./avatarModel');
      if (!(await mod.readyModelStage())) return null;
      api = mod;
      return mod;
    } catch {
      // 読めなくてもゲームは止めない（平らな絵のまま）
      return null;
    }
  })();
  return loading;
}

/**
 * 読めたら1回だけ呼ぶ（もう読めていれば、その場で呼ぶ）。
 *
 * モデルは 15MB あるので、画面が出てから数秒おくれて届く。すでに描いた
 * ものは、届いたときに描き直さないと平らな絵のまま残る。
 */
export function whenModelReady(fn: () => void): void {
  if (api) {
    fn();
    return;
  }
  void readyModel().then((mod) => {
    if (mod) fn();
  });
}
