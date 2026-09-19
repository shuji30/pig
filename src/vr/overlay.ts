/**
 * VR モードのかぶせ画面。three.js のキャンバスと、出入りのボタン。
 *
 * ゲーム（Phaser）は裏で動かしたままにする。アバターを歩かせているのは
 * あくまでゲームのほうなので、止めると VR の中でも動かなくなる。
 */
export interface VrOverlay {
  /**
   * 下のほうに出す短い知らせ。空文字で消える。
   * @param ms 入れると、そのミリ秒だけ出して自分で消える
   */
  setNote(text: string, ms?: number): void;
  /** 「ヘッドセットで見る」を出すか（WebXR に対応していない端末では隠す） */
  setEnterVisible(visible: boolean): void;
  remove(): void;
}

export interface VrOverlayHandlers {
  onExit(): void;
  onEnterVr(): void;
}

export function createVrOverlay(canvas: HTMLCanvasElement, handlers: VrOverlayHandlers): VrOverlay {
  const root = document.createElement('div');
  root.id = 'vr-overlay';

  canvas.className = 'vr-canvas';
  root.appendChild(canvas);

  const bar = document.createElement('div');
  bar.className = 'vr-bar';

  const enter = document.createElement('button');
  enter.type = 'button';
  enter.className = 'vr-enter';
  enter.textContent = '🥽 ヘッドセットで見る';
  enter.addEventListener('click', handlers.onEnterVr);

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'vr-exit';
  exit.textContent = '× とじる';
  exit.addEventListener('click', handlers.onExit);

  bar.append(enter, exit);

  const note = document.createElement('p');
  note.className = 'vr-note';
  note.hidden = true;

  root.append(bar, note);
  document.body.appendChild(root);

  let noteTimer: number | undefined;

  return {
    setNote(text, ms) {
      window.clearTimeout(noteTimer);
      note.textContent = text;
      note.hidden = text === '';
      if (ms !== undefined && text !== '') {
        noteTimer = window.setTimeout(() => {
          note.textContent = '';
          note.hidden = true;
        }, ms);
      }
    },
    setEnterVisible(visible) {
      enter.hidden = !visible;
    },
    remove() {
      root.remove();
    },
  };
}
