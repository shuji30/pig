import type Phaser from 'phaser';
import {
  CLOTH_COLORS,
  FLOOR_STYLES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  SKIN_COLORS,
  WALL_STYLES,
} from '../config';
import { CATEGORY_LABEL, CATEGORY_ORDER, FURNITURE } from '../data/furniture';
import { MOTIONS, type MotionKind } from '../data/motions';
import { makeIconCanvas } from '../render/furnitureTexture';
import type { AvatarLook, FurnitureCategory } from '../types';

export type PanelName = 'furniture' | 'emote' | 'wardrobe' | 'room' | 'help';

export interface UiHandlers {
  onPickFurniture(defId: string): void;
  onFloorChange(idx: number): void;
  onWallChange(idx: number): void;
  onLookChange(look: AvatarLook): void;
  onChat(text: string): void;
  onReset(): void;
  onPlaceAction(act: 'rotate' | 'cancel'): void;
  onSelAction(act: 'rotate' | 'move' | 'store' | 'deselect'): void;
  onPanelOpen(name: PanelName): void;
  onEmote(kind: MotionKind): void;
  onZoom(factor: number): void;
  onCenter(): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
};

/** DOM 側の UI 全般 */
export class Ui {
  private tab: FurnitureCategory = 'seat';
  private inventory: Record<string, number> = {};
  private look!: AvatarLook;
  private floorIdx = 0;
  private wallIdx = 0;
  private pickedDefId: string | null = null;
  private toastTimer?: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly handlers: UiHandlers,
  ) {
    this.buildTabs();
    this.buildEmotes();
    this.buildWardrobe();
    this.buildRoomPanel();
    this.wireChrome();
  }

  // ---------- 組み立て ----------

  private wireChrome() {
    document.querySelectorAll<HTMLButtonElement>('#toolbar .tool').forEach((btn) => {
      btn.addEventListener('click', () => this.togglePanel(btn.dataset.panel as PanelName));
    });
    $('btn-help').addEventListener('click', () => this.togglePanel('help'));
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

    $('btn-reset').addEventListener('click', () => {
      if (window.confirm('部屋とアバターを最初の状態に戻します。よろしいですか？')) {
        this.closePanels();
        this.handlers.onReset();
      }
    });

    $('placebar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'rotate' || act === 'cancel') this.handlers.onPlaceAction(act);
    });
    $('selbar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'rotate' || act === 'move' || act === 'store' || act === 'deselect') {
        this.handlers.onSelAction(act);
      }
    });
  }

  private buildTabs() {
    const tabs = $('furniture-tabs');
    tabs.innerHTML = '';
    for (const cat of CATEGORY_ORDER) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = CATEGORY_LABEL[cat];
      b.dataset.cat = cat;
      b.addEventListener('click', () => {
        this.tab = cat;
        this.renderCatalog();
      });
      tabs.appendChild(b);
    }
  }

  private buildEmotes() {
    const grid = $('emote-grid');
    grid.innerHTML = '';
    for (const m of MOTIONS) {
      const btn = document.createElement('button');
      btn.className = 'item';
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
    body.appendChild(this.swatchRow('ふく', CLOTH_COLORS, () => this.look.shirt, (c) => this.patchLook({ shirt: c })));
    body.appendChild(
      this.swatchRow('ズボン', CLOTH_COLORS, () => this.look.pants, (c) => this.patchLook({ pants: c })),
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
    this.refreshRoomPanel();
  }

  setInventory(inv: Record<string, number>) {
    this.inventory = inv;
    this.renderCatalog();
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
    const list = FURNITURE.filter((f) => f.category === this.tab && (this.inventory[f.id] ?? 0) > 0);
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'このカテゴリの家具はぜんぶ部屋に置いてあります。';
      grid.appendChild(p);
      return;
    }
    for (const def of list) {
      const item = document.createElement('button');
      item.className = 'item';
      item.dataset.id = def.id;
      item.appendChild(makeIconCanvas(this.scene, def));
      const name = document.createElement('span');
      name.textContent = def.name;
      item.appendChild(name);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `×${this.inventory[def.id]}`;
      item.appendChild(count);
      item.classList.toggle('selected', def.id === this.pickedDefId);
      item.addEventListener('click', () => this.handlers.onPickFurniture(def.id));
      grid.appendChild(item);
    }
  }

  // ---------- 表示制御 ----------

  togglePanel(name: PanelName) {
    const panel = $(`panel-${name}`);
    const wasOpen = !panel.hidden;
    this.closePanels();
    if (!wasOpen) {
      panel.hidden = false;
      document.querySelector<HTMLElement>(`#toolbar .tool[data-panel="${name}"]`)?.classList.add('active');
      this.handlers.onPanelOpen(name);
    }
  }

  closePanels() {
    document.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = true));
    document.querySelectorAll<HTMLElement>('#toolbar .tool').forEach((t) => t.classList.remove('active'));
  }

  showPlaceBar(name: string | null) {
    const bar = $('placebar');
    bar.hidden = name === null;
    if (name) $('placebar-name').textContent = name;
  }

  showSelBar(name: string | null) {
    const bar = $('selbar');
    bar.hidden = name === null;
    if (name) $('selbar-name').textContent = name;
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
