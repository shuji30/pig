import type Phaser from 'phaser';
import {
  CLOTH_COLORS,
  EYE_COLORS,
  FLOOR_STYLES,
  ROOM_THEMES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  OUTFIT_NAMES,
  RECOLOR_ACCENT,
  RECOLOR_BASE,
  SKIN_COLORS,
  WALL_STYLES,
} from '../config';
import { CATEGORY_LABEL, CATEGORY_ORDER, FURNITURE, getDef } from '../data/furniture';
import { MOTIONS, type MotionKind } from '../data/motions';
import type { MissionView } from '../state/economy';
import { sellPrice } from '../state/economy';
import { makeAvatarPreviewCanvas } from '../render/avatarPreview';
import { makeIconCanvas } from '../render/furnitureTexture';
import { makeWallIconCanvas } from '../render/wallTexture';
import type { AvatarLook, FurnitureCategory, Recolor } from '../types';

export type PanelName = 'furniture' | 'emote' | 'wardrobe' | 'room' | 'share' | 'missions' | 'help' | 'recolor';

/** 訪問中に上部へ出す、その部屋の情報 */
export interface VisitInfo {
  roomName: string;
  roomNote: string;
  ownerName: string;
}

export interface UiHandlers {
  onPickFurniture(defId: string): void;
  onFloorChange(idx: number): void;
  onWallChange(idx: number): void;
  onLookChange(look: AvatarLook): void;
  onChat(text: string): void;
  onReset(): void;
  onPlaceAction(act: 'rotate' | 'cancel'): void;
  onSelAction(act: 'rotate' | 'move' | 'recolor' | 'store' | 'deselect'): void;
  /** リカラーの色を選んだ。どちらも undefined ならもとの色に戻す */
  onRecolor(recolor: Recolor | undefined): void;
  onPanelOpen(name: PanelName): void;
  onEmote(kind: MotionKind): void;
  onToggleAuto(): void;
  onBuy(defId: string): void;
  onSell(defId: string): void;
  onClaimMissions(): void;
  onZoom(factor: number): void;
  onCenter(): void;
  onRoomTextChange(name: string, note: string): void;
  /** いまの部屋の共有 URL をつくる */
  requestShareUrl(): Promise<string>;
  onShareCopied(): void;
  onSaveShot(): void;
  onLike(): void;
  onImportRoom(): void;
  onLeaveVisit(): void;
  onExpandRoom(): void;
  /** テーマ（床と壁の組み合わせ）を選んだ */
  onThemeChange(idx: number): void;
  /** 塗るときの柄を選んだ */
  onBrushChange(idx: number): void;
  /** 床を1マスずつ塗るモードの切り替え */
  onTogglePaint(): void;
  onPaintAction(act: 'clear' | 'done'): void;
  /** 🌍 でちきゅうへ戻る */
  onGoHome(): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
};

/** DOM 側の UI 全般 */
export class Ui {
  private tab: FurnitureCategory | 'shop' = 'seat';
  private inventory: Record<string, number> = {};
  private look!: AvatarLook;
  private floorIdx = 0;
  private wallIdx = 0;
  /** いまの床と壁に一致するテーマ。無ければ -1 */
  private themeIdx = -1;
  /** 床を塗るときの柄 */
  private brushIdx = 1;
  private pickedDefId: string | null = null;
  private coins = 0;
  private toastTimer?: number;
  private visiting = false;
  /** リカラーパネルでいま選ばれている色 */
  private recolor: Recolor = {};

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly handlers: UiHandlers,
  ) {
    this.buildTabs();
    this.buildEmotes();
    this.buildWardrobe();
    this.buildRoomPanel();
    this.buildRecolorPanel();
    this.wireChrome();
  }

  // ---------- 組み立て ----------

  private wireChrome() {
    document.querySelectorAll<HTMLButtonElement>('#toolbar .tool').forEach((btn) => {
      btn.addEventListener('click', () => this.togglePanel(btn.dataset.panel as PanelName));
    });
    $('btn-help').addEventListener('click', () => this.togglePanel('help'));
    $('btn-auto').addEventListener('click', () => this.handlers.onToggleAuto());
    $('btn-missions').addEventListener('click', () => this.togglePanel('missions'));
    $('btn-claim').addEventListener('click', () => this.handlers.onClaimMissions());
    $('btn-zoom-in').addEventListener('click', () => this.handlers.onZoom(1.15));
    $('btn-zoom-out').addEventListener('click', () => this.handlers.onZoom(1 / 1.15));
    $('btn-center').addEventListener('click', () => this.handlers.onCenter());
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.closePanels());
    });

    $<HTMLFormElement>('chatbar').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.blur();
      this.handlers.onChat(text);
    });

    $('btn-expand').addEventListener('click', () => this.handlers.onExpandRoom());
    $('btn-paint').addEventListener('click', () => this.handlers.onTogglePaint());
    $('btn-earth').addEventListener('click', () => this.handlers.onGoHome());
    $('paintbar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'clear' || act === 'done') this.handlers.onPaintAction(act);
    });

    $('btn-reset').addEventListener('click', () => {
      if (window.confirm('部屋とアバターを最初の状態に戻します。よろしいですか？')) {
        this.closePanels();
        this.handlers.onReset();
      }
    });

    // ---- みせる ----
    const nameInput = $<HTMLInputElement>('room-name');
    const noteInput = $<HTMLInputElement>('room-note');
    const pushRoomText = () => {
      this.handlers.onRoomTextChange(nameInput.value, noteInput.value);
      void this.refreshShareUrl();
    };
    nameInput.addEventListener('input', pushRoomText);
    noteInput.addEventListener('input', pushRoomText);
    $('btn-copy').addEventListener('click', () => void this.copyShareUrl());
    $('btn-shot').addEventListener('click', () => this.handlers.onSaveShot());

    // ---- 訪問中 ----
    $('btn-visit-shot').addEventListener('click', () => this.handlers.onSaveShot());
    $('btn-like').addEventListener('click', () => this.handlers.onLike());
    $('btn-home').addEventListener('click', () => this.handlers.onLeaveVisit());
    $('btn-import').addEventListener('click', () => {
      if (window.confirm('いまの自分の部屋をこの部屋に置きかえます。よろしいですか？')) {
        this.handlers.onImportRoom();
      }
    });

    $('placebar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'rotate' || act === 'cancel') this.handlers.onPlaceAction(act);
    });
    $('selbar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'rotate' || act === 'move' || act === 'recolor' || act === 'store' || act === 'deselect') {
        this.handlers.onSelAction(act);
      }
    });

    $('btn-recolor-reset').addEventListener('click', () => {
      this.recolor = {};
      this.refreshRecolor();
      this.handlers.onRecolor(undefined);
    });
  }

  private buildTabs() {
    const tabs = $('furniture-tabs');
    tabs.innerHTML = '';
    const add = (key: FurnitureCategory | 'shop', label: string) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = label;
      b.dataset.cat = key;
      b.addEventListener('click', () => {
        this.tab = key;
        this.renderCatalog();
      });
      tabs.appendChild(b);
    };
    for (const cat of CATEGORY_ORDER) add(cat, CATEGORY_LABEL[cat]);
    add('shop', '🛍 ショップ');
  }

  private buildEmotes() {
    const grid = $('emote-grid');
    grid.innerHTML = '';
    for (const m of MOTIONS) {
      const btn = document.createElement('button');
      btn.className = 'item';
      btn.dataset.kind = m.kind;
      const icon = document.createElement('span');
      icon.className = 'emoji';
      icon.textContent = m.icon;
      const name = document.createElement('span');
      name.textContent = m.label;
      btn.append(icon, name);
      btn.addEventListener('click', () => this.handlers.onEmote(m.kind));
      grid.appendChild(btn);
    }
  }

  private buildWardrobe() {
    const body = $('wardrobe-body');
    body.innerHTML = '';
    body.appendChild(
      this.chipRow('かみがた', HAIR_STYLE_NAMES, () => this.look.hairStyle, (i) => this.patchLook({ hairStyle: i })),
    );
    body.appendChild(
      this.swatchRow('かみのいろ', HAIR_COLORS, () => this.look.hair, (c) => this.patchLook({ hair: c })),
    );
    body.appendChild(this.swatchRow('はだ', SKIN_COLORS, () => this.look.skin, (c) => this.patchLook({ skin: c })));
    body.appendChild(this.swatchRow('ひとみ', EYE_COLORS, () => this.look.eyes, (c) => this.patchLook({ eyes: c })));
    body.appendChild(
      this.chipRow('ふくのかたち', OUTFIT_NAMES, () => (this.look.outfit === 'dress' ? 1 : 0), (i) =>
        this.patchLook({ outfit: i === 1 ? 'dress' : 'shirt' }),
      ),
    );
    body.appendChild(this.swatchRow('ふく', CLOTH_COLORS, () => this.look.shirt, (c) => this.patchLook({ shirt: c })));
    body.appendChild(
      this.swatchRow('ズボン／くつした', CLOTH_COLORS, () => this.look.pants, (c) => this.patchLook({ pants: c })),
    );
    body.appendChild(this.swatchRow('くつ', CLOTH_COLORS, () => this.look.shoes, (c) => this.patchLook({ shoes: c })));

    const nameInput = $<HTMLInputElement>('avatar-name');
    nameInput.addEventListener('input', () => {
      this.patchLook({ name: nameInput.value.slice(0, 10) || 'ピグ' });
    });
  }

  private buildRoomPanel() {
    const body = $('room-body');
    body.innerHTML = '';
    body.appendChild(
      this.chipRow('テーマ', ROOM_THEMES.map((t) => t.name), () => this.themeIdx, (i) =>
        this.handlers.onThemeChange(i),
      ),
    );
    body.appendChild(
      this.chipRow('ゆか', FLOOR_STYLES.map((s) => s.name), () => this.floorIdx, (i) => {
        this.floorIdx = i;
        this.refreshRoomPanel();
        this.handlers.onFloorChange(i);
      }),
    );
    body.appendChild(
      this.chipRow('かべ', WALL_STYLES.map((s) => s.name), () => this.wallIdx, (i) => {
        this.wallIdx = i;
        this.refreshRoomPanel();
        this.handlers.onWallChange(i);
      }),
    );
    body.appendChild(
      this.chipRow('ぬる柄', FLOOR_STYLES.map((s) => s.name), () => this.brushIdx, (i) => {
        this.brushIdx = i;
        this.refreshRoomPanel();
        this.handlers.onBrushChange(i);
      }),
    );
  }

  private buildRecolorPanel() {
    const body = $('recolor-body');
    body.innerHTML = '';
    body.appendChild(
      this.swatchRow('きじ（木のところ）', RECOLOR_BASE, () => this.recolor.color ?? '', (c) => {
        this.recolor = { ...this.recolor, color: c };
        this.refreshRecolor();
        this.handlers.onRecolor(this.recolor);
      }),
    );
    body.appendChild(
      this.swatchRow('はりじ（布のところ）', RECOLOR_ACCENT, () => this.recolor.accent ?? '', (c) => {
        this.recolor = { ...this.recolor, accent: c };
        this.refreshRecolor();
        this.handlers.onRecolor(this.recolor);
      }),
    );
  }

  private refreshRecolor() {
    this.refreshRows($('recolor-body'));
  }

  /** リカラーパネルを、選んだ家具の名前といまの色で開く */
  openRecolor(name: string, current: Recolor | undefined) {
    this.recolor = { ...(current ?? {}) };
    $('recolor-name').textContent = name;
    this.refreshRecolor();
    const panel = $('panel-recolor');
    if (panel.hidden) {
      document.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = true));
      panel.hidden = false;
    }
  }

  closeRecolor() {
    $('panel-recolor').hidden = true;
  }

  private chipRow(label: string, names: string[], current: () => number, pick: (i: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.row = label;
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = label;
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    names.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = n;
      b.dataset.idx = String(i);
      b.addEventListener('click', () => pick(i));
      wrap.appendChild(b);
    });
    row.append(lab, wrap);
    row.dataset.kind = 'chips';
    (row as HTMLElement & { _current?: () => number })._current = current;
    return row;
  }

  private swatchRow(label: string, colors: string[], current: () => string, pick: (c: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = label;
    const wrap = document.createElement('div');
    wrap.className = 'swatches';
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.dataset.color = c;
      b.addEventListener('click', () => pick(c));
      wrap.appendChild(b);
    });
    row.append(lab, wrap);
    row.dataset.kind = 'swatches';
    (row as HTMLElement & { _currentColor?: () => string })._currentColor = current;
    return row;
  }

  // ---------- 更新 ----------

  private patchLook(patch: Partial<AvatarLook>) {
    this.look = { ...this.look, ...patch };
    this.refreshWardrobe();
    this.handlers.onLookChange(this.look);
  }

  private refreshRows(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('.row').forEach((row) => {
      if (row.dataset.kind === 'chips') {
        const cur = (row as HTMLElement & { _current?: () => number })._current?.() ?? 0;
        row.querySelectorAll<HTMLElement>('.chip').forEach((c) => {
          c.classList.toggle('active', Number(c.dataset.idx) === cur);
        });
      } else {
        const cur = (row as HTMLElement & { _currentColor?: () => string })._currentColor?.();
        row.querySelectorAll<HTMLElement>('.swatch').forEach((c) => {
          c.classList.toggle('active', c.dataset.color === cur);
        });
      }
    });
  }

  private refreshWardrobe() {
    this.refreshRows($('wardrobe-body'));
    const box = $('avatar-preview');
    box.innerHTML = '';
    box.appendChild(makeAvatarPreviewCanvas(this.scene, this.look));
    const nameInput = $<HTMLInputElement>('avatar-name');
    if (document.activeElement !== nameInput) nameInput.value = this.look.name;
  }

  private refreshRoomPanel() {
    this.refreshRows($('room-body'));
  }

  setLook(look: AvatarLook) {
    this.look = { ...look };
    this.refreshWardrobe();
  }

  setStyles(floorIdx: number, wallIdx: number) {
    this.floorIdx = floorIdx;
    this.wallIdx = wallIdx;
    this.themeIdx = ROOM_THEMES.findIndex((t) => t.floor === floorIdx && t.wall === wallIdx);
    this.refreshRoomPanel();
  }

  /** 地上の部屋にいるか。よその部屋にいるときだけ 🌍 を出す */
  setAtHome(atHome: boolean) {
    $('btn-earth').hidden = atHome;
  }

  /** 床をぬるモードの表示。バーを出し、パネルを閉じる */
  setBrush(idx: number) {
    this.brushIdx = idx;
    this.refreshRoomPanel();
  }

  setPainting(on: boolean, styleName: string) {
    $('paintbar').hidden = !on;
    $('paintbar-name').textContent = on ? `${styleName}でぬる` : 'ゆかをぬる';
    $('btn-paint').classList.toggle('active', on);
    if (on) this.closePanels();
  }

  setInventory(inv: Record<string, number>) {
    this.inventory = inv;
    this.renderCatalog();
  }

  /** 「おまかせ」の状態を表示に反映する */
  setAutoPlay(on: boolean) {
    const btn = $('btn-auto');
    btn.textContent = on ? 'おまかせ ON' : 'おまかせ OFF';
    btn.classList.toggle('active', on);
  }

  /** 繰り返し再生中のモーションのボタンを光らせる */
  setActiveEmote(kind: MotionKind | null) {
    document.querySelectorAll<HTMLElement>('#emote-grid .item').forEach((el) => {
      el.classList.toggle('selected', kind !== null && el.dataset.kind === kind);
    });
  }

  setPicked(defId: string | null) {
    this.pickedDefId = defId;
    document.querySelectorAll<HTMLElement>('#furniture-grid .item').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === defId);
    });
  }

  private renderCatalog() {
    document.querySelectorAll<HTMLElement>('#furniture-tabs .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.cat === this.tab);
    });
    const grid = $('furniture-grid');
    grid.innerHTML = '';
    $('furniture-note').textContent =
      this.tab === 'shop'
        ? 'コインで家具を買えます。もっているものは「うる」で半額になります。'
        : this.tab === 'wall'
          ? 'えらんで かべをクリックすると掛かります。上下2段に掛けられます。'
          : 'アイテムを選んで部屋をクリックで設置。R で回転、Esc でやめる。';

    if (this.tab === 'shop') {
      this.renderShop(grid);
      return;
    }
    const list = FURNITURE.filter((f) => f.category === this.tab && (this.inventory[f.id] ?? 0) > 0);
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'このカテゴリの持ちものは空です。ショップで買えます。';
      grid.appendChild(p);
      return;
    }
    for (const def of list) {
      const item = this.itemButton(def.id, `×${this.inventory[def.id]}`);
      item.classList.toggle('selected', def.id === this.pickedDefId);
      item.addEventListener('click', () => this.handlers.onPickFurniture(def.id));
      grid.appendChild(item);
    }
  }

  /** ショップ。安い順に全部ならべ、買えないものは薄く出す */
  private renderShop(grid: HTMLElement) {
    const order = { common: 0, uncommon: 1, rare: 2 };
    const list = [...FURNITURE].sort((a, b) => order[a.rarity] - order[b.rarity] || a.price - b.price);
    for (const def of list) {
      const owned = this.inventory[def.id] ?? 0;
      const item = this.itemButton(def.id, owned > 0 ? `×${owned}` : '');
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = `🪙${def.price}`;
      item.appendChild(price);
      if (def.rarity !== 'common') {
        const dot = document.createElement('span');
        dot.className = `rarity ${def.rarity}`;
        item.appendChild(dot);
      }
      const poor = this.coins < def.price;
      item.classList.toggle('locked', poor);
      item.addEventListener('click', () => this.handlers.onBuy(def.id));
      if (owned > 0) {
        const sellBtn = document.createElement('button');
        sellBtn.className = 'sell';
        sellBtn.textContent = `うる 🪙${sellPrice(def)}`;
        sellBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handlers.onSell(def.id);
        });
        item.appendChild(sellBtn);
      }
      grid.appendChild(item);
    }
  }

  /** アイコンと名前を並べた四角いボタン */
  private itemButton(defId: string, countLabel: string): HTMLButtonElement {
    const def = getDef(defId);
    const item = document.createElement('button');
    item.className = 'item';
    item.dataset.id = def.id;
    item.appendChild(def.category === 'wall' ? makeWallIconCanvas(this.scene, def) : makeIconCanvas(this.scene, def));
    const name = document.createElement('span');
    name.textContent = def.name;
    item.appendChild(name);
    if (countLabel) {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = countLabel;
      item.appendChild(count);
    }
    return item;
  }

  /** 共有 URL を作り直して入力欄に入れる */
  private async refreshShareUrl() {
    const input = $<HTMLInputElement>('share-url');
    input.value = 'つくっています…';
    try {
      input.value = await this.handlers.requestShareUrl();
    } catch {
      input.value = 'URL をつくれませんでした';
    }
  }

  private async copyShareUrl() {
    const input = $<HTMLInputElement>('share-url');
    const url = input.value;
    if (!/^https?:/.test(url)) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // クリップボードが使えない環境（http や古いブラウザ）では選択状態にして手でコピーしてもらう
      input.focus();
      input.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    this.toast(ok ? 'URL をコピーしました' : 'えらんだので、長おしでコピーしてね');
    if (ok) this.handlers.onShareCopied();
  }

  /**
   * 「ひろさ」の行を更新する。
   * @param next 次に広げられる広さと値段。もう最大なら null
   */
  setRoomSize(size: number, next: { size: number; price: number } | null, coins: number) {
    $('room-size').textContent = `${size}×${size}`;
    const btn = $<HTMLButtonElement>('btn-expand');
    const note = $('room-size-note');
    if (!next) {
      btn.hidden = true;
      note.textContent = 'これがいちばん広いおへやです。';
      return;
    }
    btn.hidden = false;
    btn.disabled = coins < next.price;
    btn.textContent = `${next.size}×${next.size} に ひろげる 🪙${next.price}`;
    note.textContent =
      coins < next.price
        ? `あと 🪙${next.price - coins} でひろげられます。置いてある家具はそのまま残ります。`
        : '置いてある家具はそのまま残ります。せまくは戻せません。';
  }

  setRoomText(name: string, note: string) {
    const nameInput = $<HTMLInputElement>('room-name');
    const noteInput = $<HTMLInputElement>('room-note');
    if (document.activeElement !== nameInput) nameInput.value = name;
    if (document.activeElement !== noteInput) noteInput.value = note;
  }

  /** 訪問モードに入る／出る。編集の入口をまとめて隠す */
  setVisiting(info: VisitInfo | null) {
    this.visiting = info !== null;
    for (const panel of ['furniture', 'wardrobe', 'room', 'share'] as const) {
      const btn = document.querySelector<HTMLElement>(`#toolbar .tool[data-panel="${panel}"]`);
      if (btn) btn.hidden = this.visiting;
    }
    $('coins').hidden = this.visiting;
    $('btn-missions').hidden = this.visiting;
    $('visitbar').hidden = !this.visiting;
    if (!info) return;
    $('visit-name').textContent = info.roomName;
    $('visit-note').textContent = info.roomNote || `${info.ownerName} のおへや`;
    this.setLikes(0);
  }

  setLikes(n: number) {
    const el = $('like-count');
    el.textContent = String(n);
  }

  /** あそびかたパネルの下に、端末内で数えている記録を出す */
  setMetricsLine(text: string) {
    $('metrics-line').textContent = text;
  }

  setCoins(n: number) {
    this.coins = n;
    const el = $('coins').querySelector('b');
    if (el) el.textContent = String(n);
    if (this.tab === 'shop' && !$('panel-furniture').hidden) this.renderCatalog();
  }

  /** きょうのミッションを描く */
  setMissions(views: MissionView[]) {
    const list = $('mission-list');
    list.innerHTML = '';
    let claimable = 0;
    for (const v of views) {
      const row = document.createElement('div');
      row.className = 'mission' + (v.done ? ' done' : '');
      const label = document.createElement('span');
      label.textContent = (v.done ? '✅ ' : '') + v.def.label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round((v.progress / v.def.goal) * 100)}%`;
      bar.appendChild(fill);
      const rw = document.createElement('span');
      rw.className = 'rw';
      rw.textContent = `${v.progress}/${v.def.goal} 🪙${v.def.reward}`;
      row.append(label, bar, rw);
      list.appendChild(row);
      if (!v.done && v.progress >= v.def.goal) claimable += 1;
    }
    const claim = $<HTMLButtonElement>('btn-claim');
    claim.disabled = claimable === 0;
    claim.textContent = claimable > 0 ? `できたぶんを うけとる（${claimable}）` : 'できたものはまだありません';
    const badge = $('mission-badge');
    badge.hidden = claimable === 0;
  }

  // ---------- 表示制御 ----------
  // ---------- 表示制御 ----------

  togglePanel(name: PanelName) {
    // 訪問中は編集系のパネルを開かせない（ボタンは隠しているが、念のため）
    if (this.visiting && (name === 'furniture' || name === 'wardrobe' || name === 'room' || name === 'share')) {
      return;
    }
    const panel = $(`panel-${name}`);
    const wasOpen = !panel.hidden;
    this.closePanels();
    if (!wasOpen) {
      panel.hidden = false;
      document.querySelector<HTMLElement>(`#toolbar .tool[data-panel="${name}"]`)?.classList.add('active');
      if (name === 'share') void this.refreshShareUrl();
      this.handlers.onPanelOpen(name);
    }
  }

  closePanels() {
    document.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = true));
    document.querySelectorAll<HTMLElement>('#toolbar .tool').forEach((t) => t.classList.remove('active'));
  }

  /** @param opts.wall 壁に掛けるものなら回転ボタンを隠す */
  showPlaceBar(name: string | null, opts?: { wall?: boolean }) {
    const bar = $('placebar');
    bar.hidden = name === null;
    if (name) $('placebar-name').textContent = name;
    const rotate = bar.querySelector<HTMLElement>('[data-act="rotate"]');
    if (rotate) rotate.hidden = opts?.wall === true;
  }

  showSelBar(name: string | null, opts?: { wall?: boolean }) {
    const bar = $('selbar');
    bar.hidden = name === null;
    if (name) $('selbar-name').textContent = name;
    const rotate = bar.querySelector<HTMLElement>('[data-act="rotate"]');
    if (rotate) rotate.hidden = opts?.wall === true;
  }

  setHint(text: string) {
    $('hint').textContent = text;
  }

  toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.hidden = true;
    }, 1500);
  }

  /** テキスト入力中はゲームのキー操作を止めたい */
  get isTyping(): boolean {
    const a = document.activeElement;
    return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
  }
}
