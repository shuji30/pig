import type Phaser from 'phaser';

export interface ShotInfo {
  roomName: string;
  ownerName: string;
  /** 訪問中に押された ❤️ の数。0 なら出さない */
  likes: number;
}

/** Phaser のキャンバスを1枚の画像として取り出す。UI は DOM 側なので写らない */
function grabCanvas(game: Phaser.Game): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('snapshot timeout')), 4000);
    game.renderer.snapshot((result) => {
      window.clearTimeout(timer);
      if (result instanceof HTMLImageElement) resolve(result);
      else reject(new Error('snapshot failed'));
    });
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 画面を撮って、部屋の名前を焼き込んだ PNG をダウンロードさせる。
 * SNS に貼ったときに「どこの部屋か」が分かるようにするのが目的。
 */
export async function saveRoomPng(game: Phaser.Game, info: ShotInfo): Promise<boolean> {
  let img: HTMLImageElement;
  try {
    img = await grabCanvas(game);
  } catch {
    return false;
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return false;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return false;
  g.drawImage(img, 0, 0, w, h);

  // 下に帯を敷いて、部屋の名前と持ち主を焼き込む
  const scale = Math.max(1, Math.min(w, h) / 480);
  const pad = 14 * scale;
  const bandH = 62 * scale;
  const band = { x: pad, y: h - bandH - pad, w: w - pad * 2, h: bandH };

  g.save();
  g.shadowColor = 'rgba(0,0,0,0.28)';
  g.shadowBlur = 10 * scale;
  g.shadowOffsetY = 3 * scale;
  g.fillStyle = 'rgba(255, 250, 246, 0.94)';
  roundRect(g, band.x, band.y, band.w, band.h, 16 * scale);
  g.fill();
  g.restore();

  g.strokeStyle = '#ff9ec4';
  g.lineWidth = 3 * scale;
  roundRect(g, band.x, band.y, band.w, band.h, 16 * scale);
  g.stroke();

  const left = band.x + 18 * scale;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#4a3b42';
  g.font = `bold ${23 * scale}px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`;
  g.fillText(info.roomName, left, band.y + 27 * scale, band.w * 0.62);
  g.fillStyle = '#8a7480';
  g.font = `${14 * scale}px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`;
  const sub = info.likes > 0 ? `${info.ownerName} のおへや　❤️ ${info.likes}` : `${info.ownerName} のおへや`;
  g.fillText(sub, left, band.y + 48 * scale, band.w * 0.62);

  g.textAlign = 'right';
  g.fillStyle = '#e4739f';
  g.font = `bold ${15 * scale}px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`;
  g.fillText('🏠 My Little Room', band.x + band.w - 18 * scale, band.y + 38 * scale);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // ファイル名は ASCII だけにする。日本語のままだとブラウザに落とされて
  // 「download」という名前で保存されることがある
  const slug = info.roomName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  a.download = slug ? `my-little-room-${slug}.png` : 'my-little-room.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // すぐ revoke するとダウンロードが始まらないブラウザがあるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
