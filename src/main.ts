import Phaser from 'phaser';
import { RoomScene } from './scenes/RoomScene';
import { setupPwa } from './pwa/install';
import { decodeShared, shareTokenInLocation } from './state/share';

/**
 * 共有 URL の読み取りは非同期（deflate の展開があるため）なので、
 * 部屋の中身が決まってからゲームを起動する。
 */
async function boot() {
  const token = shareTokenInLocation();
  const shared = token ? await decodeShared(token) : null;
  const broken = token !== null && shared === null;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#2b2430',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    // ピンチ操作のため複数の指を受け取る
    input: {
      activePointers: 3,
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    scene: [new RoomScene(shared, broken)],
  });

  // 中を触れる口を1つだけ開けておく。動作確認と、遊ぶ人からの
  // 「こうなった」を追う用。中身はすべて端末の中にしか無いので、
  // 見えて困るものは無い
  (window as unknown as { game: Phaser.Game }).game = game;

  // ホーム画面への追加とオフライン対応。開発中は登録しない
  // （古い保存が残って、直したはずのものが直らなくなる）
  setupPwa(import.meta.env.PROD);
}

void boot();
