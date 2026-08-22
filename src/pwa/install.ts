/**
 * ホーム画面に追加（PWA）まわり。
 *
 * - Service Worker を登録する。2回目からは**通信が無くても遊べる**
 * - 新しい版が入ったことを知らせる（勝手に読み込み直さない。
 *   遊んでいる最中に画面が作り直されるほうが困るため）
 * - 「ホーム画面に追加」のボタン（Android・PC）。iPhone は Safari の
 *   共有メニューからなので、あそびかたに書いてある
 * - 保存領域を「消さないで」と申請する。部屋は端末の中にしか無いので、
 *   容量が足りないときに勝手に消されると全部失われる
 */

/** 画面のまんなかに出る短い知らせ（ゲーム側と同じ見た目を使う） */
function toast(text: string, ms = 4000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  window.setTimeout(() => {
    el.hidden = true;
  }, ms);
}

/** ホーム画面に追加できる状態になったら押せるボタン */
function setupInstallButton() {
  const row = document.getElementById('install-row');
  const btn = document.getElementById('btn-install');
  if (!row || !btn) return;

  let prompt: { prompt(): Promise<void>; userChoice?: Promise<unknown> } | null = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // 既定の案内を止めて、あそびかたの中のボタンに置き換える
    e.preventDefault();
    prompt = e as unknown as { prompt(): Promise<void> };
    row.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!prompt) return;
    await prompt.prompt();
    prompt = null;
    row.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    row.hidden = true;
    toast('ホーム画面に追加したよ');
  });
}

/** 「オフラインでも遊べる」状態になったことを、あそびかたに書き添える */
function markOfflineReady() {
  const note = document.getElementById('offline-note');
  if (!note) return;
  note.textContent = 'この端末に保存したので、つながっていなくても遊べます。';
  note.hidden = false;
}

async function askPersistentStorage() {
  try {
    const s = navigator.storage;
    if (!s?.persist || !s.persisted) return;
    if (await s.persisted()) return;
    await s.persist();
  } catch {
    // 対応していない端末では何もしない
  }
}

/** いま動いている Service Worker に、自分の版を聞く */
function askVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const ctl = navigator.serviceWorker.controller;
    if (!ctl) {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMsg);
      resolve(null);
    }, 3000);
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; cache?: string } | null;
      if (data?.type !== 'version') return;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMsg);
      resolve(data.cache ?? null);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    ctl.postMessage({ type: 'get-version' });
  });
}

/** 配信されている sw.js から版を読む（通信できないときは null） */
async function servedVersion(): Promise<string | null> {
  try {
    const res = await fetch('./sw.js', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.text()).match(/const CACHE = "([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Service Worker に「ぜんぶ取り直して」と頼む。終わったら true */
function requestRefresh(version: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ctl = navigator.serviceWorker.controller;
    if (!ctl) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMsg);
      resolve(false);
    }, 20000);
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string } | null;
      if (data?.type !== 'refreshed') return;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMsg);
      resolve(true);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    ctl.postMessage({ type: 'refresh', version });
  });
}

/**
 * 「配られている版」と「いま動いている版」を見比べて、違えば読み込み直しを勧める。
 *
 * ブラウザの自動更新（次に開いたときに入れかわる）だけに頼らないのは、
 * それが動かない環境を実測で見たため。ここは自分で確かめて、
 * 押したら確実に新しくなる道（登録を外して読み込み直す）を用意しておく。
 */
async function offerUpdateIfStale() {
  const bar = document.getElementById('update-bar');
  const go = document.getElementById('btn-update');
  const later = document.getElementById('btn-update-later');
  if (!bar || !go || !later) return;

  const [mine, served] = await Promise.all([askVersion(), servedVersion()]);
  if (mine === null || served === null || mine === served) return;
  // 一度読み込み直した版について、何度も勧めない。
  // Service Worker 側の目印が消えることがあるので、こちらでも覚えておく
  if (readUpdatedTo() === served) return;

  bar.hidden = false;
  later.addEventListener('click', () => {
    bar.hidden = true;
  });
  go.addEventListener('click', () => {
    void (async () => {
      go.setAttribute('disabled', 'true');
      go.textContent = '読み込み中…';
      // まず Service Worker に取り直してもらう。これが最も確実
      // （登録まわりの API は、返ってこない端末があるので頼らない）
      if (!(await requestRefresh(served))) {
        // 返事が無いときは、保存を消してから読み込み直す。
        // 保存が空なら通信から取りにいくので、いずれにしても新しくなる
        try {
          for (const key of await caches.keys()) {
            if (key.startsWith('mlr-')) await caches.delete(key);
          }
        } catch {
          // 消せなくても読み込み直しは試す
        }
      }
      writeUpdatedTo(served);
      location.reload();
    })();
  });
}

const UPDATED_KEY = 'mlr.updatedTo';

function readUpdatedTo(): string | null {
  try {
    return localStorage.getItem(UPDATED_KEY);
  } catch {
    return null;
  }
}

function writeUpdatedTo(version: string) {
  try {
    localStorage.setItem(UPDATED_KEY, version);
  } catch {
    // 保存できなくても、勧める回数が増えるだけ
  }
}

export function setupPwa(isProduction: boolean) {
  setupInstallButton();
  void askPersistentStorage();

  if (!isProduction || !('serviceWorker' in navigator)) return;

  // 登録の前に見ておく。すでに動いていた場合だけ「新しくなった」と知らせる
  // （はじめて開いた人に「新しい版があります」と言っても意味がない）
  const hadController = navigator.serviceWorker.controller !== null;
  if (hadController) markOfflineReady();

  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string } | null;
    if (data?.type !== 'sw-activated') return;
    markOfflineReady();
    if (hadController) toast('あたらしいバージョンがあるよ。開き直すと入れかわります');
  });

  const start = async () => {
    // ⚠️ register() の戻りを待ってはいけない。すでに登録済みのページでは
    // この約束が返ってこないブラウザがある（実測）。待つと、その後ろに
    // 書いた更新の確認がまるごと動かなくなる
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    try {
      // ready は確実に返る。ここから更新を頼む
      const reg = await navigator.serviceWorker.ready;
      void reg.update().catch(() => undefined);
      watchForUpdates(reg);
      void offerUpdateIfStale();
    } catch {
      // 登録できなくても、ゲームそのものは動く
    }
  };

  // ⚠️ load を待ってはいけない。ここへ来るまでに共有 URL の展開で await が
  // 入るので、2回目以降（保存から開くとき）は load が先に済んでいて、
  // 待つと**登録も更新も一度も走らない**（実測で見つけた）
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
}

/** 開いたままの端末のために、戻ってきたときにも確かめる（間隔は空ける） */
function watchForUpdates(reg: ServiceWorkerRegistration) {
  const EVERY = 30 * 60 * 1000;
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - last < EVERY) return;
    last = Date.now();
    void reg.update().catch(() => undefined);
  });
}
